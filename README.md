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

1. **Search** remote job boards (RemoteOK, We Work Remotely) for relevant roles
2. **Score** each job against your CV (0–100 fit score with matched/missing skills)
3. **Generate** a tailored cover letter for every job — in your tone
4. **Log** every application automatically to a Notion Job Tracker database
5. **Track** status changes (Applied → Interview → Offer) directly in Notion
6. **Draft** follow-up emails when a company goes quiet

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
Anthropic API               Notion API
(CV parsing, fit scoring,   (Job Tracker DB
 cover letters, follow-ups)  read & write)
       │
       ▼
RemoteOK / WeWorkRemotely
(Free job board APIs)
```

---

## The 7 MCP Tools

| Tool | What it does |
|---|---|
| `parse_cv` | Extracts your profile from CV text — skills, titles, bio, experience |
| `search_jobs` | Searches RemoteOK + WeWorkRemotely for matching roles |
| `score_job_fit` | AI scores how well you match each job (0–100) with gap analysis |
| `generate_cover_letter` | Writes a personalised cover letter (professional / enthusiastic / concise) |
| `generate_follow_up` | Drafts a follow-up email scaled to how long since you applied |
| `log_to_notion` | Creates a row in your Notion Job Tracker with all details |
| `update_application_status` | Updates status in Notion (Applied → Interview → Offer) |

---

## Notion Database Schema

Create a database in Notion with exactly these columns:

| Column Name | Type | Notes |
|---|---|---|
| Job Title | Title | Primary column |
| Company | Text | |
| Job URL | URL | |
| Status | Select | Options: Applied, Pending, Interview, Rejected, Offer |
| Date Applied | Date | |
| Salary | Text | If available |
| Fit Score | Number | AI-generated 0–100 |
| Cover Letter Snippet | Text | First 300 chars of letter |
| Last Updated | Date | Updated on status changes |
| Notes | Text | Any extra context |

---

## Setup Guide

### Prerequisites

- [Node.js 18+](https://nodejs.org/)
- [Claude Desktop](https://claude.ai/download)
- A [Notion](https://www.notion.so) account
- An [Anthropic API key](https://console.anthropic.com)

### Step 1 — Clone, install & build

```bash
git clone https://github.com/YOUR_USERNAME/jobpilot-mcp.git
cd jobpilot-mcp
npm install
npm run build
```

### Step 2 — Set up Notion

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations) → **New Integration** → name it `JobPilot`
2. Set capabilities: **Read**, **Update**, **Insert** → click **Submit**
3. Copy the **Internal Integration Token** (starts with `secret_...`)
4. In Notion, create a **Full Page** database called `Job Applications` with the columns from the [schema table](#notion-database-schema) above
5. **Share** the database → **Invite** your `JobPilot` integration
6. Copy the **Database ID** from the page URL — it's the 32-character string before `?v=`:
   ```
   https://notion.so/yourworkspace/DATABASE_ID_HERE?v=...
   ```

### Step 3 — Add to Claude Desktop

Locate (or create) the Claude Desktop config file:

| OS | Path |
|---|---|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

If the file doesn't exist yet, create it and open it in one go:

```bash
# macOS
mkdir -p ~/Library/Application\ Support/Claude
open -e ~/Library/Application\ Support/Claude/claude_desktop_config.json 2>/dev/null || nano ~/Library/Application\ Support/Claude/claude_desktop_config.json

# Linux
mkdir -p ~/.config/Claude
nano ~/.config/Claude/claude_desktop_config.json
```

```powershell
# Windows (PowerShell)
New-Item -ItemType Directory -Force -Path "$env:APPDATA\Claude" | Out-Null
notepad "$env:APPDATA\Claude\claude_desktop_config.json"
```

Paste the following into the editor, replace the placeholder values, and save:

```json
{
  "mcpServers": {
    "jobpilot": {
      "command": "node",
      "args": ["/FULL/PATH/TO/jobpilot-mcp/dist/index.js"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-...",
        "NOTION_API_KEY": "secret_...",
        "NOTION_DATABASE_ID": "your_database_id"
      }
    }
  }
}
```

> **Tip:** Run `pwd` in the project folder to get the full path for `args`.
>
> **Already have other MCP servers?** Add the `"jobpilot": { ... }` block inside your existing `"mcpServers"` object — don't replace the whole file.

### Step 4 — Restart & verify

Fully quit and reopen Claude Desktop. You should see a tools icon in the chat input bar — click it to confirm all 7 JobPilot tools are listed.

---

## How to Use JobPilot

### Full Workflow (The Power Move)

Paste this into Claude Desktop:

```
Here is my CV:

[paste your full CV text here]

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

## Example Notion Output

After running the full pipeline, your Notion Job Tracker will look like this:

| Job Title | Company | Status | Fit Score | Salary | Date Applied |
|---|---|---|---|---|---|
| Senior Flutter Engineer | Shopify | Applied | 88 | $120k/yr | 2026-03-19 |
| Mobile Developer | Buffer | Applied | 74 | Not listed | 2026-03-19 |
| Flutter Dev (Remote) | Remote First Inc | Applied | 61 | $80–100k | 2026-03-19 |

Each row links back to the full cover letter snippet and notes.

---

## Why JobPilot Beats the Competition

The existing "Notion Career Sync" submission (a Chrome extension) only logs jobs you manually click on. JobPilot goes significantly further:

| Feature | Career Sync (existing) | JobPilot |
|---|---|---|
| Logs job details to Notion | ✅ | ✅ |
| AI extracts job info | ✅ | ✅ |
| Searches job boards for you | ❌ | ✅ |
| Scores CV fit against each job | ❌ | ✅ |
| Generates tailored cover letter | ❌ | ✅ |
| Tracks status updates in Notion | ❌ | ✅ |
| Drafts follow-up emails | ❌ | ✅ |
| Works via Claude Desktop (no browser extension needed) | ❌ | ✅ |
| Full pipeline in one prompt | ❌ | ✅ |

---

## Project Structure

```
jobpilot-mcp/
├── src/
│   ├── index.ts                    # MCP server + tool registry
│   └── tools/
│       ├── parseCV.ts              # CV parsing via Claude AI
│       ├── searchJobs.ts           # RemoteOK + WeWorkRemotely APIs
│       ├── scoreJobFit.ts          # AI fit scoring
│       ├── generateCoverLetter.ts  # AI cover letter generation
│       ├── generateFollowUp.ts     # AI follow-up email drafting
│       ├── logToNotion.ts          # Create row in Notion DB
│       └── updateApplicationStatus.ts  # Update existing Notion row
├── dist/                           # Compiled output (after npm run build)
├── .env.example                    # Environment variable template
├── package.json
├── tsconfig.json
└── README.md
```

---

## Tech Stack

- **Runtime**: Node.js 18+ with TypeScript
- **MCP SDK**: `@modelcontextprotocol/sdk` (official Anthropic SDK)
- **AI**: Anthropic Claude Sonnet (via `@anthropic-ai/sdk`) for CV parsing, fit scoring, letter generation
- **Job Data**: RemoteOK API + WeWorkRemotely RSS (both free, no auth required)
- **Storage**: Notion REST API v1 (2022-06-28)
- **Host**: Claude Desktop

---

## Roadmap / Future Ideas

- [ ] LinkedIn Easy Apply automation via Playwright
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
