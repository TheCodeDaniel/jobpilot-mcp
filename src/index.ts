#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { parseCV } from "./tools/parseCV.js";
import { scoreJobFit } from "./tools/scoreJobFit.js";
import { generateCoverLetter } from "./tools/generateCoverLetter.js";
import { generateFollowUp } from "./tools/generateFollowUp.js";
import { logToNotion } from "./tools/logToNotion.js";
import { updateApplicationStatus } from "./tools/updateApplicationStatus.js";
import { searchJobs } from "./tools/searchJobs.js";
import { setupNotionDB } from "./tools/setupNotionDB.js";
import { autoApply } from "./tools/autoApply.js";
import { linkedInApply } from "./tools/linkedInApply.js";
import { indeedApply } from "./tools/indeedApply.js";

const server = new Server(
  {
    name: "jobpilot-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ─── List Tools ───────────────────────────────────────────────────────────────
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "setup_notion_db",
        description:
          "One-time setup: creates the Job List DB in Notion with the correct schema. If NOTION_DATABASE_ID is already set and valid, it skips creation. Run this before using log_to_notion.",
        inputSchema: {
          type: "object",
          properties: {
            parent_page_id: {
              type: "string",
              description:
                "The Notion page ID where the database will be created. Copy it from the page URL.",
            },
          },
          required: ["parent_page_id"],
        },
      },
      {
        name: "parse_cv",
        description:
          "Parse a CV/resume (PDF path or raw text) and extract a structured candidate profile: name, skills, years of experience, job titles, education, and a short bio summary.",
        inputSchema: {
          type: "object",
          properties: {
            cv_text: {
              type: "string",
              description: "Raw text content of the CV/resume",
            },
            file_path: {
              type: "string",
              description: "Absolute path to a PDF CV/resume file",
            },
          },
        },
      },
      {
        name: "search_jobs",
        description:
          "Search for open job listings on RemoteOK, We Work Remotely, and Himalayas based on a role keyword and optional filters.",
        inputSchema: {
          type: "object",
          properties: {
            role: {
              type: "string",
              description: 'Job role to search for, e.g. "Flutter Developer"',
            },
            location: {
              type: "string",
              description: 'Location filter, e.g. "Remote" or "Nigeria"',
            },
            max_results: {
              type: "number",
              description: "Maximum number of jobs to return (default 10)",
            },
          },
          required: ["role"],
        },
      },
      {
        name: "score_job_fit",
        description:
          "Score how well a candidate profile matches a job listing (0–100). Returns a fit score, matched skills, missing skills, and a recommendation.",
        inputSchema: {
          type: "object",
          properties: {
            candidate_profile: {
              type: "object",
              description: "Structured candidate profile from parse_cv",
            },
            job: {
              type: "object",
              description: "Job listing object with title, description, company, salary",
            },
          },
          required: ["candidate_profile", "job"],
        },
      },
      {
        name: "generate_cover_letter",
        description:
          "Generate a tailored, professional cover letter for a specific job based on the candidate profile.",
        inputSchema: {
          type: "object",
          properties: {
            candidate_profile: {
              type: "object",
              description: "Structured candidate profile from parse_cv",
            },
            job: {
              type: "object",
              description: "Job listing object",
            },
            tone: {
              type: "string",
              enum: ["professional", "enthusiastic", "concise"],
              description: "Tone of the cover letter (default: professional)",
            },
          },
          required: ["candidate_profile", "job"],
        },
      },
      {
        name: "generate_follow_up",
        description:
          "Generate a professional follow-up email for an application that has not received a response.",
        inputSchema: {
          type: "object",
          properties: {
            candidate_name: { type: "string" },
            company_name: { type: "string" },
            job_title: { type: "string" },
            days_since_applied: { type: "number" },
            application_id: {
              type: "string",
              description: "Notion page ID of the application (for reference)",
            },
          },
          required: ["candidate_name", "company_name", "job_title", "days_since_applied"],
        },
      },
      {
        name: "log_to_notion",
        description:
          "Log a job application to the Notion Job Tracker database with full details.",
        inputSchema: {
          type: "object",
          properties: {
            job_title: { type: "string" },
            company_name: { type: "string" },
            job_url: { type: "string" },
            salary: { type: "string", description: "Salary/rate if available" },
            fit_score: { type: "number", description: "AI fit score 0-100" },
            status: {
              type: "string",
              enum: ["Applied", "Pending", "Interview", "Rejected", "Offer"],
              description: "Current application status",
            },
            cover_letter_snippet: {
              type: "string",
              description: "First 300 chars of the generated cover letter",
            },
            notes: { type: "string", description: "Any extra notes" },
          },
          required: ["job_title", "company_name", "job_url", "status"],
        },
      },
      {
        name: "update_application_status",
        description:
          "Update the status of an existing job application in Notion (e.g. from Applied → Interview).",
        inputSchema: {
          type: "object",
          properties: {
            notion_page_id: {
              type: "string",
              description: "The Notion page ID of the application row",
            },
            new_status: {
              type: "string",
              enum: ["Applied", "Pending", "Interview", "Rejected", "Offer"],
            },
            notes: { type: "string" },
          },
          required: ["notion_page_id", "new_status"],
        },
      },
      {
        name: "auto_apply",
        description:
          "Automatically search, score, generate cover letters, and apply to N remote jobs matching the candidate profile. Uses browser automation (Playwright) to fill and submit application forms. Logs all applications to Notion.",
        inputSchema: {
          type: "object",
          properties: {
            candidate_profile: {
              type: "object",
              description: "Structured candidate profile from parse_cv",
            },
            role: {
              type: "string",
              description: 'Job role to search and apply for, e.g. "Flutter Developer"',
            },
            max_applications: {
              type: "number",
              description: "Maximum number of jobs to apply to (default 5, max 20)",
            },
            min_fit_score: {
              type: "number",
              description: "Minimum fit score to apply (default 65, 0-100)",
            },
            tone: {
              type: "string",
              enum: ["professional", "enthusiastic", "concise"],
              description: "Tone for generated cover letters (default: professional)",
            },
            dry_run: {
              type: "boolean",
              description:
                "If true, runs the full pipeline (search, score, cover letter, log) but skips actual form submission",
            },
          },
          required: ["candidate_profile", "role"],
        },
      },
      {
        name: "linkedin_apply",
        description:
          "Search LinkedIn for jobs and auto-apply using Easy Apply. Uses a persistent browser session — on first run the user logs in manually; all subsequent runs reuse the saved session. Each application result includes a 'confirmed' flag, confidence level, confirmation message, and a screenshot path so you can verify every submission.",
        inputSchema: {
          type: "object",
          properties: {
            candidate_profile: {
              type: "object",
              description: "Structured candidate profile from parse_cv",
            },
            role: {
              type: "string",
              description: 'Job role to search for, e.g. "Flutter Developer"',
            },
            location: {
              type: "string",
              description: 'Search location (default: "Worldwide")',
            },
            remote: {
              type: "boolean",
              description: "Filter for remote jobs only (default: true)",
            },
            easy_apply_only: {
              type: "boolean",
              description: "Only apply to Easy Apply jobs (default: true)",
            },
            date_posted: {
              type: "string",
              enum: ["day", "week", "month", "any"],
              description: "How recently the job was posted (default: week)",
            },
            experience_levels: {
              type: "array",
              items: {
                type: "string",
                enum: ["internship", "entry", "associate", "mid_senior", "director", "executive"],
              },
              description: "Experience levels to filter by (default: [entry, associate, mid_senior])",
            },
            job_types: {
              type: "array",
              items: {
                type: "string",
                enum: ["full_time", "part_time", "contract", "temporary", "internship"],
              },
              description: "Job types to filter by (default: [full_time])",
            },
            min_fit_score: {
              type: "number",
              description: "Minimum fit score to apply (default: 60, range 0-100)",
            },
            max_applications: {
              type: "number",
              description: "Maximum number of jobs to apply to (default: 10, max 20)",
            },
            tone: {
              type: "string",
              enum: ["professional", "enthusiastic", "concise"],
              description: "Cover letter tone (default: professional)",
            },
            dry_run: {
              type: "boolean",
              description: "Open forms but do not submit — for previewing the pipeline",
            },
          },
          required: ["candidate_profile", "role"],
        },
      },
      {
        name: "indeed_apply",
        description:
          "Search Indeed for jobs and auto-apply using Indeed's native 'Easily Apply' flow. Uses a persistent browser session — on first run the user logs in manually; all subsequent runs reuse the saved session. Each application result includes a 'confirmed' flag, confidence level, confirmation message, and a screenshot path so you can verify every submission.",
        inputSchema: {
          type: "object",
          properties: {
            candidate_profile: {
              type: "object",
              description: "Structured candidate profile from parse_cv",
            },
            role: {
              type: "string",
              description: 'Job role to search for, e.g. "Flutter Developer"',
            },
            location: {
              type: "string",
              description: 'Search location (default: "Remote")',
            },
            remote: {
              type: "boolean",
              description: "Filter for remote jobs only (default: true)",
            },
            indeed_apply_only: {
              type: "boolean",
              description: "Only show jobs with Indeed's native apply flow (default: true)",
            },
            date_posted_days: {
              type: "number",
              description: "Only show jobs posted within this many days (default: 7)",
            },
            job_type: {
              type: "string",
              enum: ["full_time", "part_time", "contract", "temporary", "internship"],
              description: "Job type filter (default: full_time)",
            },
            salary_min: {
              type: "number",
              description: "Minimum annual salary filter (optional)",
            },
            min_fit_score: {
              type: "number",
              description: "Minimum fit score to apply (default: 60, range 0-100)",
            },
            max_applications: {
              type: "number",
              description: "Maximum number of jobs to apply to (default: 10, max 20)",
            },
            tone: {
              type: "string",
              enum: ["professional", "enthusiastic", "concise"],
              description: "Cover letter tone (default: professional)",
            },
            dry_run: {
              type: "boolean",
              description: "Open forms but do not submit — for previewing the pipeline",
            },
          },
          required: ["candidate_profile", "role"],
        },
      },
    ],
  };
});

// ─── Call Tools ───────────────────────────────────────────────────────────────
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "setup_notion_db":
        return await setupNotionDB(args as any);

      case "parse_cv":
        return await parseCV(args as any);

      case "search_jobs":
        return await searchJobs(args as any);

      case "score_job_fit":
        return await scoreJobFit(args as any);

      case "generate_cover_letter":
        return await generateCoverLetter(args as any);

      case "generate_follow_up":
        return await generateFollowUp(args as any);

      case "log_to_notion":
        return await logToNotion(args as any);

      case "update_application_status":
        return await updateApplicationStatus(args as any);

      case "auto_apply":
        return await autoApply(args as any);

      case "linkedin_apply":
        return await linkedInApply(args as any);

      case "indeed_apply":
        return await indeedApply(args as any);

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err: any) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${err.message}`,
        },
      ],
      isError: true,
    };
  }
});

// ─── Start Server ─────────────────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("JobPilot MCP server running...");
}

main().catch(console.error);
