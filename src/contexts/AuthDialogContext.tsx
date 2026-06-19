"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  PropsWithChildren,
} from "react";
import AuthDialog from "@/components/auth/AuthDialog";

/**
 * App-wide home for the single sign-in / sign-up dialog.
 *
 * Before this, seven call-sites (NavPill, UserMenu, the three landing
 * sections, the onboarding page, PlacementTest) each kept their own
 * `useState` open flag and rendered their own `<AuthDialog />`. They all
 * pointed at the same component, so the duplication was pure wiring — seven
 * mounted-but-closed dialogs and seven copies of the open/close glue to keep
 * in sync.
 *
 * Now there is one dialog. <GlobalAuthDialog /> mounts it once inside the MUI
 * ThemeProvider (see src/sections/layout) so it keeps the orange/glass theme,
 * and any component opens it with `useAuthDialog().openAuthDialog()`.
 *
 * `openAuthDialog` takes an optional `onClose` so callers that need to react
 * to the dialog closing — e.g. the onboarding page redirecting to /plan once
 * the user is signed in — can still do so. The callback fires once, on the
 * next close, then clears itself.
 */

interface OpenAuthDialogOptions {
  /** Runs once after the dialog closes. Used for post-auth redirects. */
  onClose?: () => void;
}

interface AuthDialogContextValue {
  openAuthDialog: (options?: OpenAuthDialogOptions) => void;
  closeAuthDialog: () => void;
  isAuthDialogOpen: boolean;
}

const AuthDialogContext = createContext<AuthDialogContextValue>({
  openAuthDialog: () => {},
  closeAuthDialog: () => {},
  isAuthDialogOpen: false,
});

export function AuthDialogProvider({ children }: PropsWithChildren) {
  const [open, setOpen] = useState(false);
  // Held in a ref (not state) so swapping the callback never re-renders, and
  // so the close handler always invokes the latest callback handed to
  // openAuthDialog rather than a stale snapshot.
  const onCloseRef = useRef<(() => void) | undefined>(undefined);

  const openAuthDialog = useCallback((options?: OpenAuthDialogOptions) => {
    onCloseRef.current = options?.onClose;
    setOpen(true);
  }, []);

  const closeAuthDialog = useCallback(() => {
    setOpen(false);
    const cb = onCloseRef.current;
    onCloseRef.current = undefined;
    cb?.();
  }, []);

  return (
    <AuthDialogContext.Provider
      value={{ openAuthDialog, closeAuthDialog, isAuthDialogOpen: open }}
    >
      {children}
    </AuthDialogContext.Provider>
  );
}

/**
 * Renders the one shared AuthDialog. Mount inside the ThemeProvider (see
 * Layout) so the dialog inherits the app theme; the provider above only holds
 * open/close state and can live higher in the tree.
 */
export function GlobalAuthDialog() {
  const { isAuthDialogOpen, closeAuthDialog } = useAuthDialog();
  return <AuthDialog open={isAuthDialogOpen} onClose={closeAuthDialog} />;
}

export const useAuthDialog = () => useContext(AuthDialogContext);
