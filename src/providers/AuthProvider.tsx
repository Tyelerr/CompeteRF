import { Session, User } from "@supabase/supabase-js";
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { supabase } from "../lib/supabase";
import { profileService } from "../models/services/profile.service";
import { Profile, ProfileInsert } from "../models/types/profile.types";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  isAuthenticated: boolean;
  canSubmitTournaments: boolean;
  isAdmin: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
  createProfile: (profileData: ProfileInsert) => Promise<void>;
}

const SUBMIT_ALLOWED_ROLES = [
  "tournament_director",
  "bar_owner",
  "compete_admin",
  "super_admin",
];

const ADMIN_ROLES = ["compete_admin", "super_admin"];

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  isAuthenticated: false,
  canSubmitTournaments: false,
  isAdmin: false,
  refreshProfile: async () => {},
  signOut: async () => {},
  createProfile: async () => {},
});

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      if (error) throw error;
      setProfile(data);
    } catch (error) {
      console.error("Fetch profile error:", error);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  const refreshProfile = async () => {
    if (user?.id) {
      await fetchProfile(user.id);
    }
  };

  const createProfile = async (profileData: ProfileInsert) => {
    try {
      const newProfile = await profileService.createProfile(profileData);
      setProfile(newProfile);
      // Force refresh the auth state to trigger navigation
      await refreshProfile();
    } catch (error) {
      console.error("Create profile error:", error);
      throw error;
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
  };

  const value: AuthContextType = {
    session,
    user,
    profile,
    loading,
    isAuthenticated: !!user,
    canSubmitTournaments: profile
      ? SUBMIT_ALLOWED_ROLES.includes(profile.role)
      : false,
    isAdmin: profile ? ADMIN_ROLES.includes(profile.role) : false,
    refreshProfile,
    signOut,
    createProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuthContext = () => useContext(AuthContext);

// Keep backward compatibility
export const useAuth = useAuthContext;
