import { readFile } from "fs/promises";
import { PDFParse } from "pdf-parse";

export interface CandidateProfile {
  name: string;
  email: string;
  phone: string | null;
  location: string | null;
  summary: string;
  skills: string[];
  experience: Array<{ title: string; company: string; start: string; end: string }>;
  years_experience: number;
  education: Array<{ degree: string; institution: string }>;
}

// ── Section splitter ─────────────────────────────────────────────────────────
// Splits CV text into named sections (SUMMARY, SKILLS, EXPERIENCE, EDUCATION, etc.)
function extractSections(text: string): Record<string, string> {
  const sectionHeaders = [
    "summary",
    "profile",
    "about",
    "objective",
    "skills",
    "technical skills",
    "core competencies",
    "experience",
    "work experience",
    "professional experience",
    "employment",
    "education",
    "certifications",
    "languages",
    "projects",
  ];

  const headerPattern = new RegExp(
    `^\\s*(${sectionHeaders.join("|")})\\s*[:—\\-]?\\s*$`,
    "gim"
  );

  const sections: Record<string, string> = {};
  const matches: Array<{ name: string; index: number }> = [];

  let m: RegExpExecArray | null;
  while ((m = headerPattern.exec(text)) !== null) {
    matches.push({ name: m[1].toLowerCase().trim(), index: m.index + m[0].length });
  }

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index - matches[i + 1].name.length - 2 : text.length;
    sections[matches[i].name] = text.slice(start, end).trim();
  }

  // Store the text before the first section header as "header" (contains name, contact info)
  if (matches.length > 0) {
    sections["_header"] = text.slice(0, matches[0].index - matches[0].name.length - 2).trim();
  } else {
    sections["_header"] = text.trim();
  }

  return sections;
}

// ── Field extractors ─────────────────────────────────────────────────────────
function extractEmail(text: string): string {
  const m = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
  return m ? m[0] : "";
}

function extractPhone(text: string): string | null {
  const m = text.match(/(?:\+?\d{1,3}[\s-]?)?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}/);
  return m ? m[0].trim() : null;
}

function extractLocation(text: string): string | null {
  // Look for common location patterns: "City, State", "City, Country", "Location: ..."
  const locLabel = text.match(/(?:location|based in|address)\s*[:—-]\s*(.+)/i);
  if (locLabel) return locLabel[1].trim().split("\n")[0].trim();

  // "City, XX" pattern (e.g. "Lagos, Nigeria" or "San Francisco, CA")
  const cityCountry = text.match(/([A-Z][a-z]+(?:\s[A-Z][a-z]+)*),\s*([A-Z]{2,}|[A-Z][a-z]+(?:\s[A-Z][a-z]+)*)/);
  if (cityCountry) return cityCountry[0].trim();

  return null;
}

function extractSkills(sections: Record<string, string>): string[] {
  const skillSection =
    sections["skills"] ||
    sections["technical skills"] ||
    sections["core competencies"] ||
    "";

  if (!skillSection) return [];

  // Split by commas, pipes, bullets, dashes, newlines
  return skillSection
    .split(/[,|•·\n]/)
    .map((s) => s.replace(/^[\s\-–—*]+/, "").trim())
    .filter((s) => s.length > 0 && s.length < 60);
}

