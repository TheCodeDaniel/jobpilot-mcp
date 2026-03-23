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
    const path = `${dir}/linkedin-${safe}-${date}.png`;
    await page.screenshot({ path, fullPage: false });
    return path;
  } catch {
    return "";
  }
}

// ── Duplicate detection (checks Notion before applying) ──────────────────────

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
// If the session is fresh, we're already logged in.
// If not, we open the login page and wait up to 2 minutes for the user to
// log in manually. After that, the session is saved and reused next time.

async function ensureLoggedIn(page: Page): Promise<boolean> {
  await page.goto("https://www.linkedin.com/feed/", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });

  const url = page.url();
  if (!url.includes("/login") && !url.includes("/checkpoint") && !url.includes("/authwall")) {
    console.error("[linkedInApply] Session active — already logged in");
    return true;
  }

  // Not logged in — open login page and wait for the user
  console.error("[linkedInApply] Not logged in. Opening LinkedIn login page...");
  console.error("[linkedInApply] Waiting up to 2 minutes for manual login. Log in to LinkedIn in the browser window that just opened.");
  await page.goto("https://www.linkedin.com/login", { waitUntil: "domcontentloaded" });

  try {
    await page.waitForURL((u) => u.href.includes("/feed") || u.href.includes("/jobs"), {
      timeout: 120000,
    });
    console.error("[linkedInApply] Login detected — session saved for future runs");
    return true;
  } catch {
    console.error("[linkedInApply] Login timed out after 2 minutes");
    return false;
  }
}

// ── Build LinkedIn job search URL ─────────────────────────────────────────────

function buildSearchUrl(filters: {
  role: string;
  location: string;
  remote: boolean;
  easy_apply_only: boolean;
  date_posted: "day" | "week" | "month" | "any";
  experience_levels: string[];
  job_types: string[];
}): string {
  const params = new URLSearchParams();
  params.set("keywords", filters.role);
  params.set("location", filters.location);

  if (filters.remote) params.set("f_WT", "2"); // Remote

  if (filters.easy_apply_only) params.set("f_AL", "true"); // Easy Apply only

  const tprMap: Record<string, string> = {
    day: "r86400",
    week: "r604800",
    month: "r2592000",
  };
  if (filters.date_posted !== "any" && tprMap[filters.date_posted]) {
    params.set("f_TPR", tprMap[filters.date_posted]);
  }

  const expMap: Record<string, string> = {
    internship: "1",
    entry: "2",
    associate: "3",
    mid_senior: "4",
    director: "5",
    executive: "6",
  };
  const expCodes = filters.experience_levels.map((e) => expMap[e]).filter(Boolean);
  if (expCodes.length > 0) params.set("f_E", expCodes.join(","));

  const jtMap: Record<string, string> = {
    full_time: "F",
    part_time: "P",
    contract: "C",
    temporary: "T",
    internship: "I",
  };
  const jtCodes = filters.job_types.map((j) => jtMap[j]).filter(Boolean);
  if (jtCodes.length > 0) params.set("f_JT", jtCodes.join(","));

  return `https://www.linkedin.com/jobs/search/?${params.toString()}`;
}

// ── Scrape job listings from the search results page ─────────────────────────

