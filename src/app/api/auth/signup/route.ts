import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { assertAuthSecrets } from "@/env";
import { signupSchema, firstZodError } from "@/lib/auth/validation";
import { setSessionCookieOnResponse } from "@/lib/auth/session";
import { createUser, toSafe, UserError } from "@/lib/server/users";
import { AdminConfigError } from "@/lib/server/firebaseAdmin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertAuthSecrets({ needsSession: true, needsAdmin: true });
  } catch (err) {
    console.error("[auth/signup]", err);
    return NextResponse.json({ error: "Authentication service unavailable" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  let input;
  try {
    input = signupSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: firstZodError(err) }, { status: 400 });
    }
    throw err;
  }

  try {
    const user = await createUser({
      email: input.email,
      password: input.password,
      displayName: input.displayName,
    });

    const safe = toSafe(user);
    const response = NextResponse.json({ user: safe }, { status: 201 });
    await setSessionCookieOnResponse(response, {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.photoURL,
    });
    return response;
  } catch (err) {
    if (err instanceof UserError && err.code === "email_taken") {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 409 });
    }
    if (err instanceof AdminConfigError) {
      console.error("[auth/signup]", err);
      return NextResponse.json({ error: "Authentication service unavailable" }, { status: 503 });
    }
    console.error("[auth/signup] unexpected", err);
    return NextResponse.json({ error: "Sign-up failed." }, { status: 500 });
  }
}
