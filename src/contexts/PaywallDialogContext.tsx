"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  PropsWithChildren,
} from "react";
import PaywallDialog from "@/components/paywall/PaywallDialog";

const PAYWALL_EVENT = "chessmasti:paywall";

/**
 * Open the global paywall from ANYWHERE — including module-level helper
 * functions and the deep coach call paths that can't use React hooks. Decoupled
 * via a window CustomEvent the provider listens for. No-op during SSR.
 */
export function triggerPaywall(options?: OpenPaywallOptions): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PAYWALL_EVENT, { detail: options ?? {} }));
}

/**
 * App-wide home for the single Premium upgrade dialog. Mirrors
 * AuthDialogContext exactly (one mounted dialog, ref-held onClose) so any
 * component can call `usePaywallDialog().openPaywallDialog()` when a user hits
 * a 402 or taps an upgrade affordance.
 */

export interface OpenPaywallOptions {
  /** Human label of the feature that triggered the wall (for copy + tracking). */
  feature?: string;
  reason?: "quota_exhausted" | "premium_required" | "manual";
  /** Runs once after the dialog closes. */
  onClose?: () => void;
}

interface PaywallDialogContextValue {
  openPaywallDialog: (options?: OpenPaywallOptions) => void;
  closePaywallDialog: () => void;
  isPaywallOpen: boolean;
  paywallContext: OpenPaywallOptions | null;
}

const PaywallDialogContext = createContext<PaywallDialogContextValue>({
  openPaywallDialog: () => {},
  closePaywallDialog: () => {},
  isPaywallOpen: false,
  paywallContext: null,
});

export function PaywallDialogProvider({ children }: PropsWithChildren) {
  const [open, setOpen] = useState(false);
  const [ctx, setCtx] = useState<OpenPaywallOptions | null>(null);
  const onCloseRef = useRef<(() => void) | undefined>(undefined);

  const openPaywallDialog = useCallback((options?: OpenPaywallOptions) => {
    onCloseRef.current = options?.onClose;
    setCtx(options ?? null);
    setOpen(true);
  }, []);

  const closePaywallDialog = useCallback(() => {
    setOpen(false);
    const cb = onCloseRef.current;
    onCloseRef.current = undefined;
    cb?.();
  }, []);

  // Bridge: let non-React code open the paywall via triggerPaywall().
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as OpenPaywallOptions | undefined;
      openPaywallDialog(detail);
    };
    window.addEventListener(PAYWALL_EVENT, handler);
    return () => window.removeEventListener(PAYWALL_EVENT, handler);
  }, [openPaywallDialog]);

  return (
    <PaywallDialogContext.Provider
      value={{
        openPaywallDialog,
        closePaywallDialog,
        isPaywallOpen: open,
        paywallContext: ctx,
      }}
    >
      {children}
    </PaywallDialogContext.Provider>
  );
}

/**
 * Renders the one shared PaywallDialog. Mount inside the ThemeProvider (see
 * Layout) so it inherits the glass theme.
 */
export function GlobalPaywallDialog() {
  const { isPaywallOpen, closePaywallDialog, paywallContext } =
    usePaywallDialog();
  return (
    <PaywallDialog
      open={isPaywallOpen}
      onClose={closePaywallDialog}
      context={paywallContext}
    />
  );
}

export const usePaywallDialog = () => useContext(PaywallDialogContext);
