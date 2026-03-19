import type { CandidateProfile } from "./parseCV.js";
import type { JobListing } from "./searchJobs.js";
export declare function generateCoverLetter(args: {
    candidate_profile: CandidateProfile;
    job: JobListing;
    tone?: "professional" | "enthusiastic" | "concise";
}): Promise<{
    content: {
        type: string;
        text: string;
    }[];
}>;
//# sourceMappingURL=generateCoverLetter.d.ts.map