import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/server/firebaseAdmin";
import { sendDailyReminderEmail } from "@/lib/server/email";
import { unsubscribeUrl } from "@/lib/server/reminderToken";
import type { StoredUser } from "@/lib/server/users";

/**
 * Daily training-reminder cron (Phase 3 of the learning engine).
 *
 * Invoked by a Vercel cron (see vercel.json). Emails opted-in users who
 * haven't trained today a nudge to keep their streak. Strictly opt-in
 * (reminderPrefs.enabled) — that opt-in is the consent — and every email
 * carries a one-click unsubscribe (CAN-SPAM). Authorized via CRON_SECRET like
 * keep-maia-alive.
 *
 * NOTE: actual delivery is gated on the chessmasti.com domain being verified
 * in Resend; until then sends throw and are counted as `failed` (the cron
 * stays green so it doesn't page anyone).
 */

const CRON_SECRET = process.env.CRON_SECRET;
const MAX_PER_RUN = 1000;
const INACTIVE_CUTOFF_MS = 20 * 60 * 60 * 1000; // don't nag someone who trained <20h ago

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  if (CRON_SECRET) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let db;
  try {
    db = await getAdminFirestore();
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: "Firestore unavailable", detail: String(err) },
      { status: 503 }
    );
  }

  const now = Date.now();
  let considered = 0;
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  try {
    const snap = await db
      .collection("users")
      .where("reminderPrefs.enabled", "==", true)
      .limit(MAX_PER_RUN)
      .get();

    for (const doc of snap.docs) {
      considered += 1;
      const u = { uid: doc.id, ...(doc.data() as Omit<StoredUser, "uid">) };

      // Skip if no email, or trained recently (don't nag).
      if (!u.email) {
        skipped += 1;
        continue;
      }
      if (
        typeof u.lastActiveAt === "number" &&
        now - u.lastActiveAt < INACTIVE_CUTOFF_MS
      ) {
        skipped += 1;
        continue;
      }

      try {
        await sendDailyReminderEmail({
          to: u.email,
          displayName: u.displayName,
          streak: u.currentStreak,
          unsubscribeUrl: unsubscribeUrl(u.uid),
        });
        sent += 1;
      } catch (err) {
        // Resend not configured / domain unverified / transient — count, continue.
        failed += 1;
        console.error("[send-reminders] send failed for", u.uid, err);
      }
    }
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: "Query failed",
        detail: String(err),
        considered,
        sent,
        skipped,
        failed,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, considered, sent, skipped, failed });
}
