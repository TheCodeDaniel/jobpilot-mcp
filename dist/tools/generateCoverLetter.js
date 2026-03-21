export async function generateCoverLetter(args) {
    const { candidate_profile, job, tone = "professional" } = args;
    const name = candidate_profile?.name || "the candidate";
    const email = candidate_profile?.email || "";
    const skills = candidate_profile?.skills || [];
    const experience = candidate_profile?.experience || [];
    const years = candidate_profile?.years_experience || 0;
    const jobTitle = job?.title || "the open position";
    const company = job?.company || "your company";
    const jobDesc = job?.description || "";
    const jobTags = (job?.tags || []).join(" ");
    // Pick top 3 matched skills (skills that appear in job title/description/tags)
    const jobText = `${jobTitle} ${jobDesc} ${jobTags}`.toLowerCase();
    const matchedSkills = skills.filter((s) => jobText.includes(s.toLowerCase()));
    const topSkills = matchedSkills.length > 0 ? matchedSkills.slice(0, 3) : skills.slice(0, 3);
    // Most recent experience entry
    const recentExp = experience.length > 0 ? experience[0] : null;
    // Extract a few specific requirements from the job description
    const reqSentences = jobDesc
        .split(/[.\n]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 20 && /experience|proficien|knowledge|familiar|skill|require/i.test(s));
    const topReq = reqSentences.length > 0 ? reqSentences[0] : "";
    // Senior framing
    const seniorLevel = years >= 4;
    const levelLabel = seniorLevel ? "senior-level" : "";
    const paragraphs = [];
    if (tone === "enthusiastic") {
        // ── Enthusiastic ──
        paragraphs.push("Hi there!");
        if (seniorLevel) {
            paragraphs.push(`I'm thrilled to apply for the ${jobTitle} role at ${company}! As a ${levelLabel} professional with ${years} years of hands-on experience, this opportunity immediately caught my eye.`);
        }
        else {
            paragraphs.push(`I'm thrilled to apply for the ${jobTitle} role at ${company}! This opportunity immediately caught my eye, and I knew I had to reach out.`);
        }
        if (topSkills.length > 0) {
            paragraphs.push(`I bring deep, hands-on experience with ${topSkills.join(", ")} — skills I've honed over ${years > 0 ? `${years} years` : "my career"} of building production applications. These directly align with what you're looking for.`);
        }
        if (recentExp) {
            paragraphs.push(`Most recently, as ${recentExp.title} at ${recentExp.company}, I led development efforts that sharpened my expertise in the exact areas this role demands.`);
        }
        if (topReq) {
            paragraphs.push(`What excites me most about ${company} is the focus on ${topReq.toLowerCase().slice(0, 120)}. I'd love to bring my energy and skills to help drive that mission forward!`);
        }
        else {
            paragraphs.push(`What excites me most about ${company} is the opportunity to work with a team that's pushing boundaries. I'd love to bring my energy and skills to help drive that mission forward!`);
        }
        const contactLine = email ? `\nEmail: ${email}` : "";
        paragraphs.push(`I'd love to chat more about how I can contribute. Looking forward to hearing from you!${contactLine}\n\nBest,\n${name}`);
    }
    else if (tone === "concise") {
        // ── Concise ──
        paragraphs.push("Hello,");
        paragraphs.push(`I'm applying for the ${jobTitle} role at ${company}.${seniorLevel ? ` I have ${years} years of relevant experience.` : ""}`);
        if (topSkills.length > 0) {
            paragraphs.push(`Key skills: ${topSkills.join(", ")}.`);
        }
        if (recentExp) {
            paragraphs.push(`Recent role: ${recentExp.title} at ${recentExp.company}.`);
        }
        const contactLine = email ? `\nEmail: ${email}` : "";
        paragraphs.push(`Happy to discuss further.${contactLine}\n\n${name}`);
    }
    else {
        // ── Professional (default) ──
        paragraphs.push("Dear Hiring Manager,");
        if (seniorLevel) {
            paragraphs.push(`I am writing to express my interest in the ${jobTitle} position at ${company}. As a ${levelLabel} engineer with ${years} years of industry experience, I am confident I can contribute meaningfully to your team's goals.`);
        }
        else {
            paragraphs.push(`I am writing to express my interest in the ${jobTitle} position at ${company}. With a strong background in the technologies and practices your team values, I am confident I can contribute meaningfully to your goals.`);
        }
        if (topSkills.length > 0) {
            paragraphs.push(`My technical expertise includes ${topSkills.join(", ")}, backed by ${years > 0 ? `${years} years` : "substantial"} professional experience. These skills directly align with the requirements for this role.`);
        }
        if (recentExp) {
            paragraphs.push(`In my most recent role as ${recentExp.title} at ${recentExp.company}, I developed and delivered solutions that strengthened my abilities in the areas this role demands.`);
        }
        if (topReq) {
            paragraphs.push(`I am particularly drawn to ${company} and the emphasis on ${topReq.toLowerCase().slice(0, 120)}. I believe my skills and experience align well with the challenges ahead.`);
        }
        else {
            paragraphs.push(`I am particularly drawn to ${company} because of the team's commitment to impactful work and innovative engineering practices. I believe my skills and experience align well with the challenges ahead.`);
        }
        const contactLine = email ? `\nEmail: ${email}` : "";
        paragraphs.push(`I would welcome the opportunity to discuss how my experience aligns with your needs. Thank you for your consideration.${contactLine}\n\nSincerely,\n${name}`);
    }
    const coverLetter = paragraphs.join("\n\n");
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({
                    success: true,
                    job_title: jobTitle,
                    company,
                    tone,
                    cover_letter: coverLetter,
                    snippet: coverLetter.slice(0, 300),
                }, null, 2),
            },
        ],
    };
}
//# sourceMappingURL=generateCoverLetter.js.map