import { supabase } from "@/src/lib/supabase";
import { authService } from "@/src/models/services/auth.service";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";

export function useResetPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const params = useLocalSearchParams();

  useEffect(() => {
    const hashString = params["#"] as string;
    if (!hashString) return;

    const parsed: Record<string, string> = {};
    hashString.split("&").forEach((part) => {
      const [key, value] = part.split("=");
      parsed[key] = decodeURIComponent(value ?? "");
    });

    const accessToken = parsed.access_token;
    const refreshToken = parsed.refresh_token;

    if (accessToken && refreshToken) {
      supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      }).then(({ error }) => {
        if (!error) setSessionReady(true);
      });
    }
  }, [params]);

  const handleUpdatePassword = async () => {
    if (!password || password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    setError(null);

    const { error } = await authService.updatePassword(password);

    setLoading(false);

    if (error) {
      setError(error);
    } else {
      setSuccess(true);
    }
  };

  return {
    params,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    loading,
    sessionReady,
    success,
    error,
    handleUpdatePassword,
  };
}
