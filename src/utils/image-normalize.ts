// src/utils/image-normalize.ts
// ONE shared image normalization step that runs BEFORE any moderated upload. Google
// Vision cannot decode HEIC/HEIF (the iPhone picker's default), so we transcode those
// (and anything not already JPEG/PNG/WEBP) to JPEG. Re-encoding also bakes in EXIF
// orientation and drops the original HEIC metadata. A guaranteed-supported source
// (JPEG/PNG/WEBP) is returned untouched — no unnecessary transcode.

import * as ImageManipulator from "expo-image-manipulator";

export interface NormalizedImage {
  uri: string;
  mimeType: string; // e.g. "image/jpeg"
  ext: string; // e.g. "jpg"
}

// Formats Vision decodes AND that we don't need to re-encode.
const VISION_SAFE = new Set(["jpg", "jpeg", "png", "webp"]);

const extFromUri = (uri: string): string =>
  uri.split("?")[0].split(".").pop()?.toLowerCase() ?? "";

const isHeicLike = (ext: string, mimeType?: string | null): boolean => {
  const m = (mimeType ?? "").toLowerCase();
  return ext === "heic" || ext === "heif" || m.includes("heic") || m.includes("heif");
};

const mimeFor = (ext: string): string => (ext === "jpg" ? "image/jpeg" : `image/${ext}`);

export const normalizeImageForUpload = async (
  uri: string,
  mimeType?: string | null,
): Promise<NormalizedImage> => {
  const srcExt = extFromUri(uri);
  const mimeExt = (mimeType ?? "").toLowerCase().split("/")[1] ?? "";
  const effExt = srcExt || (mimeExt === "jpeg" ? "jpg" : mimeExt);

  let out: NormalizedImage;
  if (VISION_SAFE.has(effExt) && !isHeicLike(effExt, mimeType)) {
    // Already a Vision-supported, non-HEIC format → leave it alone.
    const ext = effExt === "jpeg" ? "jpg" : effExt;
    out = { uri, mimeType: mimeFor(ext), ext };
  } else {
    // Transcode to JPEG (empty actions = re-encode only; applies orientation, strips
    // HEIC metadata). ~0.8 compression.
    const result = await ImageManipulator.manipulateAsync(uri, [], {
      compress: 0.8,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    out = { uri: result.uri, mimeType: "image/jpeg", ext: "jpg" };
  }

  // TEMP diagnostics: source vs normalized (size shows as actualBytes in the
  // scan-image Edge Function log once uploaded).
  console.log("🧪 normalizeImage:", {
    srcExt: srcExt || mimeExt || null,
    srcMime: mimeType ?? null,
    outExt: out.ext,
    outMime: out.mimeType,
    transcoded: out.uri !== uri,
  });
  return out;
};
