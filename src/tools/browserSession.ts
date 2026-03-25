/**
 * browserSession.ts — browser session manager for JobPilot
 *
 * Uses a dedicated JobPilot profile — completely separate from your real Chrome.
 * Your personal Chrome profile is never touched.
 *
 *  1. Connects to Chrome via CDP if already running with --remote-debugging-port.
 *  2. Opens the JobPilot-dedicated Chrome profile from ~/.jobpilot/sessions/<name>/.
 *     First run: a login window appears — log in once, session is saved forever.
 *     All subsequent runs: cookies are reloaded automatically, no login needed.
 *  3. Falls back to bundled Chromium with the same saved session if Chrome is absent.
 */

import { chromium, type BrowserContext, type Page } from "playwright";
import { mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

// ── Session directory for the dedicated JobPilot profile ─────────────────────

function getSessionDir(sessionName: string): string {
  const dir = join(homedir(), ".jobpilot", "sessions", sessionName);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ── Public interface ──────────────────────────────────────────────────────────

export interface BrowserSession {
  context: BrowserContext;
  /** Call this when done. Closes only what JobPilot opened, never the whole browser. */
  cleanup: (page: Page) => Promise<void>;
  /** How the session was established — included in tool output for transparency. */
  mode: "cdp_existing" | "persistent_chrome" | "persistent_chromium";
}

export async function getSession(
  sessionName: "linkedin" | "indeed" | "general"
): Promise<BrowserSession> {
  const debugPort = parseInt(process.env.CHROME_DEBUG_PORT ?? "9222", 10);
  const cdpUrl = `http://localhost:${debugPort}`;

  // ── Step 1: Connect to already-running Chrome with remote debugging ────────
  // Works if the user (or a previous run) started Chrome with --remote-debugging-port.
  try {
    const browser = await chromium.connectOverCDP(cdpUrl, { timeout: 2000 });
    const contexts = browser.contexts();
    const context = contexts.length > 0 ? contexts[0] : await browser.newContext();

    console.error(`[browserSession] ✓ Connected to existing Chrome on port ${debugPort}`);

    return {
      context,
      mode: "cdp_existing",
      cleanup: async (page: Page) => {
        await page.close().catch(() => {});
        await browser.close().catch(() => {}); // disconnects only — does not kill Chrome
      },
    };
  } catch {
    console.error(`[browserSession] No Chrome on port ${debugPort} — opening JobPilot profile...`);
  }

  // ── Step 2: JobPilot-dedicated session (system Chrome) ────────────────────
  // Uses ~/.jobpilot/sessions/<name>/ — a profile completely separate from the
  // user's real Chrome.  Cookies are saved to disk on close, so login persists
  // across all future MCP runs.
  const sessionDir = getSessionDir(sessionName);

  try {
    const context = await chromium.launchPersistentContext(sessionDir, {
      headless: false,
      channel: "chrome",
      viewport: { width: 1280, height: 900 },
      args: [
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-blink-features=AutomationControlled", // Hides the "Automated" banner
      ],
      ignoreDefaultArgs: ["--enable-automation"], // Crucial: prevents Chrome from identifying itself as a bot
    });

    console.error(`[browserSession] ✓ Opened JobPilot Chrome session`);
    console.error(`[browserSession] Profile: ${sessionDir}`);
    console.error(`[browserSession] If you see a login screen, log in once — it will be remembered.`);

    return {
      context,
      mode: "persistent_chrome",
      cleanup: async (_page: Page) => {
        await context.close().catch(() => {});
      },
    };
  } catch {
    console.error(`[browserSession] System Chrome not available — using bundled Chromium`);
  }

  // ── Step 3: Bundled Chromium with saved session (last resort) ────────────
  const context = await chromium.launchPersistentContext(sessionDir, {
    headless: false,
    viewport: { width: 1280, height: 900 },
    args: ["--no-first-run", "--no-default-browser-check"],
  });

  console.error(`[browserSession] ✓ Opened JobPilot Chromium session`);
  console.error(`[browserSession] Profile: ${sessionDir}`);
  console.error(`[browserSession] If you see a login screen, log in once — it will be remembered.`);

  return {
    context,
    mode: "persistent_chromium",
    cleanup: async (_page: Page) => {
      await context.close().catch(() => {});
    },
  };
}
