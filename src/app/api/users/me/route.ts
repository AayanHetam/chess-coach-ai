import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { firstZodError, profilePatchSchema } from "@/lib/auth/validation";
import { requireSession } from "@/lib/auth/session";
import { toSafe, updateUser } from "@/lib/server/users";
import { AdminConfigError } from "@/lib/server/firebaseAdmin";
import { suppressEmail, unsuppressEmail } from "@/lib/server/emailSuppression";

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

    // Keep the address-level suppression in step with the account toggle.
    // Without this the dashboard switch lies in both directions: flipping
    // reminders back on after an email unsubscribe would show "on" and send
    // nothing, and flipping them off in the UI would leave the address
    // deliverable to any future account sharing it.
    const enabled = patch.reminderPrefs?.enabled;
    if (enabled !== undefined && user.email) {
      try {
        if (enabled) await unsuppressEmail(user.email);
        else await suppressEmail(user.email, "unsubscribed");
      } catch (err) {
        // Non-fatal: the preference is saved, and the preference is what this
        // request was about. Logged so a persistent failure is visible.
        console.error("[users/me] suppression sync failed", err);
      }
    }

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
