import { NextResponse } from "next/server";
import { getUserById, updateUser } from "@/lib/server/users";
import { verifyReminderToken } from "@/lib/server/reminderToken";
import { suppressEmail } from "@/lib/server/emailSuppression";

/**
 * One-click unsubscribe from reminder emails (CAN-SPAM). Stateless: the link
 * carries an HMAC token over the uid, so no auth/session is needed — clicking
 * it from the email just works.
 *
 * TWO writes, not one, and they answer different questions:
 *
 *   reminderPrefs.enabled = false  — the account's preference. This is what
 *     the dashboard toggle reflects, so the UI and the email agree.
 *
 *   suppressEmail(email)           — the ADDRESS is opted out. This is the one
 *     that actually holds. The preference is keyed to a uid; the promise in
 *     the footer is about an address, and an address can outlive the account,
 *     be shared by a second account, or come back after a deletion. Without
 *     this, "unsubscribe" meant "until you sign up again".
 *
 * Also serves POST, because RFC 8058 one-click (the List-Unsubscribe-Post
 * header the reminder carries) has the mail provider POST here directly. A GET
 * shows the confirmation page; a POST answers 200 with no body, which is what
 * the spec asks for.
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

/**
 * Returns true if the opt-out was recorded. The address suppression is the
 * load-bearing half, so a failure to write the preference does not abort it.
 */
async function optOut(uid: string): Promise<boolean> {
  let ok = false;

  // Address first: if only one of the two writes lands, this is the one that
  // must, because it is the one that survives a new account on the same email.
  try {
    const user = await getUserById(uid);
    if (user?.email) {
      await suppressEmail(user.email, "unsubscribed");
      ok = true;
    }
  } catch (err) {
    console.error("[reminders/unsubscribe] suppression failed", uid, err);
  }

  try {
    await updateUser(uid, { reminderPrefs: { enabled: false } });
    ok = true;
  } catch (err) {
    console.error("[reminders/unsubscribe] pref update failed", uid, err);
  }

  return ok;
}

function readToken(req: Request): string | null {
  const { searchParams } = new URL(req.url);
  const uid = searchParams.get("uid") ?? "";
  const token = searchParams.get("t") ?? "";
  return uid && verifyReminderToken(uid, token) ? uid : null;
}

export async function GET(req: Request) {
  const uid = readToken(req);
  if (!uid) return page("This unsubscribe link is invalid or expired.");

  return (await optOut(uid))
    ? page(
        "You're unsubscribed from training reminders. You can re-enable them any time in your training dashboard."
      )
    : page(
        "Something went wrong turning off reminders. Please try again from your dashboard."
      );
}

/**
 * RFC 8058 one-click. The mail provider POSTs here with no user present, so
 * there is no page to render and nothing to confirm — the click in their UI
 * WAS the confirmation.
 */
export async function POST(req: Request) {
  const uid = readToken(req);
  if (!uid) return new NextResponse(null, { status: 400 });
  const ok = await optOut(uid);
  return new NextResponse(null, { status: ok ? 200 : 500 });
}
