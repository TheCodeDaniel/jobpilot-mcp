import type { CandidateProfile } from "./parseCV.js";
import type { JobListing } from "./searchJobs.js";

export async function generateCoverLetter(args: {
  candidate_profile: CandidateProfile;
  job: JobListing;
  tone?: "professional" | "enthusiastic" | "concise";
}) {
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

  // Senior framing
  const seniorLevel = years >= 4;
  const levelLabel = seniorLevel ? "senior-level" : "";

  const paragraphs: string[] = [];

  if (tone === "enthusiastic") {
    // ── Enthusiastic ──
    paragraphs.push("Hi there!");

    if (seniorLevel) {
      paragraphs.push(
        `I'm thrilled to apply for the ${jobTitle} role at ${company}! As a ${levelLabel} professional with ${years} years of hands-on experience, this opportunity immediately caught my eye.`
      );
    } else {
      paragraphs.push(
        `I'm thrilled to apply for the ${jobTitle} role at ${company}! This opportunity immediately caught my eye, and I knew I had to reach out.`
      );
    }

    if (topSkills.length > 0) {
      paragraphs.push(
        `I bring deep, hands-on experience with ${topSkills.join(", ")} — skills I've honed over ${years > 0 ? `${years} years` : "my career"} of building production applications. These directly align with what you're looking for.`
      );
    }

    if (recentExp) {
      paragraphs.push(
        `Most recently, as ${recentExp.title} at ${recentExp.company}, I led development efforts that sharpened my expertise in the exact areas this role demands.`
      );
    }

    paragraphs.push(
      `What excites me most about ${company} is the opportunity to contribute to the ${jobTitle} team. I'd love to bring my energy and skills to help drive that mission forward!`
    );

    const contactLine = email ? `\nEmail: ${email}` : "";
    paragraphs.push(
      `I'd love to chat more about how I can contribute. Looking forward to hearing from you!${contactLine}\n\nBest,\n${name}`
    );
  } else if (tone === "concise") {
    // ── Concise ──
    paragraphs.push("Hello,");

    paragraphs.push(
      `I'm applying for the ${jobTitle} role at ${company}.${seniorLevel ? ` I have ${years} years of relevant experience.` : ""}`
    );

    if (topSkills.length > 0) {
      paragraphs.push(`Key skills: ${topSkills.join(", ")}.`);
    }

    if (recentExp) {
      paragraphs.push(`Recent role: ${recentExp.title} at ${recentExp.company}.`);
    }

    const contactLine = email ? `\nEmail: ${email}` : "";
    paragraphs.push(`Happy to discuss further.${contactLine}\n\n${name}`);
  } else {
    // ── Professional (default) ──
    paragraphs.push("Dear Hiring Manager,");

    if (seniorLevel) {
      paragraphs.push(
        `I am writing to express my interest in the ${jobTitle} position at ${company}. As a ${levelLabel} engineer with ${years} years of industry experience, I am confident I can contribute meaningfully to your team's goals.`
      );
    } else {
      paragraphs.push(
        `I am writing to express my interest in the ${jobTitle} position at ${company}. With a strong background in the technologies and practices your team values, I am confident I can contribute meaningfully to your goals.`
      );
    }

    if (topSkills.length > 0) {
      paragraphs.push(
        `My technical expertise includes ${topSkills.join(", ")}, backed by ${years > 0 ? `${years} years` : "substantial"} professional experience. These skills directly align with the requirements for this role.`
      );
    }

    if (recentExp) {
      paragraphs.push(
        `In my most recent role as ${recentExp.title} at ${recentExp.company}, I developed and delivered solutions that strengthened my abilities in the areas this role demands.`
      );
    }

    paragraphs.push(
      `I am particularly drawn to the ${jobTitle} opportunity at ${company}. I believe my skills and experience align well with the challenges ahead, and I am eager to contribute to the team's continued success.`
    );

    const contactLine = email ? `\nEmail: ${email}` : "";
    paragraphs.push(
      `I would welcome the opportunity to discuss how my experience aligns with your needs. Thank you for your consideration.${contactLine}\n\nSincerely,\n${name}`
    );
  }

  const coverLetter = paragraphs.join("\n\n");

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            success: true,
            job_title: jobTitle,
            company,
            tone,
            cover_letter: coverLetter,
            snippet: coverLetter.slice(0, 300),
          },
          null,
          2
        ),
      },
    ],
  };
}
