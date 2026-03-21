const NOTION_API_KEY = process.env.NOTION_API_KEY!;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID!;

export async function logToNotion(args: {
  job_title: string;
  company_name: string;
  job_url: string;
  salary?: string;
  fit_score?: number;
  status: "Applied" | "Pending" | "Interview" | "Rejected" | "Offer";
  cover_letter_snippet?: string;
  notes?: string;
}) {
  if (!NOTION_API_KEY || !NOTION_DATABASE_ID) {
    throw new Error(
      "NOTION_API_KEY and NOTION_DATABASE_ID must be set in environment variables."
    );
  }

  const {
    job_title,
    company_name,
    job_url,
    salary,
    fit_score,
    status,
    cover_letter_snippet,
    notes,
  } = args;

  const properties: Record<string, any> = {
    // Title column
    "Job Title": {
      title: [{ text: { content: job_title } }],
    },
    "Company": {
      rich_text: [{ text: { content: company_name } }],
    },
    "Job URL": {
      url: job_url,
    },
    "Status": {
      rich_text: [{ text: { content: status } }],
    },
    "Date Applied": {
      date: { start: new Date().toISOString().split("T")[0] },
    },
  };

  if (salary) {
    properties["Salary"] = {
      rich_text: [{ text: { content: salary } }],
    };
  }

  if (fit_score !== undefined) {
    properties["Fit Score"] = {
      number: fit_score,
    };
  }

  if (cover_letter_snippet) {
    properties["Cover Letter Snippet"] = {
      rich_text: [{ text: { content: cover_letter_snippet.slice(0, 2000) } }],
    };
  }

  if (notes) {
    properties["Notes"] = {
      rich_text: [{ text: { content: notes.slice(0, 2000) } }],
    };
  }

  const response = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${NOTION_API_KEY}`,
      "Content-Type": "application/json",
      "Notion-Version": "2022-06-28",
    },
    body: JSON.stringify({
      parent: { database_id: NOTION_DATABASE_ID },
      properties,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Notion API error: ${response.status} — ${err}`);
  }

  const page = (await response.json()) as any;

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            success: true,
            message: `✅ Logged "${job_title}" at ${company_name} to Notion`,
            notion_page_id: page.id,
            notion_url: page.url,
          },
          null,
          2
        ),
      },
    ],
  };
}
