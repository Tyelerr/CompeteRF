// src/utils/version-gate.ts
// Pure rules for the native minimum-version gate (app_config 'min_supported').
// Compares the NATIVE BUILD NUMBER (iOS CFBundleVersion / Android versionCode) as an integer
// against the per-platform minimum — never marketing version strings (the App Store shows
// "1.25" while EAS builds are 1.0.x). FAIL-OPEN everywhere: web, unknown platform, missing /
// malformed config, unreadable build number, or no minimum set → the app is allowed.

export interface MinSupportedConfig {
  ios_min_build?: unknown;
  android_min_build?: unknown;
  message?: unknown;
  ios_store_url?: unknown;
  android_store_url?: unknown;
}

export type VersionGateResult =
  | { status: "ok" }
  | { status: "update_required"; message: string; storeUrl: string | null; currentBuild: number; minBuild: number };

export const DEFAULT_UPDATE_MESSAGE =
  "This version of Compete is no longer supported. Please update to keep using the app.";

const toInt = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && /^\s*\d+\s*$/.test(v)) return parseInt(v, 10);
  return null;
};

export const evaluateVersionGate = (input: {
  platform: string;
  buildNumber: string | number | null | undefined;
  config: MinSupportedConfig | null | undefined;
}): VersionGateResult => {
  const { platform, buildNumber, config } = input;
  if (platform !== "ios" && platform !== "android") return { status: "ok" }; // web & others
  if (!config || typeof config !== "object") return { status: "ok" };
  const minBuild = toInt(platform === "ios" ? config.ios_min_build : config.android_min_build);
  if (minBuild == null || minBuild <= 0) return { status: "ok" };
  const currentBuild = toInt(buildNumber);
  if (currentBuild == null) return { status: "ok" }; // can't read our own build → never block
  if (currentBuild >= minBuild) return { status: "ok" };
  const url = platform === "ios" ? config.ios_store_url : config.android_store_url;
  const message = typeof config.message === "string" && config.message.trim() ? config.message : DEFAULT_UPDATE_MESSAGE;
  return {
    status: "update_required",
    message,
    storeUrl: typeof url === "string" && /^https:\/\//.test(url) ? url : null,
    currentBuild,
    minBuild,
  };
};
