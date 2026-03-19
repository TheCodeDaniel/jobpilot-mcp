import Anthropic from "@anthropic-ai/sdk";
import type { CandidateProfile } from "./parseCV.js";
import type { JobListing } from "./searchJobs.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function generateCoverLetter(args: {
  candidate_profile: CandidateProfile;
  job: JobListing;
  tone?: "professional" | "enthusiastic" | "concise";
}) {
  const { candidate_profile, job, tone = "professional" } = args;

  const toneGuide = {
    professional: "formal, polished, and business-appropriate",
    enthusiastic: "warm, energetic, and genuinely excited about the role",
    concise: "direct, brief (under 200 words), and punchy",
  };

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 800,
    messages: [
      {
        role: "user",
        content: `Write a tailored cover letter for this candidate applying to this job.
Tone: ${toneGuide[tone]}
Do NOT use placeholder text like [Your Name]. Use the actual candidate data.
Do NOT add Subject line or "Dear Hiring Manager" — just the letter body.

CANDIDATE:
Name: ${candidate_profile.name}
Bio: ${candidate_profile.bio}
Skills: ${candidate_profile.skills.join(", ")}
Experience: ${candidate_profile.years_of_experience} years
Previous Titles: ${candidate_profile.job_titles.join(", ")}

JOB:
Title: ${job.title}
Company: ${job.company}
Description: ${job.description}
Tags: ${job.tags.join(", ")}

Write the cover letter now:`,
      },
    ],
  });

  const coverLetter = message.content[0].type === "text" ? message.content[0].text : "";

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            success: true,
            job_title: job.title,
            company: job.company,
            tone,
            cover_letter: coverLetter.trim(),
            snippet: coverLetter.trim().slice(0, 300),
          },
          null,
          2
        ),
      },
    ],
  };
}
