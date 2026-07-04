import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { setPromoCodeRevoked, setPromoCodeMax } from "@/lib/promo/promoCodes";

export const runtime = "nodejs";

/**
 * PUT — mutate a promo code (admin only).
 * Body: { action: "revoke" | "unrevoke" | "setMax", value?: number | null }.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;
  const { code } = await params;

  let body: { action?: unknown; value?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  try {
    if (body.action === "revoke") {
      await setPromoCodeRevoked(code, true);
    } else if (body.action === "unrevoke") {
      await setPromoCodeRevoked(code, false);
    } else if (body.action === "setMax") {
      await setPromoCodeMax(code, typeof body.value === "number" ? body.value : null);
    } else {
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/promo-codes PUT]", err);
    return NextResponse.json({ error: "Update failed." }, { status: 500 });
  }
}
