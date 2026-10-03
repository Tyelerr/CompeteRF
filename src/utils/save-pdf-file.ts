// src/utils/save-pdf-file.ts
// Save a generated PDF — WEB: a normal browser download (Blob + object URL, revoked right after;
// nothing is uploaded or given a public URL). Native lives in save-pdf-file.native.ts.

export type SavePdfResult = { ok: true; message?: string } | { ok: false; canceled?: boolean; message: string };

export const savePdfFile = async (bytes: Uint8Array, fileName: string): Promise<SavePdfResult> => {
  if (typeof document === "undefined" || typeof URL === "undefined") {
    return { ok: false, message: "Downloads aren't available here." };
  }
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
  return { ok: true };
};
