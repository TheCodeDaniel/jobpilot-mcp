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
import { type BrowserContext, type Page } from "playwright";
export interface BrowserSession {
    context: BrowserContext;
    /** Call this when done. Closes only what JobPilot opened, never the whole browser. */
    cleanup: (page: Page) => Promise<void>;
    /** How the session was established — included in tool output for transparency. */
    mode: "cdp_existing" | "persistent_chrome" | "persistent_chromium";
}
export declare function getSession(sessionName: "linkedin" | "indeed" | "general"): Promise<BrowserSession>;
//# sourceMappingURL=browserSession.d.ts.map