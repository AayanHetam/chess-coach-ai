import { NextResponse } from "next/server";
import { getSession, refreshSessionCookieOnResponse } from "@/lib/auth/session";
import { getUserById, toSafe } from "@/lib/server/users";
import { AdminConfigError } from "@/lib/server/firebaseAdmin";

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
    // isIntern + isAdmin are stamped into the session JWT at sign-in time;
    // surface them alongside the user payload so `useViewer()` can read both
    // without a second roundtrip.
    const response = NextResponse.json({
      user: toSafe(user),
      isIntern: !!session.isIntern,
      isAdmin: !!session.isAdmin,
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
