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

function matchesKeyword(text: string, role: string): boolean {
  const haystack = text.toLowerCase();
  const fullKeyword = role.toLowerCase();
  if (haystack.includes(fullKeyword)) return true;
  // Match if ANY word (3+ chars) from the role appears in the text
  const words = fullKeyword.split(/\s+/).filter((w) => w.length >= 3);
  return words.some((w) => haystack.includes(w));
}

export async function searchJobs(args: {
  role: string;
  location?: string;
  max_results?: number;
}): Promise<{ content: Array<{ type: string; text: string }> }> {
  const { role, max_results = 10 } = args;
  const jobs: JobListing[] = [];
  const errors: string[] = [];

  // ── RemoteOK ───────────────────────────────────────────────────────────────
  try {
    const res = await fetch("https://remoteok.com/api", {
      headers: {
        "User-Agent": "JobPilot-MCP/1.0",
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      const msg = `RemoteOK HTTP ${res.status}`;
      errors.push(msg);
      console.error(`[searchJobs] ${msg}`);
    } else {
      const raw = await res.text();
      let data: any[];
      try {
        data = JSON.parse(raw);
      } catch {
        const msg = `RemoteOK returned invalid JSON (${raw.slice(0, 100)})`;
        errors.push(msg);
        console.error(`[searchJobs] ${msg}`);
        data = [];
      }
      // Index 0 is a legal notice / metadata object — skip it
      const listings = Array.isArray(data) ? data.slice(1) : [];

      for (const job of listings) {
        if (jobs.length >= max_results) break;
        if (!job.position || !job.company) continue;

        const text = `${job.position} ${job.company} ${(job.tags || []).join(" ")} ${job.description || ""}`;
        if (!matchesKeyword(text, role)) continue;

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
  } catch (e: any) {
    const msg = `RemoteOK error: ${e.message}`;
    errors.push(msg);
    console.error(`[searchJobs] ${msg}`);
  }

  // ── We Work Remotely RSS ───────────────────────────────────────────────────
  if (jobs.length < max_results) {
    try {
      const wwrCategory = role.toLowerCase().includes("design")
        ? "design"
        : role.toLowerCase().includes("market")
          ? "marketing"
          : "programming";

      const res = await fetch(
        `https://weworkremotely.com/categories/remote-${wwrCategory}-jobs.rss`,
        { headers: { "User-Agent": "JobPilot-MCP/1.0" } }
      );

      if (!res.ok) {
        const msg = `WWR HTTP ${res.status}`;
        errors.push(msg);
        console.error(`[searchJobs] ${msg}`);
      } else {
        const xml = await res.text();
        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
        let match;

        while ((match = itemRegex.exec(xml)) !== null && jobs.length < max_results) {
          const item = match[1];
          const getTag = (tag: string) => {
            const m =
              new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`).exec(item) ||
              new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`).exec(item);
            return m ? m[1].trim() : "";
          };

          const title = getTag("title");
          const link = getTag("link");
          const desc = getTag("description").replace(/<[^>]+>/g, "").slice(0, 500);

          const text = `${title} ${desc}`;
          if (!matchesKeyword(text, role)) continue;

          const company = title.split(" at ").pop() || "Unknown";
          const jobTitle = title.split(" at ")[0] || title;

          jobs.push({
            id: `wwr-${Buffer.from(link).toString("base64").slice(0, 16)}`,
            title: jobTitle,
            company,
            url: link,
            description: desc,
            tags: [wwrCategory],
            date_posted: getTag("pubDate"),
            source: "WeWorkRemotely",
          });
        }
      }
    } catch (e: any) {
      const msg = `WWR error: ${e.message}`;
      errors.push(msg);
      console.error(`[searchJobs] ${msg}`);
    }
  }

  // ── Working Nomads ─────────────────────────────────────────────────────────
  if (jobs.length < max_results) {
    try {
      const res = await fetch(
        "https://www.workingnomads.com/api/exposed_jobs/?category=development",
        { headers: { "User-Agent": "JobPilot-MCP/1.0" } }
      );

      if (!res.ok) {
        const msg = `WorkingNomads HTTP ${res.status}`;
        errors.push(msg);
        console.error(`[searchJobs] ${msg}`);
      } else {
        const data = (await res.json()) as any[];
        if (!Array.isArray(data)) {
          const msg = "WorkingNomads returned non-array response";
          errors.push(msg);
          console.error(`[searchJobs] ${msg}`);
        } else {
          for (const job of data) {
            if (jobs.length >= max_results) break;

            const text = `${job.title || ""} ${job.company_name || ""} ${(job.tags || []).map((t: any) => t.name || t).join(" ")} ${job.description || ""}`;
            if (!matchesKeyword(text, role)) continue;

            jobs.push({
              id: `wn-${job.id || job.slug || Math.random().toString(36).slice(2, 10)}`,
              title: job.title || "Untitled",
              company: job.company_name || "Unknown",
              url: job.url || job.apply_url || "",
              salary: job.salary || undefined,
              description: (job.description || "").replace(/<[^>]+>/g, "").slice(0, 500),
              tags: Array.isArray(job.tags)
                ? job.tags.map((t: any) => (typeof t === "string" ? t : t.name || ""))
                : [],
              date_posted: job.pub_date || new Date().toISOString(),
              source: "WorkingNomads",
            });
          }
        }
      }
    } catch (e: any) {
      const msg = `WorkingNomads error: ${e.message}`;
      errors.push(msg);
      console.error(`[searchJobs] ${msg}`);
    }
  }

  if (jobs.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: false,
              message: `No jobs found for "${role}". Try a broader keyword like "developer" or "engineer".`,
              errors,
              jobs: [],
            },
            null,
            2
          ),
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
            errors: errors.length > 0 ? errors : undefined,
            jobs,
          },
          null,
          2
        ),
      },
    ],
  };
}
