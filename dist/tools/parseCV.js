import { readFile } from "fs/promises";
// ── Section splitter ─────────────────────────────────────────────────────────
// Splits CV text into named sections (SUMMARY, SKILLS, EXPERIENCE, EDUCATION, etc.)
function extractSections(text) {
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
    const headerPattern = new RegExp(`^\\s*(${sectionHeaders.join("|")})\\s*[:—\\-]?\\s*$`, "gim");
    const sections = {};
    const matches = [];
    let m;
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
    }
    else {
        sections["_header"] = text.trim();
    }
    return sections;
}
// ── Field extractors ─────────────────────────────────────────────────────────
function extractEmail(text) {
    const m = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
    return m ? m[0] : "";
}
function extractPhone(text) {
    const m = text.match(/(?:\+?\d{1,3}[\s-]?)?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}/);
    return m ? m[0].trim() : null;
}
function extractLocation(text) {
    // Look for common location patterns: "City, State", "City, Country", "Location: ..."
    const locLabel = text.match(/(?:location|based in|address)\s*[:—-]\s*(.+)/i);
    if (locLabel)
        return locLabel[1].trim().split("\n")[0].trim();
    // "City, XX" pattern (e.g. "Lagos, Nigeria" or "San Francisco, CA")
    const cityCountry = text.match(/([A-Z][a-z]+(?:\s[A-Z][a-z]+)*),\s*([A-Z]{2,}|[A-Z][a-z]+(?:\s[A-Z][a-z]+)*)/);
    if (cityCountry)
        return cityCountry[0].trim();
    return null;
}
function extractSkills(sections) {
    const skillSection = sections["skills"] ||
        sections["technical skills"] ||
        sections["core competencies"] ||
        "";
    if (!skillSection)
        return [];
    // Split by " - ", ",", "&", "|", bullets, newlines, and "/"
    return skillSection
        .split(/\s+-\s+|[,|•·&\n\/]/)
        .map((s) => s.replace(/^[\s\-–—*]+/, "").trim())
        .filter((s) => s.length > 0 && s.length < 60);
}
const DATE_RANGE_RE = /((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*[\s,]*\d{4}|20\d{2}|19\d{2})\s*[-–—to]+\s*((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*[\s,]*\d{4}|20\d{2}|19\d{2}|present|current|now)/i;
function extractExperience(sections) {
    const expSection = sections["experience"] ||
        sections["work experience"] ||
        sections["professional experience"] ||
        sections["employment"] ||
        "";
    if (!expSection)
        return [];
    const entries = [];
    const allLines = expSection.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
    // Find indices of lines containing date ranges — these mark job boundaries
    const dateLineIndices = [];
    for (let i = 0; i < allLines.length; i++) {
        if (DATE_RANGE_RE.test(allLines[i])) {
            dateLineIndices.push(i);
        }
    }
    if (dateLineIndices.length === 0) {
        // Fallback: split by double newlines
        const blocks = expSection.split(/\n{2,}/);
        for (const block of blocks) {
            const lines = block.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
            if (lines.length === 0)
                continue;
            const titleLine = lines[0] || "";
            const companyLine = lines.length > 1 ? lines[1] : "";
            const atSplit = titleLine.match(/^(.+?)\s+(?:at|@|—|\|)\s+(.+)$/i);
            if (atSplit) {
                entries.push({ title: atSplit[1].trim(), company: atSplit[2].trim(), start: "", end: "" });
            }
            else {
                entries.push({ title: titleLine, company: companyLine, start: "", end: "" });
            }
        }
        return entries.filter((e) => e.title.length > 0);
    }
    // For each date line, gather context lines above it (title, company) until
    // we hit the previous date line or the start of the section
    for (let d = 0; d < dateLineIndices.length; d++) {
        const dateIdx = dateLineIndices[d];
        const dateLine = allLines[dateIdx];
        const dateMatch = dateLine.match(DATE_RANGE_RE);
        const start = dateMatch[1].trim();
        const end = dateMatch[2].trim();
        // Context lines are between previous date line (or start) and this date line
        const prevBoundary = d > 0 ? dateLineIndices[d - 1] + 1 : 0;
        const contextLines = allLines.slice(prevBoundary, dateIdx).filter((l) => l.length > 0 && !DATE_RANGE_RE.test(l));
        // Also check if title/company info is on the same line as the date
        const dateStripped = dateLine.replace(DATE_RANGE_RE, "").replace(/[|—–\-,]/g, " ").trim();
        let title = "";
        let company = "";
        if (contextLines.length >= 2) {
            // Check for "Title at Company" pattern
            const atSplit = contextLines[0].match(/^(.+?)\s+(?:at|@|—|\|)\s+(.+)$/i);
            if (atSplit) {
                title = atSplit[1].trim();
                company = atSplit[2].trim();
            }
            else {
                title = contextLines[0];
                company = contextLines[1];
            }
        }
        else if (contextLines.length === 1) {
            const atSplit = contextLines[0].match(/^(.+?)\s+(?:at|@|—|\|)\s+(.+)$/i);
            if (atSplit) {
                title = atSplit[1].trim();
                company = atSplit[2].trim();
            }
            else {
                title = contextLines[0];
                company = dateStripped || "";
            }
        }
        else if (dateStripped) {
            title = dateStripped;
        }
        // Clean up title/company — remove trailing date fragments
        title = title.replace(/[-–—].*$/, "").trim();
        company = company.replace(/[-–—].*$/, "").trim();
        if (title.length > 0) {
            entries.push({ title, company, start, end });
        }
    }
    return entries;
}
function calculateYearsExperience(experience) {
    if (experience.length === 0)
        return 0;
    const parseYear = (s) => {
        const m = s.match(/(20\d{2}|19\d{2})/);
        return m ? parseInt(m[1]) : 0;
    };
    let earliest = Infinity;
    let latest = 0;
    for (const exp of experience) {
        const startYear = parseYear(exp.start);
        const endStr = exp.end.toLowerCase();
        const endYear = endStr === "present" || endStr === "current" || endStr === "now"
            ? new Date().getFullYear()
            : parseYear(exp.end);
        if (startYear > 0 && startYear < earliest)
            earliest = startYear;
        if (endYear > 0 && endYear > latest)
            latest = endYear;
    }
    return earliest < Infinity && latest > 0 ? Math.max(latest - earliest, 0) : 0;
}
function extractEducation(sections) {
    const eduSection = sections["education"] || "";
    if (!eduSection)
        return [];
    const entries = [];
    const lines = eduSection.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
    for (const line of lines) {
        // "Degree, Institution" pattern
        const commaSplit = line.match(/^(.+?),\s*(.+)$/);
        if (commaSplit) {
            entries.push({ degree: commaSplit[1].trim(), institution: commaSplit[2].trim() });
        }
        else if (line.length > 0) {
            // Standalone line — try to detect "Degree — Institution" or "Degree | Institution"
            const dashSplit = line.match(/^(.+?)\s*[—|]\s*(.+)$/);
            if (dashSplit) {
                entries.push({ degree: dashSplit[1].trim(), institution: dashSplit[2].trim() });
            }
            else {
                entries.push({ degree: line, institution: "" });
            }
        }
    }
    return entries.filter((e) => e.degree.length > 0);
}
function extractSummary(sections) {
    return (sections["summary"] ||
        sections["profile"] ||
        sections["about"] ||
        sections["objective"] ||
        "");
}
// ── Main parse function ──────────────────────────────────────────────────────
export async function parseCV(args) {
    let cv_text = args.cv_text;
    if (!cv_text && !args.file_path) {
        throw new Error("Either cv_text or file_path must be provided.");
    }
    if (args.file_path) {
        const buffer = await readFile(args.file_path, "utf-8");
        cv_text = buffer;
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
    const profile = {
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
                text: JSON.stringify({
                    success: true,
                    message: `CV parsed for ${profile.name}`,
                    profile,
                }, null, 2),
            },
        ],
    };
}
//# sourceMappingURL=parseCV.js.map