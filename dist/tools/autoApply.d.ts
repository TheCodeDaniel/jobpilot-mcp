import type { CandidateProfile } from "./parseCV.js";
export declare function autoApply(args: {
    candidate_profile: CandidateProfile;
    role: string;
    max_applications?: number;
    min_fit_score?: number;
    tone?: "professional" | "enthusiastic" | "concise";
    dry_run?: boolean;
}): Promise<{
    content: {
        type: string;
        text: string;
    }[];
}>;
//# sourceMappingURL=autoApply.d.ts.map