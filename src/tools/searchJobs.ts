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

// Related tags for specific domains — used as fallback matching
const RELATED_TAGS: Record<string, string[]> = {
  flutter: ["flutter", "dart"],
  mobile: ["flutter", "dart", "mobile", "react-native", "swift", "kotlin"],
  react: ["react", "reactjs", "react-native", "javascript", "typescript", "frontend"],
  ios: ["ios", "swift", "flutter", "dart"],
  android: ["android", "kotlin", "java", "flutter", "dart"],
};

export async function searchJobs(args: {
  role: string;
  location?: string;
  max_results?: number;
}): Promise<{ content: Array<{ type: string; text: string }> }> {
  const { role, max_results = 10 } = args;
  const errors: string[] = [];

  // Build keyword list: split role into words + add related tags
  const keywords = role.toLowerCase().split(/\s+/).filter((w) => w.length > 0);
  const relatedTags: string[] = [];
  for (const kw of keywords) {
    if (RELATED_TAGS[kw]) {
      relatedTags.push(...RELATED_TAGS[kw]);
    }
  }
  const allMatchTerms = [...new Set([...keywords, ...relatedTags])];

  console.error(`[searchJobs] role="${role}" keywords=${JSON.stringify(keywords)} matchTerms=${JSON.stringify(allMatchTerms)}`);

  // ── Filter function: job must match in title OR tags ─────────────────────
  function jobMatchesRole(title: string, tags: string[]): boolean {
    const titleLower = title.toLowerCase();
    const tagsLower = tags.map((t) => t.toLowerCase());

    const titleMatch = allMatchTerms.some((k) => titleLower.includes(k));
    const tagMatch = tagsLower.some((tag) =>
      allMatchTerms.some((k) => tag.includes(k) || k.includes(tag))
    );

    return titleMatch || tagMatch;
  }

  // ── Collect jobs from all sources ────────────────────────────────────────
  const allFetchedJobs: JobListing[] = [];

  // ── RemoteOK ─────────────────────────────────────────────────────────────
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

      const listings = Array.isArray(data) ? data.slice(1) : [];
      console.error(`[searchJobs] RemoteOK returned ${listings.length} total listings`);

      for (const job of listings) {
        if (!job.position || !job.company) continue;

        allFetchedJobs.push({
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

  // ── We Work Remotely RSS ─────────────────────────────────────────────────
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

      while ((match = itemRegex.exec(xml)) !== null) {
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
        const company = title.split(" at ").pop() || "Unknown";
        const jobTitle = title.split(" at ")[0] || title;

        allFetchedJobs.push({
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

  // ── Working Nomads ───────────────────────────────────────────────────────
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
          const jobTags = Array.isArray(job.tags)
            ? job.tags.map((t: any) => (typeof t === "string" ? t : t.name || ""))
            : [];

          allFetchedJobs.push({
            id: `wn-${job.id || job.slug || Math.random().toString(36).slice(2, 10)}`,
            title: job.title || "Untitled",
            company: job.company_name || "Unknown",
            url: job.url || job.apply_url || "",
            salary: job.salary || undefined,
            description: (job.description || "").replace(/<[^>]+>/g, "").slice(0, 500),
            tags: jobTags,
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

  // ── FILTER: only keep jobs matching the role ─────────────────────────────
  console.error(`[searchJobs] Total fetched before filter: ${allFetchedJobs.length}`);

  const filtered = allFetchedJobs.filter((job) => jobMatchesRole(job.title, job.tags));

  console.error(`[searchJobs] After filter: ${filtered.length} jobs match "${role}"`);

  // Log first few rejected titles for debugging
  if (filtered.length === 0 && allFetchedJobs.length > 0) {
    const sample = allFetchedJobs.slice(0, 5).map((j) => `"${j.title}" [${j.tags.join(",")}]`);
    console.error(`[searchJobs] Sample rejected titles: ${sample.join(", ")}`);
  }

  const jobs = filtered.slice(0, max_results);

  if (jobs.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: false,
              message: `No ${role} jobs found right now. ${allFetchedJobs.length} jobs were fetched but none matched "${role}". Try again later or use a broader keyword.`,
              errors: errors.length > 0 ? errors : undefined,
              total_fetched: allFetchedJobs.length,
              total_matched: 0,
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
