import type { Page } from "playwright";
import { mkdirSync } from "fs";
import { logToNotion } from "./logToNotion.js";
import { scoreJobFit } from "./scoreJobFit.js";
import { generateCoverLetter } from "./generateCoverLetter.js";
import { getSession } from "./browserSession.js";
import type { CandidateProfile } from "./parseCV.js";
import type { JobListing } from "./searchJobs.js";

// ── Screenshot helper ─────────────────────────────────────────────────────────

async function takeScreenshot(page: Page, label: string): Promise<string> {
  try {
    const dir = "screenshots";
    mkdirSync(dir, { recursive: true });
    const date = new Date().toISOString().split("T")[0];
    const safe = label.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 40);
    const path = `${dir}/indeed-${safe}-${date}.png`;
    await page.screenshot({ path, fullPage: false });
    return path;
  } catch {
    return "";
  }
}

// ── Duplicate detection ───────────────────────────────────────────────────────

async function isDuplicate(jobUrl: string): Promise<boolean> {
  const NOTION_API_KEY = process.env.NOTION_API_KEY;
  const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;
  if (!NOTION_API_KEY || !NOTION_DATABASE_ID) return false;
  try {
    const res = await fetch(
      `https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${NOTION_API_KEY}`,
          "Content-Type": "application/json",
          "Notion-Version": "2022-06-28",
        },
        body: JSON.stringify({
          filter: { property: "Job URL", url: { equals: jobUrl } },
        }),
      }
    );
    if (!res.ok) return false;
    const data = (await res.json()) as any;
    return Array.isArray(data.results) && data.results.length > 0;
  } catch {
    return false;
  }
}

// ── Login check & wait ────────────────────────────────────────────────────────
// Indeed login is optional — many Indeed Apply jobs work without a login.
// However a logged-in session pre-fills name/email/resume and increases
// the success rate. We detect the login state and prompt if needed.

async function ensureLoggedIn(page: Page): Promise<boolean> {
  await page.goto("https://www.indeed.com/", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });

  // Check for a logged-in indicator (avatar menu, "Sign out" link, etc.)
  const signedIn =
    (await page.locator('[aria-label*="account"], [data-gnav-element-name="SignOut"], #SignedInLink').count()) > 0;

  if (signedIn) {
    console.error("[indeedApply] Session active — already logged in");
    return true;
  }

  console.error(
    "[indeedApply] Not logged in. Opening Indeed sign-in page..."
  );
  console.error(
    "[indeedApply] Waiting up to 2 minutes for manual login. Sign in to Indeed in the browser window."
  );

  await page.goto("https://secure.indeed.com/auth", {
    waitUntil: "domcontentloaded",
  });

  try {
    await page.waitForURL(
      (u) =>
        u.href.includes("indeed.com") &&
        !u.href.includes("/auth") &&
        !u.href.includes("/login"),
      { timeout: 120000 }
    );
    console.error("[indeedApply] Login detected — session saved");
    return true;
  } catch {
    // Session not confirmed but we'll try anyway — many jobs don't require login
    console.error(
      "[indeedApply] Login not confirmed — will attempt applying without logged-in session"
    );
    return true; // don't abort; try unauthenticated
  }
}

// ── Build Indeed search URL ───────────────────────────────────────────────────

function buildSearchUrl(filters: {
  role: string;
  location: string;
  remote: boolean;
  indeed_apply_only: boolean;
  date_posted_days: number;
  job_type: string;
  salary_min?: number;
}): string {
  const params = new URLSearchParams();
  params.set("q", filters.role);
  params.set("l", filters.remote ? "Remote" : filters.location);

  if (filters.remote) params.set("remotejob", "1");

  if (filters.indeed_apply_only) params.set("iafc", "1"); // Indeed Apply only

  if (filters.date_posted_days > 0) {
    params.set("fromage", String(filters.date_posted_days));
  }

  const jtMap: Record<string, string> = {
    full_time: "fulltime",
    part_time: "parttime",
    contract: "contract",
    temporary: "temporary",
    internship: "internship",
  };
  if (filters.job_type && jtMap[filters.job_type]) {
    params.set("jt", jtMap[filters.job_type]);
  }

  if (filters.salary_min) {
    params.set("salary", String(filters.salary_min));
  }

  return `https://www.indeed.com/jobs?${params.toString()}`;
}

