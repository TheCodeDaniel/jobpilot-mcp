import type { CandidateProfile } from "./parseCV.js";
export declare function linkedInApply(args: {
    candidate_profile: CandidateProfile;
    role: string;
    location?: string;
    remote?: boolean;
    easy_apply_only?: boolean;
    date_posted?: "day" | "week" | "month" | "any";
    experience_levels?: Array<"internship" | "entry" | "associate" | "mid_senior" | "director" | "executive">;
    job_types?: Array<"full_time" | "part_time" | "contract" | "temporary" | "internship">;
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
//# sourceMappingURL=linkedInApply.d.ts.map