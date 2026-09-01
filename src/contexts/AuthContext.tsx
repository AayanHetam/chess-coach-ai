import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  PropsWithChildren,
} from "react";
import {
  getUserProfile,
  updateUserProfile,
  UserProfile,
  UserProfileUpdates,
} from "@/lib/firestoreUsers";
import OAuthErrorSnackbar from "@/components/auth/OAuthErrorSnackbar";

/**
 * Auth runs entirely against chessmasti.com /api/auth/*. The browser
 * never talks to Firebase domains, which lets the app work on networks
 * that block them (school WiFi, etc.). Server-side Admin SDK handles
 * the actual Firestore reads / writes.
 *
 * Public shape mirrors the previous Firebase-backed context so existing
 * callsites (UserMenu, ProfileDialog, useGameDatabase, …) keep working.
 */

export type AppUser = {
  uid: string;
  /** Optional: an account can exist with only a handle and a password. */
  email?: string;
  /** The name the user chose. Resolved through `addressAs`, never read raw. */
  handle?: string;
  displayName?: string;
  photoURL?: string;
};

interface AuthContextType {
  user: AppUser | null;
  profile: UserProfile | null;
  loading: boolean;
  // CMIP intern allowlist membership, stamped into the cm_session JWT at
  // sign-in. Drives the site-wide "employee experience" reskin.
  isIntern: boolean;
  // CMIP dashboard admin (matches CMIP_DASHBOARD_ADMIN_EMAIL). Gates
  // /admin/intern-data UI on the browser; server re-checks every request.
  isAdmin: boolean;
  signInWithGoogle: (opts?: {
    ageAffirmed?: boolean;
    termsAccepted?: boolean;
    emailOptIn?: boolean;
  }) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUp: (input: {
    /** Optional — signup asks for a handle and a password. */
    email?: string;
    password: string;
    /** Required at signup — see signupSchema for why it is fail-closed. */
    handle: string;
    displayName?: string;
    // COPPA: true only after the 13+ age-affirmation checkbox (required by
    // the signup API; no age or birth date ever leaves the browser).
    ageAffirmed: boolean;
    termsAccepted: boolean;
    /** Optional marketing-email consent — never required to sign up. */
    emailOptIn?: boolean;
  }) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (updates: UserProfileUpdates) => Promise<void>;
  /** Re-fetch /api/auth/me. */
  refresh: () => Promise<void>;
  isFirebaseConfigured: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isIntern: false,
  isAdmin: false,
  signInWithGoogle: async () => {},
  signInWithEmail: async () => {},
  signUp: async () => {},
  forgotPassword: async () => {},
  signOut: async () => {},
  updateProfile: async () => {},
  refresh: async () => {},
  isFirebaseConfigured: true,
});

// Purely a rendering hint for the nav avatar on the NEXT page load — never
// read for anything security-sensitive. `refresh()` below always re-fetches
// /api/auth/me and reconciles (or clears) this cache; nothing trusts it past
// first paint. Without it, every hard reload showed a blank account slot for
// the full round-trip of /api/auth/me (network + cold Next.js boot) because
// NavPill deliberately hides the slot during `loading` rather than flash
// Sign-in → Avatar. Caching last-known identity lets a returning, still-
// signed-in user's avatar paint immediately instead of popping in a second
// later — the same stale-while-revalidate trick behind "why does my avatar
// already look right in Gmail before the page finishes loading".
const AUTH_CACHE_KEY = "cm-auth-cache-v1";

function readCachedUser(): AppUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(AUTH_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.uid === "string" ? (parsed as AppUser) : null;
  } catch {
    return null;
  }
}

function writeCachedUser(user: AppUser | null): void {
  if (typeof window === "undefined") return;
  try {
    if (user) {
      window.localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(user));
    } else {
      window.localStorage.removeItem(AUTH_CACHE_KEY);
    }
  } catch {
    // Storage full/blocked — next load just falls back to the loading gate.
  }
}

function profileToUser(profile: UserProfile | null): AppUser | null {
  if (!profile) return null;
  return {
    uid: profile.uid,
    email: profile.email,
    handle: profile.handle,
    displayName: profile.displayName,
    photoURL: profile.photoURL,
  };
}

