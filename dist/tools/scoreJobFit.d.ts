import type { CandidateProfile } from "./parseCV.js";
import type { JobListing } from "./searchJobs.js";
export interface FitResult {
    score: number;
    verdict: "Strong Match" | "Good Match" | "Weak Match" | "Not Recommended";
    matched_skills: string[];
    missing_skills: string[];
    recommendation: string;
}
export declare function scoreJobFit(args: {
    candidate_profile: CandidateProfile;
    job: JobListing;
}): Promise<{
    content: {
        type: string;
        text: string;
    }[];
}>;
//# sourceMappingURL=scoreJobFit.d.ts.map