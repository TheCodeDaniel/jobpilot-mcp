import { chromium, type Page } from "playwright";
import { mkdirSync } from "fs";
import { searchJobs, type JobListing } from "./searchJobs.js";
import { scoreJobFit } from "./scoreJobFit.js";
import { generateCoverLetter } from "./generateCoverLetter.js";
import { logToNotion } from "./logToNotion.js";
import type { CandidateProfile } from "./parseCV.js";

// ── Types ────────────────────────────────────────────────────────────────────

interface ApplyResult {
  success: boolean;
  method: "easy_apply" | "ats_form" | "generic_form" | "skipped";
  ats?: string;
  notes: string;
  screenshot_path?: string;
}

interface ApplicationSummary {
  company: string;
  job_title: string;
  fit_score: number;
  status: string;
  apply_method: string;
  notes: string;
  notion_url?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseToolResponse(result: { content: Array<{ type: string; text: string }> }): any {
  try {
    return JSON.parse(result.content[0].text);
  } catch {
    return null;
  }
}

// ── Duplicate Detection ──────────────────────────────────────────────────────

async function isDuplicate(jobUrl: string): Promise<boolean> {
  const NOTION_API_KEY = process.env.NOTION_API_KEY;
  const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;
  if (!NOTION_API_KEY || !NOTION_DATABASE_ID) return false;

  try {
    const res = await fetch(`https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NOTION_API_KEY}`,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28",
      },
      body: JSON.stringify({
        filter: {
          property: "Job URL",
          url: { equals: jobUrl },
        },
      }),
    });

    if (!res.ok) return false;
    const data = (await res.json()) as any;
    return Array.isArray(data.results) && data.results.length > 0;
  } catch {
    return false;
  }
}

// ── ATS Selectors ────────────────────────────────────────────────────────────

const ATS_CONFIGS: Record<string, {
  detect: (url: string) => boolean;
  selectors: {
    first_name?: string;
    last_name?: string;
    name?: string;
    email: string;
    phone?: string;
    cover_letter: string;
    submit: string;
  };
}> = {
  greenhouse: {
    detect: (url) => url.includes("greenhouse.io"),
    selectors: {
      first_name: "#first_name",
      last_name: "#last_name",
      email: "#email",
      phone: "#phone",
      cover_letter: '#cover_letter, textarea[name="cover_letter"]',
      submit: '#submit_app, button[type="submit"]',
    },
  },
  lever: {
    detect: (url) => url.includes("lever.co"),
    selectors: {
      name: 'input[name="name"]',
      email: 'input[name="email"]',
      phone: 'input[name="phone"]',
      cover_letter: 'textarea[name="comments"], .application-field textarea',
      submit: 'button[type="submit"]',
    },
  },
  workable: {
    detect: (url) => url.includes("workable.com"),
    selectors: {
      first_name: 'input[name="firstname"]',
      last_name: 'input[name="lastname"]',
      email: 'input[name="email"]',
      cover_letter: 'textarea[placeholder*="cover"], .cover-letter textarea',
      submit: 'button[data-ui="submit-button"]',
    },
  },
  bamboohr: {
    detect: (url) => url.includes("bamboohr.com"),
    selectors: {
      first_name: 'input[name="firstName"]',
      last_name: 'input[name="lastName"]',
      email: 'input[name="email"]',
      cover_letter: 'textarea[name="coverLetter"], textarea',
      submit: 'button[type="submit"]',
    },
  },
};

// ── Browser Automation: Apply to a Single Job ────────────────────────────────

