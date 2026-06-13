import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { purgeUserData } from "@/lib/tracking/purge";

/**
 * POST /api/admin/tracking/purge — admin-only right-to-erasure (TRK-5).
 *
 * Deletes all tracking-warehouse data for a uid. Until a self-serve
 * account-deletion flow exists, this is how a data-removal request is honored;
 * when that flow lands it should call purgeUserData() directly too.
 */
export const runtime = "nodejs";

const schema = z.object({ uid: z.string().min(1).max(128) });

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "uid is required" }, { status: 400 });
  }

  const result = await purgeUserData(parsed.data.uid);
  const status = result.errors.length ? 207 : 200;
  return NextResponse.json(result, { status });
}
