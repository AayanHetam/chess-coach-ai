import { Resend } from "resend";
import { getAuthEnv } from "@/env";
import { TRACK_LABELS, EDUCATION_LABELS, type Track, type EducationStatus } from "@/lib/cmip/types";

let cachedClient: Resend | null = null;
function getClient(): Resend {
  if (cachedClient) return cachedClient;
  const apiKey = getAuthEnv().email.resendApiKey;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set.");
  cachedClient = new Resend(apiKey);
  return cachedClient;
}

const BRAND_GRADIENT = "linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%)";

function shell(headline: string, body: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f6f6f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0"
             style="max-width:600px;background:#fff;border-radius:16px;overflow:hidden;">
        <tr>
          <td style="background:${BRAND_GRADIENT};padding:24px 32px;">
            <div style="color:#fff;font-size:20px;font-weight:800;letter-spacing:-0.01em;">Chess Masti — CMIP</div>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;color:#222;font-size:15px;line-height:1.55;">
            <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#111;">${headline}</h1>
            ${body}
            <p style="margin:24px 0 0;color:#888;font-size:13px;">— Chess Masti Internship Program</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type ApplicantPayload = {
  to: string;
  fullName: string;
  programUrl: string;
  contactEmail: string;
};

export async function sendApplicantConfirmation(args: ApplicantPayload): Promise<void> {
  const env = getAuthEnv();
  const fromAddr = env.cmip.fromEmail;

  const firstName = args.fullName.trim().split(/\s+/)[0] || "there";

  const html = shell(
    `Hi ${escapeHtml(firstName)} — we got your CMIP application`,
    `<p>Thanks for applying to the <strong>Chess Masti Internship Program</strong>. Your application is in.</p>
     <p><strong>What's next:</strong> we review applications on a rolling basis. If your background looks like a fit,
     we'll reach out to schedule an <strong>interview</strong> — that's a required step for every applicant.</p>
     <p>Please give us <strong>7–10 days</strong>. If you don't hear back within that window, feel free to reply
     to this email or write to <a href="mailto:${escapeHtml(args.contactEmail)}" style="color:#FF6B35;">${escapeHtml(args.contactEmail)}</a>.</p>
     <p>Want to revisit the program details? <a href="${escapeHtml(args.programUrl)}" style="color:#FF6B35;">${escapeHtml(args.programUrl)}</a></p>
     <p>Excited to read your application.</p>`,
  );

  const text = [
    `Hi ${firstName},`,
    ``,
    `Thanks for applying to the Chess Masti Internship Program. Your application is in.`,
    ``,
    `What's next: we review applications on a rolling basis. If your background looks like a fit, we'll reach out to schedule an interview — that's a required step for every applicant.`,
    ``,
    `Please give us 7–10 days. If you don't hear back within that window, write to ${args.contactEmail}.`,
    ``,
    `Program details: ${args.programUrl}`,
    ``,
    `— Chess Masti Internship Program`,
  ].join("\n");

  const result = await getClient().emails.send({
    from: `Chess Masti CMIP <${fromAddr}>`,
    to: args.to,
    subject: "We received your CMIP application",
    html,
    text,
  });
  if (result.error) {
    throw new Error(`Resend rejected applicant email: ${result.error.message}`);
  }
}

export type AdminPayload = {
  to: string;
  fullName: string;
  email: string;
  phone?: string;
  location: string;
  educationStatus: EducationStatus;
  school: string;
  tracks: Track[];
  chessUsername?: string;
  chessRating?: string;
  portfolioUrl?: string;
  resumeUrl?: string;
  motivation: string;
  proudOf: string;
  hoursPerWeek: number;
  earliestStartDate: string;
  hearAbout?: string;
  source?: string;
  userAgent?: string;
  firestoreDocPath: string;
  firestoreConsoleUrl?: string;
};

export async function sendAdminNotification(args: AdminPayload): Promise<void> {
  const env = getAuthEnv();
  const fromAddr = env.cmip.fromEmail;

  const tracksLabel = args.tracks.map((t) => TRACK_LABELS[t]).join(", ");
  const eduLabel = EDUCATION_LABELS[args.educationStatus];

  const fields: Array<[string, string | undefined]> = [
    ["Name", args.fullName],
    ["Email", args.email],
    ["Phone", args.phone],
    ["Location / TZ", args.location],
    ["Education", eduLabel],
    ["School / Institution", args.school],
    ["Tracks", tracksLabel],
    ["Chess username", args.chessUsername],
    ["Chess rating", args.chessRating],
    ["Portfolio / LinkedIn / GitHub", args.portfolioUrl],
    ["Resume URL", args.resumeUrl],
    ["Hours / week", String(args.hoursPerWeek)],
    ["Earliest start", args.earliestStartDate],
    ["How they heard", args.hearAbout],
    ["Source (referrer)", args.source],
    ["User agent", args.userAgent],
    ["Firestore doc", args.firestoreDocPath],
  ];

  const rowsHtml = fields
    .filter(([, v]) => v !== undefined && v !== "")
    .map(
      ([k, v]) =>
        `<tr>
           <td style="padding:6px 12px;color:#666;font-size:13px;vertical-align:top;white-space:nowrap;">${escapeHtml(k)}</td>
           <td style="padding:6px 12px;color:#111;font-size:14px;word-break:break-word;">${escapeHtml(String(v))}</td>
         </tr>`,
    )
    .join("");

  const consoleLink = args.firestoreConsoleUrl
    ? `<p style="margin:16px 0 0;"><a href="${escapeHtml(args.firestoreConsoleUrl)}" style="color:#FF6B35;">Open in Firestore →</a></p>`
    : "";

  const html = shell(
    `New CMIP application: ${escapeHtml(args.fullName)}`,
    `<p style="color:#555;">Tracks: <strong>${escapeHtml(tracksLabel)}</strong></p>
     <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #eee;border-radius:8px;border-collapse:separate;border-spacing:0;">
       ${rowsHtml}
     </table>
     <h2 style="margin:24px 0 8px;font-size:16px;color:#111;">Why CMIP?</h2>
     <p style="white-space:pre-wrap;background:#fafafa;border:1px solid #eee;border-radius:8px;padding:12px;font-size:14px;">${escapeHtml(args.motivation)}</p>
     <h2 style="margin:24px 0 8px;font-size:16px;color:#111;">Proud of</h2>
     <p style="white-space:pre-wrap;background:#fafafa;border:1px solid #eee;border-radius:8px;padding:12px;font-size:14px;">${escapeHtml(args.proudOf)}</p>
     ${consoleLink}`,
  );

  const textRows = fields
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  const text = [
    `New CMIP application: ${args.fullName} — ${tracksLabel}`,
    ``,
    textRows,
    ``,
    `Why CMIP?`,
    args.motivation,
    ``,
    `Proud of:`,
    args.proudOf,
    ``,
    args.firestoreConsoleUrl ?? "",
  ]
    .filter(Boolean)
    .join("\n");

  const result = await getClient().emails.send({
    from: `Chess Masti CMIP <${fromAddr}>`,
    to: args.to,
    subject: `New CMIP application: ${args.fullName} — ${tracksLabel}`,
    html,
    text,
  });
  if (result.error) {
    throw new Error(`Resend rejected admin email: ${result.error.message}`);
  }
}
