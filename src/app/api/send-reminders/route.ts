import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/server/firebaseAdmin";
import { sendDailyReminderEmail } from "@/lib/server/email";
import { unsubscribeUrl } from "@/lib/server/reminderToken";
import { sendPush, isPushConfigured } from "@/lib/server/webpush";
import { updateUser, type StoredUser } from "@/lib/server/users";
import {
  decideReminder,
  INACTIVE_CUTOFF_MS,
} from "@/lib/reminders/eligibility";

/**
 * Daily training-reminder cron (Phases 3–4 of the learning engine).
 *
 * Invoked by a Vercel cron (see vercel.json). Nudges opted-in users who haven't
 * trained today to keep their streak — via **Web Push** if they have a
 * subscription (and VAPID is configured), otherwise **email**. Strictly opt-in
 * (reminderPrefs.enabled) — that opt-in is the consent — and email carries a
 * one-click unsubscribe (CAN-SPAM). Authorized via CRON_SECRET like
 * keep-maia-alive.
 *
 * Delivery is gated on ops config: email needs the chessmasti.com domain
 * verified in Resend; push needs VAPID keys. Until then sends fail/return
 * "unconfigured" and are counted — the cron stays green so it never pages.
 */

const CRON_SECRET = process.env.CRON_SECRET;
const MAX_PER_RUN = 1000;


export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  // Fail closed: without CRON_SECRET set, this route sends real email to real
  // users, so a missing secret must reject rather than open the relay. Vercel
  // cron injects `Authorization: Bearer <CRON_SECRET>` when the env is set.
  const auth = req.headers.get("authorization");
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  const pushReady = isPushConfigured();
  let considered = 0;
  let emailSent = 0;
  let pushSent = 0;
  let pushPruned = 0;
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

      const subs = u.pushSubscriptions ?? [];
      const hasPush = pushReady && subs.length > 0;

      // Eligibility lives in src/lib/reminders/eligibility.ts so it can be
      // tested — this route runs unattended and returns 200 even when every
      // send fails, so a regression in the decision would be silent.
      const decision = decideReminder(
        {
          email: u.email,
          lastActiveAt: u.lastActiveAt,
          pushSubscriptionCount: subs.length,
        },
        now,
        pushReady,
        INACTIVE_CUTOFF_MS,
      );
      if (!decision.send) {
        skipped += 1;
        continue;
      }

      // 1) Web Push (preferred). Prune any expired subscriptions.
      let pushedOk = false;
      if (hasPush) {
        const alive: typeof subs = [];
        for (const sub of subs) {
          const result = await sendPush(sub, {
            title: "Your chess training is ready",
            body:
              u.currentStreak && u.currentStreak > 0
                ? `Keep your ${u.currentStreak}-day streak alive — a few puzzles now.`
                : "A few minutes of training keeps your tactics sharp.",
            url: "/plan",
          });
          if (result === "sent") {
            pushedOk = true;
            alive.push(sub);
          } else if (result === "expired") {
            pushPruned += 1; // drop it
          } else {
            alive.push(sub); // keep on transient/unconfigured failures
          }
        }
        if (alive.length !== subs.length) {
          try {
            await updateUser(u.uid, { pushSubscriptions: alive });
          } catch (e) {
            console.error("[send-reminders] prune failed for", u.uid, e);
          }
        }
        if (pushedOk) pushSent += 1;
      }

      if (pushedOk) continue; // delivered via push — don't also email

      // 2) Email fallback.
      if (!u.email) {
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
        emailSent += 1;
      } catch (err) {
        failed += 1;
        console.error("[send-reminders] email failed for", u.uid, err);
      }
    }
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: "Query failed",
        detail: String(err),
        considered,
        emailSent,
        pushSent,
        pushPruned,
        skipped,
        failed,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    considered,
    emailSent,
    pushSent,
    pushPruned,
    skipped,
    failed,
    pushReady,
  });
}
