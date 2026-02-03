import React from "react";
import { useAuth } from "../../../providers/AuthProvider";
import { BreakLoadingScreen } from "./BreakLoadingScreen";

interface ProfileLoadingWrapperProps {
  children: React.ReactNode;
  loadingMessage?: string;
  requireProfile?: boolean;
}

export const ProfileLoadingWrapper: React.FC<ProfileLoadingWrapperProps> = ({
  children,
  loadingMessage = "Setting up your profile...",
  requireProfile = true,
}) => {
  const { user, profile, loading } = useAuth();

  // Show loading screen if:
  // 1. Auth is still loading
  // 2. User exists but no profile yet (and profile is required)
  if (loading || (requireProfile && user && !profile)) {
    return <BreakLoadingScreen message={loadingMessage} />;
  }

  return <>{children}</>;
};
