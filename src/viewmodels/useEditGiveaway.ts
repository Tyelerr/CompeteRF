import { useCallback, useEffect, useState } from "react";
import { giveawayService } from "../models/services/giveaway.service";
import { GiveawayEntryMode } from "../models/types/giveaway.types";

// ─────────────────────────────────────────────────────────────────────────────
// Form structure intentionally mirrors useCreateGiveaway so the edit screen
// can reuse identical UI patterns. The only additions are:
//   • entryCount / hasEntries — drives field locking
//   • isFieldLocked(field)   — view queries this instead of hardcoding rules
//
// LOCKING RULES (fairness / trust):
// Once any entry exists these fields become read-only so admins cannot
// silently change conditions users entered under:
//   prize_value, max_entries, end_type, end_date (month/day/year)
// ─────────────────────────────────────────────────────────────────────────────

export type EndType = "date" | "entries" | "both";

export interface EditGiveawayForm {
  name: string;
  description: string;
  prize_value: string;       // numeric string, e.g. "500"
  image_url: string;
  rules_text: string;
  min_age: string;
  end_type: EndType;
  max_entries: string;       // numeric string, blank = unlimited
  per_user_max: string;      // wallet giveaways only (required there)
  end_date: {
    month: string;           // "1"–"12"
    day: string;             // "1"–"31"
    year: string;            // "2025"
  };
}

// Fields locked once entries > 0
const LOCKED_AFTER_ENTRIES: (keyof EditGiveawayForm)[] = [
  "prize_value",
  "max_entries",
  "end_type",
  "end_date",
  "per_user_max",
];

