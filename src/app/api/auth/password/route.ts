import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { assertAuthSecrets } from "@/env";
import { changePasswordSchema, firstZodError } from "@/lib/auth/validation";
import { getSession } from "@/lib/auth/session";
import { setPassword, verifyPasswordForUid } from "@/lib/server/users";
import { AdminConfigError } from "@/lib/server/firebaseAdmin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  try {
    assertAuthSecrets({ needsSession: true, needsAdmin: true });
  } catch (err) {
    console.error("[auth/password]", err);
    return NextResponse.json(
      { error: "Authentication service unavailable" },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  let input;
  try {
    input = changePasswordSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: firstZodError(err) }, { status: 400 });
    }
    throw err;
  }

  try {
    const user = await verifyPasswordForUid(session.uid, input.currentPassword);
    if (!user) {
      return NextResponse.json(
        { error: "Current password is incorrect." },
        { status: 401 }
      );
    }
    await setPassword(user.uid, input.newPassword);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AdminConfigError) {
      console.error("[auth/password]", err);
      return NextResponse.json(
        { error: "Authentication service unavailable" },
        { status: 503 }
      );
    }
    console.error("[auth/password] unexpected", err);
    return NextResponse.json(
      { error: "Password change failed." },
      { status: 500 }
    );
  }
}
