export interface JobListing {
  id: string;
  title: string;
  company: string;
  url: string;
  salary?: string;
  description: string;
  tags: string[];
  date_posted: string;
  source: string;
}

export async function searchJobs(args: {
  role: string;
  location?: string;
  max_results?: number;
}): Promise<{ content: Array<{ type: string; text: string }> }> {
  const { role, max_results = 10 } = args;

  const jobs: JobListing[] = [];

  // ── RemoteOK (free, no auth needed) ──────────────────────────────────────
  try {
    const tag = encodeURIComponent(role.toLowerCase().replace(/\s+/g, "-"));
    const res = await fetch(`https://remoteok.com/api?tag=${tag}`, {
      headers: { "User-Agent": "JobPilot-MCP/1.0" },
    });

    if (res.ok) {
      const data = (await res.json()) as any[];
      // First item is a legal notice object, skip it
      const listings = data.slice(1);

      for (const job of listings) {
        if (jobs.length >= max_results) break;
        if (!job.position || !job.company) continue;

        jobs.push({
          id: `remoteok-${job.id}`,
          title: job.position,
          company: job.company,
          url: job.url || `https://remoteok.com/remote-jobs/${job.id}`,
          salary: job.salary || undefined,
          description: job.description
            ? job.description.replace(/<[^>]+>/g, "").slice(0, 500)
            : "No description available",
          tags: job.tags || [],
          date_posted: job.date || new Date().toISOString(),
          source: "RemoteOK",
        });
      }
    }
  } catch (e) {
    console.error("RemoteOK fetch failed:", e);
  }

  // ── We Work Remotely RSS (fallback / supplement) ──────────────────────────
  if (jobs.length < max_results) {
    try {
      const wwrCategory = role.toLowerCase().includes("design")
        ? "design"
        : role.toLowerCase().includes("market")
        ? "marketing"
        : "programming"; // default to programming

      const res = await fetch(
        `https://weworkremotely.com/categories/remote-${wwrCategory}-jobs.rss`,
        { headers: { "User-Agent": "JobPilot-MCP/1.0" } }
      );

      if (res.ok) {
        const xml = await res.text();
        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
        let match;

        while ((match = itemRegex.exec(xml)) !== null && jobs.length < max_results) {
          const item = match[1];
          const getTag = (tag: string) => {
            const m = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`).exec(item)
              || new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`).exec(item);
            return m ? m[1].trim() : "";
          };

          const title = getTag("title");
          const link = getTag("link");
          const company = title.split(" at ").pop() || "Unknown";
          const jobTitle = title.split(" at ")[0] || title;

          if (!title.toLowerCase().includes(role.toLowerCase().split(" ")[0])) continue;

          jobs.push({
            id: `wwr-${Buffer.from(link).toString("base64").slice(0, 16)}`,
            title: jobTitle,
            company,
            url: link,
            description: getTag("description").replace(/<[^>]+>/g, "").slice(0, 500),
            tags: [wwrCategory],
            date_posted: getTag("pubDate"),
            source: "WeWorkRemotely",
          });
        }
      }
    } catch (e) {
      console.error("WWR fetch failed:", e);
    }
  }

  if (jobs.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: false,
            message: `No jobs found for "${role}". Try a broader keyword like "Flutter" or "Mobile Developer".`,
            jobs: [],
          }),
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            success: true,
            total: jobs.length,
            jobs,
          },
          null,
          2
        ),
      },
    ],
  };
}
