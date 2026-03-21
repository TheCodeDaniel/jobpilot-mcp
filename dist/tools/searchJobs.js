export async function searchJobs(args) {
    const { role, max_results = 10 } = args;
    const jobs = [];
    const errors = [];
    // ── RemoteOK ───────────────────────────────────────────────────────────────
    try {
        const res = await fetch("https://remoteok.com/api", {
            headers: { "User-Agent": "JobPilot-MCP/1.0" },
        });
        if (!res.ok) {
            errors.push(`RemoteOK HTTP ${res.status}`);
        }
        else {
            const data = (await res.json());
            // Index 0 is a legal notice / metadata object — skip it
            const listings = data.slice(1);
            const keyword = role.toLowerCase();
            for (const job of listings) {
                if (jobs.length >= max_results)
                    break;
                if (!job.position || !job.company)
                    continue;
                const text = `${job.position} ${job.company} ${(job.tags || []).join(" ")} ${job.description || ""}`.toLowerCase();
                if (!text.includes(keyword) && !keyword.split(/\s+/).some((w) => text.includes(w)))
                    continue;
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
    }
    catch (e) {
        errors.push(`RemoteOK error: ${e.message}`);
    }
    // ── We Work Remotely RSS ───────────────────────────────────────────────────
    if (jobs.length < max_results) {
        try {
            const wwrCategory = role.toLowerCase().includes("design")
                ? "design"
                : role.toLowerCase().includes("market")
                    ? "marketing"
                    : "programming";
            const res = await fetch(`https://weworkremotely.com/categories/remote-${wwrCategory}-jobs.rss`, { headers: { "User-Agent": "JobPilot-MCP/1.0" } });
            if (!res.ok) {
                errors.push(`WWR HTTP ${res.status}`);
            }
            else {
                const xml = await res.text();
                const itemRegex = /<item>([\s\S]*?)<\/item>/g;
                let match;
                const keyword = role.toLowerCase();
                while ((match = itemRegex.exec(xml)) !== null && jobs.length < max_results) {
                    const item = match[1];
                    const getTag = (tag) => {
                        const m = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`).exec(item) ||
                            new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`).exec(item);
                        return m ? m[1].trim() : "";
                    };
                    const title = getTag("title");
                    const link = getTag("link");
                    const desc = getTag("description").replace(/<[^>]+>/g, "").slice(0, 500);
                    // Match against keywords in the role
                    const text = `${title} ${desc}`.toLowerCase();
                    if (!keyword.split(/\s+/).some((w) => text.includes(w)))
                        continue;
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
        }
        catch (e) {
            errors.push(`WWR error: ${e.message}`);
        }
    }
    // ── Working Nomads fallback ────────────────────────────────────────────────
    if (jobs.length < max_results) {
        try {
            const res = await fetch("https://www.workingnomads.com/api/exposed_jobs/?category=development", { headers: { "User-Agent": "JobPilot-MCP/1.0" } });
            if (!res.ok) {
                errors.push(`WorkingNomads HTTP ${res.status}`);
            }
            else {
                const data = (await res.json());
                const keyword = role.toLowerCase();
                for (const job of data) {
                    if (jobs.length >= max_results)
                        break;
                    const text = `${job.title || ""} ${job.company_name || ""} ${(job.tags || []).map((t) => t.name || t).join(" ")} ${job.description || ""}`.toLowerCase();
                    if (!keyword.split(/\s+/).some((w) => text.includes(w)))
                        continue;
                    jobs.push({
                        id: `wn-${job.id || job.slug || Math.random().toString(36).slice(2, 10)}`,
                        title: job.title || "Untitled",
                        company: job.company_name || "Unknown",
                        url: job.url || job.apply_url || "",
                        salary: job.salary || undefined,
                        description: (job.description || "").replace(/<[^>]+>/g, "").slice(0, 500),
                        tags: Array.isArray(job.tags)
                            ? job.tags.map((t) => (typeof t === "string" ? t : t.name || ""))
                            : [],
                        date_posted: job.pub_date || new Date().toISOString(),
                        source: "WorkingNomads",
                    });
                }
            }
        }
        catch (e) {
            errors.push(`WorkingNomads error: ${e.message}`);
        }
    }
    if (jobs.length === 0) {
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: false,
                        message: `No jobs found for "${role}". Try a broader keyword like "developer" or "engineer".`,
                        errors: errors.length > 0 ? errors : undefined,
                        jobs: [],
                    }, null, 2),
                },
            ],
        };
    }
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({
                    success: true,
                    total: jobs.length,
                    errors: errors.length > 0 ? errors : undefined,
                    jobs,
                }, null, 2),
            },
        ],
    };
}
//# sourceMappingURL=searchJobs.js.map