const NOTION_API_KEY = process.env.NOTION_API_KEY;
export async function updateApplicationStatus(args) {
    const { notion_page_id, new_status, notes } = args;
    if (!NOTION_API_KEY) {
        throw new Error("NOTION_API_KEY must be set in environment variables.");
    }
    const properties = {
        Status: { select: { name: new_status } },
        "Last Updated": {
            date: { start: new Date().toISOString().split("T")[0] },
        },
    };
    if (notes) {
        properties["Notes"] = {
            rich_text: [{ text: { content: notes.slice(0, 2000) } }],
        };
    }
    const response = await fetch(`https://api.notion.com/v1/pages/${notion_page_id}`, {
        method: "PATCH",
        headers: {
            Authorization: `Bearer ${NOTION_API_KEY}`,
            "Content-Type": "application/json",
            "Notion-Version": "2022-06-28",
        },
        body: JSON.stringify({ properties }),
    });
    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Notion API error: ${response.status} — ${err}`);
    }
    const page = (await response.json());
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({
                    success: true,
                    message: `✅ Status updated to "${new_status}"`,
                    notion_page_id: page.id,
                    notion_url: page.url,
                }, null, 2),
            },
        ],
    };
}
//# sourceMappingURL=updateApplicationStatus.js.map