import { useQuery } from "@tanstack/react-query";
import { profileService } from "../../models/services/profile.service";

export const useProfile = (userId?: string) => {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["profile", userId],
    queryFn: () => profileService.getProfile(userId!),
    enabled: !!userId,
  });

  return {
    profile: data,
    isLoading,
    error,
    refetch,
  };
};

export const useProfileByUsername = (username?: string) => {
  const { data, isLoading, error } = useQuery({
    queryKey: ["profile", "username", username],
    queryFn: () => profileService.getProfileByUsername(username!),
    enabled: !!username,
  });

  return {
    profile: data,
    isLoading,
    error,
  };
};

export const useCheckUsername = (username: string) => {
  const { data, isLoading } = useQuery({
    queryKey: ["username", "check", username],
    queryFn: () => profileService.checkUsernameAvailable(username),
    enabled: username.length >= 3,
  });

  return {
    isAvailable: data,
    isChecking: isLoading,
  };
};
