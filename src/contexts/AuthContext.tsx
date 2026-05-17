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
  email: string;
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
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUp: (input: {
    email: string;
    password: string;
    displayName?: string;
  }) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (updates: UserProfileUpdates) => Promise<void>;
  isFirebaseConfigured: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isIntern: false,
  signInWithGoogle: async () => {},
  signInWithEmail: async () => {},
  signUp: async () => {},
  forgotPassword: async () => {},
  signOut: async () => {},
  updateProfile: async () => {},
  isFirebaseConfigured: true,
});

function profileToUser(profile: UserProfile | null): AppUser | null {
  if (!profile) return null;
  return {
    uid: profile.uid,
    email: profile.email,
    displayName: profile.displayName,
    photoURL: profile.photoURL,
  };
}

async function fetchMe(): Promise<{ profile: UserProfile | null; isIntern: boolean }> {
  const res = await fetch("/api/auth/me", { credentials: "include" });
  if (!res.ok) return { profile: null, isIntern: false };
  const data = (await res.json()) as { user: UserProfile | null; isIntern?: boolean };
  return { profile: data.user ?? null, isIntern: !!data.isIntern };
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
  const [user, setUser] = useState<AppUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isIntern, setIsIntern] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { profile: p, isIntern: intern } = await fetchMe();
      setProfile(p);
      setUser(profileToUser(p));
      setIsIntern(intern);
    } catch (err) {
      console.error("Auth refresh failed:", err);
      setProfile(null);
      setUser(null);
      setIsIntern(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      await postJson("/api/auth/signin", { email, password });
      await refresh();
    },
    [refresh]
  );

  const signUp = useCallback(
    async (input: { email: string; password: string; displayName?: string }) => {
      await postJson("/api/auth/signup", input);
      await refresh();
    },
    [refresh]
  );

  const forgotPassword = useCallback(async (email: string) => {
    await postJson("/api/auth/forgot-password", { email });
  }, []);

  const signInWithGoogle = useCallback(async () => {
    // Server-routed OAuth: full-page redirect through chessmasti.com so
    // we never hit the *.firebaseapp.com handler that school WiFi blocks.
    window.location.href = "/api/auth/google/start";
  }, []);

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/auth/signout", { method: "POST", credentials: "include" });
    } catch (err) {
      console.error("Sign-out request failed:", err);
    }
    setProfile(null);
    setUser(null);
    setIsIntern(false);
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
        signInWithGoogle,
        signInWithEmail,
        signUp,
        forgotPassword,
        signOut,
        updateProfile,
        isFirebaseConfigured: true,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