function extractExperience(
  sections: Record<string, string>
): Array<{ title: string; company: string; start: string; end: string }> {
  const expSection =
    sections["experience"] ||
    sections["work experience"] ||
    sections["professional experience"] ||
    sections["employment"] ||
    "";

  if (!expSection) return [];

  const entries: Array<{ title: string; company: string; start: string; end: string }> = [];

  // Split into blocks by double newlines or lines that start with a date/title pattern
  const blocks = expSection.split(/\n{2,}/);

  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lines.length === 0) continue;

    // Try to find a date range in the block
    const dateMatch = block.match(
      /((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*[\s,]*\d{4}|20\d{2}|19\d{2})\s*[-–—to]+\s*((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*[\s,]*\d{4}|20\d{2}|19\d{2}|present|current|now)/i
    );

    const start = dateMatch ? dateMatch[1].trim() : "";
    const end = dateMatch ? dateMatch[2].trim() : "";

    // First non-date line is usually the title, second is usually the company (or vice versa)
    const titleLine = lines[0] || "";
    const companyLine = lines.length > 1 ? lines[1] : "";

    // If the line contains " at " or " — " or " | ", split it
    const atSplit = titleLine.match(/^(.+?)\s+(?:at|@|—|\|)\s+(.+)$/i);
    if (atSplit) {
      entries.push({ title: atSplit[1].trim(), company: atSplit[2].trim(), start, end });
    } else {
      entries.push({
        title: titleLine.replace(/[-–—].*$/, "").trim(),
        company: companyLine.replace(/[-–—].*$/, "").trim(),
        start,
        end,
      });
    }
  }

  return entries.filter((e) => e.title.length > 0);
}

function calculateYearsExperience(
  experience: Array<{ start: string; end: string }>
): number {
  if (experience.length === 0) return 0;

  const parseYear = (s: string): number => {
    const m = s.match(/(20\d{2}|19\d{2})/);
    return m ? parseInt(m[1]) : 0;
  };

  let earliest = Infinity;
  let latest = 0;

  for (const exp of experience) {
    const startYear = parseYear(exp.start);
    const endStr = exp.end.toLowerCase();
    const endYear =
      endStr === "present" || endStr === "current" || endStr === "now"
        ? new Date().getFullYear()
        : parseYear(exp.end);

    if (startYear > 0 && startYear < earliest) earliest = startYear;
    if (endYear > 0 && endYear > latest) latest = endYear;
  }

  return earliest < Infinity && latest > 0 ? Math.max(latest - earliest, 0) : 0;
}

function extractEducation(
  sections: Record<string, string>
): Array<{ degree: string; institution: string }> {
  const eduSection = sections["education"] || "";
  if (!eduSection) return [];

  const entries: Array<{ degree: string; institution: string }> = [];
  const blocks = eduSection.split(/\n{2,}/);

  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lines.length === 0) continue;

    // Common patterns: "BSc Computer Science, University of Lagos" or two lines
    const commaSplit = lines[0].match(/^(.+?),\s*(.+)$/);
    if (commaSplit) {
      entries.push({ degree: commaSplit[1].trim(), institution: commaSplit[2].trim() });
    } else {
      entries.push({
        degree: lines[0] || "",
        institution: lines.length > 1 ? lines[1] : "",
      });
    }
  }

  return entries.filter((e) => e.degree.length > 0);
}

function extractSummary(sections: Record<string, string>): string {
  return (
    sections["summary"] ||
    sections["profile"] ||
    sections["about"] ||
    sections["objective"] ||
    ""
  );
}

// ── Main parse function ──────────────────────────────────────────────────────
export async function parseCV(args: { cv_text?: string; file_path?: string }) {
  let cv_text = args.cv_text;

  if (!cv_text && !args.file_path) {
    throw new Error("Either cv_text or file_path must be provided.");
  }

  if (args.file_path) {
    const buffer = await readFile(args.file_path);
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    cv_text = result.text;
  }

  if (!cv_text || cv_text.trim().length === 0) {
    throw new Error("CV text is empty. Check your file or input.");
  }

  const sections = extractSections(cv_text);
  const header = sections["_header"] || "";
  const lines = header.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);

  const name = lines[0] || "Unknown";
  const email = extractEmail(cv_text);
  const phone = extractPhone(header);
  const location = extractLocation(header) || extractLocation(cv_text);
  const summary = extractSummary(sections);
  const skills = extractSkills(sections);
  const experience = extractExperience(sections);
  const years_experience = calculateYearsExperience(experience);
  const education = extractEducation(sections);

  const profile: CandidateProfile = {
    name,
    email,
    phone,
    location,
    summary,
    skills,
    experience,
    years_experience,
    education,
  };

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            success: true,
            message: `CV parsed for ${profile.name}`,
            profile,
          },
          null,
          2
        ),
      },
    ],
  };
}
