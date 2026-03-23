/**
 * browserSession.ts — automatic browser session manager for JobPilot
 *
 * Priority order (no manual setup required):
 *
 *  1. Connect to Chrome if already running with remote debugging (--remote-debugging-port).
 *  2. Open your REAL Chrome profile via launchPersistentContext — you are already logged in
 *     everywhere because this is the exact same profile Chrome uses day-to-day.
 *     If Chrome is already open, macOS/Windows route the launch back into the existing
 *     instance as a new window, so your sessions remain intact.
 *  3. Fallback: a saved Playwright session in ~/.jobpilot/sessions/<name>.
 *     On first use a login window opens; the session is saved for all future runs.
 *  4. Last resort: bundled Chromium with the same saved session.
 */
import { chromium } from "playwright";
import { mkdirSync, existsSync } from "fs";
import { homedir, platform as osPlatform } from "os";
import { join } from "path";
// ── Locate the user's real Chrome user-data directory ────────────────────────
// This is where Chrome stores cookies, sessions, and login state.
function getRealChromeDataDir() {
    const os = osPlatform();
    if (os === "darwin") {
        const p = join(homedir(), "Library", "Application Support", "Google", "Chrome");
        return existsSync(p) ? p : null;
    }
    if (os === "win32") {
        const p = join(process.env.LOCALAPPDATA ?? "", "Google", "Chrome", "User Data");
        return existsSync(p) ? p : null;
    }
    // Linux
    const linuxPaths = [
        join(homedir(), ".config", "google-chrome"),
        join(homedir(), ".config", "chromium"),
    ];
    return linuxPaths.find(existsSync) ?? null;
}
// ── Fallback session directory (used only when real profile is unavailable) ──
function getSessionDir(sessionName) {
    const dir = join(homedir(), ".jobpilot", "sessions", sessionName);
    mkdirSync(dir, { recursive: true });
    return dir;
}
export async function getSession(sessionName) {
    const debugPort = parseInt(process.env.CHROME_DEBUG_PORT ?? "9222", 10);
    const cdpUrl = `http://localhost:${debugPort}`;
    // ── Step 1: Connect to already-running Chrome with remote debugging ────────
    // Works instantly if the user started Chrome with --remote-debugging-port=9222.
    try {
        const browser = await chromium.connectOverCDP(cdpUrl, { timeout: 2000 });
        const contexts = browser.contexts();
        const context = contexts.length > 0 ? contexts[0] : await browser.newContext();
        console.error(`[browserSession] ✓ Connected to existing Chrome on port ${debugPort}`);
        return {
            context,
            mode: "cdp_existing",
            cleanup: async (page) => {
                await page.close().catch(() => { });
                await browser.close().catch(() => { }); // disconnects only — does not kill Chrome
            },
        };
    }
    catch {
        console.error(`[browserSession] No Chrome on port ${debugPort} — opening with your real Chrome profile...`);
    }
    // ── Step 2: Open your real Chrome profile ────────────────────────────────
    // Points Playwright at the same user-data-dir Chrome uses every day, so all
    // your cookies and logins are already there.  On macOS/Windows, if Chrome is
    // already running, this opens a new window inside your existing Chrome instance.
    const realDataDir = getRealChromeDataDir();
    if (realDataDir) {
        try {
            const context = await chromium.launchPersistentContext(realDataDir, {
                headless: false,
                channel: "chrome",
                viewport: null, // let Chrome use its own window size
                args: [
                    "--no-first-run",
                    "--no-default-browser-check",
                    `--remote-debugging-port=${debugPort}`, // next run can use CDP (step 1)
                ],
            });
            console.error(`[browserSession] ✓ Opened your real Chrome profile — all sessions active`);
            console.error(`[browserSession] Profile: ${realDataDir}`);
            return {
                context,
                mode: "real_chrome_profile",
                cleanup: async (_page) => {
                    await context.close().catch(() => { });
                },
            };
        }
        catch (err) {
            console.error(`[browserSession] Could not open real Chrome profile (${err.message}) — falling back`);
        }
    }
    // ── Step 3: Saved Playwright session (one-time login) ────────────────────
    const sessionDir = getSessionDir(sessionName);
    try {
        const context = await chromium.launchPersistentContext(sessionDir, {
            headless: false,
            channel: "chrome",
            viewport: { width: 1280, height: 900 },
            args: ["--no-first-run", "--no-default-browser-check"],
        });
        console.error(`[browserSession] ✓ Launched Chrome with saved JobPilot session`);
        console.error(`[browserSession] Session saved at: ${sessionDir}`);
        console.error(`[browserSession] If you see a login screen, log in once — it will be remembered.`);
        return {
            context,
            mode: "persistent_chrome",
            cleanup: async (_page) => {
                await context.close().catch(() => { });
            },
        };
    }
    catch {
        console.error(`[browserSession] System Chrome not found — using bundled Chromium`);
    }
    // ── Step 4: Bundled Chromium with saved session (last resort) ────────────
    const context = await chromium.launchPersistentContext(sessionDir, {
        headless: false,
        viewport: { width: 1280, height: 900 },
        args: ["--no-first-run", "--no-default-browser-check"],
    });
    console.error(`[browserSession] ✓ Launched bundled Chromium with saved session`);
    console.error(`[browserSession] Session saved at: ${sessionDir}`);
    console.error(`[browserSession] If you see a login screen, log in once — it will be remembered.`);
    return {
        context,
        mode: "persistent_chromium",
        cleanup: async (_page) => {
            await context.close().catch(() => { });
        },
    };
}
//# sourceMappingURL=browserSession.js.map