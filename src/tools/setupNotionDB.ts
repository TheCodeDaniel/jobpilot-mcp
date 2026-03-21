const NOTION_API_KEY = process.env.NOTION_API_KEY!;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;

export async function setupNotionDB(args: { parent_page_id: string }) {
  const { parent_page_id } = args;

  if (!NOTION_API_KEY) {
    throw new Error("NOTION_API_KEY must be set in environment variables.");
  }

  // ── Idempotency: check if a database is already configured and valid ──
  if (NOTION_DATABASE_ID) {
    const checkRes = await fetch(
      `https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}`,
      {
        headers: {
          Authorization: `Bearer ${NOTION_API_KEY}`,
          "Notion-Version": "2022-06-28",
        },
      }
    );

    if (checkRes.ok) {
      const db = (await checkRes.json()) as any;
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                message:
                  "Database already set up — no action needed.",
                database_id: NOTION_DATABASE_ID,
                database_title: db.title?.[0]?.plain_text ?? "Unknown",
              },
              null,
              2
            ),
          },
        ],
      };
    }
    // If the existing ID is invalid/inaccessible, fall through and create a new one
  }

  // ── Create the database ──────────────────────────────────────────────────
  const response = await fetch("https://api.notion.com/v1/databases", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${NOTION_API_KEY}`,
      "Content-Type": "application/json",
      "Notion-Version": "2022-06-28",
    },
    body: JSON.stringify({
      parent: { type: "page_id", page_id: parent_page_id },
      title: [{ type: "text", text: { content: "Job List DB" } }],
      properties: {
        "Job Title": { title: {} },
        "Company": { rich_text: {} },
        "Job URL": { url: {} },
        "Status": { rich_text: {} },
        "Fit Score": { number: { format: "number" } },
        "Cover Letter Snippet": { rich_text: {} },
        "Notes": { rich_text: {} },
        "Date Applied": { date: {} },
        "Salary": { rich_text: {} },
        "Last Updated": { date: {} },
      },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Notion API error: ${response.status} — ${err}`);
  }

  const db = (await response.json()) as any;

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            success: true,
            message:
              "Notion database created successfully. Set the database_id below as NOTION_DATABASE_ID in your .env or Claude Desktop config.",
            database_id: db.id,
            database_url: db.url,
          },
          null,
          2
        ),
      },
    ],
  };
}
