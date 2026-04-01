import { sendEmail } from "./emailService";
import { buildSupportTicketEmail } from "./templates/support-ticket.template";
import { EmailResult } from "./email.types";

// ---------------------------------------------------------------------------
// Support Ticket Confirmation Email
// Called once after a support ticket is successfully inserted.
// Always fire-and-forget — never blocks the UI flow.
// ---------------------------------------------------------------------------

export async function sendSupportTicketEmail(
  recipientEmail: string,
  firstName: string,
  category: string,
  subject: string,
  message: string
): Promise<EmailResult> {
  try {
    const { subject: emailSubject, html, text } = buildSupportTicketEmail({
      firstName,
      category,
      subject,
      message,
    });

    const result = await sendEmail({
      to: recipientEmail,
      subject: emailSubject,
      html,
      text,
    });

    if (result.success) {
      console.log(`[sendSupportTicketEmail] Sent to ${recipientEmail} - Resend ID: ${result.id}`);
    } else {
      console.warn(`[sendSupportTicketEmail] Failed for ${recipientEmail}: ${result.error}`);
    }

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error in sendSupportTicketEmail.";
    console.error("[sendSupportTicketEmail] Unexpected error:", message);
    return { success: false, error: message };
  }
}