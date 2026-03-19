#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { parseCV } from "./tools/parseCV.js";
import { scoreJobFit } from "./tools/scoreJobFit.js";
import { generateCoverLetter } from "./tools/generateCoverLetter.js";
import { generateFollowUp } from "./tools/generateFollowUp.js";
import { logToNotion } from "./tools/logToNotion.js";
import { updateApplicationStatus } from "./tools/updateApplicationStatus.js";
import { searchJobs } from "./tools/searchJobs.js";
const server = new Server({
    name: "jobpilot-mcp",
    version: "1.0.0",
}, {
    capabilities: {
        tools: {},
    },
});
// ─── List Tools ───────────────────────────────────────────────────────────────
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "parse_cv",
                description: "Parse a CV/resume (PDF path or raw text) and extract a structured candidate profile: name, skills, years of experience, job titles, education, and a short bio summary.",
                inputSchema: {
                    type: "object",
                    properties: {
                        cv_text: {
                            type: "string",
                            description: "Raw text content of the CV/resume",
                        },
                    },
                    required: ["cv_text"],
                },
            },
            {
                name: "search_jobs",
                description: "Search for open job listings on RemoteOK and We Work Remotely based on a role keyword and optional filters.",
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
                description: "Score how well a candidate profile matches a job listing (0–100). Returns a fit score, matched skills, missing skills, and a recommendation.",
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
                description: "Generate a tailored, professional cover letter for a specific job based on the candidate profile.",
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
                description: "Generate a professional follow-up email for an application that has not received a response.",
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
                description: "Log a job application to the Notion Job Tracker database with full details.",
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
                description: "Update the status of an existing job application in Notion (e.g. from Applied → Interview).",
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
        ],
    };
});
// ─── Call Tools ───────────────────────────────────────────────────────────────
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        switch (name) {
            case "parse_cv":
                return await parseCV(args);
            case "search_jobs":
                return await searchJobs(args);
            case "score_job_fit":
                return await scoreJobFit(args);
            case "generate_cover_letter":
                return await generateCoverLetter(args);
            case "generate_follow_up":
                return await generateFollowUp(args);
            case "log_to_notion":
                return await logToNotion(args);
            case "update_application_status":
                return await updateApplicationStatus(args);
            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    }
    catch (err) {
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
//# sourceMappingURL=index.js.map