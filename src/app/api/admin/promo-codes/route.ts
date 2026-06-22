import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { listPromoCodes, createPromoCode } from "@/lib/promo/promoCodes";

export const runtime = "nodejs";

/** GET — list all promo codes (admin only). */
export async function GET() {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;
  try {
    const codes = await listPromoCodes();
    return NextResponse.json({ codes });
  } catch (err) {
    console.error("[admin/promo-codes] list failed", err);
    return NextResponse.json(
      { error: "Could not load promo codes." },
      { status: 500 },
    );
  }
}

/** POST — mint a new promo code (admin only). */
export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;

  let body: { code?: unknown; maxRedemptions?: unknown; note?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const code = typeof body.code === "string" ? body.code : "";
  if (!code.trim()) {
    return NextResponse.json({ error: "Code required." }, { status: 400 });
  }
  const maxRedemptions =
    typeof body.maxRedemptions === "number" ? body.maxRedemptions : null;
  const note = typeof body.note === "string" ? body.note : null;

  try {
    const created = await createPromoCode({ code, maxRedemptions, note });
    return NextResponse.json({ code: created }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not create code.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
