import { NextResponse } from "next/server";
import { getSession, refreshSessionCookieOnResponse } from "@/lib/auth/session";
import { getUserById, toSafe } from "@/lib/server/users";
import { AdminConfigError } from "@/lib/server/firebaseAdmin";
import {
  resolveEntitlement,
  toClientEntitlement,
  startTrialIfEligible,
} from "@/lib/billing/access";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ user: null }, { status: 200 });
  }

  try {
    const user = await getUserById(session.uid);
    if (!user) {
      // Session points to a deleted user — treat as signed-out.
      return NextResponse.json({ user: null }, { status: 200 });
    }
    // Lazily start the 7-day premium trial on first authenticated load — covers
    // both new signups and pre-pivot existing users. No-op when FREEMIUM_ENABLED
    // is off or the user already has billing state. Non-fatal on write failure.
    let current = user;
    try {
      current = await startTrialIfEligible(user);
    } catch (e) {
      console.error("[auth/me] trial start failed (non-fatal)", e);
    }
    const now = Date.now();
    const entitlement = toClientEntitlement(resolveEntitlement(current, now), now);
    // isIntern + isAdmin are stamped into the session JWT at sign-in time;
    // surface them alongside the user payload so `useViewer()` can read both
    // without a second roundtrip. `entitlement` is computed LIVE (not from the
    // JWT) so a webhook/promo update shows up on the next load.
    const response = NextResponse.json({
      user: toSafe(current),
      isIntern: !!session.isIntern,
      isAdmin: !!session.isAdmin,
      entitlement,
    });
    // Sliding-window refresh: every authenticated app load rolls the session
    // forward so a returning user is silently kept signed in.
    await refreshSessionCookieOnResponse(response, session);
    return response;
  } catch (err) {
    if (err instanceof AdminConfigError) {
      console.error("[auth/me]", err);
      return NextResponse.json(
        { error: "Authentication service unavailable" },
        { status: 503 }
      );
    }
    console.error("[auth/me] unexpected", err);
    return NextResponse.json(
      { error: "Failed to load session." },
      { status: 500 }
    );
  }
}
