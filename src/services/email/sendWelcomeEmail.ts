import { sendEmail } from "./emailService";
import { buildWelcomeEmail } from "./templates/welcome.template";
import { EmailResult } from "./email.types";

// ---------------------------------------------------------------------------
// Welcome Email Sender
// Called once after a new profile is successfully created.
// Always fire-and-forget — never awaited in the auth flow so it
// cannot block or fail registration.
// ---------------------------------------------------------------------------

export async function sendWelcomeEmail(
  recipientEmail: string,
  firstName: string
): Promise<EmailResult> {
  try {
    const { subject, html, text } = buildWelcomeEmail({ firstName });

    const result = await sendEmail({ to: recipientEmail, subject, html, text });

    if (result.success) {
      console.log(`[sendWelcomeEmail] Sent to ${recipientEmail} - Resend ID: ${result.id}`);
    } else {
      console.warn(`[sendWelcomeEmail] Failed for ${recipientEmail}: ${result.error}`);
    }

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error in sendWelcomeEmail.";
    console.error("[sendWelcomeEmail] Unexpected error:", message);
    return { success: false, error: message };
  }
}