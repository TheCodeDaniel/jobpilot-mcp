const tones = {
    professional: {
        greeting: "Dear Hiring Manager,",
        opener: (name, role, company) => `I am writing to express my interest in the ${role} position at ${company}. With a strong background in the technologies and practices your team values, I am confident I can contribute meaningfully to your goals.`,
        skillsIntro: "My technical expertise includes",
        experienceIntro: "In my most recent role as",
        whyCompany: (company) => `I am particularly drawn to ${company} because of the team's commitment to impactful work and innovative engineering practices. I believe my skills and experience align well with the challenges ahead.`,
        closing: (name) => `I welcome the opportunity to discuss how my background aligns with your team's needs. Thank you for considering my application.\n\nSincerely,\n${name}`,
    },
    enthusiastic: {
        greeting: "Hi there!",
        opener: (name, role, company) => `I'm thrilled to apply for the ${role} role at ${company}! This opportunity immediately caught my eye, and I knew I had to reach out.`,
        skillsIntro: "I bring hands-on experience with",
        experienceIntro: "Most recently, as",
        whyCompany: (company) => `What excites me most about ${company} is the opportunity to work with a team that's pushing boundaries. I'd love to bring my energy and skills to help drive that mission forward!`,
        closing: (name) => `I'd love to chat more about how I can contribute. Looking forward to hearing from you!\n\nBest,\n${name}`,
    },
    concise: {
        greeting: "Hello,",
        opener: (name, role, company) => `I'm applying for the ${role} role at ${company}.`,
        skillsIntro: "Key skills:",
        experienceIntro: "Recent role:",
        whyCompany: (company) => `${company}'s work aligns with my career goals and expertise.`,
        closing: (name) => `Happy to discuss further.\n\n${name}`,
    },
};
export async function generateCoverLetter(args) {
    const { candidate_profile, job, tone = "professional" } = args;
    const t = tones[tone] || tones.professional;
    const name = candidate_profile?.name || "the candidate";
    const skills = candidate_profile?.skills || [];
    const experience = candidate_profile?.experience || [];
    const years = candidate_profile?.years_experience || 0;
    const jobTitle = job?.title || "the open position";
    const company = job?.company || "your company";
    // Pick top 3 matching skills (skills that appear in job description/tags)
    const jobText = `${job?.title || ""} ${job?.description || ""} ${(job?.tags || []).join(" ")}`.toLowerCase();
    const matchedSkills = skills.filter((s) => jobText.includes(s.toLowerCase()));
    const topSkills = matchedSkills.length > 0 ? matchedSkills.slice(0, 3) : skills.slice(0, 3);
    // Most recent experience entry
    const recentExp = experience.length > 0 ? experience[0] : null;
    // Build the letter
    const paragraphs = [];
    paragraphs.push(t.greeting);
    paragraphs.push(t.opener(name, jobTitle, company));
    // Skills paragraph
    if (topSkills.length > 0) {
        const yearsText = years > 0 ? ` backed by ${years} years of experience` : "";
        paragraphs.push(`${t.skillsIntro} ${topSkills.join(", ")}${yearsText}. These skills directly align with the requirements for this role.`);
    }
    // Experience paragraph
    if (recentExp) {
        paragraphs.push(`${t.experienceIntro} ${recentExp.title} at ${recentExp.company}, I developed and delivered solutions that strengthened my abilities in the areas this role demands.`);
    }
    // Why this company
    paragraphs.push(t.whyCompany(company));
    // Closing
    paragraphs.push(t.closing(name));
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