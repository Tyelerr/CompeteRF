import { useCallback, useState } from "react";
import { Alert } from "react-native";
import {
  hasUserReported,
  submitReport,
} from "@/src/models/services/report.service";
import {
  ReportContentType,
  ReportReason,
} from "@/src/models/types/report.types";

interface UseReportOptions {
  userId?: string;
}

export interface UseReportReturn {
  isModalVisible: boolean;
  contentType: ReportContentType | null;
  contentId: string | null;
  reason: ReportReason | null;
  details: string;
  isSubmitting: boolean;
  openReportModal: (contentType: ReportContentType, contentId: string) => Promise<void>;
  closeReportModal: () => void;
  setReason: (reason: ReportReason) => void;
  setDetails: (details: string) => void;
  handleSubmit: () => Promise<void>;
}

export function useReport({ userId }: UseReportOptions): UseReportReturn {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [contentType, setContentType] = useState<ReportContentType | null>(null);
  const [contentId, setContentId] = useState<string | null>(null);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetState = useCallback(() => {
    setIsModalVisible(false);
    setContentType(null);
    setContentId(null);
    setReason(null);
    setDetails("");
    setIsSubmitting(false);
  }, []);

  const openReportModal = useCallback(
    async (type: ReportContentType, id: string) => {
      if (!userId) {
        Alert.alert(
          "Sign In Required",
          "You must be signed in to report content."
        );
        return;
      }

      try {
        const alreadyReported = await hasUserReported(userId, type, id);
        if (alreadyReported) {
          Alert.alert(
            "Already Reported",
            "You have already reported this content. Our team will review it."
          );
          return;
        }
      } catch {
        // Non-fatal — allow the modal to open even if the check fails
      }

      setContentType(type);
      setContentId(id);
      setReason(null);
      setDetails("");
      setIsSubmitting(false);
      // Set visible LAST so all other state is ready before the modal opens
      setIsModalVisible(true);
    },
    [userId]
  );

  const closeReportModal = useCallback(() => {
    // Full reset — prevents the transparent overlay from persisting
    // and blocking touch input on the underlying screen
    resetState();
  }, [resetState]);

  const handleSubmit = useCallback(async () => {
    if (!userId || !contentType || !contentId || !reason) return;

    setIsSubmitting(true);
    try {
      await submitReport({
        reporter_id: userId,
        content_type: contentType,
        content_id: contentId,
        reason,
        details: details.trim() || undefined,
      });

      resetState();

      Alert.alert(
        "Report Submitted",
        "Thank you. Our team will review your report shortly."
      );
    } catch (err: any) {
      Alert.alert(
        "Submission Failed",
        err?.message ?? "Failed to submit report. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [userId, contentType, contentId, reason, details, resetState]);

  return {
    isModalVisible,
    contentType,
    contentId,
    reason,
    details,
    isSubmitting,
    openReportModal,
    closeReportModal,
    setReason,
    setDetails,
    handleSubmit,
  };
}