async function applyToJob(
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
    // Navigate to the job URL
    await page.goto(job.url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await sleep(2000);

    const currentUrl = page.url();

    // Check for CAPTCHA
    const pageText = await page.textContent("body").catch(() => "");
    if (pageText && /captcha|verify you are human|i'm not a robot/i.test(pageText)) {
      return { success: false, method: "skipped", notes: "CAPTCHA detected, skipping" };
    }

    // Check for login/account requirement
    if (pageText && /sign in|log in|create account|register to apply/i.test(pageText)) {
      const hasPublicForm = await page.locator('input[type="email"], input[name="email"]').count();
      if (hasPublicForm === 0) {
        return { success: false, method: "skipped", notes: "Login/account creation required" };
      }
    }

    // ── Strategy A: Easy Apply Button ──────────────────────────────────────
    const easyApplyBtn = page.locator(
      'button:text-matches("Easy Apply|Quick Apply", "i"), a:text-matches("Easy Apply|Quick Apply", "i")'
    );
    if (await easyApplyBtn.count() > 0) {
      await easyApplyBtn.first().click();
      await sleep(1500);

      // Fill modal fields
      await fillField(page, 'input[name*="name" i], input[placeholder*="name" i]', profile.name);
      await fillField(page, 'input[name*="email" i], input[type="email"]', profile.email);
      if (profile.phone) {
        await fillField(page, 'input[name*="phone" i], input[type="tel"]', profile.phone);
      }
      await fillField(page, "textarea", coverLetter);

      if (!dryRun) {
        const submitBtn = page.locator('button[type="submit"], button:text-matches("Submit|Apply", "i")');
        if (await submitBtn.count() > 0) {
          await submitBtn.first().click();
          await sleep(2000);
        }
      }

      const screenshotPath = await takeScreenshot(page, job.company);
      return {
        success: !dryRun,
        method: "easy_apply",
        notes: dryRun ? "Dry run — form filled but not submitted" : "Easy Apply form submitted",
        screenshot_path: screenshotPath,
      };
    }

    // ── Strategy B: Known ATS Form ─────────────────────────────────────────
    for (const [atsName, config] of Object.entries(ATS_CONFIGS)) {
      if (config.detect(currentUrl)) {
        console.error(`[autoApply] Detected ATS: ${atsName}`);

        const sel = config.selectors;

        if (sel.first_name) await fillField(page, sel.first_name, firstName);
        if (sel.last_name) await fillField(page, sel.last_name, lastName);
        if (sel.name) await fillField(page, sel.name, profile.name);
        await fillField(page, sel.email, profile.email);
        if (sel.phone && profile.phone) await fillField(page, sel.phone, profile.phone);
        await fillField(page, sel.cover_letter, coverLetter);

        if (!dryRun) {
          const submitBtn = page.locator(sel.submit);
          if (await submitBtn.count() > 0) {
            await submitBtn.first().click();
            await sleep(2000);
          }
        }

        const screenshotPath = await takeScreenshot(page, job.company);
        return {
          success: !dryRun,
          method: "ats_form",
          ats: atsName,
          notes: dryRun
            ? `Dry run — ${atsName} form filled but not submitted`
            : `${atsName} ATS form submitted`,
          screenshot_path: screenshotPath,
        };
      }
    }

    // ── Strategy C: Generic Form Fill ──────────────────────────────────────
    // Look for an Apply button first
    const applyBtn = page.locator(
      'a:text-matches("Apply", "i"), button:text-matches("Apply", "i")'
    );
    if (await applyBtn.count() > 0) {
      await applyBtn.first().click();
      await sleep(2000);
    }

    // Check if there are form inputs on the page
    const inputs = await page.locator("input:visible, textarea:visible").count();
    if (inputs === 0) {
      return {
        success: false,
        method: "skipped",
        notes: "No application form found on page",
      };
    }

    // Check for multi-step forms (more than 3 pages)
    const stepIndicators = await page.locator('[class*="step"], [class*="progress"], [aria-label*="step"]').count();
    if (stepIndicators > 3) {
      return {
        success: false,
        method: "skipped",
        notes: "Multi-step form detected (>3 steps), too complex",
      };
    }

    // Match fields by label/placeholder/name
    await fillByLabel(page, ["name", "full name", "your name"], profile.name);
    await fillByLabel(page, ["first name", "firstname"], firstName);
    await fillByLabel(page, ["last name", "lastname", "surname"], lastName);
    await fillByLabel(page, ["email", "e-mail"], profile.email);
    if (profile.phone) {
      await fillByLabel(page, ["phone", "telephone", "mobile"], profile.phone);
    }
    await fillByLabel(page, ["linkedin"], (profile as any).linkedin || "");

    // Fill cover letter into any textarea
    const textareas = page.locator("textarea:visible");
    const textareaCount = await textareas.count();
    for (let i = 0; i < textareaCount; i++) {
      const ta = textareas.nth(i);
      const placeholder = (await ta.getAttribute("placeholder")) || "";
      const name = (await ta.getAttribute("name")) || "";
      if (/cover|letter|message|comments|about/i.test(`${placeholder} ${name}`)) {
        await ta.fill(coverLetter);
        break;
      }
    }

    if (!dryRun) {
      const submitBtn = page.locator('button[type="submit"], button:text-matches("Submit|Apply|Send", "i")');
      if (await submitBtn.count() > 0) {
        await submitBtn.first().click();
        await sleep(2000);
      }
    }

    const screenshotPath = await takeScreenshot(page, job.company);
    return {
      success: !dryRun,
      method: "generic_form",
      notes: dryRun ? "Dry run — generic form filled but not submitted" : "Generic form submitted",
      screenshot_path: screenshotPath,
    };
  } catch (err: any) {
    return {
      success: false,
      method: "skipped",
      notes: `Error during application: ${err.message}`,
    };
  }
}

