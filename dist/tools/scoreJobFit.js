import Anthropic from "@anthropic-ai/sdk";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
export async function scoreJobFit(args) {
    const { candidate_profile, job } = args;
    const message = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 512,
        messages: [
            {
                role: "user",
                content: `You are a career coach AI. Score how well this candidate matches this job.
Return ONLY valid JSON, no markdown or explanation.

CANDIDATE:
${JSON.stringify(candidate_profile, null, 2)}

JOB:
Title: ${job.title}
Company: ${job.company}
Description: ${job.description}
Tags: ${job.tags.join(", ")}

JSON shape:
{
  "score": number (0-100),
  "verdict": "Strong Match" | "Good Match" | "Weak Match" | "Not Recommended",
  "matched_skills": ["skill1", "skill2"],
  "missing_skills": ["skill3"],
  "recommendation": "1-2 sentence honest recommendation on whether to apply"
}`,
            },
        ],
    });
    const rawText = message.content[0].type === "text" ? message.content[0].text : "";
    let result;
    try {
        result = JSON.parse(rawText.trim());
    }
    catch {
        throw new Error("Failed to parse fit score response");
    }
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({
                    success: true,
                    job_title: job.title,
                    company: job.company,
                    fit: result,
                }, null, 2),
            },
        ],
    };
}
//# sourceMappingURL=scoreJobFit.js.map