const EMPTY_FORM: EditGiveawayForm = {
  name: "",
  description: "",
  prize_value: "",
  image_url: "",
  rules_text: "",
  min_age: "18",
  end_type: "date",
  max_entries: "",
  per_user_max: "",
  end_date: { month: "", day: "", year: "" },
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Derive end_type from stored giveaway fields */
function deriveEndType(endDate: string | null, maxEntries: number | null): EndType {
  const hasDate    = !!endDate;
  const hasEntries = maxEntries != null && maxEntries > 0;
  if (hasDate && hasEntries) return "both";
  if (hasEntries)             return "entries";
  return "date"; // default
}

/** Parse ISO date string into { month, day, year } */
function parseISODate(iso: string | null): { month: string; day: string; year: string } {
  if (!iso) return { month: "", day: "", year: "" };
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { month: "", day: "", year: "" };
  return {
    month: String(d.getUTCMonth() + 1),
    day:   String(d.getUTCDate()),
    year:  String(d.getUTCFullYear()),
  };
}

/** Build ISO date from { month, day, year }. Returns "" if incomplete. */
function buildISO(d: { month: string; day: string; year: string }): string {
  if (!d.month || !d.day || !d.year) return "";
  const m = d.month.padStart(2, "0");
  const day = d.day.padStart(2, "0");
  // End of day in UTC
  return `${d.year}-${m}-${day}T23:59:00.000Z`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────
export function useEditGiveaway(giveawayId: number) {
  const [form, setForm]               = useState<EditGiveawayForm>(EMPTY_FORM);
  const [originalForm, setOriginalForm] = useState<EditGiveawayForm>(EMPTY_FORM);
  const [entryCount, setEntryCount]   = useState(0);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  // Entry method is fixed at creation — shown read-only, never sent on save.
  const [entryMode, setEntryMode]     = useState<GiveawayEntryMode>("legacy_single");
  const isWallet = entryMode === "wallet";

  // ── Load ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!giveawayId) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      const g = await giveawayService.getGiveawayById(giveawayId);
      if (cancelled) return;

      if (!g) {
        setError("Giveaway not found.");
        setLoading(false);
        return;
      }

      const loaded: EditGiveawayForm = {
        name:        g.name || "",
        description: g.description || "",
        prize_value: g.prize_value != null ? String(g.prize_value) : "",
        image_url:   g.image_url || "",
        rules_text:  g.rules_text || "",
        min_age:     g.min_age != null ? String(g.min_age) : "18",
        end_type:    deriveEndType(g.end_date, g.max_entries),
        max_entries: g.max_entries != null ? String(g.max_entries) : "",
        per_user_max: g.per_user_max != null ? String(g.per_user_max) : "",
        end_date:    parseISODate(g.end_date),
      };
      setEntryMode(g.entry_mode ?? "legacy_single");

      setForm(loaded);
      setOriginalForm(loaded);
      setEntryCount(g.entry_count || 0);
      setLoading(false);
    };

    load();
    return () => { cancelled = true; };
  }, [giveawayId]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const hasEntries = entryCount > 0;

  const isFieldLocked = useCallback(
    (field: keyof EditGiveawayForm) =>
      hasEntries && LOCKED_AFTER_ENTRIES.includes(field),
    [hasEntries],
  );

  const hasChanges = JSON.stringify(form) !== JSON.stringify(originalForm);
  const perUserMaxValid = !isWallet || parseInt(form.per_user_max, 10) > 0;
  const isValid    = form.name.trim().length > 0 && perUserMaxValid;

  // ── Update field (no-ops on locked fields) ────────────────────────────────
  const updateField = useCallback(
    (field: keyof EditGiveawayForm, value: any) => {
      if (isFieldLocked(field)) return;
      setForm((prev) => ({ ...prev, [field]: value }));
      setError(null);
      setSaveSuccess(false);
    },
    [isFieldLocked],
  );

  /** Convenience wrapper for the nested end_date object */
  const updateEndDate = useCallback(
    (part: "month" | "day" | "year", value: string) => {
      if (isFieldLocked("end_date")) return;
      setForm((prev) => ({
        ...prev,
        end_date: { ...prev.end_date, [part]: value },
      }));
      setError(null);
      setSaveSuccess(false);
    },
    [isFieldLocked],
  );

  // ── Save ─────────────────────────────────────────────────────────────────
  const save = useCallback(async (): Promise<boolean> => {
    if (!isValid) {
      setError(!perUserMaxValid ? "Max entries per user is required." : "Giveaway name is required.");
      return false;
    }

    setSaving(true);
    setError(null);

    const updates: Parameters<typeof giveawayService.updateGiveaway>[1] = {
      name: form.name.trim(),
    };

    // Always-editable fields
    updates.description = form.description.trim() || undefined as any;
    updates.image_url   = form.image_url.trim()   || undefined as any;
    updates.rules_text  = form.rules_text.trim()  || undefined as any;

    if (form.min_age.trim()) {
      const n = parseInt(form.min_age, 10);
      if (!isNaN(n)) updates.min_age = n;
    }

    // Locked fields — only send when no entries
    if (!hasEntries) {
      if (form.prize_value.trim()) {
        const n = parseFloat(form.prize_value);
        if (!isNaN(n)) updates.prize_value = n;
      }

      if (form.end_type === "entries" || form.end_type === "both") {
        if (form.max_entries.trim()) {
          const n = parseInt(form.max_entries, 10);
          if (!isNaN(n)) updates.max_entries = n;
        }
        // Clear end_date if switching away from date/both
        if (form.end_type === "entries") updates.end_date = null as any;
      }

      if (form.end_type === "date" || form.end_type === "both") {
        const iso = buildISO(form.end_date);
        if (iso) updates.end_date = iso;
        // Clear max_entries if switching to date only
        if (form.end_type === "date") updates.max_entries = null as any;
      }

      // Wallet giveaways: capacity is mandatory (no date-only) and the per-user max is saved.
      if (isWallet) {
        const perUser = parseInt(form.per_user_max, 10);
        if (!isNaN(perUser)) updates.per_user_max = perUser;
        updates.end_type = form.end_type === "both" ? "both" : "entries";
      }
    }

    try {
      const result = await giveawayService.updateGiveaway(giveawayId, updates);
      if (result.success) {
        setOriginalForm(form);
        setSaveSuccess(true);
        return true;
      } else {
        setError(result.error || "Failed to save changes.");
        return false;
      }
    } catch (err: any) {
      setError(err?.message || "An unexpected error occurred.");
      return false;
    } finally {
      setSaving(false);
    }
  }, [giveawayId, form, isValid, hasEntries, isWallet, perUserMaxValid]);

  // ── Dropdown option builders (same as useCreateGiveaway) ─────────────────
  const monthOptions = [
    { label: "Month", value: "" },
    ...[
      "January","February","March","April","May","June",
      "July","August","September","October","November","December",
    ].map((label, i) => ({ label, value: String(i + 1) })),
  ];

  const dayOptions = [
    { label: "Day", value: "" },
    ...Array.from({ length: 31 }, (_, i) => ({
      label: String(i + 1),
      value: String(i + 1),
    })),
  ];

  const currentYear = new Date().getFullYear();
  const yearOptions = [
    { label: "Year", value: "" },
    ...Array.from({ length: 5 }, (_, i) => ({
      label: String(currentYear + i),
      value: String(currentYear + i),
    })),
  ];

  return {
    form,
    loading,
    saving,
    error,
    hasChanges,
    isValid,
    saveSuccess,
    entryCount,
    hasEntries,
    entryMode,
    isWallet,
    isFieldLocked,
    updateField,
    updateEndDate,
    save,
    monthOptions,
    dayOptions,
    yearOptions,
  };
}
