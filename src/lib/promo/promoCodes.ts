/**
 * Promo-code server lib (pricing pivot). Redemption is delegated to the
 * `redeem_promo` Postgres function so the cap-check + redemption insert +
 * counter increment are one atomic, row-locked transaction — the race-safe
 * guard against a free-Premium grant being over-redeemed. All access is
 * service-role (getInternSupabase); never import from client code.
 */
import { Timestamp } from "firebase-admin/firestore";
import { getInternSupabase } from "@/lib/intern/supabase";
import { updateSubscription } from "@/lib/server/users";
import { compedReasonForCode } from "@/lib/billing/config";

export type RedeemResult =
  | { ok: true; alreadyRedeemed: boolean }
  | {
      ok: false;
      code: "invalid" | "revoked" | "limit" | "unavailable";
      message: string;
    };

export async function redeemPromo(
  uid: string,
  code: string,
): Promise<RedeemResult> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) {
    return { ok: false, code: "invalid", message: "Enter a promo code." };
  }

  let status: string;
  try {
    const supabase = await getInternSupabase();
    const { data, error } = await supabase.rpc("redeem_promo", {
      p_code: normalized,
      p_uid: uid,
    });
    if (error) {
      // Includes "function does not exist" before the migration is run.
      console.error("[promo.redeem] rpc failed:", error.message);
      return {
        ok: false,
        code: "unavailable",
        message: "Promo redemption is temporarily unavailable.",
      };
    }
    status = typeof data === "string" ? data : String(data);
  } catch (err) {
    console.error("[promo.redeem] unexpected:", err);
    return {
      ok: false,
      code: "unavailable",
      message: "Promo redemption is temporarily unavailable.",
    };
  }

  if (status === "ok" || status === "already") {
    // Comp the user (idempotent — safe to re-apply on an 'already' retry). The
    // DB redemption already committed; if THIS write fails we return
    // 'unavailable' (not a 500) so the client retries — the retry hits the
    // 'already' branch and re-applies the comp, self-healing the consistency
    // gap between the Postgres redemption and the Firestore comp.
    try {
      await updateSubscription(uid, {
        compedReason: compedReasonForCode(normalized),
        compedAt: Timestamp.now(),
        plan: "premium",
      });
    } catch (err) {
      console.error("[promo.redeem] comp write failed after DB redemption:", err);
      return {
        ok: false,
        code: "unavailable",
        message: "Almost there — please try redeeming once more.",
      };
    }
    return { ok: true, alreadyRedeemed: status === "already" };
  }
  if (status === "invalid") {
    return { ok: false, code: "invalid", message: "That code isn't valid." };
  }
  if (status === "revoked") {
    return { ok: false, code: "revoked", message: "That code is no longer active." };
  }
  if (status === "limit") {
    return {
      ok: false,
      code: "limit",
      message: "That code has reached its redemption limit.",
    };
  }
  return {
    ok: false,
    code: "unavailable",
    message: "Promo redemption is temporarily unavailable.",
  };
}

// ─── Admin CRUD ──────────────────────────────────────────────────────────────

export type PromoCodeRow = {
  code: string;
  kind: string;
  max_redemptions: number | null;
  redemption_count: number;
  revoked_at: string | null;
  note: string | null;
  created_at: string;
};

export async function listPromoCodes(): Promise<PromoCodeRow[]> {
  const supabase = await getInternSupabase();
  const { data, error } = await supabase
    .from("promo_codes")
    .select("code, kind, max_redemptions, redemption_count, revoked_at, note, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as PromoCodeRow[];
}

export async function createPromoCode(input: {
  code: string;
  maxRedemptions?: number | null;
  note?: string | null;
}): Promise<PromoCodeRow> {
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,40}$/.test(code)) {
    throw new Error("Code must be 3–40 chars: A–Z, 0–9, - or _.");
  }
  const supabase = await getInternSupabase();
  const { data, error } = await supabase
    .from("promo_codes")
    .insert({
      code,
      max_redemptions: input.maxRedemptions ?? null,
      note: input.note ?? null,
    })
    .select("code, kind, max_redemptions, redemption_count, revoked_at, note, created_at")
    .single();
  if (error) {
    // 23505 = unique_violation → friendly message instead of the raw DB string.
    if (error.code === "23505") throw new Error("That code already exists.");
    throw new Error(error.message);
  }
  return data as PromoCodeRow;
}

export async function setPromoCodeRevoked(
  code: string,
  revoked: boolean,
): Promise<void> {
  const supabase = await getInternSupabase();
  const { error } = await supabase
    .from("promo_codes")
    .update({ revoked_at: revoked ? new Date().toISOString() : null })
    .eq("code", code.trim().toUpperCase());
  if (error) throw new Error(error.message);
}

export async function setPromoCodeMax(
  code: string,
  maxRedemptions: number | null,
): Promise<void> {
  const supabase = await getInternSupabase();
  const { error } = await supabase
    .from("promo_codes")
    .update({ max_redemptions: maxRedemptions })
    .eq("code", code.trim().toUpperCase());
  if (error) throw new Error(error.message);
}
