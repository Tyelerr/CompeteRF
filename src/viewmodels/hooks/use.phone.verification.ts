// src/viewmodels/hooks/use.phone.verification.ts
// Owns the SMS section's phone identity + verification + consent state, keeping
// verification and consent as SEPARATE actions. The canonical number lives on
// profiles.phone_number; sms_enabled lives on notification_preferences and is
// only ever changed through enable/disable RPCs (verification never opts in).

import { useCallback, useEffect, useState } from "react";
import { useAuthContext } from "../../providers/AuthProvider";
import { notificationService } from "../../models/services/notification.service";
import {
  checkPhoneVerification,
  disableSmsAlerts,
  enableSmsAlerts,
  getPhoneState,
  sendTestMessage,
  startPhoneVerification,
  type SmsActionResult,
} from "../../services/sms/smsVerificationService";
import { isValidOtpFormat, looksLikePhone, maskPhone } from "../../utils/phone";

export function usePhoneVerification() {
  const { user } = useAuthContext();
  const userId = user?.id;

  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [phoneVerifiedAt, setPhoneVerifiedAt] = useState<string | null>(null);
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [codeSent, setCodeSent] = useState(false);

  const isVerified = !!phoneVerifiedAt;

  const refresh = useCallback(async () => {
    if (!userId) return;
    const state = await getPhoneState(userId);
    setPhoneNumber(state?.phone_number ?? null);
    setPhoneVerifiedAt(state?.phone_verified_at ?? null);
    try {
      const prefs = await notificationService.getPreferences(userId);
      setSmsEnabled(!!prefs.sms_enabled);
    } catch {
      // leave prior value
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const sendCode = useCallback(async (phone: string): Promise<SmsActionResult> => {
    if (!looksLikePhone(phone)) return { success: false, error: "Enter a valid mobile number." };
    setBusy(true);
    try {
      const res = await startPhoneVerification(phone.trim());
      if (res.success) {
        setCodeSent(true);
        await refresh(); // changing the number may have cleared verification
      }
      return res;
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const verifyCode = useCallback(async (code: string): Promise<SmsActionResult> => {
    if (!isValidOtpFormat(code)) return { success: false, error: "Enter the code we sent." };
    setBusy(true);
    try {
      const res = await checkPhoneVerification(code.trim());
      if (res.success) {
        setCodeSent(false);
        await refresh();
      }
      return res;
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const enableAlerts = useCallback(async (): Promise<SmsActionResult> => {
    setBusy(true);
    try {
      const res = await enableSmsAlerts();
      if (res.success) await refresh();
      return res;
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const disableAlerts = useCallback(async (): Promise<SmsActionResult> => {
    setBusy(true);
    try {
      const res = await disableSmsAlerts();
      if (res.success) await refresh();
      return res;
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  // Test text — server derives the destination from the caller's verified profile.
  const sendTest = useCallback(async (): Promise<SmsActionResult> => {
    if (!isVerified) return { success: false, error: "Verify your number first." };
    setBusy(true);
    try {
      return await sendTestMessage();
    } finally {
      setBusy(false);
    }
  }, [isVerified]);

  return {
    userId,
    phoneNumber,
    maskedPhone: maskPhone(phoneNumber),
    phoneVerifiedAt,
    isVerified,
    smsEnabled,
    loading,
    busy,
    codeSent,
    refresh,
    sendCode,
    verifyCode,
    enableAlerts,
    disableAlerts,
    sendTest,
    resetCodeSent: () => setCodeSent(false),
  };
}
