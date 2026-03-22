# JobPilot MCP 🚀
### Your AI-Powered Job Hunting Agent — Built for the Notion MCP Challenge 2026

> "I built this because I needed it myself. As a developer actively searching for remote work,
> I was spending hours searching, copy-pasting, writing cover letters, and forgetting to follow up.
> JobPilot automates the grind so I can focus on what matters — actually getting hired."
>
> — Daniel A., THECODEDANIEL

---

## What is JobPilot?

JobPilot is a custom MCP (Model Context Protocol) server that turns Claude into a
full AI job-hunting assistant. You paste your CV once, and Claude can:

1. **Search** remote job boards (RemoteOK, We Work Remotely, Himalayas) for relevant roles
2. **Score** each job against your CV (0–100 fit score with matched/missing skills)
3. **Generate** a tailored cover letter for every job — in your tone
4. **Log** every application automatically to a Notion Job Tracker database
5. **Track** status changes (Applied → Interview → Offer) directly in Notion
6. **Draft** follow-up emails when a company goes quiet
7. **Auto-apply** to jobs using browser automation (Playwright)

Everything is human-in-the-loop — Claude proposes, you decide, Notion remembers.

---

## Architecture

```
You (Claude Desktop)
      │
      ▼
┌─────────────────────┐
│   JobPilot MCP       │  ← This repo
│   (Node.js server)  │
└──────┬──────────────┘
       │
  ┌────┴──────────────────────────┐
  │                               │
  ▼                               ▼
Job Board APIs              Notion API
(RemoteOK, WWR,            (Job Tracker DB
 Himalayas, Jobicy)         read & write)
       │
       ▼
Playwright (Chromium)
(Browser automation for
 auto-apply form filling)
```

---

## The 9 MCP Tools

| Tool | What it does |
|---|---|
| `setup_notion_db` | One-time setup — creates the Job List DB in Notion with the correct schema |
| `parse_cv` | Extracts your profile from CV text (plain text only — see Limitations) |
| `search_jobs` | Searches RemoteOK, WeWorkRemotely, and Himalayas for matching roles |
| `score_job_fit` | Scores how well you match each job (0–100) with gap analysis |
| `generate_cover_letter` | Writes a personalised cover letter (professional / enthusiastic / concise) |
| `generate_follow_up` | Drafts a follow-up email scaled to how long since you applied |
| `log_to_notion` | Creates a row in your Notion Job Tracker with all details |
| `update_application_status` | Updates status in Notion (Applied → Interview → Offer) |
| **`auto_apply`** | **Full pipeline: search → score → cover letter → browser apply → Notion log** |

---

## Known Limitations & What's Not Fully Implemented

This is important to read before using JobPilot so you know what to expect.

### PDF parsing does not work
`parse_cv` accepts a `file_path` argument but reads the file as plain UTF-8 text. Binary PDF files will produce garbled output. **Pass your CV as plain text using `cv_text` instead.** Copy-paste from your word processor or export as `.txt` first.

### No Anthropic API calls are made
Despite the `.env.example` including `ANTHROPIC_API_KEY`, the key is never used. CV parsing, fit scoring, and cover letter generation are all done with local regex and string-matching logic — not the Anthropic API. The `ANTHROPIC_API_KEY` environment variable is currently a placeholder for a future implementation. You do not need it to run JobPilot.

### The `location` filter in `search_jobs` is ignored
The tool accepts a `location` parameter but does not pass it to any of the job board APIs. All results are unfiltered by location. Treat this as a remote-first search.

### WeWorkRemotely only covers 3 categories
Job roles are mapped to one of: `design`, `marketing`, or `programming`. Roles like `data scientist`, `devops engineer`, or `product manager` all fall through to `programming`, which may return irrelevant listings.

### Role matching uses a small keyword expansion map
The `RELATED_TAGS` map only covers: `flutter`, `mobile`, `react`, `ios`, `android`. All other roles rely on exact keyword matching against job titles and tags. If you search for `TypeScript developer`, only jobs with "typescript" in the title or tags will match — no synonyms are expanded.

### Browser automation opens a visible window
`auto_apply` launches Chromium with `headless: false`, meaning a real browser window opens on your screen during auto-apply. This is intentional for transparency but may be surprising. Do not close it while a pipeline is running.

### LinkedIn field is not extracted from CV
The `auto_apply` pipeline attempts to fill LinkedIn fields in job application forms, but the `CandidateProfile` type does not include a `linkedin` field. The field is always left blank.

### Environment variables are not loaded from `.env` when testing directly
The `.env` file is only read by Claude Desktop (you pass the values in the MCP config). When running or testing the server outside Claude Desktop, you must set the environment variables manually in your shell. See the Testing section below.

---

## Notion Database Schema

