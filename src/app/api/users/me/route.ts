import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { firstZodError, profilePatchSchema } from "@/lib/auth/validation";
import { requireSession } from "@/lib/auth/session";
import { toSafe, updateUser } from "@/lib/server/users";
import { AdminConfigError } from "@/lib/server/firebaseAdmin";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  let patch;
  try {
    patch = profilePatchSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: firstZodError(err) }, { status: 400 });
    }
    throw err;
  }

  try {
    const user = await updateUser(guard.session.uid, patch);
    return NextResponse.json({ user: toSafe(user) });
  } catch (err) {
    if (err instanceof AdminConfigError) {
      console.error("[users/me]", err);
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }
    console.error("[users/me] unexpected", err);
    return NextResponse.json({ error: "Update failed." }, { status: 500 });
  }
}
