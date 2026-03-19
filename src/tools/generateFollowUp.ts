import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function generateFollowUp(args: {
  candidate_name: string;
  company_name: string;
  job_title: string;
  days_since_applied: number;
  application_id?: string;
}) {
  const { candidate_name, company_name, job_title, days_since_applied } = args;

  const urgency =
    days_since_applied < 7
      ? "gentle and early"
      : days_since_applied < 14
      ? "polite and professional"
      : "firm but still courteous";

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 400,
    messages: [
      {
        role: "user",
        content: `Write a ${urgency} follow-up email for a job application.
It has been ${days_since_applied} days since they applied.
Keep it under 120 words. Do not use placeholder text.

Candidate: ${candidate_name}
Company: ${company_name}
Job Title: ${job_title}

Return ONLY valid JSON with this shape (no markdown, no backticks):
{
  "subject": "Email subject line",
  "body": "Full email body"
}`,
      },
    ],
  });

  const rawText = message.content[0].type === "text" ? message.content[0].text : "";

  let email: { subject: string; body: string };
  try {
    email = JSON.parse(rawText.trim());
  } catch {
    throw new Error("Failed to parse follow-up email response");
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            success: true,
            days_since_applied,
            follow_up_email: email,
          },
          null,
          2
        ),
      },
    ],
  };
}