> You do **not** need to create this manually. Run the `setup_notion_db` tool once and it creates everything for you.

The database ("Job List DB") is created with these columns:

| Column Name | Type | Notes |
|---|---|---|
| Job Title | Title | Primary column |
| Company | Text | |
| Job URL | URL | Used for duplicate detection in auto_apply |
| Status | Text | Applied, Pending, Interview, Rejected, or Offer |
| Date Applied | Date | |
| Salary | Text | If available |
| Fit Score | Number | AI-generated 0–100 |
| Cover Letter Snippet | Text | First 300 chars of letter |
| Last Updated | Date | Updated on status changes |
| Notes | Text | Any extra context |

---

## Setup Guide

### Prerequisites

You need the following installed before starting:

| Tool | Version | Download |
|---|---|---|
| Node.js | 18 or higher | https://nodejs.org (choose LTS) |
| Git | Any recent version | https://git-scm.com |
| Claude Desktop | Latest | https://claude.ai/download |
| A Notion account | — | https://notion.so |

To confirm Node.js and Git are installed, open a terminal and run:

```bash
node --version   # should print v18.x.x or higher
git --version    # should print git version x.x.x
```

If either command says "command not found", install the tool from the links above before continuing.

---

### Step 1 — Clone, install & build

Open a terminal and run:

```bash
git clone https://github.com/YOUR_USERNAME/jobpilot-mcp.git
cd jobpilot-mcp
npm install
npm run build
```

After `npm run build` you should see a `dist/` folder created. If you get TypeScript errors, make sure Node.js 18+ is installed.

To get the full path to this folder (you will need it in Step 3):

```bash
# macOS / Linux
pwd

# Windows (PowerShell)
Get-Location
```

---

### Step 2 — Set up Notion

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Click **New Integration** → name it `JobPilot`
3. Set capabilities: **Read content**, **Update content**, **Insert content**
4. Click **Submit** and copy the **Internal Integration Token** (starts with `secret_...`)
5. In Notion, create a blank page — this is where the database will live
6. Open that page → click **Share** → **Invite** → search for `JobPilot` → click **Invite**
7. Copy the **Page ID** from the page URL. It is the 32-character string in the URL:
   ```
   https://notion.so/yourworkspace/My-Page-<PAGE_ID_HERE>?v=...
   ```
   The Page ID is everything after the last `-` and before `?`. It looks like: `a1b2c3d4e5f6...`

You will use the integration token and page ID in the next step.

---

### Step 3 — Configure Claude Desktop

Locate (or create) the Claude Desktop config file:

| Operating System | Config file path |
|---|---|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

**Open or create the file:**

```bash
# macOS
open -a TextEdit ~/Library/Application\ Support/Claude/claude_desktop_config.json
# If that fails (file doesn't exist yet):
mkdir -p ~/Library/Application\ Support/Claude && touch ~/Library/Application\ Support/Claude/claude_desktop_config.json && open -a TextEdit ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

```bash
# Linux
mkdir -p ~/.config/Claude
nano ~/.config/Claude/claude_desktop_config.json
```

```powershell
# Windows (PowerShell)
New-Item -ItemType Directory -Force -Path "$env:APPDATA\Claude" | Out-Null
notepad "$env:APPDATA\Claude\claude_desktop_config.json"
```

Paste the following into the file, replacing all placeholder values:

```json
{
  "mcpServers": {
    "jobpilot": {
      "command": "node",
      "args": ["/FULL/PATH/TO/jobpilot-mcp/dist/index.js"],
      "env": {
        "NOTION_API_KEY": "secret_...",
        "NOTION_DATABASE_ID": ""
      }
    }
  }
}
```

Replace `/FULL/PATH/TO/jobpilot-mcp` with the output of `pwd` from Step 1.

> **Already have other MCP servers?** Add the `"jobpilot": { ... }` block inside your existing `"mcpServers"` object — don't replace the whole file.

> **Note:** `NOTION_DATABASE_ID` can be left blank for now. You will fill it in after Step 4.

---

### Step 4 — Restart Claude Desktop & create the Notion database

1. Fully quit Claude Desktop (not just close the window — use Quit from the menu)
2. Reopen Claude Desktop
3. Select the **Chat** tab and look for the tools icon in the chat input bar — click it to confirm all 9 JobPilot tools are listed

Then ask Claude to set up your Notion database:

```
Run setup_notion_db with parent_page_id YOUR_PAGE_ID_HERE
```

The tool will return a `database_id`. Copy it, then go back to your Claude Desktop config file, paste it as `NOTION_DATABASE_ID`, and restart Claude Desktop once more.

> If `NOTION_DATABASE_ID` is already set and the database exists, the tool will skip creation safely — so it is safe to run multiple times.

---

## How to Test JobPilot (Without Claude Desktop)

This section is for developers who want to test tools directly without going through Claude Desktop.

### Option 1: MCP Inspector (Recommended)

The MCP Inspector is an official browser-based tool for interactively testing any MCP server. It lets you call any tool, pass custom inputs, and see the raw JSON response — no Claude needed.

**Install and run:**

```bash
# From inside the jobpilot-mcp directory
npm run build
npx @modelcontextprotocol/inspector node dist/index.js
```

This starts a local web server and opens `http://localhost:5173` in your browser (or prints the URL if it doesn't open automatically).

