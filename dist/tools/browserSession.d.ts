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
import { type BrowserContext, type Page } from "playwright";
export interface BrowserSession {
    context: BrowserContext;
    /** Call this when done. Closes only what JobPilot opened, never the whole browser. */
    cleanup: (page: Page) => Promise<void>;
    /** How the session was established — included in tool output for transparency. */
    mode: "cdp_existing" | "real_chrome_profile" | "persistent_chrome" | "persistent_chromium";
}
export declare function getSession(sessionName: "linkedin" | "indeed" | "general"): Promise<BrowserSession>;
//# sourceMappingURL=browserSession.d.ts.map