import { useEffect, useState } from 'react';
import { profileService } from '../src/models/services/profile.service';

export const useCheckUsername = (username: string) => {
  const [isAvailable, setIsAvailable] = useState<boolean>(true);
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Don't check if username is too short or empty
    if (!username || username.length < 3) {
      setIsAvailable(true);
      setIsChecking(false);
      setError(null);
      return;
    }

    const checkAvailability = async () => {
      setIsChecking(true);
      setError(null);

      try {
        const available = await profileService.checkUsernameAvailable(username.toLowerCase());
        setIsAvailable(available);
      } catch (err: any) {
        console.error('Username check error:', err);
        setError(err.message || 'Failed to check username availability');
        setIsAvailable(false);
      } finally {
        setIsChecking(false);
      }
    };

    // Debounce the API call to avoid too many requests
    const timeoutId = setTimeout(checkAvailability, 500);

    return () => clearTimeout(timeoutId);
  }, [username]);

  return {
    isAvailable,
    isChecking,
    error,
  };
};
