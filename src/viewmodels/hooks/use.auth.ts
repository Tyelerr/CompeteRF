import { useEffect } from "react";
import { authService } from "../../models/services/auth.service";
import { profileService } from "../../models/services/profile.service";
import { ProfileInsert } from "../../models/types/profile.types";
import { useAuthContext } from "../../providers/AuthProvider";
import { useAuthStore } from "../stores/auth.store";

export const useAuth = () => {
  const { user, loading } = useAuthContext();
  const { profile, isAuthenticated, setProfile, setIsLoading, reset } =
    useAuthStore();

  useEffect(() => {
    const loadProfile = async () => {
      if (user) {
        try {
          const userProfile = await profileService.getProfile(user.id);
          setProfile(userProfile);
        } catch (error) {
          console.error("Error loading profile:", error);
        }
      } else {
        setProfile(null);
      }
      setIsLoading(false);
    };

    if (!loading) {
      loadProfile();
    }
  }, [user, loading]);

  const signUp = async (email: string, password: string) => {
    const data = await authService.signUp(email, password);
    return data;
  };

  const signIn = async (email: string, password: string) => {
    const data = await authService.signIn(email, password);
    return data;
  };

  const signOut = async () => {
    await authService.signOut();
    reset();
  };

  const createProfile = async (profileData: ProfileInsert) => {
    const newProfile = await profileService.createProfile(profileData);
    setProfile(newProfile);
    return newProfile;
  };

  const updateProfile = async (updates: Partial<ProfileInsert>) => {
    if (!user) throw new Error("No user logged in");
    const updatedProfile = await profileService.updateProfile(user.id, updates);
    setProfile(updatedProfile);
    return updatedProfile;
  };

  return {
    user,
    profile,
    isAuthenticated,
    isLoading: loading,
    signUp,
    signIn,
    signOut,
    createProfile,
    updateProfile,
  };
};
