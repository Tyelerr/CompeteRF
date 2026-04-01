// ---------------------------------------------------------------------------
// Support Ticket Confirmation Email Template
// ---------------------------------------------------------------------------

export interface SupportTicketTemplateProps {
  firstName: string;
  category: string;
  subject: string;
  message: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  tournament_issues: "Tournament Issues",
  report_problem: "Report a Problem",
  feedback_suggestions: "Feedback & Suggestions",
  account_issues: "Account Issues",
  fargo_rating: "Fargo Rating",
  become_td: "Become a Tournament Director",
  tournament_submission: "Tournament Submission",
  general: "General",
  other: "Other",
};

export function buildSupportTicketEmail({ firstName, category, subject, message }: SupportTicketTemplateProps): {
  subject: string;
  html: string;
  text: string;
} {
  const emailSubject = `We received your message - ${subject}`;
  const categoryLabel = CATEGORY_LABELS[category] ?? category;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Support Ticket Received</title>
</head>
<body style="margin:0;padding:0;background-color:#0f0f0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f0f0f;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#1a1a1a;border-radius:16px;overflow:hidden;border:1px solid #2a2a2a;">

          <!-- Header -->
          <tr>
            <td style="background-color:#2563EB;padding:32px 40px;text-align:center;">
              <p style="margin:0;font-size:13px;font-weight:700;color:#93C5FD;letter-spacing:3px;text-transform:uppercase;">Compete Support</p>
              <h1 style="margin:8px 0 0;font-size:28px;font-weight:800;color:#ffffff;">Message Received</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 20px;font-size:16px;color:#ffffff;font-weight:600;">
                Hey ${firstName},
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#a3a3a3;line-height:1.7;">
                Thanks for reaching out. We received your message and will get back to you as soon as possible, typically within 1-2 business days.
              </p>

              <!-- Ticket Summary -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#242424;border-radius:12px;overflow:hidden;margin-bottom:28px;border:1px solid #2f2f2f;">
                <tr>
                  <td style="padding:20px 24px;border-bottom:1px solid #2f2f2f;">
                    <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1.5px;">Category</p>
                    <p style="margin:0;font-size:14px;color:#e5e5e5;font-weight:500;">${categoryLabel}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px 24px;border-bottom:1px solid #2f2f2f;">
                    <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1.5px;">Subject</p>
                    <p style="margin:0;font-size:14px;color:#e5e5e5;font-weight:500;">${subject}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1.5px;">Your Message</p>
                    <p style="margin:0;font-size:14px;color:#a3a3a3;line-height:1.6;white-space:pre-wrap;">${message}</p>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;font-size:14px;color:#a3a3a3;line-height:1.6;">
                You can reply directly to this email or reach us at
                <a href="mailto:support@thecompeteapp.com" style="color:#2563EB;text-decoration:none;font-weight:600;">support@thecompeteapp.com</a>
              </p>
              <p style="margin:0;font-size:14px;color:#a3a3a3;line-height:1.6;">
                Please do not submit duplicate tickets for the same issue.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #2a2a2a;text-align:center;">
              <p style="margin:0;font-size:12px;color:#4b5563;">
                Compete &mdash; Find Your Game
              </p>
              <p style="margin:6px 0 0;font-size:11px;color:#374151;">
                Sent from no-reply@thecompeteapp.com
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Hey ${firstName},

Thanks for reaching out. We received your message and will get back to you as soon as possible, typically within 1-2 business days.

--- Your Ticket ---
Category: ${categoryLabel}
Subject: ${subject}

Message:
${message}
---

You can reply directly to this email or reach us at support@thecompeteapp.com.

-- The Compete Support Team`;

  return { subject: emailSubject, html, text };
}