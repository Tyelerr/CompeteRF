// src/viewmodels/hooks/use.version.gate.ts
// Native minimum-version gate. Checks app_config 'min_supported' at launch and whenever the
// app returns to the foreground (throttled), comparing this binary's native build number
// (expo-application nativeBuildVersion) with the per-platform minimum. Web is skipped
// entirely. Fail-open: any error / timeout / missing config leaves the app usable; only an
// explicit "your build is below the minimum" answer shows the blocking Update screen.

import * as Application from "expo-application";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import { appConfigService } from "../../models/services/app-config.service";
import { evaluateVersionGate, VersionGateResult } from "../../utils/version-gate";

const RECHECK_THROTTLE_MS = 30_000;

export const useVersionGate = () => {
  const enabled = Platform.OS === "ios" || Platform.OS === "android";
  const [result, setResult] = useState<VersionGateResult>({ status: "ok" });
  const [checking, setChecking] = useState(false);
  const lastCheckRef = useRef(0);
  const inFlightRef = useRef(false);

  const check = useCallback(async (force = false) => {
    if (!enabled || inFlightRef.current) return;
    if (!force && Date.now() - lastCheckRef.current < RECHECK_THROTTLE_MS) return;
    inFlightRef.current = true;
    lastCheckRef.current = Date.now();
    try {
      const config = await appConfigService.getMinSupported();
      // No config (offline / error / not deployed) → keep the previous answer; never newly block.
      if (config) {
        setResult(
          evaluateVersionGate({ platform: Platform.OS, buildNumber: Application.nativeBuildVersion, config }),
        );
      }
    } catch {
      // fail open
    } finally {
      inFlightRef.current = false;
    }
  }, [enabled]);

  // "Check again" (user action): show a spinner while the forced re-check runs.
  const recheck = useCallback(async () => {
    setChecking(true);
    try {
      await check(true);
    } finally {
      setChecking(false);
    }
  }, [check]);

  useEffect(() => {
    if (!enabled) return;
    // Launch check from a timer callback (not synchronously in the effect body).
    const launch = setTimeout(() => void check(true), 0);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void check();
    });
    return () => {
      clearTimeout(launch);
      sub.remove();
    };
  }, [enabled, check]);

  return { result, checking, recheck };
};
