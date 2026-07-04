import { useAuth } from "@/contexts/AuthContext";
import type { ClientEntitlement } from "@/lib/billing/entitlement";

/**
 * Narrow hook over useAuth() for premium gating in the UI. Reads the live
 * entitlement returned by /api/auth/me.
 *
 * Fails OPEN on the client (isPremium defaults to true while entitlement is
 * unknown / still loading) so we never flash a paywall before we know the
 * answer — the server route is the real gate, the client UI is just courtesy.
 */
export function useEntitlement(): {
  entitlement: ClientEntitlement | null;
  isPremium: boolean;
  loading: boolean;
  /** Whether freemium enforcement is on at all (drives whether UI shows banners). */
  freemiumEnabled: boolean;
  trialDaysRemaining: number;
  isOnTrial: boolean;
  /** Has a real Stripe subscription (already checked out) — vs a local no-card
   *  trial. Gate "Manage subscription" / suppress re-upsell on this. */
  hasStripeSubscription: boolean;
  /** A cancellation is scheduled — premium until the period/trial end, then free. */
  cancelAtPeriodEnd: boolean;
} {
  const { entitlement, loading } = useAuth();
  return {
    entitlement,
    loading,
    isPremium: entitlement ? entitlement.isPremium : true,
    freemiumEnabled: entitlement?.freemiumEnabled ?? false,
    trialDaysRemaining: entitlement?.trialDaysRemaining ?? 0,
    isOnTrial: entitlement?.reason === "trialing",
    hasStripeSubscription: entitlement?.hasStripeSubscription ?? false,
    cancelAtPeriodEnd: entitlement?.cancelAtPeriodEnd ?? false,
  };
}
