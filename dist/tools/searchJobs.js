function matchesRole(title, tags, role) {
    const roleWords = role.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
    const titleLower = title.toLowerCase();
    // Check if title contains the full role or any significant keyword
    if (titleLower.includes(role.toLowerCase()))
        return true;
    if (roleWords.some((w) => titleLower.includes(w)))
        return true;
    // Check if tags contain any keyword from the role
    const tagsLower = tags.map((t) => t.toLowerCase());
    if (roleWords.some((w) => tagsLower.some((tag) => tag.includes(w) || w.includes(tag))))
        return true;
    return false;
}
export async function searchJobs(args) {
    const { role, max_results = 10 } = args;
    const jobs = [];
    const errors = [];
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
        }
        else {
            const raw = await res.text();
            let data;
            try {
                data = JSON.parse(raw);
            }
            catch {
                const msg = `RemoteOK returned invalid JSON (${raw.slice(0, 100)})`;
                errors.push(msg);
                console.error(`[searchJobs] ${msg}`);
                data = [];
            }
            // Index 0 is a legal notice / metadata object — skip it
            const listings = Array.isArray(data) ? data.slice(1) : [];
            for (const job of listings) {
                if (jobs.length >= max_results)
                    break;
                if (!job.position || !job.company)
                    continue;
                if (!matchesRole(job.position, job.tags || [], role))
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
            const res = await fetch(`https://weworkremotely.com/categories/remote-${wwrCategory}-jobs.rss`, { headers: { "User-Agent": "JobPilot-MCP/1.0" } });
            if (!res.ok) {
                const msg = `WWR HTTP ${res.status}`;
                errors.push(msg);
                console.error(`[searchJobs] ${msg}`);
            }
            else {
                const xml = await res.text();
                const itemRegex = /<item>([\s\S]*?)<\/item>/g;
                let match;
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
                    if (!matchesRole(title, [wwrCategory], role))
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
            const msg = `WWR error: ${e.message}`;
            errors.push(msg);
            console.error(`[searchJobs] ${msg}`);
        }
    }
    // ── Working Nomads ─────────────────────────────────────────────────────────
    if (jobs.length < max_results) {
        try {
            const res = await fetch("https://www.workingnomads.com/api/exposed_jobs/?category=development", { headers: { "User-Agent": "JobPilot-MCP/1.0" } });
            if (!res.ok) {
                const msg = `WorkingNomads HTTP ${res.status}`;
                errors.push(msg);
                console.error(`[searchJobs] ${msg}`);
            }
            else {
                const data = (await res.json());
                if (!Array.isArray(data)) {
                    const msg = "WorkingNomads returned non-array response";
                    errors.push(msg);
                    console.error(`[searchJobs] ${msg}`);
                }
                else {
                    for (const job of data) {
                        if (jobs.length >= max_results)
                            break;
                        const jobTags = Array.isArray(job.tags)
                            ? job.tags.map((t) => (typeof t === "string" ? t : t.name || ""))
                            : [];
                        if (!matchesRole(job.title || "", jobTags, role))
                            continue;
                        jobs.push({
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
        }
        catch (e) {
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
                    text: JSON.stringify({
                        success: false,
                        message: `No jobs found for "${role}". Try a broader keyword like "developer" or "engineer".`,
                        errors,
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