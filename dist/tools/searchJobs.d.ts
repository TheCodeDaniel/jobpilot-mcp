export interface JobListing {
    id: string;
    title: string;
    company: string;
    url: string;
    salary?: string;
    description: string;
    tags: string[];
    date_posted: string;
    source: string;
}
export declare function searchJobs(args: {
    role: string;
    location?: string;
    max_results?: number;
}): Promise<{
    content: Array<{
        type: string;
        text: string;
    }>;
}>;
//# sourceMappingURL=searchJobs.d.ts.map