// ── Field Filling Helpers ────────────────────────────────────────────────────

async function fillField(page: Page, selector: string, value: string): Promise<void> {
  if (!value) return;
  try {
    const el = page.locator(selector).first();
    if (await el.count() > 0 && await el.isVisible()) {
      await el.fill(value);
    }
  } catch {
    // Field not found or not fillable — skip silently
  }
}

async function fillByLabel(page: Page, labelTerms: string[], value: string): Promise<void> {
  if (!value) return;
  try {
    const allInputs = page.locator("input:visible");
    const count = await allInputs.count();

    for (let i = 0; i < count; i++) {
      const input = allInputs.nth(i);
      const placeholder = ((await input.getAttribute("placeholder")) || "").toLowerCase();
      const name = ((await input.getAttribute("name")) || "").toLowerCase();
      const ariaLabel = ((await input.getAttribute("aria-label")) || "").toLowerCase();
      const id = ((await input.getAttribute("id")) || "").toLowerCase();
      const combined = `${placeholder} ${name} ${ariaLabel} ${id}`;

      if (labelTerms.some((term) => combined.includes(term))) {
        await input.fill(value);
        return;
      }
    }
  } catch {
    // Skip silently
  }
}

async function takeScreenshot(page: Page, company: string): Promise<string> {
  try {
    const dir = "screenshots";
    mkdirSync(dir, { recursive: true });
    const date = new Date().toISOString().split("T")[0];
    const safeCompany = company.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 30);
    const path = `${dir}/${safeCompany}-${date}.png`;
    await page.screenshot({ path, fullPage: false });
    return path;
  } catch {
    return "";
  }
}

// ── Main auto_apply Function ─────────────────────────────────────────────────