// ── Scrape Indeed job listings ────────────────────────────────────────────────

async function scrapeJobs(
  page: Page,
  searchUrl: string,
  maxJobs: number,
  indeedApplyOnly: boolean
): Promise<JobListing[]> {
  await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(3000);

  // Scroll to load more results
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollBy(0, 600));
    await page.waitForTimeout(1000);
  }

  const jobs: JobListing[] = [];

  // Job card selectors (Indeed updates HTML periodically)
  const cards = await page
    .locator(".job_seen_beacon, .resultContent, .tapItem")
    .all();

  console.error(`[indeedApply] Found ${cards.length} job cards`);

  for (const card of cards.slice(0, maxJobs * 2)) {
    try {
      // Title
      const titleEl = card.locator(
        "h2.jobTitle a, .jcs-JobTitle, a[data-jk]"
      ).first();
      const title = ((await titleEl.textContent().catch(() => "")) || "").trim();
      if (!title) continue;

      // Job key (used to build the job URL)
      const jobKey =
        (await titleEl.getAttribute("data-jk").catch(() => "")) ||
        (await card.locator("[data-jk]").first().getAttribute("data-jk").catch(() => ""));

      const url = jobKey
        ? `https://www.indeed.com/viewjob?jk=${jobKey}`
        : "";
      if (!url) continue;

      const id = `indeed-${jobKey || Math.random().toString(36).slice(2, 10)}`;

      // Company
      const company = (
        (await card
          .locator(".companyName, [data-testid='company-name']")
          .first()
          .textContent()
          .catch(() => "Unknown")) || "Unknown"
      ).trim();

      // Salary
      const salary = (
        (await card
          .locator(".salary-snippet, [data-testid='attribute_snippet_testid']")
          .first()
          .textContent()
          .catch(() => "")) || ""
      ).trim() || undefined;

      // "Easily apply" badge
      const hasIndeedApply =
        (await card.locator(':text("Easily apply"), .indeedApplyBadge').count()) > 0;

      if (indeedApplyOnly && !hasIndeedApply) continue;

      jobs.push({
        id,
        title,
        company,
        url,
        salary,
        description: "",
        tags: [],
        date_posted: new Date().toISOString(),
        source: hasIndeedApply ? "Indeed (Easily Apply)" : "Indeed",
      });
    } catch (err: any) {
      console.error(`[indeedApply] Card parse error: ${err.message}`);
    }
  }

  return jobs;
}

// ── Confirmation detection ────────────────────────────────────────────────────

interface Confirmation {
  confirmed: boolean;
  confidence: "high" | "medium" | "none";
  message: string;
}

async function detectConfirmation(page: Page): Promise<Confirmation> {
  try {
    const text = ((await page.textContent("body").catch(() => "")) || "").toLowerCase();
    const url = page.url();

    // High confidence: explicit confirmation text
    if (/application submitted|application has been submitted/i.test(text)) {
      return {
        confirmed: true,
        confidence: "high",
        message: "Indeed confirmed: 'Application submitted'",
      };
    }
    if (/your application was sent|application was submitted/i.test(text)) {
      return {
        confirmed: true,
        confidence: "high",
        message: "Confirmed: application sent message detected",
      };
    }
    if (/thank you for applying|thanks for applying/i.test(text)) {
      return {
        confirmed: true,
        confidence: "high",
        message: "Confirmed: 'Thank you for applying' message detected",
      };
    }
    if (/successfully applied|you.ve applied/i.test(text)) {
      return {
        confirmed: true,
        confidence: "high",
        message: "Confirmed: 'Successfully applied' message detected",
      };
    }

    // Medium confidence: URL contains confirmation path
    if (url.includes("/apply/confirmation") || url.includes("applied=true")) {
      return {
        confirmed: true,
        confidence: "medium",
        message: "Likely confirmed: redirected to confirmation URL",
      };
    }

    return {
      confirmed: false,
      confidence: "none",
      message: "No confirmation detected — check screenshot to verify manually",
    };
  } catch {
    return {
      confirmed: false,
      confidence: "none",
      message: "Could not read page — check screenshot",
    };
  }
}

