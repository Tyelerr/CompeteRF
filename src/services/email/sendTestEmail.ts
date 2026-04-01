import { sendEmail } from "./emailService";
import { EmailResult } from "./email.types";

export async function sendTestEmail(recipientEmail: string): Promise<EmailResult> {
  console.log(`[sendTestEmail] Sending test email to: ${recipientEmail}`);

  const result = await sendEmail({
    to: recipientEmail,
    subject: "Compete - Email Integration Test",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #1a1a1a;">Email Integration Test</h2>
        <p>This is a test email from the <strong>Compete</strong> app.</p>
        <p>If you received this, the Resend integration is working correctly.</p>
        <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
        <p style="font-size: 12px; color: #999;">
          Sent from: no-reply@thecompeteapp.com &nbsp;|&nbsp;
          Reply-To: support@thecompeteapp.com
        </p>
      </div>
    `,
    text: "This is a test email from the Compete app. If you received this, the Resend integration is working correctly.",
  });

  if (result.success) {
    console.log(`[sendTestEmail] Success - Resend ID: ${result.id}`);
  } else {
    console.warn(`[sendTestEmail] Failed - ${result.error}`);
  }

  return result;
}