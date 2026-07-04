import { NextRequest, NextResponse, after } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { redeemPromo } from "@/lib/promo/promoCodes";
import { trackEvent } from "@/lib/tracking/track";

export const runtime = "nodejs";

/**
 * Redeem a promo code → free-forever Premium for the signed-in user. Works even
 * before go-live (a comp sets compedReason directly, independent of
 * FREEMIUM_ENABLED) — that's what hands Akanksha / Grandknights kids free
 * access with no card.
 */
export async function POST(request: NextRequest) {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;
  const { uid } = guard.session;

  let body: { code?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const code = typeof body.code === "string" ? body.code : "";
  if (!code.trim()) {
    return NextResponse.json({ error: "Enter a promo code." }, { status: 400 });
  }

  const result = await redeemPromo(uid, code);
  if (result.ok) {
    after(() =>
      trackEvent({
        eventName: "promo_redeemed",
        uid,
        props: {
          code: code.trim().toUpperCase(),
          alreadyRedeemed: result.alreadyRedeemed,
        },
      }),
    );
    return NextResponse.json({ ok: true });
  }
  const httpStatus = result.code === "unavailable" ? 503 : 400;
  return NextResponse.json(
    { error: result.message, code: result.code },
    { status: httpStatus },
  );
}
