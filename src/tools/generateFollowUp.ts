export async function generateFollowUp(args: {
  candidate_name: string;
  company_name: string;
  job_title: string;
  days_since_applied: number;
  application_id?: string;
}) {
  const { candidate_name, company_name, job_title, days_since_applied } = args;

  let subject: string;
  let body: string;

  if (days_since_applied < 7) {
    // Gentle / early follow-up
    subject = `Following up on my ${job_title} application`;
    body = [
      `Hi,`,
      ``,
      `I recently submitted my application for the ${job_title} position at ${company_name} and wanted to confirm it was received.`,
      ``,
      `I'm very interested in this opportunity and would love the chance to discuss how my background could contribute to your team. Please let me know if there's any additional information I can provide.`,
      ``,
      `Thank you for your time.`,
      ``,
      `Best regards,`,
      `${candidate_name}`,
    ].join("\n");
  } else if (days_since_applied < 14) {
    // Polite and professional
    subject = `Checking in — ${job_title} application at ${company_name}`;
    body = [
      `Dear Hiring Team,`,
      ``,
      `I applied for the ${job_title} role at ${company_name} ${days_since_applied} days ago and wanted to follow up on the status of my application.`,
      ``,
      `I remain very enthusiastic about this opportunity and believe my experience aligns well with what the team is looking for. I'd welcome the chance to discuss this further at your convenience.`,
      ``,
      `Looking forward to hearing from you.`,
      ``,
      `Kind regards,`,
      `${candidate_name}`,
    ].join("\n");
  } else {
    // Firm but courteous
    subject = `Follow-up: ${job_title} position — ${company_name}`;
    body = [
      `Dear Hiring Team,`,
      ``,
      `I submitted my application for the ${job_title} position at ${company_name} ${days_since_applied} days ago. I understand the hiring process takes time, but I wanted to reiterate my strong interest in this role.`,
      ``,
      `If the position has been filled or the team has moved in a different direction, I would appreciate a brief update. Otherwise, I am happy to provide any additional information or references you may need.`,
      ``,
      `Thank you for your consideration.`,
      ``,
      `Sincerely,`,
      `${candidate_name}`,
    ].join("\n");
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            success: true,
            days_since_applied,
            follow_up_email: { subject, body },
          },
          null,
          2
        ),
      },
    ],
  };
}
