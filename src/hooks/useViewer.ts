import { useAuth, type AppUser } from "@/contexts/AuthContext";
import type { UserProfile } from "@/lib/firestoreUsers";

/**
 * Narrow hook surface for intern-mode UI. Wraps useAuth() with just the fields
 * the employee chrome cares about, so intern components don't accidentally
 * depend on the full auth API surface (signInWithGoogle, etc.).
 *
 * `isIntern` is the CMIP allowlist flag stamped into the cm_session JWT at
 * sign-in time; flipping the allowlist requires re-signin.
 *
 * `profile` exposes the Firestore user doc (selfReportedRating, coachTone,
 * playingStyle, studyGoals, favoriteOpenings) so analysis surfaces can thread
 * the user's actual rating + prefs into LLM calls instead of hardcoding 1500.
 */
export type Viewer = {
  user: AppUser | null;
  profile: UserProfile | null;
  isIntern: boolean;
  isAdmin: boolean;
  loading: boolean;
};

export function useViewer(): Viewer {
  const { user, profile, isIntern, isAdmin, loading } = useAuth();
  return { user, profile, isIntern, isAdmin, loading };
}
