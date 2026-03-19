import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface CandidateProfile {
  name: string;
  email: string;
  phone?: string;
  location?: string;
  bio: string;
  skills: string[];
  years_of_experience: number;
  job_titles: string[];
  education: string[];
  languages?: string[];
}

export async function parseCV(args: { cv_text: string }) {
  const { cv_text } = args;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `You are a CV parser. Extract structured data from this CV and return ONLY valid JSON — no markdown, no explanation, no backticks.

JSON shape:
{
  "name": "string",
  "email": "string",
  "phone": "string or null",
  "location": "string or null",
  "bio": "2-3 sentence professional summary of the candidate",
  "skills": ["array", "of", "skills"],
  "years_of_experience": number,
  "job_titles": ["Previous Job Title 1", "Previous Job Title 2"],
  "education": ["Degree, Institution, Year"],
  "languages": ["English", "etc"]
}

CV TEXT:
${cv_text}`,
      },
    ],
  });

  const rawText = message.content[0].type === "text" ? message.content[0].text : "";

  let profile: CandidateProfile;
  try {
    profile = JSON.parse(rawText.trim());
  } catch {
    throw new Error("Failed to parse CV response as JSON. Check your CV text.");
  }

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
