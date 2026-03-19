export declare function generateFollowUp(args: {
    candidate_name: string;
    company_name: string;
    job_title: string;
    days_since_applied: number;
    application_id?: string;
}): Promise<{
    content: {
        type: string;
        text: string;
    }[];
}>;
//# sourceMappingURL=generateFollowUp.d.ts.map