**Pass your environment variables** if you want Notion tools to work:

```bash
# macOS / Linux
NOTION_API_KEY=secret_... NOTION_DATABASE_ID=your_db_id npx @modelcontextprotocol/inspector node dist/index.js

# Windows (PowerShell)
$env:NOTION_API_KEY="secret_..."; $env:NOTION_DATABASE_ID="your_db_id"; npx @modelcontextprotocol/inspector node dist/index.js
```

**Using the Inspector UI:**

1. Click **Connect** — the server status should turn green
2. Click **Tools** in the left sidebar — all 9 JobPilot tools appear
3. Click any tool (e.g. `search_jobs`) to expand it
4. Fill in the input fields and click **Run Tool**
5. The JSON response appears on the right

**Example inputs to try:**

`search_jobs`:
```json
{
  "role": "Flutter Developer",
  "max_results": 5
}
```

`parse_cv`:
```json
{
  "cv_text": "John Smith\njohn@example.com\n+1 555 000 1234\n\nSkills\nFlutter, Dart, Firebase, REST APIs\n\nExperience\nSenior Flutter Developer at Acme Corp\n2021 – Present\n\nFlutter Developer at Startup Inc\n2019 – 2021\n\nEducation\nBSc Computer Science, University of Lagos"
}
```

`score_job_fit`:
```json
{
  "candidate_profile": {
    "name": "John Smith",
    "email": "john@example.com",
    "phone": "+1 555 000 1234",
    "location": "Lagos, Nigeria",
    "summary": "Mobile developer with 5 years Flutter experience",
    "skills": ["Flutter", "Dart", "Firebase", "REST APIs"],
    "experience": [
      { "title": "Senior Flutter Developer", "company": "Acme Corp", "start": "2021", "end": "present" },
      { "title": "Flutter Developer", "company": "Startup Inc", "start": "2019", "end": "2021" }
    ],
    "years_experience": 5,
    "education": [
      { "degree": "BSc Computer Science", "institution": "University of Lagos" }
    ]
  },
  "job": {
    "id": "test-001",
    "title": "Senior Flutter Engineer",
    "company": "Remote First Inc",
    "url": "https://example.com/jobs/flutter",
    "description": "We need a Flutter expert with 3+ years experience. Must know Dart, Firebase, and REST APIs. Remote position.",
    "tags": ["flutter", "dart", "remote"],
    "date_posted": "2026-03-22",
    "source": "test"
  }
}
```

### Option 2: Smoke-test the MCP protocol directly

Send a raw MCP message via stdin to verify the server starts and responds correctly:

```bash
npm run build

# macOS / Linux
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node dist/index.js

# Windows (PowerShell)
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node dist/index.js
```

You should see a JSON response listing all 9 tools. If the server crashes or prints nothing, check your Node.js version with `node --version`.

---

## How to Use JobPilot (in Claude Desktop)

### Full Workflow

Paste this into Claude Desktop:

```
Here is my CV:

[paste your full CV as plain text — not PDF]

Please:
1. Parse my CV to extract my profile
2. Search for remote Flutter Developer jobs
3. Score the top 5 results against my profile
4. For any job with a fit score above 65, generate a professional cover letter
5. Log each application to my Notion Job Tracker
```

Claude will run the full pipeline automatically, logging everything to Notion as it goes.

---

### Individual Commands

**Parse your CV:**
```
Parse my CV and extract my profile.
[paste CV text]
```

**Search for jobs:**
```
Search for remote Flutter developer jobs. Show me the top 10.
```

**Score a specific job:**
```
Score how well my profile matches the Senior Flutter Engineer role at Acme Corp.
[paste job description]
```

**Generate a cover letter:**
```
Write an enthusiastic cover letter for the Flutter Engineer role at Stripe.
```

**Log to Notion manually:**
```
Log this application to Notion:
- Job: Senior Flutter Developer
- Company: Shopify
- URL: https://shopify.com/careers/123
- Salary: $120,000/yr
- Status: Applied
- Fit Score: 82
```

**Update an application status:**
```
Update my Shopify application status to "Interview". Add a note: "Interview scheduled for March 25 at 2pm."
```

