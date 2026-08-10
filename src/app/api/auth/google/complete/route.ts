import { NextResponse } from "next/server";
import { assertAuthSecrets } from "@/env";
import {
  clearPendingSignupCookie,
  readPendingSignupFromRequest,
} from "@/lib/auth/pendingSignup";
import { setSessionCookieOnResponse } from "@/lib/auth/session";
import {
  createUser,
  getUserByEmail,
  getUserByGoogleId,
  toSafe,
  updateLastLoginAt,
  updateUser,
} from "@/lib/server/users";
import { AdminConfigError } from "@/lib/server/firebaseAdmin";
import { isAllowlistedIntern } from "@/lib/intern/allowlist";
import { isDashboardAdminEmail } from "@/lib/auth/isAdmin";

export const runtime = "nodejs";

/**
 * POST /api/auth/google/complete — finish a Google sign-up that was parked
 * at the /auth/age COPPA interstitial (see google/callback).
 *
 * Body: { ageAffirmed: boolean }
 * - ageAffirmed=true  → create (or link, if a racing sign-in created it
 *   meanwhile) the account with ageAffirmedAt stamped, set the session.
 * - ageAffirmed=false → clear the pending cookie and stop. No account was
 *   ever created, so declining leaves zero stored personal data.
 *
 * The pending cookie is signed (SESSION_SECRET) and carries the Google
 * profile the callback already verified against Google's JWKS — this route
 * never trusts client-supplied identity, only the client's age answer.
 */
export async function POST(request: Request) {
  try {
    assertAuthSecrets({ needsSession: true, needsAdmin: true });
  } catch (err) {
    console.error("[auth/google/complete]", err);
    return NextResponse.json(
      { error: "Authentication service unavailable" },
      { status: 503 }
    );
  }

  const pending = await readPendingSignupFromRequest(request);
  if (!pending) {
    return NextResponse.json(
      { error: "Sign-in session expired. Please try again.", code: "expired" },
      { status: 400 }
    );
  }

  let ageAffirmed = false;
  try {
    const body = (await request.json()) as { ageAffirmed?: unknown };
    ageAffirmed = body.ageAffirmed === true;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!ageAffirmed) {
    const response = NextResponse.json({ blocked: true });
    clearPendingSignupCookie(response);
    return response;
  }

  try {
    // Mirror the callback's create-or-link ladder: a parallel sign-in may
    // have created or linked this identity while the gate was on screen.
    let user = await getUserByGoogleId(pending.googleId);
    if (!user) {
      const existing = await getUserByEmail(pending.email);
      if (existing) {
        await updateUser(existing.uid, {
          googleId: pending.googleId,
          emailVerified: true,
          ...(pending.displayName && !existing.displayName
            ? { displayName: pending.displayName }
            : {}),
          ...(pending.photoURL && !existing.photoURL
            ? { photoURL: pending.photoURL }
            : {}),
        });
        user = { ...existing, googleId: pending.googleId, emailVerified: true };
      } else {
        user = await createUser({
          email: pending.email,
          googleId: pending.googleId,
          displayName: pending.displayName,
          photoURL: pending.photoURL,
          emailVerified: true,
          ageAffirmed: true,
        });
      }
    }

    await updateLastLoginAt(user.uid);

    const isIntern = await isAllowlistedIntern(user.email);
    const isAdmin = isDashboardAdminEmail(user.email);

    const response = NextResponse.json({ user: toSafe(user) });
    await setSessionCookieOnResponse(response, {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.photoURL,
      isIntern,
      isAdmin,
    });
    clearPendingSignupCookie(response);
    return response;
  } catch (err) {
    if (err instanceof AdminConfigError) {
      console.error("[auth/google/complete]", err);
      return NextResponse.json(
        { error: "Authentication service unavailable" },
        { status: 503 }
      );
    }
    console.error("[auth/google/complete] unexpected", err);
    return NextResponse.json({ error: "Sign-in failed." }, { status: 500 });
  }
}
