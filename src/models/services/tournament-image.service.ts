// tournament-image.service.ts
// Scan + upload a custom tournament image. Production flow (fail-closed):
//   1. upload to an owner-scoped path (<authUid>/…) in tournament-images
//   2. scan it via a short-lived signed URL (shared moderation service)
//   3. publish (return publicUrl) ONLY when moderation status === "approved"
//   4. otherwise DELETE the temp upload and report inappropriate / unavailable
// It never links an unscanned image, and never leaves a rejected upload orphaned
// (the owner-scoped DELETE policy lets the uploader remove their own temp object).

import { supabase } from "../../lib/supabase";
import { imageUploadService } from "./image-upload.services";
import { moderateStoredImage, MODERATION_UNAVAILABLE_MESSAGE } from "./image-moderation.service";
import { normalizeImageForUpload } from "../../utils/image-normalize";

const BUCKET_NAME = "tournament-images";

export type TournamentImageUploadResult =
  | { ok: true; publicUrl: string }
  | { ok: false; reason: "inappropriate"; violations: string[] }
  | { ok: false; reason: "error"; message: string };

export const tournamentImageService = {
  async scanAndUpload(
    uri: string,
    userId?: string,
    mimeType?: string | null,
  ): Promise<TournamentImageUploadResult> {
    // 0) Normalize FIRST — HEIC/HEIF → JPEG so Vision can decode it (never send raw
    //    HEIC). No-op for JPEG/PNG/WEBP.
    const normalized = await normalizeImageForUpload(uri, mimeType);

    // Owner-scoped path: first folder = the uploader's auth uid, so Storage RLS can
    // restrict insert/update/delete to the owner. Falls back to "uploads" only if the
    // session is somehow missing (that upload will then fail the owner-scoped policy).
    const { data: auth } = await supabase.auth.getUser();
    const owner = auth?.user?.id ?? "uploads";
    const timestamp = new Date().getTime();
    const path = `${owner}/tournament-${timestamp}-custom.${normalized.ext}`;

    // 1) Upload first (Vision fetches by URL and cannot read a local file:// URI).
    //    Native-safe binary upload via the shared uploader (no browser FormData).
    const uploaded = await imageUploadService.uploadBinary(normalized.uri, BUCKET_NAME, path);
    if (!uploaded.success) {
      return { ok: false, reason: "error", message: uploaded.error ?? MODERATION_UNAVAILABLE_MESSAGE };
    }

    // 2) Moderate the uploaded object (signed URL + SafeSearch).
    const scan = await moderateStoredImage(BUCKET_NAME, path, userId);

    // 3) Publish only on approval.
    if (scan.status === "approved") {
      const { data: pub } = supabase.storage.from(BUCKET_NAME).getPublicUrl(path);
      return { ok: true, publicUrl: pub.publicUrl };
    }

    // 4) Not approved → remove the temp upload; never link it.
    await supabase.storage.from(BUCKET_NAME).remove([path]).catch(() => {});
    if (scan.status === "rejected") {
      return {
        ok: false,
        reason: "inappropriate",
        violations: [scan.reason ?? "Inappropriate content detected"],
      };
    }
    // status === "error" → FAIL CLOSED: do not publish; keep previous image.
    return { ok: false, reason: "error", message: MODERATION_UNAVAILABLE_MESSAGE };
  },
};
