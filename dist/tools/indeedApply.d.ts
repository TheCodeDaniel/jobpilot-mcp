import type { CandidateProfile } from "./parseCV.js";
export declare function indeedApply(args: {
    candidate_profile: CandidateProfile;
    role: string;
    location?: string;
    remote?: boolean;
    indeed_apply_only?: boolean;
    date_posted_days?: number;
    job_type?: "full_time" | "part_time" | "contract" | "temporary" | "internship";
    salary_min?: number;
    min_fit_score?: number;
    max_applications?: number;
    tone?: "professional" | "enthusiastic" | "concise";
    dry_run?: boolean;
}): Promise<{
    content: {
        type: string;
        text: string;
    }[];
}>;
//# sourceMappingURL=indeedApply.d.ts.map