async function scrapeJobs(
  page: Page,
  searchUrl: string,
  maxJobs: number
): Promise<JobListing[]> {
  await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(3000);

  // Scroll down to trigger lazy-loading of more job cards
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => window.scrollBy(0, 600));
    await page.waitForTimeout(1000);
  }

  const jobs: JobListing[] = [];

  // Try multiple selector patterns (LinkedIn updates their HTML regularly)
  const cardSelector = [
    ".jobs-search-results__list-item",
    ".job-card-container--clickable",
    ".scaffold-layout__list-item",
  ].join(", ");

  const cards = await page.locator(cardSelector).all();
  console.error(`[linkedInApply] Found ${cards.length} job cards on search page`);

  for (const card of cards.slice(0, maxJobs * 2)) {
    try {
      // Title and URL
      const titleLink = card.locator(
        "a.job-card-list__title--link, a.job-card-container__link, .job-card-list__title a"
      ).first();

      const title = ((await titleLink.textContent().catch(() => "")) || "").trim();
      if (!title) continue;

      const href = (await titleLink.getAttribute("href").catch(() => "")) || "";
      if (!href) continue;

      const url = href.startsWith("http")
        ? href.split("?")[0]
        : `https://www.linkedin.com${href.split("?")[0]}`;

      const jobIdMatch = url.match(/\/jobs\/view\/(\d+)/);
      const id = jobIdMatch ? `linkedin-${jobIdMatch[1]}` : `linkedin-${Math.random().toString(36).slice(2, 10)}`;

      // Company
      const company = (
        (await card
          .locator(
            ".job-card-container__primary-description, .job-card-container__company-name"
          )
          .first()
          .textContent()
          .catch(() => "Unknown")) || "Unknown"
      ).trim();

      // Salary (shown on some cards)
      const salary = (
        (await card
          .locator(".job-card-container__salary-info, .compensation-info")
          .first()
          .textContent()
          .catch(() => "")) || ""
      ).trim() || undefined;

      // Easy Apply badge
      const hasEasyApply = (await card.locator(':text("Easy Apply")').count()) > 0;

      jobs.push({
        id,
        title,
        company,
        url,
        salary,
        description: "", // fetched from job page during apply
        tags: [],
        date_posted: new Date().toISOString(),
        source: hasEasyApply ? "LinkedIn (Easy Apply)" : "LinkedIn",
      });
    } catch (err: any) {
      console.error(`[linkedInApply] Error parsing job card: ${err.message}`);
    }
  }

  return jobs;
}

// ── Confirmation detection (multi-signal) ────────────────────────────────────
// This is how we know a job was actually applied to.
// LinkedIn shows a confirmation modal after a successful Easy Apply submission.

interface Confirmation {
  confirmed: boolean;
  confidence: "high" | "medium" | "none";
  message: string;
}

async function detectConfirmation(page: Page): Promise<Confirmation> {
  try {
    const text = ((await page.textContent("body").catch(() => "")) || "").toLowerCase();

    // High confidence: explicit LinkedIn confirmation text
    if (/your application was sent/i.test(text)) {
      return {
        confirmed: true,
        confidence: "high",
        message: "LinkedIn confirmed: 'Your application was sent'",
      };
    }
    if (/application submitted/i.test(text)) {
      return {
        confirmed: true,
        confidence: "high",
        message: "Confirmed: 'Application submitted' message detected",
      };
    }
    if (/successfully applied/i.test(text)) {
      return {
        confirmed: true,
        confidence: "high",
        message: "Confirmed: 'Successfully applied' message detected",
      };
    }
    if (/thank you for applying/i.test(text)) {
      return {
        confirmed: true,
        confidence: "high",
        message: "Confirmed: 'Thank you for applying' message detected",
      };
    }

    // Medium confidence: the "Done" button that appears after LinkedIn submits
    const doneBtn = await page.locator('button:has-text("Done")').count();
    if (doneBtn > 0) {
      return {
        confirmed: true,
        confidence: "medium",
        message: "Likely confirmed: 'Done' button appeared (typical post-submit state)",
      };
    }

    return {
      confirmed: false,
      confidence: "none",
      message: "No confirmation signal detected — check screenshot to verify manually",
    };
  } catch {
    return {
      confirmed: false,
      confidence: "none",
      message: "Could not read page — check screenshot",
    };
  }
}

// ── Easy Apply multi-step flow ────────────────────────────────────────────────

interface ApplyResult {
  success: boolean;
  confirmation: Confirmation;
  screenshot_path: string;
  notes: string;
}