async function fetchMe(): Promise<{
  profile: UserProfile | null;
  isIntern: boolean;
  isAdmin: boolean;
}> {
  const res = await fetch("/api/auth/me", { credentials: "include" });
  if (!res.ok) {
    return {
      profile: null,
      isIntern: false,
      isAdmin: false,
    };
  }
  const data = (await res.json()) as {
    user: UserProfile | null;
    isIntern?: boolean;
    isAdmin?: boolean;
  };
  return {
    profile: data.user ?? null,
    isIntern: !!data.isIntern,
    isAdmin: !!data.isAdmin,
  };
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // ignore parse error
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export function AuthProvider({ children }: PropsWithChildren) {
  // Both start at the exact SSR-safe values (null / true) — Next.js
  // prerenders this tree with `window` undefined, so the first CLIENT render
  // must produce identical output or React throws a hydration mismatch
  // (#418/#423). readCachedUser() used to run inside these initializers,
  // which read a real cached value on that first client render whenever one
  // existed — mismatching the server's markup. Caught by the opening-trainer
  // E2E suite ("a session survives leaving the page") after #461 merged.
  const [user, setUser] = useState<AppUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isIntern, setIsIntern] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  // Cache read moves to an effect — effects never run during the
  // hydration-matching render, only after it commits, so this can safely
  // look at localStorage without risking a mismatch. Still beats the
  // /api/auth/me round trip by a wide margin from the user's perspective.
  useEffect(() => {
    const cached = readCachedUser();
    if (cached) {
      setUser(cached);
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const { profile: p, isIntern: intern, isAdmin: admin } = await fetchMe();
      const nextUser = profileToUser(p);
      setProfile(p);
      setUser(nextUser);
      setIsIntern(intern);
      setIsAdmin(admin);
      writeCachedUser(nextUser);
    } catch (err) {
      console.error("Auth refresh failed:", err);
      setProfile(null);
      setUser(null);
      setIsIntern(false);
      setIsAdmin(false);
      writeCachedUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      // `identifier`, because this may be a handle rather than an email.
      // The route still accepts `email` for older cached bundles.
      await postJson("/api/auth/signin", { identifier: email, password });
      await refresh();
    },
    [refresh]
  );

  const signUp = useCallback(
    async (input: {
      email?: string;
      password: string;
      handle: string;
      displayName?: string;
      ageAffirmed: boolean;
      termsAccepted: boolean;
      emailOptIn?: boolean;
    }) => {
      await postJson("/api/auth/signup", input);
      await refresh();
    },
    [refresh]
  );

  const forgotPassword = useCallback(async (email: string) => {
    await postJson("/api/auth/forgot-password", { email });
  }, []);

  const signInWithGoogle = useCallback(
    async (opts?: {
      ageAffirmed?: boolean;
      termsAccepted?: boolean;
      emailOptIn?: boolean;
    }) => {
      // Server-routed OAuth: full-page redirect through chessmasti.com so
      // we never hit the *.firebaseapp.com handler that school WiFi blocks.
      //
      // Pass returnTo so the OAuth callback lands the user back on the page
      // they were on (with all query params intact) — important for shared
      // permalinks like /analysis?insightId=X where signing in without
      // returnTo would dump them on / and lose the deep link entirely.
      // Caller is always client-side (button click handler), but we use
      // globalThis to keep TypeScript happy under SSR-aware narrowing.
      const w =
        typeof globalThis !== "undefined" && "location" in globalThis
          ? (globalThis as { location: Location }).location
          : null;
      if (!w) {
        // Should not happen in practice; defensive only.
        return;
      }
      const here = w.pathname + w.search + w.hash;
      // Only pass same-origin paths. Server-side `sanitizeReturnTo` rejects
      // anything else, but we keep client-side hygiene tight too.
      const returnTo = here.startsWith("/") ? here : "/";
      // ageAffirmed=1 marks that the signup dialog's 13+ checkbox was already
      // confirmed, so the OAuth callback can skip the /auth/age interstitial.
      const ageParam = opts?.ageAffirmed ? "&ageAffirmed=1" : "";
      const termsParam = opts?.termsAccepted ? "&termsAccepted=1" : "";
      const optInParam = opts?.emailOptIn ? "&emailOptIn=1" : "";
      w.href = `/api/auth/google/start?returnTo=${encodeURIComponent(returnTo)}${ageParam}${termsParam}${optInParam}`;
    },
    []
  );

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/auth/signout", {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      console.error("Sign-out request failed:", err);
    }
    setProfile(null);
    setUser(null);
    setIsIntern(false);
    setIsAdmin(false);
    writeCachedUser(null);
  }, []);

  const updateProfile = useCallback(
    async (updates: UserProfileUpdates) => {
      if (!user) throw new Error("User not authenticated");
      await updateUserProfile(user.uid, updates);
      const fresh = await getUserProfile(user.uid);
      setProfile(fresh);
      setUser(profileToUser(fresh));
    },
    [user]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        isIntern,
        isAdmin,
        signInWithGoogle,
        signInWithEmail,
        signUp,
        forgotPassword,
        signOut,
        updateProfile,
        refresh,
        isFirebaseConfigured: true,
      }}
    >
      {children}
      <OAuthErrorSnackbar />
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
