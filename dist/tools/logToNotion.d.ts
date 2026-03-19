export declare function logToNotion(args: {
    job_title: string;
    company_name: string;
    job_url: string;
    salary?: string;
    fit_score?: number;
    status: "Applied" | "Pending" | "Interview" | "Rejected" | "Offer";
    cover_letter_snippet?: string;
    notes?: string;
}): Promise<{
    content: {
        type: string;
        text: string;
    }[];
}>;
//# sourceMappingURL=logToNotion.d.ts.map