// ── Indeed Apply form fill ────────────────────────────────────────────────────

interface ApplyResult {
  success: boolean;
  confirmation: Confirmation;
  screenshot_path: string;
  notes: string;
}

async function applyIndeedJob(
  page: Page,
  job: JobListing,
  profile: CandidateProfile,
  coverLetter: string,
  dryRun: boolean
): Promise<ApplyResult> {
  const nameParts = (profile.name || "").split(" ");
  const firstName = nameParts[0] || "";
  const lastName = nameParts.slice(1).join(" ") || "";

  try {
    await page.goto(job.url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2500);

    const bodyText = ((await page.textContent("body").catch(() => "")) || "").toLowerCase();

    // Grab description
    const desc = await page
      .locator("#jobDescriptionText, .jobsearch-JobComponent-description")
      .first()
      .textContent()
      .catch(() => "");
    job.description = (desc || "").slice(0, 1000);

    // Guard: already applied
    if (/you.ve applied|already applied/i.test(bodyText)) {
      return {
        success: false,
        confirmation: { confirmed: false, confidence: "none", message: "" },
        screenshot_path: "",
        notes: "Already applied to this job on Indeed",
      };
    }

    // Guard: CAPTCHA
    if (/captcha|verify you are human/i.test(bodyText)) {
      return {
        success: false,
        confirmation: { confirmed: false, confidence: "none", message: "" },
        screenshot_path: "",
        notes: "CAPTCHA detected — skipped",
      };
    }

    // Click the apply button
    const applyBtn = page.locator(
      'button:has-text("Apply now"), button:has-text("Easily apply"), #indeedApplyButton, .indeed-apply-button'
    );

    if ((await applyBtn.count()) === 0) {
      return {
        success: false,
        confirmation: { confirmed: false, confidence: "none", message: "" },
        screenshot_path: "",
        notes: "No Indeed Apply button found — external application, skipped",
      };
    }

    await applyBtn.first().click();
    await page.waitForTimeout(2500);

    // Dry run: screenshot and bail
    if (dryRun) {
      const screenshotPath = await takeScreenshot(page, job.company);
      return {
        success: true,
        confirmation: { confirmed: false, confidence: "none", message: "" },
        screenshot_path: screenshotPath,
        notes: "Dry run — Indeed Apply form opened but not submitted",
      };
    }

    // ── Multi-step Indeed Apply form loop ──────────────────────────────────
    let stepCount = 0;
    const maxSteps = 10;
    let submitted = false;

    while (stepCount < maxSteps) {
      stepCount++;
      await page.waitForTimeout(1500);

      // Fill contact fields (shown on first step)
      if (stepCount === 1) {
        await fillField(page, 'input[name="applicant.name"], input[id*="applicant.name"]', profile.name);
        await fillField(page, 'input[name*="firstName"], input[id*="firstName"]', firstName);
        await fillField(page, 'input[name*="lastName"], input[id*="lastName"]', lastName);
        await fillField(page, 'input[type="email"], input[name*="email"]', profile.email);
        await fillField(page, 'input[type="tel"], input[name*="phone"]', profile.phone || "");
      }

      // Fill cover letter textarea if present
      const textareas = page.locator("textarea:visible");
      const taCount = await textareas.count();
      for (let i = 0; i < taCount; i++) {
        const ta = textareas.nth(i);
        const placeholder = ((await ta.getAttribute("placeholder")) || "").toLowerCase();
        const name = ((await ta.getAttribute("name")) || "").toLowerCase();
        const current = (await ta.inputValue().catch(() => "")).trim();
        if (
          current.length < 10 &&
          /cover|letter|message|additional|about/i.test(`${placeholder} ${name}`)
        ) {
          await ta.fill(coverLetter.slice(0, 3000));
        }
      }

      // Submit button — final step
      const submitBtn = page.locator(
        'button:has-text("Submit your application"), button:has-text("Submit application"), button[type="submit"]:has-text("Submit")'
      );
      if ((await submitBtn.count()) > 0) {
        await submitBtn.first().click();
        await page.waitForTimeout(3000);
        submitted = true;
        break;
      }

      // Continue / Next button
      const nextBtn = page.locator(
        'button:has-text("Continue"), button:has-text("Next"), button[type="submit"]:not(:has-text("Submit"))'
      );
      if ((await nextBtn.count()) > 0) {
        await nextBtn.first().click();
        await page.waitForTimeout(1500);
        continue;
      }

      // No navigation found
      console.error(
        `[indeedApply] No navigation button at step ${stepCount} for ${job.title}`
      );
      break;
    }

    const screenshotPath = await takeScreenshot(page, job.company);
    const confirmation = await detectConfirmation(page);

    return {
      success: submitted,
      confirmation,
      screenshot_path: screenshotPath,
      notes: submitted
        ? `Indeed Apply submitted in ${stepCount} step(s). ${confirmation.message}`
        : `Did not reach Submit after ${stepCount} step(s) — check screenshot`,
    };
  } catch (err: any) {
    return {
      success: false,
      confirmation: { confirmed: false, confidence: "none", message: "" },
      screenshot_path: "",
      notes: `Unexpected error: ${err.message}`,
    };
  }
}

