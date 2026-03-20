import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "fs/promises";
import { PDFParse } from "pdf-parse";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
export async function parseCV(args) {
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
    let profile;
    try {
        profile = JSON.parse(rawText.trim());
    }
    catch {
        throw new Error("Failed to parse CV response as JSON. Check your CV text.");
    }
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