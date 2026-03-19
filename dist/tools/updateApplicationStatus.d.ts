export declare function updateApplicationStatus(args: {
    notion_page_id: string;
    new_status: "Applied" | "Pending" | "Interview" | "Rejected" | "Offer";
    notes?: string;
}): Promise<{
    content: {
        type: string;
        text: string;
    }[];
}>;
//# sourceMappingURL=updateApplicationStatus.d.ts.map