async function applyEasyApply(
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

    // Grab job description for scoring
    const descText = await page
      .locator(".jobs-description__content, .jobs-description, #job-details")
      .first()
      .textContent()
      .catch(() => "");
    job.description = (descText || "").slice(0, 1000);

    // Guard: already applied on LinkedIn
    if (/you.ve applied|already applied/i.test(bodyText)) {
      return {
        success: false,
        confirmation: { confirmed: false, confidence: "none", message: "" },
        screenshot_path: "",
        notes: "Already applied to this job directly on LinkedIn",
      };
    }

    // Guard: CAPTCHA
    if (/captcha|verify you are human|i.m not a robot/i.test(bodyText)) {
      return {
        success: false,
        confirmation: { confirmed: false, confidence: "none", message: "" },
        screenshot_path: "",
        notes: "CAPTCHA detected — skipped",
      };
    }

    // Find and click Easy Apply button
    const easyApplyBtn = page.locator(
      'button:has-text("Easy Apply"), .jobs-apply-button'
    );
    if ((await easyApplyBtn.count()) === 0) {
      return {
        success: false,
        confirmation: { confirmed: false, confidence: "none", message: "" },
        screenshot_path: "",
        notes: "No Easy Apply button found — external application only, skipped",
      };
    }

    await easyApplyBtn.first().click();
    await page.waitForTimeout(2000);

    // Dry run: screenshot the modal and bail
    if (dryRun) {
      const screenshotPath = await takeScreenshot(page, job.company);
      await page.keyboard.press("Escape").catch(() => {});
      return {
        success: true,
        confirmation: { confirmed: false, confidence: "none", message: "" },
        screenshot_path: screenshotPath,
        notes: "Dry run — Easy Apply modal opened but not submitted",
      };
    }

    // ── Multi-step Easy Apply loop ─────────────────────────────────────────
    // LinkedIn Easy Apply can have 1–5 steps. We loop until we hit Submit or
    // exhaust the step limit.
    let stepCount = 0;
    const maxSteps = 12;
    let submitted = false;

    while (stepCount < maxSteps) {
      stepCount++;
      await page.waitForTimeout(1500);

      const modalSelector =
        ".jobs-easy-apply-modal, [data-test-modal], .artdeco-modal";

      // Fill contact fields on each step (LinkedIn may show them on step 1)
      if (stepCount === 1) {
        await fillIfEmpty(page, 'input[id*="firstName"], input[name*="firstName"]', firstName);
        await fillIfEmpty(page, 'input[id*="lastName"], input[name*="lastName"]', lastName);
        await fillIfEmpty(page, 'input[id*="phoneNumber"], input[name*="phone"]', profile.phone || "");
      }

      // Fill cover letter / additional information textarea
      const textareas = page.locator(
        `${modalSelector} textarea:visible, .jobs-easy-apply-form-section textarea:visible`
      );
      const taCount = await textareas.count();
      for (let i = 0; i < taCount; i++) {
        const ta = textareas.nth(i);
        const placeholder = ((await ta.getAttribute("placeholder")) || "").toLowerCase();
        const labelText = await ta.evaluate((el) => {
          const label = document.querySelector(`label[for="${el.id}"]`);
          return label ? label.textContent || "" : "";
        }).catch(() => "");
        const current = (await ta.inputValue().catch(() => "")).trim();

        if (
          current.length < 10 &&
          /cover|letter|additional|message|about|summary/i.test(`${placeholder} ${labelText}`)
        ) {
          await ta.fill(coverLetter.slice(0, 3000));
        }
      }

      // Submit application — final step
      const submitBtn = page.locator(
        'button:has-text("Submit application"), button[aria-label="Submit application"]'
      );
      if ((await submitBtn.count()) > 0) {
        await submitBtn.first().click();
        await page.waitForTimeout(3000);
        submitted = true;
        break;
      }

      // Review step — one more Next after this gets to Submit
      const reviewBtn = page.locator(
        'button:has-text("Review your application"), button:has-text("Review")'
      );
      if ((await reviewBtn.count()) > 0) {
        await reviewBtn.first().click();
        await page.waitForTimeout(1500);
        continue;
      }

      // Continue to next step
      const nextBtn = page.locator(
        'button:has-text("Next"), button[aria-label="Continue to next step"]'
      );
      if ((await nextBtn.count()) > 0) {
        await nextBtn.first().click();
        await page.waitForTimeout(1500);
        continue;
      }

      // No navigation button found — can't proceed
      console.error(
        `[linkedInApply] No navigation button at step ${stepCount} for ${job.title} — stopping`
      );
      break;
    }

    const screenshotPath = await takeScreenshot(page, job.company);
    const confirmation = await detectConfirmation(page);

    // Close the modal
    await page.keyboard.press("Escape").catch(() => {});

    return {
      success: submitted,
      confirmation,
      screenshot_path: screenshotPath,
      notes: submitted
        ? `Easy Apply submitted in ${stepCount} step(s). ${confirmation.message}`
        : `Easy Apply did not reach Submit after ${stepCount} step(s) — check screenshot`,
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

// ── Fill a field only if it is currently empty ────────────────────────────────

async function fillIfEmpty(page: Page, selector: string, value: string): Promise<void> {
  if (!value) return;
  try {
    const el = page.locator(selector).first();
    if ((await el.count()) === 0 || !(await el.isVisible())) return;
    const current = (await el.inputValue().catch(() => "")).trim();
    if (current.length === 0) await el.fill(value);
  } catch {
    // Field missing or not fillable — skip
  }
}

// ── Main exported function ────────────────────────────────────────────────────

export async function linkedInApply(args: {
  candidate_profile: CandidateProfile;
  role: string;
  location?: string;
  remote?: boolean;
  easy_apply_only?: boolean;
  date_posted?: "day" | "week" | "month" | "any";
  experience_levels?: Array<"internship" | "entry" | "associate" | "mid_senior" | "director" | "executive">;
  job_types?: Array<"full_time" | "part_time" | "contract" | "temporary" | "internship">;
  min_fit_score?: number;
  max_applications?: number;
  tone?: "professional" | "enthusiastic" | "concise";
  dry_run?: boolean;
}) {
  const {
    candidate_profile,
    role,
    location = "Worldwide",
    remote = true,
    easy_apply_only = true,
    date_posted = "week",
    experience_levels = ["entry", "associate", "mid_senior"],
    job_types = ["full_time"],
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
    easy_apply_only,
    date_posted,
    experience_levels,
    job_types,
  });

  console.error(`[linkedInApply] Starting: role="${role}" max=${maxApps} dryRun=${dry_run}`);
  console.error(`[linkedInApply] Search URL: ${searchUrl}`);

  let session: Awaited<ReturnType<typeof getSession>> | undefined;
  let page: Page | undefined;

  try {
    session = await getSession("linkedin");
    page = await session.context.newPage();

    // Step 1: Ensure the user is logged in
    const loggedIn = await ensureLoggedIn(page);
    if (!loggedIn) {
      await session.cleanup(page);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: false,
                message:
                  "LinkedIn login timed out. Run linkedin_apply again and log in within 2 minutes. Your session will be saved for all future runs.",
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

    // Step 2: Scrape job listings
    console.error("[linkedInApply] Scraping job listings...");
    const jobs = await scrapeJobs(page, searchUrl, maxApps * 2);
    console.error(`[linkedInApply] Scraped ${jobs.length} jobs`);

    if (jobs.length === 0) {
      await session.cleanup(page);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: false,
                message: `No LinkedIn jobs found for "${role}" with these filters. Try: broader date_posted ("month"), different location, or easy_apply_only: false.`,
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
    console.error("[linkedInApply] Scoring jobs...");
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
      `[linkedInApply] ${scored.length} scored, ${qualifying.length} qualify (score >= ${min_fit_score})`
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

    // Step 4: Apply to each qualifying job
    for (const { job, score } of qualifying) {
      // Duplicate check
      if (job.url && (await isDuplicate(job.url))) {
        console.error(`[linkedInApply] Duplicate skip: ${job.title} at ${job.company}`);
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
        console.error(`[linkedInApply] Cover letter error: ${err.message}`);
      }

      // Apply
      console.error(`[linkedInApply] Applying: ${job.title} at ${job.company} (score: ${score})`);
      const result = await applyEasyApply(page, job, candidate_profile, coverLetter, dry_run);

      const notionStatus: "Applied" | "Pending" = result.success ? "Applied" : "Pending";

      // Build a clear Notion notes string so the user can audit each application
      const notionNotes = [
        `[linkedin_apply]`,
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
        console.error(`[linkedInApply] Notion log error: ${err.message}`);
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

      await page.waitForTimeout(3500); // polite delay between applications
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
              note: "Check 'confirmed' and 'screenshot' on each application to verify. 'confirmed: true' means LinkedIn showed a success message.",
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
              message: `linkedin_apply failed: ${err.message}`,
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
