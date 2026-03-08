import { supabase } from '@/src/lib/supabase';
import { authService } from '@/src/models/services/auth.service';
import * as ExpoLinking from 'expo-linking';
import { useEffect, useState } from 'react';

export function useResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const url = ExpoLinking.useURL();

  useEffect(() => {
    if (!url) return;

    const handleDeepLink = async (deepUrl: string) => {
      const hashPart = deepUrl.split('#')[1];
      if (!hashPart) return;

      const params: Record<string, string> = {};
      hashPart.split('&').forEach((part) => {
        const [key, value] = part.split('=');
        params[key] = decodeURIComponent(value ?? '');
      });

      if (params.access_token && params.refresh_token) {
        const { error } = await supabase.auth.setSession({
          access_token: params.access_token,
          refresh_token: params.refresh_token,
        });
        if (!error) setSessionReady(true);
      }
    };

    handleDeepLink(url);
  }, [url]);

  const handleUpdatePassword = async () => {
    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
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
    url,
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