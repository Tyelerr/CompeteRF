// src/viewmodels/hooks/use.referral.code.field.ts
// Optional "Referral code" field on the signup screens. Pre-fills from a pending /r link,
// live-checks the code (debounced) to show "Invited by Tyler H.", and on submit hands the code
// to the pending store so the ONE background claim path (usePendingReferralClaim) records it
// once the profile exists. Link and manual codes therefore share the same server logic.

import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useRef, useState } from "react";
import { pendingReferralService } from "../../models/services/pending-referral.service";
import { referralService } from "../../models/services/referral.service";
import { ReferralSource } from "../../models/types/referral.types";
import { extractReferralCode, isWellFormedReferralCode, normalizeReferralCode } from "../../utils/referral";

export type ReferralFieldCheck = "idle" | "checking" | "valid" | "invalid";

interface Resolved {
  code: string;
  valid: boolean;
  inviter: string | null;
}

export function useReferralCodeField() {
  const [code, setCodeState] = useState("");
  const [resolved, setResolved] = useState<Resolved | null>(null);
  // The code that arrived via a /r link — keeps source = "link" (and its visit) while unchanged.
  const linkCode = useRef<string | null>(null);
  const linkVisitId = useRef<string | null>(null);
  const [pasteNote, setPasteNote] = useState<string | null>(null);

  useEffect(() => {
    pendingReferralService.get().then((p) => {
      if (!p) return;
      if (p.source === "link") {
        linkCode.current = p.code;
        linkVisitId.current = p.visitId ?? null;
      }
      setCodeState((cur) => cur || p.code);
    });
  }, []);

  const normalized = normalizeReferralCode(code);
  const wellFormed = isWellFormedReferralCode(normalized);

  // Debounced server check; results are keyed by code so stale answers are ignored.
  useEffect(() => {
    if (!wellFormed) return;
    let alive = true;
    const t = setTimeout(async () => {
      const res = await referralService.resolveCode(normalized);
      if (alive) setResolved({ code: normalized, valid: res.valid, inviter: res.valid ? res.inviter : null });
    }, 400);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [normalized, wellFormed]);

  const current = resolved && resolved.code === normalized ? resolved : null;
  const check: ReferralFieldCheck = !normalized
    ? "idle"
    : !wellFormed
      ? "invalid"
      : !current
        ? "checking"
        : current.valid
          ? "valid"
          : "invalid";
  const inviter = check === "valid" ? (current?.inviter ?? null) : null;

  const setCode = useCallback((value: string) => {
    setPasteNote(null);
    setCodeState(value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 16));
  }, []);

  /**
   * Optional convenience (e.g. the /r page copied the code before the App Store): paste a bare
   * code or a referral link. Typing always works — clipboard access is never required.
   */
  const paste = useCallback(async () => {
    try {
      const found = extractReferralCode(await Clipboard.getStringAsync());
      if (found) {
        setCodeState(found);
        setPasteNote(null);
      } else {
        setPasteNote("No referral code found on your clipboard — you can type it instead.");
      }
    } catch {
      setPasteNote("Couldn't read the clipboard — you can type the code instead.");
    }
  }, []);

  /**
   * Call right before creating the account. A non-empty code becomes the pending referral
   * (claimed after the profile exists); an emptied field discards any pending link referral.
   * Never blocks signup — the code is optional and the server re-validates everything.
   */
  const commit = useCallback(async () => {
    if (!normalized) {
      await pendingReferralService.clear();
      return;
    }
    const fromLink = normalized === linkCode.current;
    const source: ReferralSource = fromLink ? "link" : "manual";
    await pendingReferralService.save(normalized, source, fromLink ? linkVisitId.current : null);
  }, [normalized]);

  return { code, setCode, check, inviter, commit, paste, pasteNote };
}
