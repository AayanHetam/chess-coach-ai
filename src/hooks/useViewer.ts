import { useAuth, type AppUser } from "@/contexts/AuthContext";

/**
 * Narrow hook surface for intern-mode UI. Wraps useAuth() with just the fields
 * the employee chrome cares about, so intern components don't accidentally
 * depend on the full auth API surface (signInWithGoogle, etc.).
 *
 * `isIntern` is the CMIP allowlist flag stamped into the cm_session JWT at
 * sign-in time; flipping the allowlist requires re-signin.
 */
export type Viewer = {
  user: AppUser | null;
  isIntern: boolean;
  loading: boolean;
};

export function useViewer(): Viewer {
  const { user, isIntern, loading } = useAuth();
  return { user, isIntern, loading };
}
