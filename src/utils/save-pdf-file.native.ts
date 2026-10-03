// src/utils/save-pdf-file.native.ts
// Save a generated PDF on iOS / Android using only modules already in the app binary
// (expo-file-system's legacy API + React Native's Share) — no new native dependency or build.
//   iOS:     write to the app cache, then the system share sheet (Save to Files, Print, AirDrop,
//            Mail, …).
//   Android: the system folder picker (e.g. Downloads), then the file is written there; it can be
//            opened, printed or shared from Files.

import { Platform, Share } from "react-native";
import * as LegacyFS from "expo-file-system/legacy";
import { bytesToBase64 } from "./pdf-writer";

export type SavePdfResult = { ok: true; message?: string } | { ok: false; canceled?: boolean; message: string };

export const savePdfFile = async (bytes: Uint8Array, fileName: string): Promise<SavePdfResult> => {
  const base64 = bytesToBase64(bytes);
  if (Platform.OS === "android") {
    const saf = LegacyFS.StorageAccessFramework;
    const perm = await saf.requestDirectoryPermissionsAsync();
    if (!perm.granted) return { ok: false, canceled: true, message: "No folder was chosen, so nothing was saved." };
    const uri = await saf.createFileAsync(perm.directoryUri, fileName.replace(/\.pdf$/i, ""), "application/pdf");
    await LegacyFS.writeAsStringAsync(uri, base64, { encoding: LegacyFS.EncodingType.Base64 });
    return { ok: true, message: `Saved ${fileName}. Open it from your Files app to print or share.` };
  }
  const dir = LegacyFS.cacheDirectory;
  if (!dir) return { ok: false, message: "This device has no place to save the file." };
  const uri = `${dir}${fileName}`;
  await LegacyFS.writeAsStringAsync(uri, base64, { encoding: LegacyFS.EncodingType.Base64 });
  const shared = await Share.share({ url: uri, title: fileName });
  // Closing the share sheet without choosing anything saved nothing — don't let the caller record
  // "Last backup: just now" for it (callers skip the error alert for `canceled`).
  if (shared.action === Share.dismissedAction)
    return { ok: false, canceled: true, message: "The share sheet was closed, so nothing was saved." };
  return { ok: true };
};
