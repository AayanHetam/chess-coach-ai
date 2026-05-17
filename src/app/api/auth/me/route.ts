import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
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
    // isIntern is stamped into the session JWT at sign-in time; surface it
    // alongside the user payload so `useViewer()` can read it without a
    // second roundtrip.
    return NextResponse.json({ user: toSafe(user), isIntern: !!session.isIntern });
  } catch (err) {
    if (err instanceof AdminConfigError) {
      console.error("[auth/me]", err);
      return NextResponse.json({ error: "Authentication service unavailable" }, { status: 503 });
    }
    console.error("[auth/me] unexpected", err);
    return NextResponse.json({ error: "Failed to load session." }, { status: 500 });
  }
}
