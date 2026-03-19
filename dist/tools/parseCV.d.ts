export interface CandidateProfile {
    name: string;
    email: string;
    phone?: string;
    location?: string;
    bio: string;
    skills: string[];
    years_of_experience: number;
    job_titles: string[];
    education: string[];
    languages?: string[];
}
export declare function parseCV(args: {
    cv_text: string;
}): Promise<{
    content: {
        type: string;
        text: string;
    }[];
}>;
//# sourceMappingURL=parseCV.d.ts.map