// src/models/services/app-config.service.ts
// Public, non-secret app configuration (public.app_config). Reads are bounded by a timeout so
// a slow network can never hold the app on a gate check.

import { supabase } from "../../lib/supabase";
import { MinSupportedConfig } from "../../utils/version-gate";

const TIMEOUT_MS = 6000;

export const appConfigService = {
  // The 'min_supported' row, or null when unavailable (missing table/row, offline, timeout).
  async getMinSupported(): Promise<MinSupportedConfig | null> {
    const read = (async () => {
      const { data, error } = await supabase
        .from("app_config")
        .select("value")
        .eq("key", "min_supported")
        .maybeSingle();
      if (error || !data) return null;
      return (data.value ?? null) as MinSupportedConfig | null;
    })();
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS));
    try {
      return await Promise.race([read, timeout]);
    } catch {
      return null;
    }
  },
};