export async function autoApply(args: {
  candidate_profile: CandidateProfile;
  role: string;
  max_applications?: number;
  min_fit_score?: number;
  tone?: "professional" | "enthusiastic" | "concise";
  dry_run?: boolean;
}) {
  const {
    candidate_profile,
    role,
    max_applications = 5,
    min_fit_score = 65,
    tone = "professional",
    dry_run = false,
  } = args;

  const maxApps = Math.min(max_applications, 20);
  const applications: ApplicationSummary[] = [];

  console.error(`[autoApply] Starting pipeline: role="${role}" max=${maxApps} minScore=${min_fit_score} dryRun=${dry_run}`);

  // ── Step 1: Search for jobs ──────────────────────────────────────────────
  console.error("[autoApply] Step 1: Searching for jobs...");
  const searchResult = await searchJobs({ role, max_results: maxApps * 3 });
  const searchData = parseToolResponse(searchResult);

  if (!searchData || !searchData.jobs || searchData.jobs.length === 0) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: false,
          message: `No ${role} jobs found. Try a different role keyword or try again later.`,
          total_found: 0,
          total_scored: 0,
          total_applied: 0,
          total_failed: 0,
          applications: [],
        }, null, 2),
      }],
    };
  }

  const foundJobs: JobListing[] = searchData.jobs;
  console.error(`[autoApply] Found ${foundJobs.length} matching jobs`);

  // ── Step 2: Score each job ───────────────────────────────────────────────
  console.error("[autoApply] Step 2: Scoring jobs...");
  const scoredJobs: Array<{ job: JobListing; score: number; verdict: string }> = [];

  for (const job of foundJobs) {
    try {
      const scoreResult = await scoreJobFit({ candidate_profile, job });
      const scoreData = parseToolResponse(scoreResult);
      if (scoreData?.fit) {
        scoredJobs.push({
          job,
          score: scoreData.fit.score,
          verdict: scoreData.fit.verdict,
        });
      }
    } catch (err: any) {
      console.error(`[autoApply] Error scoring ${job.title}: ${err.message}`);
    }
  }

  // Filter by min_fit_score, sort descending, take top N
  const qualifyingJobs = scoredJobs
    .filter((s) => s.score >= min_fit_score)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxApps);

  console.error(`[autoApply] ${scoredJobs.length} scored, ${qualifyingJobs.length} qualify (>= ${min_fit_score})`);

  if (qualifyingJobs.length === 0) {
    const scoreBreakdown = scoredJobs
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((s) => `${s.job.title} at ${s.job.company}: ${s.score}/100 (${s.verdict})`);

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: false,
          message: `No jobs met the minimum fit score of ${min_fit_score}. Consider lowering min_fit_score or using a different role keyword.`,
          total_found: foundJobs.length,
          total_scored: scoredJobs.length,
          total_applied: 0,
          total_failed: 0,
          top_scores: scoreBreakdown,
          applications: [],
        }, null, 2),
      }],
    };
  }

  // ── Step 3: Generate cover letters ───────────────────────────────────────
  console.error("[autoApply] Step 3: Generating cover letters...");
  const jobsWithLetters: Array<{
    job: JobListing;
    score: number;
    coverLetter: string;
    snippet: string;
  }> = [];

  for (const { job, score } of qualifyingJobs) {
    try {
      const letterResult = await generateCoverLetter({
        candidate_profile,
        job,
        tone,
      });
      const letterData = parseToolResponse(letterResult);
      jobsWithLetters.push({
        job,
        score,
        coverLetter: letterData?.cover_letter || "",
        snippet: letterData?.snippet || "",
      });
    } catch (err: any) {
      console.error(`[autoApply] Error generating cover letter for ${job.title}: ${err.message}`);
      jobsWithLetters.push({
        job,
        score,
        coverLetter: "",
        snippet: "",
      });
    }
  }

  // ── Step 4: Browser automation ───────────────────────────────────────────
  console.error("[autoApply] Step 4: Launching browser for applications...");
  let browser;
  const applyResults: Array<{
    job: JobListing;
    score: number;
    coverLetter: string;
    snippet: string;
    result: ApplyResult;
  }> = [];

  try {
    browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();

    for (const entry of jobsWithLetters) {
      const { job, score, coverLetter, snippet } = entry;

      // Check for duplicates before applying
      if (job.url) {
        const duplicate = await isDuplicate(job.url);
        if (duplicate) {
          console.error(`[autoApply] Skipping duplicate: ${job.title} at ${job.company}`);
          applyResults.push({
            ...entry,
            result: { success: false, method: "skipped", notes: "Already applied (duplicate in Notion)" },
          });
          continue;
        }
      }

      console.error(`[autoApply] Applying to: ${job.title} at ${job.company} (score: ${score})`);
      const result = await applyToJob(page, job, candidate_profile, coverLetter, dry_run);
      applyResults.push({ ...entry, result });

      console.error(`[autoApply] Result: ${result.method} — ${result.notes}`);

      // Delay between applications
      await sleep(2500);
    }

    await browser.close();
  } catch (err: any) {
    console.error(`[autoApply] Browser error: ${err.message}`);
    if (browser) {
      try { await browser.close(); } catch { /* ignore */ }
    }
  }

  // ── Step 5: Log to Notion ────────────────────────────────────────────────
  console.error("[autoApply] Step 5: Logging to Notion...");
  for (const entry of applyResults) {
    const { job, score, snippet, result } = entry;

    try {
      const notionResult = await logToNotion({
        job_title: job.title,
        company_name: job.company,
        job_url: job.url,
        salary: job.salary,
        fit_score: score,
        status: result.success ? "Applied" : "Pending",
        cover_letter_snippet: snippet,
        notes: `[auto_apply] ${result.method}: ${result.notes}${result.screenshot_path ? ` | Screenshot: ${result.screenshot_path}` : ""}`,
      });

      const notionData = parseToolResponse(notionResult);
      applications.push({
        company: job.company,
        job_title: job.title,
        fit_score: score,
        status: result.success ? "Applied" : "Pending",
        apply_method: result.method,
        notes: result.notes,
        notion_url: notionData?.notion_url,
      });
    } catch (err: any) {
      console.error(`[autoApply] Error logging to Notion for ${job.title}: ${err.message}`);
      applications.push({
        company: job.company,
        job_title: job.title,
        fit_score: score,
        status: "Pending",
        apply_method: result.method,
        notes: `${result.notes} (Notion logging failed: ${err.message})`,
      });
    }
  }

  // ── Step 6: Return summary ───────────────────────────────────────────────
  const totalApplied = applications.filter((a) => a.status === "Applied").length;
  const totalFailed = applications.filter((a) => a.status === "Pending").length;

  console.error(`[autoApply] Done! Applied: ${totalApplied}, Pending: ${totalFailed}`);

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        success: true,
        total_found: foundJobs.length,
        total_scored: scoredJobs.length,
        total_applied: totalApplied,
        total_failed: totalFailed,
        applications,
      }, null, 2),
    }],
  };
}
