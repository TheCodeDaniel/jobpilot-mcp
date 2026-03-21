export interface CandidateProfile {
    name: string;
    email: string;
    phone: string | null;
    location: string | null;
    summary: string;
    skills: string[];
    experience: Array<{
        title: string;
        company: string;
        start: string;
        end: string;
    }>;
    years_experience: number;
    education: Array<{
        degree: string;
        institution: string;
    }>;
}
export declare function parseCV(args: {
    cv_text?: string;
    file_path?: string;
}): Promise<{
    content: {
        type: string;
        text: string;
    }[];
}>;
//# sourceMappingURL=parseCV.d.ts.map