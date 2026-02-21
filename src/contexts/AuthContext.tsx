import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  PropsWithChildren,
} from "react";
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";
import { createUserProfile, getUserProfile, updateUserProfile, UserProfile } from "@/lib/firestoreUsers";

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (updates: { chesscomUsername?: string; lichessUsername?: string }) => Promise<void>;
  isFirebaseConfigured: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  signInWithGoogle: async () => {},
  signOut: async () => {},
  updateProfile: async () => {},
  isFirebaseConfigured: false,
});

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const isFirebaseConfigured = !!auth;

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      
      if (user) {
        try {
          let userProfile = await getUserProfile(user.uid);
          if (!userProfile) {
            // Create profile for new user
            await createUserProfile({
              uid: user.uid,
              email: user.email!,
              displayName: user.displayName || undefined,
              photoURL: user.photoURL || undefined,
            });
            userProfile = await getUserProfile(user.uid);
          }
          setProfile(userProfile || null);
        } catch (error) {
          console.error("Profile sync error:", error);
        }
      } else {
        setProfile(null);
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!auth || !googleProvider) {
      console.warn("Firebase Auth is not configured");
      return;
    }
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: unknown) {
      const firebaseError = error as { code?: string; message?: string };
      if (firebaseError.code === "auth/popup-closed-by-user") {
        return; // User closed popup, not an error
      }
      console.error("Sign-in error:", error);
      throw error;
    }
  }, []);

  const signOut = useCallback(async () => {
    if (!auth) return;
    try {
      await firebaseSignOut(auth);
    } catch (error) {
      console.error("Sign-out error:", error);
      throw error;
    }
  }, []);

  const updateProfile = useCallback(async (updates: { chesscomUsername?: string; lichessUsername?: string }) => {
    if (!user) throw new Error("User not authenticated");
    try {
      await updateUserProfile(user.uid, updates);
      const updatedProfile = await getUserProfile(user.uid);
      setProfile(updatedProfile);
    } catch (error) {
      console.error("Profile update error:", error);
      throw error;
    }
  }, [user]);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        signInWithGoogle,
        signOut,
        updateProfile,
        isFirebaseConfigured,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
