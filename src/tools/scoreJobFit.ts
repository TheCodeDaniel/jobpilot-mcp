import type { CandidateProfile } from "./parseCV.js";
import type { JobListing } from "./searchJobs.js";

export interface FitResult {
  score: number;
  verdict: "Strong Match" | "Good Match" | "Weak Match" | "Not Recommended";
  matched_skills: string[];
  missing_skills: string[];
  recommendation: string;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9+#]/g, " ").trim();
}

function extractJobKeywords(job: JobListing): string[] {
  const text = `${job.title || ""} ${job.description || ""} ${(job.tags || []).join(" ")}`;
  // Split into words / phrases, deduplicate
  const words = normalize(text)
    .split(/\s+/)
    .filter((w) => w.length > 2);

  // Also extract multi-word tech terms
  const multiWord = text.match(
    /(?:react native|vue\.?js|node\.?js|next\.?js|ruby on rails|machine learning|deep learning|ci\/cd|rest api|graphql api|data engineering|cloud computing|project management|product management|ui\/ux|ux design|web development|mobile development|full[ -]?stack|front[ -]?end|back[ -]?end)/gi
  );

  const all = [...words, ...(multiWord || []).map((m) => normalize(m))];
  return [...new Set(all)];
}

export async function scoreJobFit(args: {
  candidate_profile: CandidateProfile;
  job: JobListing;
}) {
  const { candidate_profile, job } = args;

  // Guard against undefined/null fields
  const candidateSkills = (candidate_profile?.skills || []).map(normalize);
  const candidateTitle = normalize(
    (candidate_profile?.experience || []).map((e) => e.title).join(" ") || ""
  );
  const candidateYears = candidate_profile?.years_experience || 0;

  const jobKeywords = extractJobKeywords(job);
  const jobText = normalize(
    `${job.title || ""} ${job.description || ""} ${(job.tags || []).join(" ")}`
  );

  // ── Skill matching ─────────────────────────────────────────────────────────
  const matched_skills: string[] = [];
  const checked = new Set<string>();

  for (const skill of candidateSkills) {
    if (checked.has(skill)) continue;
    checked.add(skill);
    if (jobKeywords.some((kw) => kw.includes(skill) || skill.includes(kw))) {
      matched_skills.push(skill);
    }
  }

  // Find keywords from the job that the candidate is missing
  const techTerms = (job.tags || []).map(normalize);
  const missing_skills = techTerms.filter(
    (tag) => tag.length > 1 && !candidateSkills.some((s) => s.includes(tag) || tag.includes(s))
  );

  // ── Scoring ────────────────────────────────────────────────────────────────
  let score = 0;

  // Skill match component (up to 50 points)
  const skillRatio =
    candidateSkills.length > 0
      ? matched_skills.length / Math.max(candidateSkills.length, techTerms.length || 1)
      : 0;
  score += Math.round(skillRatio * 50);

  // Title relevance (up to 25 points)
  const titleWords = normalize(job.title || "").split(/\s+/);
  const titleMatches = titleWords.filter(
    (tw) =>
      tw.length > 2 &&
      (candidateTitle.includes(tw) ||
        candidateSkills.some((s) => s.includes(tw)))
  ).length;
  score += Math.round((titleMatches / Math.max(titleWords.length, 1)) * 25);

  // Experience bonus (up to 15 points)
  if (candidateYears >= 5) score += 15;
  else if (candidateYears >= 3) score += 10;
  else if (candidateYears >= 1) score += 5;

  // Base engagement points (10 points if they have any skills at all)
  if (candidateSkills.length > 0) score += 10;

  score = Math.min(score, 100);

  // ── Verdict ────────────────────────────────────────────────────────────────
  let verdict: FitResult["verdict"];
  let recommendation: string;

  if (score >= 75) {
    verdict = "Strong Match";
    recommendation = `Strong fit for ${job.title} at ${job.company}. Your skills in ${matched_skills.slice(0, 3).join(", ") || "relevant areas"} align well. Apply with confidence.`;
  } else if (score >= 50) {
    verdict = "Good Match";
    recommendation = `Decent fit for ${job.title} at ${job.company}. You match on ${matched_skills.length} skills. Consider highlighting transferable experience${missing_skills.length > 0 ? ` and addressing gaps in ${missing_skills.slice(0, 2).join(", ")}` : ""}.`;
  } else if (score >= 30) {
    verdict = "Weak Match";
    recommendation = `Partial fit. You're missing key skills: ${missing_skills.slice(0, 3).join(", ") || "several required areas"}. Could be worth applying if you can demonstrate fast learning.`;
  } else {
    verdict = "Not Recommended";
    recommendation = `Low match for this role. Consider upskilling in ${missing_skills.slice(0, 3).join(", ") || "the required technologies"} before applying.`;
  }

  const result: FitResult = {
    score,
    verdict,
    matched_skills,
    missing_skills,
    recommendation,
  };

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            success: true,
            job_title: job.title || "Unknown",
            company: job.company || "Unknown",
            fit: result,
          },
          null,
          2
        ),
      },
    ],
  };
}
