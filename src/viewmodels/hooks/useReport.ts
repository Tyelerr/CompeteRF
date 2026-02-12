// src/viewmodels/hooks/useReport.ts
// Follows same hook patterns as useGiveawayEntry.ts, useAdminGiveaways.ts

import {
  hasUserReported,
  submitReport,
} from '@/src/models/services/report.service';
import {
  CreateReportPayload,
  ReportContentType,
  ReportReason,
} from '@/src/models/types/report.types';
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';

interface UseReportOptions {
  /** The authenticated user's ID (from session?.user?.id) */
  userId: string | undefined;
}

interface UseReportReturn {
  /** Whether the report modal is visible */
  isModalVisible: boolean;
  /** Open the modal targeting a specific piece of content */
  openReportModal: (contentType: ReportContentType, contentId: string) => void;
  /** Close the modal and reset form */
  closeReportModal: () => void;
  /** Currently selected reason */
  reason: ReportReason | null;
  /** Set the selected reason */
  setReason: (reason: ReportReason) => void;
  /** Optional details text */
  details: string;
  /** Set the details text */
  setDetails: (text: string) => void;
  /** Submit the report */
  handleSubmit: () => Promise<void>;
  /** Whether a submission is in progress */
  isSubmitting: boolean;
  /** The content type being reported (for modal title) */
  contentType: ReportContentType | null;
}

export function useReport({ userId }: UseReportOptions): UseReportReturn {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [contentType, setContentType] = useState<ReportContentType | null>(null);
  const [contentId, setContentId] = useState<string | null>(null);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = useCallback(() => {
    setReason(null);
    setDetails('');
  }, []);

  const openReportModal = useCallback(
    (type: ReportContentType, id: string) => {
      if (!userId) {
        Alert.alert(
          'Sign In Required',
          'You must be signed in to report content.'
        );
        return;
      }
      setContentType(type);
      setContentId(id);
      resetForm();
      setIsModalVisible(true);
    },
    [userId, resetForm]
  );

  const closeReportModal = useCallback(() => {
    setIsModalVisible(false);
    // Delay reset so the modal animates out before fields clear
    setTimeout(resetForm, 300);
  }, [resetForm]);

  const handleSubmit = useCallback(async () => {
    if (!userId || !contentType || !contentId || !reason) {
      Alert.alert('Missing Info', 'Please select a reason for your report.');
      return;
    }

    setIsSubmitting(true);

    try {
      // Check for duplicate report (RLS lets users SELECT their own)
      const alreadyReported = await hasUserReported(userId, contentType, contentId);
      if (alreadyReported) {
        Alert.alert(
          'Already Reported',
          'You have already submitted a report for this content. Our team will review it shortly.'
        );
        closeReportModal();
        return;
      }

      const payload: CreateReportPayload = {
        reporter_id: userId,
        content_type: contentType,
        content_id: contentId,
        reason,
        details: details.trim() || undefined,
      };

      await submitReport(payload);

      Alert.alert(
        'Report Submitted',
        'Thank you for helping keep our community safe. We will review your report shortly.'
      );
      closeReportModal();
    } catch (error) {
      console.error('[useReport] submission error:', error);
      Alert.alert('Error', 'Something went wrong submitting your report. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [userId, contentType, contentId, reason, details, closeReportModal]);

  return {
    isModalVisible,
    openReportModal,
    closeReportModal,
    reason,
    setReason,
    details,
    setDetails,
    handleSubmit,
    isSubmitting,
    contentType,
  };
}
