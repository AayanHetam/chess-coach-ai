import { Resend } from "resend";
import { getAuthEnv } from "@/env";
import { isEmailSuppressed } from "@/lib/server/emailSuppression";

/**
 * Thin wrapper around Resend so we can swap providers later without
 * rewriting every callsite. Server-only.
 *
 * Every send declares a `kind`, and the two kinds are not interchangeable:
 *
 *   "transactional" — a reply to something the person just did (password
 *     reset). CAN-SPAM exempts these, and they must go out even to a
 *     suppressed address, or an unsubscribed user can never recover their
 *     account.
 *
 *   "bulk" — anything whose primary purpose is not that. The type REQUIRES an
 *     `unsubscribeUrl`, so a bulk sender that forgets the footer does not
 *     compile. That is deliberate: `sendWelcomeEmail` sat in this file for
 *     months with no unsubscribe link and no caller, one wire-up away from
 *     being a violation, and no test would have caught it. Making the compiler
 *     the check means the next person cannot make the same omission.
 *
 * Bulk sends are also checked against the suppression list immediately before
 * handing anything to Resend. Checking at the callsite would mean every future
 * callsite has to remember; checking here means none of them can forget.
 */

let cachedClient: Resend | null = null;
function getClient(): Resend {
  if (cachedClient) return cachedClient;
  const apiKey = getAuthEnv().email.resendApiKey;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set.");
  cachedClient = new Resend(apiKey);
  return cachedClient;
}

interface BaseSendArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
}

type SendArgs =
  | ({ kind: "transactional" } & BaseSendArgs)
  | ({ kind: "bulk"; unsubscribeUrl: string } & BaseSendArgs);

/** What a send did. "suppressed" is a success, not a failure. */
export type SendOutcome = "sent" | "suppressed";

async function send(args: SendArgs): Promise<SendOutcome> {
  const { to, subject, html, text } = args;

  if (args.kind === "bulk" && (await isEmailSuppressed(to))) {
    return "suppressed";
  }

  const from = getAuthEnv().email.fromAddress;
  const result = await getClient().emails.send({
    from: `Chess Masti <${from}>`,
    to,
    subject,
    html,
    text,
    // RFC 8058 one-click unsubscribe. The visible footer link is what the law
    // asks for; these headers are what Gmail and Yahoo ask for from bulk
    // senders, and they let the mail client offer Unsubscribe in its own UI.
    // List-Unsubscribe-Post is what makes it ONE click rather than a
    // round-trip through a browser and a confirmation page.
    ...(args.kind === "bulk"
      ? {
          headers: {
            "List-Unsubscribe": `<${args.unsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        }
      : {}),
  });
  if (result.error) {
    throw new Error(`Resend rejected email: ${result.error.message}`);
  }
  return "sent";
}

const BRAND_GRADIENT = "linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%)";

function wrapHtml(
  headline: string,
  body: string,
  ctaButton?: { url: string; label: string }
): string {
  const button = ctaButton
    ? `
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0">
        <tr>
          <td align="center" bgcolor="#FF6B35" style="border-radius:8px;background:${BRAND_GRADIENT};">
            <a href="${ctaButton.url}"
               style="display:inline-block;padding:14px 28px;color:#fff;text-decoration:none;font-weight:700;font-size:15px;">
              ${ctaButton.label}
            </a>
          </td>
        </tr>
      </table>
    `
    : "";
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f6f6f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0"
             style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;">
        <tr>
          <td style="background:${BRAND_GRADIENT};padding:24px 32px;">
            <div style="color:#fff;font-size:20px;font-weight:800;letter-spacing:-0.01em;">Chess Masti</div>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;color:#222;font-size:15px;line-height:1.55;">
            <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#111;">${headline}</h1>
            ${body}
            ${button}
            <p style="margin:24px 0 0;color:#888;font-size:13px;">— Chess Masti</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export async function sendPasswordResetEmail(args: {
  to: string;
  resetUrl: string;
  expiresInMinutes: number;
}): Promise<void> {
  const html = wrapHtml(
    "Reset your password",
    `<p>Someone — hopefully you — asked to reset the password on your Chess Masti account.
        Tap the button below to choose a new one. The link expires in
        <strong>${args.expiresInMinutes} minutes</strong>.</p>
      <p>If this wasn't you, you can ignore this email and your password will stay the same.</p>`,
    { url: args.resetUrl, label: "Reset password" }
  );
  const text =
    "Reset your Chess Masti password\n\n" +
    `Someone asked to reset your password. Open this link in the next ${args.expiresInMinutes} minutes:\n\n` +
    `${args.resetUrl}\n\n` +
    "If this wasn't you, ignore this email — your password is unchanged.\n";
  await send({
    kind: "transactional",
    to: args.to,
    subject: "Reset your Chess Masti password",
    html,
    text,
  });
}

export async function sendDailyReminderEmail(args: {
  to: string;
  displayName?: string;
  /** Current streak, if any, for "don't break your N-day streak" framing. */
  streak?: number;
  /** Link that turns reminders off (CAN-SPAM unsubscribe). */
  unsubscribeUrl: string;
}): Promise<SendOutcome> {
  const name = args.displayName ? `, ${args.displayName}` : "";
  const streakLine =
    args.streak && args.streak > 0
      ? `<p>You're on a <strong>${args.streak}-day streak</strong> 🔥 — a few puzzles today keeps it alive.</p>`
      : "<p>A few minutes of focused training today keeps your tactics sharp.</p>";
  const html = wrapHtml(
    `Your training is ready${name}`,
    `${streakLine}
      <p>Today's session is queued up — sized to the time you set. Jump in and we'll
        pick up right where your plan left off.</p>`,
    { url: "https://chessmasti.com/learn", label: "Start today's session" }
  ).replace(
    "</body>",
    `<table role="presentation" width="100%"><tr><td align="center" style="padding:0 16px 24px;">
       <a href="${args.unsubscribeUrl}" style="color:#aaa;font-size:12px;">Turn off these reminders</a>
     </td></tr></table></body>`
  );
  const text =
    `Your Chess Masti training is ready${name}.\n\n` +
    (args.streak && args.streak > 0
      ? `You're on a ${args.streak}-day streak — keep it alive.\n\n`
      : "") +
    "Start today's session: https://chessmasti.com/learn\n\n" +
    `Turn off reminders: ${args.unsubscribeUrl}\n`;
  return send({
    kind: "bulk",
    unsubscribeUrl: args.unsubscribeUrl,
    to: args.to,
    subject: "Your chess training is ready",
    html,
    text,
  });
}

/*
 * `sendWelcomeEmail` was removed on 2026-09-16. It had no caller anywhere in
 * the repo and no unsubscribe link, so it was a CAN-SPAM violation waiting for
 * somebody to wire it up. If a welcome email is wanted, write it as
 * kind: "transactional" (an account-confirmation message is a relationship
 * message) — the old body is in git history at 57471bb5~1.
 */
