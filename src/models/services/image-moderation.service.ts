// src/models/services/image-moderation.service.ts
// ONE shared moderation step used by every user-facing image upload (tournament
// images, profile avatars). Given an ALREADY-UPLOADED object, it mints a short-lived
// signed URL (works for private buckets; Vision can't read a device-local file://
// URI) and scans it with the `scan-image` Edge Function. FAIL CLOSED: any non-approved
// outcome tells the caller NOT to publish, and the caller removes the temp object.

import { supabase } from "../../lib/supabase";
import { ImageContentScanner, ImageScanResult } from "../../../image-scanner";

export const SIGNED_URL_TTL_SECONDS = 120;

// Scan an object already in Storage. Returns the structured scan result; on any
// signing/scan failure returns status:"error" (never a fake "approved").
export const moderateStoredImage = async (
  bucket: string,
  path: string,
  userId?: string,
): Promise<ImageScanResult> => {
  const { data: signed, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !signed?.signedUrl) {
    return {
      status: "error",
      isAppropriate: false,
      reason: error?.message ?? "Could not sign image URL for scanning",
    };
  }
  return ImageContentScanner.scanImage(signed.signedUrl, userId);
};

// User-facing copy for a scanner/config failure (fail-closed path).
export const MODERATION_UNAVAILABLE_MESSAGE =
  "Image review is temporarily unavailable. Please try again.";