// ── Fill a field if visible ───────────────────────────────────────────────────

async function fillField(page: Page, selector: string, value: string): Promise<void> {
  if (!value) return;
  try {
    const el = page.locator(selector).first();
    if ((await el.count()) === 0 || !(await el.isVisible())) return;
    await el.fill(value);
  } catch {
    // Skip
  }
}

// ── Main exported function ────────────────────────────────────────────────────

export async function indeedApply(args: {
  candidate_profile: CandidateProfile;
  role: string;
  location?: string;
  remote?: boolean;
  indeed_apply_only?: boolean;
  date_posted_days?: number;
  job_type?: "full_time" | "part_time" | "contract" | "temporary" | "internship";
  salary_min?: number;
  min_fit_score?: number;
  max_applications?: number;
  tone?: "professional" | "enthusiastic" | "concise";
  dry_run?: boolean;
}) {
  const {
    candidate_profile,
    role,
    location = "Remote",
    remote = true,
    indeed_apply_only = true,
    date_posted_days = 7,
    job_type = "full_time",
    salary_min,
    min_fit_score = 60,
    max_applications = 10,
    tone = "professional",
    dry_run = false,
  } = args;

  const maxApps = Math.min(max_applications, 20);
  const applicationLog: any[] = [];

  const searchUrl = buildSearchUrl({
    role,
    location,
    remote,
    indeed_apply_only,
    date_posted_days,
    job_type,
    salary_min,
  });

  console.error(`[indeedApply] Starting: role="${role}" max=${maxApps} dryRun=${dry_run}`);
  console.error(`[indeedApply] Search URL: ${searchUrl}`);

  let session: Awaited<ReturnType<typeof getSession>> | undefined;
  let page: Page | undefined;

  try {
    session = await getSession("indeed");
    page = await session.context.newPage();

    // Step 1: Login
    await ensureLoggedIn(page);

    // Step 2: Scrape jobs
    console.error("[indeedApply] Scraping job listings...");
    const jobs = await scrapeJobs(page, searchUrl, maxApps * 2, indeed_apply_only);
    console.error(`[indeedApply] Scraped ${jobs.length} jobs`);

    if (jobs.length === 0) {
      await session.cleanup(page);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: false,
                message: `No Indeed jobs found for "${role}" with these filters. Try: higher date_posted_days, indeed_apply_only: false, or broader role keyword.`,
                search_url: searchUrl,
                total_found: 0,
                total_applied: 0,
                total_confirmed: 0,
                applications: [],
              },
              null,
              2
            ),
          },
        ],
      };
    }

    // Step 3: Score & filter
    console.error("[indeedApply] Scoring jobs...");
    const scored: Array<{ job: JobListing; score: number }> = [];

    for (const job of jobs) {
      try {
        const r = await scoreJobFit({ candidate_profile, job });
        const d = JSON.parse(r.content[0].text);
        scored.push({ job, score: d?.fit?.score ?? 50 });
      } catch {
        scored.push({ job, score: 50 });
      }
    }

    const qualifying = scored
      .filter((s) => s.score >= min_fit_score)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxApps);

    console.error(
      `[indeedApply] ${scored.length} scored, ${qualifying.length} qualify (score >= ${min_fit_score})`
    );

    if (qualifying.length === 0) {
      await session.cleanup(page);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: false,
                message: `No jobs met the minimum fit score of ${min_fit_score}. Lower min_fit_score or broaden your search.`,
                top_scores: scored
                  .sort((a, b) => b.score - a.score)
                  .slice(0, 5)
                  .map((s) => `${s.job.title} at ${s.job.company}: ${s.score}/100`),
                total_found: jobs.length,
                total_applied: 0,
                total_confirmed: 0,
                applications: [],
              },
              null,
              2
            ),
          },
        ],
      };
    }

    // Step 4: Apply
    for (const { job, score } of qualifying) {
      // Duplicate check
      if (job.url && (await isDuplicate(job.url))) {
        console.error(`[indeedApply] Duplicate skip: ${job.title} at ${job.company}`);
        applicationLog.push({
          company: job.company,
          job_title: job.title,
          fit_score: score,
          status: "Skipped",
          confirmed: false,
          notes: "Already in Notion (duplicate)",
          url: job.url,
        });
        continue;
      }

      // Generate cover letter
      let coverLetter = "";
      let coverSnippet = "";
      try {
        const lr = await generateCoverLetter({ candidate_profile, job, tone });
        const ld = JSON.parse(lr.content[0].text);
        coverLetter = ld?.cover_letter || "";
        coverSnippet = ld?.snippet || "";
      } catch (err: any) {
        console.error(`[indeedApply] Cover letter error: ${err.message}`);
      }

      // Apply
      console.error(`[indeedApply] Applying: ${job.title} at ${job.company} (score: ${score})`);
      const result = await applyIndeedJob(page, job, candidate_profile, coverLetter, dry_run);

      const notionStatus: "Applied" | "Pending" = result.success ? "Applied" : "Pending";

      const notionNotes = [
        `[indeed_apply]`,
        result.success ? "✓ Applied" : "✗ Not applied",
        `Confirmation: ${result.confirmation.confirmed ? `✓ ${result.confirmation.confidence.toUpperCase()} — ${result.confirmation.message}` : `? Unconfirmed — ${result.confirmation.message}`}`,
        result.screenshot_path ? `Screenshot: ${result.screenshot_path}` : "",
        result.notes,
      ]
        .filter(Boolean)
        .join(" | ")
        .slice(0, 2000);

      // Log to Notion
      let notionUrl = "";
      try {
        const nr = await logToNotion({
          job_title: job.title,
          company_name: job.company,
          job_url: job.url,
          salary: job.salary,
          fit_score: score,
          status: notionStatus,
          cover_letter_snippet: coverSnippet,
          notes: notionNotes,
        });
        const nd = JSON.parse(nr.content[0].text);
        notionUrl = nd?.notion_url || "";
      } catch (err: any) {
        console.error(`[indeedApply] Notion log error: ${err.message}`);
      }

      applicationLog.push({
        company: job.company,
        job_title: job.title,
        fit_score: score,
        status: notionStatus,
        confirmed: result.confirmation.confirmed,
        confirmation_confidence: result.confirmation.confidence,
        confirmation_message: result.confirmation.message,
        screenshot: result.screenshot_path || null,
        notes: result.notes,
        notion_url: notionUrl || null,
        url: job.url,
      });

      await page.waitForTimeout(3500);
    }

    await session.cleanup(page);

    const totalApplied = applicationLog.filter((a) => a.status === "Applied").length;
    const totalConfirmed = applicationLog.filter((a) => a.confirmed).length;

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: true,
              search_url: searchUrl,
              total_found: jobs.length,
              total_qualifying: qualifying.length,
              total_applied: totalApplied,
              total_confirmed: totalConfirmed,
              confirmation_rate:
                totalApplied > 0
                  ? `${Math.round((totalConfirmed / totalApplied) * 100)}%`
                  : "0%",
              note: "Check 'confirmed' and 'screenshot' on each application to verify. 'confirmed: true' means Indeed showed a success message.",
              applications: applicationLog,
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (err: any) {
    if (session && page) await session.cleanup(page).catch(() => {});
    else if (session) await session.context.close().catch(() => {});
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: false,
              message: `indeed_apply failed: ${err.message}`,
              applications: applicationLog,
            },
            null,
            2
          ),
        },
      ],
    };
  }
}
