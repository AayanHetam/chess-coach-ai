import { NextResponse } from "next/server";
import { getSession, clearSessionCookieOnResponse } from "@/lib/auth/session";
import { executeUserDeletion } from "@/lib/ops/deleteUserData";
import { AdminConfigError } from "@/lib/server/firebaseAdmin";
import { DELETE_CONFIRM_PHRASE } from "@/lib/account/deleteConfirmation";

/**
 * POST /api/account/delete — the user deletes their OWN account.
 *
 * Until this route existed, deletion was real but operator-only: `/privacy`
 * told people to email chessmastiprivacy@gmail.com and wait up to seven days,
 * and a human ran `scripts/ops/delete-user.ts`. That satisfies a request made
 * by someone who reads the privacy policy; it does not satisfy GDPR Art. 17 or
 * CCPA for the people who never find it. This is the same machinery, reachable
 * from the account settings dialog, running immediately.
 *
 * Deliberately reuses `executeUserDeletion` rather than reimplementing the
 * surface list. There must be exactly ONE answer to "what does deletion mean
 * here" — two lists drift, and the one that drifts is always the one nobody
 * runs by hand.
 *
 * Confirmation is a typed literal, not a boolean flag: a mis-wired client or a
 * stray fetch cannot produce CONFIRM_PHRASE by accident. The session cookie is
 * SameSite=Lax, so a cross-site POST never carries credentials here.
 *
 * NOTE: there is no soft-delete and no undo. `users/{uid}` holds the bcrypt
 * hash and the googleId, so removing it IS removing the credential — this app
 * has no separate Firebase Auth record to revoke (see the auth model in
 * CLAUDE.md). The session cookie is cleared on the way out so the browser
 * cannot keep presenting a token for a uid that no longer resolves.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const confirm =
    typeof body === "object" && body !== null
      ? (body as { confirm?: unknown }).confirm
      : undefined;

  if (confirm !== DELETE_CONFIRM_PHRASE) {
    return NextResponse.json(
      { error: `Type ${DELETE_CONFIRM_PHRASE} to confirm.` },
      { status: 400 }
    );
  }

  let result;
  try {
    result = await executeUserDeletion(session.uid);
  } catch (err) {
    if (err instanceof AdminConfigError) {
      console.error("[account/delete] admin unavailable", err);
      return NextResponse.json(
        { error: "Account service unavailable. Please try again shortly." },
        { status: 503 }
      );
    }
    console.error("[account/delete] failed for", session.uid, err);
    return NextResponse.json(
      { error: "Could not delete the account. Please try again." },
      { status: 500 }
    );
  }

  // Per-surface errors do NOT fail the request: the account document is gone,
  // so the person cannot sign in and cannot retry. Reporting 500 here would
  // tell them nothing happened when in fact most of it did. Log loudly instead
  // — a partial deletion is an operator problem, to be finished with the CLI.
  if (result.errors.length > 0) {
    console.error(
      "[account/delete] PARTIAL deletion for",
      session.uid,
      result.errors
    );
  }

  const response = NextResponse.json({
    ok: true,
    // Counts, never contents. Useful for support ("it said 41 documents") and
    // for the e2e test to assert against without reading anyone's games.
    deleted: result.deleted,
    supabase: result.supabase?.deleted ?? null,
    partial: result.errors.length > 0,
  });
  clearSessionCookieOnResponse(response);
  return response;
}
