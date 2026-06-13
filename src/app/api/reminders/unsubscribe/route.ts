import { NextResponse } from "next/server";
import { updateUser } from "@/lib/server/users";
import { verifyReminderToken } from "@/lib/server/reminderToken";

/**
 * One-click unsubscribe from reminder emails (CAN-SPAM). Stateless: the link
 * carries an HMAC token over the uid, so no auth/session is needed — clicking
 * it from the email just works. Flips reminderPrefs.enabled to false.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function page(message: string): NextResponse {
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
     <body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0E1016;color:#eee;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;">
       <div style="text-align:center;max-width:420px;padding:24px;">
         <div style="font-weight:800;font-size:18px;color:#FB923C;margin-bottom:12px;">Chess Masti</div>
         <p style="font-size:16px;line-height:1.5;">${message}</p>
         <a href="https://chessmasti.com/learn" style="color:#FB923C;">Back to training</a>
       </div>
     </body>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }
  );
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const uid = searchParams.get("uid") ?? "";
  const token = searchParams.get("t") ?? "";

  if (!uid || !verifyReminderToken(uid, token)) {
    return page("This unsubscribe link is invalid or expired.");
  }

  try {
    await updateUser(uid, { reminderPrefs: { enabled: false } });
    return page(
      "You're unsubscribed from training reminders. You can re-enable them any time in your training dashboard."
    );
  } catch (err) {
    console.error("[reminders/unsubscribe] failed", err);
    return page(
      "Something went wrong turning off reminders. Please try again from your dashboard."
    );
  }
}