**Generate a follow-up email:**
```
Generate a follow-up email for my Flutter Engineer application at Stripe. It's been 9 days since I applied.
```

---

### Auto-Apply Workflow

The most powerful feature of JobPilot. Run the full job application pipeline with a single command.

**What it does:**
1. Searches for remote jobs matching your role across multiple job boards
2. Scores each job against your CV (only applies to jobs scoring >= min_fit_score)
3. Generates a tailored cover letter for each qualifying job
4. Fills and submits application forms automatically using a Chromium browser window
5. Logs every application to your Notion tracker with status, score, and cover letter

**Example usage in Claude:**
```
Parse my CV, then auto-apply to 10 Flutter Developer jobs today
```

**Supported application methods:**
- Easy Apply / Quick Apply buttons
- Greenhouse ATS forms
- Lever ATS forms
- Workable ATS forms
- BambooHR ATS forms
- Generic form fill (best-effort)

**When it skips a job:**
- CAPTCHA detected
- Login/account creation required
- Already applied (duplicate detected in Notion)
- Form too complex (more than 3 steps)

Skipped jobs are logged to Notion as "Pending" for manual follow-up.

**Dry run mode:**
Set `dry_run: true` to run the full pipeline (search → score → cover letter → log) without actually submitting any forms. Useful for previewing what would be applied to.

**Safety:**
- Never enters financial information
- Never creates accounts or passwords
- Never applies to the same job twice
- Takes a screenshot after each submission as proof (saved to `screenshots/`)

---

## Example Notion Output

After running the full pipeline, your Notion Job Tracker will look like this:

| Job Title | Company | Status | Fit Score | Salary | Date Applied |
|---|---|---|---|---|---|
| Senior Flutter Engineer | Shopify | Applied | 88 | $120k/yr | 2026-03-19 |
| Mobile Developer | Buffer | Applied | 74 | Not listed | 2026-03-19 |
| Flutter Dev (Remote) | Remote First Inc | Pending | 61 | $80–100k | 2026-03-19 |

Each row links back to the full cover letter snippet and notes.

---

## Project Structure

```
jobpilot-mcp/
├── src/
│   ├── index.ts                        # MCP server + tool registry
│   └── tools/
│       ├── parseCV.ts                  # CV parsing (plain text only)
│       ├── searchJobs.ts               # RemoteOK + WeWorkRemotely + Himalayas APIs
│       ├── scoreJobFit.ts              # Fit scoring (0–100, keyword-based)
│       ├── generateCoverLetter.ts      # Cover letter generation (template-based)
│       ├── generateFollowUp.ts         # Follow-up email drafting
│       ├── logToNotion.ts              # Create row in Notion DB
│       ├── updateApplicationStatus.ts  # Update existing Notion row
│       ├── setupNotionDB.ts            # Create the Notion database schema
│       └── autoApply.ts               # Full auto-apply pipeline with Playwright
├── dist/                               # Compiled output (after npm run build)
├── .env.example                        # Environment variable template
├── package.json
├── tsconfig.json
└── README.md
```

---

## Tech Stack

- **Runtime**: Node.js 18+ with TypeScript
- **MCP SDK**: `@modelcontextprotocol/sdk` (official Anthropic SDK)
- **Job scoring & cover letters**: Local string-matching logic (no external AI API required)
- **Job data**: RemoteOK API + WeWorkRemotely RSS + Himalayas API (all free, no auth required)
- **Browser automation**: Playwright (Chromium) for auto-apply form filling
- **Storage**: Notion REST API v1 (2022-06-28)
- **Host**: Claude Desktop

---

## Roadmap / Future Ideas

- [x] Auto-apply with browser automation via Playwright (Easy Apply, ATS forms, generic forms)
- [ ] Real AI-powered CV parsing using the Anthropic API (replace regex parser)
- [ ] Real AI-generated cover letters via Anthropic API (replace template engine)
- [ ] Actual PDF parsing support (e.g. using `pdf-parse` or similar)
- [ ] LinkedIn field extraction from CVs
- [ ] Expand `RELATED_TAGS` to cover more tech domains (DevOps, data, product, design)
- [ ] WeWorkRemotely category mapping for more job types
- [ ] `location` filter actually applied to job board API queries
- [ ] Daily digest: "You have 3 applications with no response after 14 days"
- [ ] Salary negotiation email generator
- [ ] Interview prep notes auto-added to Notion page
- [ ] Slack/Email notification when a Notion status changes

---

## License

MIT — free to use, fork, and build on.

---

## Author

Built by **Daniel A.** — **THECODEDANIEL**.

> This tool was built for the Notion MCP Challenge 2026 — and also because I genuinely needed it.
> Job hunting is brutal. Let AI do the boring parts.
