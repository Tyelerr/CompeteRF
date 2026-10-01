// src/viewmodels/useGiveawayEarningRules.ts
// Web Giveaway Management → Earning Rules (Super Admin). Loads the rules + stats + flagged
// referrals, keeps an editable draft, validates it locally (server re-validates), and saves only
// the changed fields through set_giveaway_earning_rules (audit_log'd server-side).

import { useCallback, useEffect, useMemo, useState } from "react";
import { earningRulesService } from "../models/services/earning-rules.service";
import { EarningRulesStats, FlaggedReferral, GiveawayEarningRules } from "../models/types/earning-rules.types";
import {
  RulesDraft,
  buildRulesPatch,
  draftFromRules,
  hasRulesErrors,
  newMilestoneKey,
  validateRulesDraft,
} from "../utils/earning-rules";
import { useAuthStore } from "./stores/auth.store";

const SAVE_ERRORS: Record<string, string> = {
  invalid: "One of the values isn't valid. Check the highlighted fields.",
  out_of_range: "A value is outside the allowed range.",
  unknown_field: "The server didn't recognise one of the settings.",
};

export function useGiveawayEarningRules() {
  const canManage = useAuthStore((st) => st.profile?.role === "super_admin");

  const [saved, setSaved] = useState<GiveawayEarningRules | null>(null);
  const [stats, setStats] = useState<EarningRulesStats | null>(null);
  const [draft, setDraft] = useState<RulesDraft | null>(null);
  const [flagged, setFlagged] = useState<FlaggedReferral[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<number | null>(null);

  // Fetch + apply as promise callbacks (state is only set asynchronously).
  const fetchAll = useCallback(
    (isAlive: () => boolean) =>
      Promise.all([earningRulesService.get(), earningRulesService.listFlagged()])
        .then(([snap, flags]) => {
          if (!isAlive()) return;
          setLoadError(null);
          setSaved(snap.rules);
          setStats(snap.stats);
          setDraft(draftFromRules(snap.rules));
          setFlagged(flags);
        })
        .catch((e: any) => {
          if (!isAlive()) return;
          setLoadError(
            e?.message?.includes("not authorized")
              ? "Earning rules are available to Super Admins only."
              : "Couldn't load earning rules. Please try again.",
          );
        })
        .finally(() => {
          if (isAlive()) setLoading(false);
        }),
    [],
  );
  const load = useCallback(() => fetchAll(() => true), [fetchAll]);

  useEffect(() => {
    if (!canManage) return;
    let alive = true;
    fetchAll(() => alive);
    return () => {
      alive = false;
    };
  }, [canManage, fetchAll]);

  const errors = useMemo(() => (draft ? validateRulesDraft(draft) : null), [draft]);
  const patch = useMemo(() => (saved && draft && errors && !hasRulesErrors(errors) ? buildRulesPatch(saved, draft) : {}), [saved, draft, errors]);
  const dirty = useMemo(() => (saved && draft ? Object.keys(buildRulesPatchSafe(saved, draft)).length > 0 : false), [saved, draft]);
  const canSave = !!draft && !!errors && !hasRulesErrors(errors) && Object.keys(patch).length > 0 && !saving;

  const update = useCallback(<K extends keyof RulesDraft>(key: K, value: RulesDraft[K]) => {
    setSavedNotice(null);
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }, []);
  const setNumber = useCallback(
    (key: "referrer_reward" | "referred_reward" | "attribution_window_days" | "monthly_referrer_cap" | "velocity_flag_threshold", v: string) =>
      update(key, v.replace(/[^0-9]/g, "")),
    [update],
  );
  const setMilestone = useCallback((key: string, field: "threshold" | "bonus", v: string) => {
    setSavedNotice(null);
    setDraft((d) =>
      d ? { ...d, milestones: d.milestones.map((m) => (m.key === key ? { ...m, [field]: v.replace(/[^0-9]/g, "") } : m)) } : d,
    );
  }, []);
  const addMilestone = useCallback(() => {
    setSavedNotice(null);
    setDraft((d) => {
      if (!d) return d;
      const max = d.milestones.reduce((acc, m) => Math.max(acc, Number(m.threshold) || 0), 0);
      return { ...d, milestones: [...d.milestones, { key: newMilestoneKey(), threshold: String(max ? max * 2 : 5), bonus: "5" }] };
    });
  }, []);
  const removeMilestone = useCallback((key: string) => {
    setSavedNotice(null);
    setDraft((d) => (d ? { ...d, milestones: d.milestones.filter((m) => m.key !== key) } : d));
  }, []);
  const discard = useCallback(() => {
    if (saved) setDraft(draftFromRules(saved));
    setSaveError(null);
    setSavedNotice(null);
  }, [saved]);

  const save = useCallback(async () => {
    if (!canSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await earningRulesService.save(patch);
      if (!res.ok || !res.rules) {
        setSaveError(SAVE_ERRORS[res.status] ?? "Couldn't save the rules. Please try again.");
        return;
      }
      setSaved(res.rules);
      setDraft(draftFromRules(res.rules));
      setSavedNotice("Earning rules saved. They apply to new referral claims from now on.");
      earningRulesService.get().then((s) => setStats(s.stats)).catch(() => {});
    } catch (e: any) {
      setSaveError(e?.message?.includes("not authorized") ? "Only a Super Admin can change earning rules." : "Network problem — please try again.");
    } finally {
      setSaving(false);
    }
  }, [canSave, patch]);

  const reviewFlag = useCallback(async (id: number) => {
    setReviewing(id);
    try {
      const res = await earningRulesService.reviewFlag(id);
      if (res.ok) {
        const [flags, snap] = await Promise.all([earningRulesService.listFlagged(), earningRulesService.get()]);
        setFlagged(flags);
        setStats(snap.stats);
      }
    } catch {
      /* the row simply stays open */
    } finally {
      setReviewing(null);
    }
  }, []);

  return {
    canManage,
    loading: canManage && loading,
    loadError,
    reload: load,
    saved,
    stats,
    draft,
    errors,
    dirty,
    canSave,
    saving,
    saveError,
    savedNotice,
    update,
    setNumber,
    setMilestone,
    addMilestone,
    removeMilestone,
    discard,
    save,
    flagged,
    reviewing,
    reviewFlag,
  };
}

/** Dirty check that tolerates a draft with invalid numbers (any difference counts as dirty). */
function buildRulesPatchSafe(saved: GiveawayEarningRules, d: RulesDraft) {
  const invalid = hasRulesErrors(validateRulesDraft(d));
  if (!invalid) return buildRulesPatch(saved, d);
  return { dirty: true };
}
