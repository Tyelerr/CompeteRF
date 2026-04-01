// ---------------------------------------------------------------------------
// Welcome Email Template
// ---------------------------------------------------------------------------

export interface WelcomeTemplateProps {
  firstName: string;
}

export function buildWelcomeEmail({ firstName }: WelcomeTemplateProps): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = "Welcome to Compete!";

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome to Compete</title>
</head>
<body style="margin:0;padding:0;background-color:#0f0f0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f0f0f;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#1a1a1a;border-radius:16px;overflow:hidden;border:1px solid #2a2a2a;">

          <!-- Header -->
          <tr>
            <td style="background-color:#2563EB;padding:36px 40px;text-align:center;">
              <p style="margin:0;font-size:13px;font-weight:700;color:#93C5FD;letter-spacing:3px;text-transform:uppercase;">Welcome to</p>
              <h1 style="margin:8px 0 0;font-size:36px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">Compete</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#ffffff;">
                Hey ${firstName}, you are in! &#127881;
              </h2>
              <p style="margin:0 0 24px;font-size:15px;color:#a3a3a3;line-height:1.7;">
                Your Compete account is all set up. You can now find tournaments near you, track your favorite venues, and stay in the loop on everything happening in your local pool scene.
              </p>

              <!-- What to do next -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#242424;border-radius:12px;padding:24px;margin-bottom:28px;border:1px solid #2f2f2f;">
                <tr>
                  <td>
                    <p style="margin:0 0 16px;font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1.5px;">Get Started</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:8px 0;border-bottom:1px solid #2f2f2f;">
                          <p style="margin:0;font-size:14px;color:#e5e5e5;">&#127919; Browse tournaments near you</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;border-bottom:1px solid #2f2f2f;">
                          <p style="margin:0;font-size:14px;color:#e5e5e5;">&#11088; Save your favorite venues and series</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;border-bottom:1px solid #2f2f2f;">
                          <p style="margin:0;font-size:14px;color:#e5e5e5;">&#128276; Set up search alerts so you never miss a tourney</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;">
                          <p style="margin:0;font-size:14px;color:#e5e5e5;">&#127873; Enter giveaways for a chance to win prizes</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.6;">
                Questions? Reply to this email or reach us at
                <a href="mailto:support@thecompeteapp.com" style="color:#2563EB;text-decoration:none;font-weight:600;">support@thecompeteapp.com</a>
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

  const text = `Hey ${firstName}, welcome to Compete!

Your account is all set. Here is what you can do next:

- Browse tournaments near you
- Save your favorite venues and series
- Set up search alerts so you never miss a tourney
- Enter giveaways for a chance to win prizes

Questions? Email us at support@thecompeteapp.com

-- The Compete Team`;

  return { subject, html, text };
}