// src/viewmodels/hooks/useOnboarding.ts
// ─────────────────────────────────────────────────────────────────────────────
// Manages the hasSeenOnboarding local device flag and slide navigation state.
// AsyncStorage only — no Supabase involved.
// ─────────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useState } from 'react';

export const ONBOARDING_STORAGE_KEY = 'hasSeenOnboarding';

export const useOnboarding = () => {
  const [currentSlide, setCurrentSlide] = useState(0);

  const nextSlide = useCallback((total: number) => {
    setCurrentSlide((prev) => Math.min(prev + 1, total - 1));
  }, []);

  const resetSlide = useCallback(() => {
    setCurrentSlide(0);
  }, []);

  const checkHasSeenOnboarding = useCallback(async (): Promise<boolean> => {
    try {
      const value = await AsyncStorage.getItem(ONBOARDING_STORAGE_KEY);
      return value === 'true';
    } catch {
      return false;
    }
  }, []);

  const markOnboardingComplete = useCallback(async (): Promise<void> => {
    try {
      await AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
    } catch {
      // Non-critical — local device flag only
    }
  }, []);

  const resetOnboarding = useCallback(async (): Promise<void> => {
    try {
      await AsyncStorage.removeItem(ONBOARDING_STORAGE_KEY);
    } catch {
      // Non-critical
    }
  }, []);

  return {
    currentSlide,
    setCurrentSlide,
    nextSlide,
    resetSlide,
    checkHasSeenOnboarding,
    markOnboardingComplete,
    resetOnboarding,
  };
};
