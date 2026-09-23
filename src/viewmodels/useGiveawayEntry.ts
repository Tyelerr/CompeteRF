import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { giveawayService } from "../models/services/giveaway.service";
import { giveawayWalletService } from "../models/services/giveaway-wallet.service";
import { WalletEntryResult, WalletEntryStatus } from "../models/types/giveaway-wallet.types";
import {
  GiveawayEntryForm,
  GiveawaySavedInfo,
  INITIAL_ENTRY_FORM,
} from "../models/types/giveaway.types";
import { useAuthContext } from "../providers/AuthProvider";

export type GiveawayEntryMode = "loading" | "full-form" | "quick-confirm" | "edit";

/** Present only for WALLET giveaways — switches the hook from the legacy insert to the RPC. */
export interface WalletEntryContext {
  balance: number;
  myEntries: number;
  perUserMax: number;
  capacityRemaining: number;
}

interface UseGiveawayEntryOptions {
  giveawayId: number | null;
  minAge: number;
  onSuccess: () => void;
  wallet?: WalletEntryContext | null;
  onWalletSuccess?: (result: WalletEntryResult) => void;
}

const WALLET_ERRORS: Partial<Record<WalletEntryStatus, string>> = {
  insufficient_balance: "You don't have enough Giveaway Entries for that.",
  per_user_cap: "That would go over the per-person limit for this giveaway.",
  capacity: "Not enough spots left in this giveaway for that many entries.",
  closed: "This giveaway is no longer accepting entries.",
  entrant_details_required: "Please complete your details to enter.",
  underage: "You don't meet the age requirement for this giveaway.",
  invalid_quantity: "Choose how many entries to add.",
  not_authenticated: "You must be logged in to enter.",
};

interface FieldErrors {
  name_as_on_id?: string;
  birthday?: string;
  email?: string;
  phone?: string;
  checkboxes?: string;
}

// ─────────────────────────────────────────────────
// Date option generators
// ─────────────────────────────────────────────────
function buildMonthOptions() {
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return [
    { label: "Month", value: "" },
    ...months.map((m, i) => ({
      label: m,
      value: String(i + 1).padStart(2, "0"),
    })),
  ];
}

function buildDayOptions() {
  return [
    { label: "Day", value: "" },
    ...Array.from({ length: 31 }, (_, i) => ({
      label: String(i + 1),
      value: String(i + 1).padStart(2, "0"),
    })),
  ];
}

function buildYearOptions() {
  const currentYear = new Date().getFullYear();
  return [
    { label: "Year", value: "" },
    ...Array.from({ length: 100 }, (_, i) => {
      const y = currentYear - 18 - i;
      return { label: String(y), value: String(y) };
    }),
  ];
}

function parseBirthdayFromISO(iso: string): {
  month: string;
  day: string;
  year: string;
} {
  const parts = iso.split("-");
  if (parts.length !== 3) return { month: "", day: "", year: "" };
  return { year: parts[0], month: parts[1], day: parts[2] };
}

function prePopulatedForm(info: GiveawaySavedInfo): GiveawayEntryForm {
  return {
    ...INITIAL_ENTRY_FORM,
    name_as_on_id: info.name_as_on_id,
    email: info.email,
    phone: info.phone,
    birthday: parseBirthdayFromISO(info.birthday),
  };
}

// ─────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────
export function useGiveawayEntry({
  giveawayId,
  minAge,
  onSuccess,
  wallet = null,
  onWalletSuccess,
}: UseGiveawayEntryOptions) {
  const { profile } = useAuthContext();

  // ── Wallet giveaways ───────────────────────────────────────────────────────
  const isWallet = !!wallet;
  // A user who already holds entries is topping up: no details/consent step.
  const isTopUp = isWallet && wallet!.myEntries > 0;
  const maxAddable = wallet
    ? Math.max(0, Math.min(wallet.balance, wallet.perUserMax - wallet.myEntries, wallet.capacityRemaining))
    : 0;
  const [quantityRaw, setQuantityRaw] = useState(1);
  const quantity = Math.max(maxAddable > 0 ? 1 : 0, Math.min(quantityRaw, maxAddable));
  const incrementQuantity = useCallback(() => setQuantityRaw((q) => q + 1), []);
  const decrementQuantity = useCallback(() => setQuantityRaw((q) => Math.max(1, q - 1)), []);
  // One id per user action; kept across a failed network call so a retry is a safe replay.
  const requestIdRef = useRef<string>(giveawayWalletService.newRequestId());

  const [mode, setMode] = useState<GiveawayEntryMode>("loading");
  const [savedInfo, setSavedInfo] = useState<GiveawaySavedInfo | null>(null);
  const savedInfoRef = useRef<GiveawaySavedInfo | null>(null);
  const [form, setForm] = useState<GiveawayEntryForm>(INITIAL_ENTRY_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Static option lists — memoised, never change
  const monthOptions = useMemo(() => buildMonthOptions(), []);
  const dayOptions = useMemo(() => buildDayOptions(), []);
  const yearOptions = useMemo(() => buildYearOptions(), []);

  // ─────────────────────────────────────────────────
  // On mount: check for saved entry info
  // ─────────────────────────────────────────────────
  useEffect(() => {
    if (!profile?.id_auto) {
      setMode("full-form");
      return;
    }

    giveawayService
      .getSavedEntryInfo(profile.id_auto)
      .then((info) => {
        if (info) {
          savedInfoRef.current = info;
          setSavedInfo(info);
          setForm(prePopulatedForm(info));
          setMode("quick-confirm");
        } else {
          setMode("full-form");
        }
      })
      .catch(() => setMode("full-form"));
  }, [profile?.id_auto]);

  // ─────────────────────────────────────────────────
  // Field updates
  // ─────────────────────────────────────────────────
  const updateField = useCallback(
    <K extends keyof GiveawayEntryForm>(key: K, value: GiveawayEntryForm[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      setErrors((prev) => ({ ...prev, [key]: undefined }));
      setSubmitError(null);
    },
    [],
  );

  const updateBirthday = useCallback(
    (field: "month" | "day" | "year", value: string) => {
      setForm((prev) => ({
        ...prev,
        birthday: { ...prev.birthday, [field]: value },
      }));
      setErrors((prev) => ({ ...prev, birthday: undefined }));
      setSubmitError(null);
    },
    [],
  );

  const toggleCheckbox = useCallback((key: keyof GiveawayEntryForm) => {
    setForm((prev) => ({ ...prev, [key]: !prev[key] }));
    setErrors((prev) => ({ ...prev, checkboxes: undefined }));
    setSubmitError(null);
  }, []);

  // ─────────────────────────────────────────────────
  // Computed completeness
  // ─────────────────────────────────────────────────
  const isFormComplete = useMemo(() => {
    if (isTopUp) return quantity > 0;
    const { name_as_on_id, email, phone, birthday, agreed_to_rules,
      confirmed_age, agreed_to_privacy, understood_one_entry } = form;
    if (isWallet && quantity < 1) return false;
    return (
      name_as_on_id.trim().length > 0 &&
      email.trim().length > 0 &&
      phone.trim().length > 0 &&
      birthday.month !== "" &&
      birthday.day !== "" &&
      birthday.year !== "" &&
      agreed_to_rules &&
      confirmed_age &&
      agreed_to_privacy &&
      (isWallet || understood_one_entry)   // "one entry per person" applies to legacy only
    );
  }, [form, isTopUp, isWallet, quantity]);

  // ─────────────────────────────────────────────────
  // Validation (field-level errors for full form)
  // ─────────────────────────────────────────────────
  const validate = (f: GiveawayEntryForm): FieldErrors | null => {
    const errs: FieldErrors = {};

    if (!f.name_as_on_id.trim()) errs.name_as_on_id = "Full name is required.";
    if (!f.email.trim() || !f.email.includes("@"))
      errs.email = "A valid email address is required.";
    if (!f.phone.trim()) errs.phone = "Phone number is required.";

    const { month, day, year } = f.birthday;
    if (!month || !day || !year) {
      errs.birthday = "Date of birth is required.";
    } else {
      const dob = new Date(`${year}-${month}-${day}`);
      if (isNaN(dob.getTime())) {
        errs.birthday = "Please enter a valid date of birth.";
      } else {
        const age = Math.floor(
          (Date.now() - dob.getTime()) / (1000 * 60 * 60 * 24 * 365.25),
        );
        if (age < minAge)
          errs.birthday = `You must be at least ${minAge} years old to enter.`;
      }
    }

    if (
      !f.agreed_to_rules ||
      !f.confirmed_age ||
      !f.agreed_to_privacy ||
      (!isWallet && !f.understood_one_entry)
    ) {
      errs.checkboxes = "Please check all required boxes to continue.";
    }

    return Object.keys(errs).length > 0 ? errs : null;
  };

  // ─────────────────────────────────────────────────
  // Submit
  // ─────────────────────────────────────────────────
  const submitEntry = useCallback(async (): Promise<boolean> => {
    if (!profile?.id_auto) {
      setSubmitError("You must be logged in to enter.");
      return false;
    }
    if (!giveawayId) {
      setSubmitError("No giveaway selected.");
      return false;
    }

    if (!isTopUp) {
      const fieldErrors = validate(form);
      if (fieldErrors) {
        setErrors(fieldErrors);
        return false;
      }
    }

    const birthdayIso = `${form.birthday.year}-${form.birthday.month.padStart(2, "0")}-${form.birthday.day.padStart(2, "0")}`;

    // ── Wallet giveaway: spend Giveaway Entries through the server RPC ──────
    if (isWallet) {
      if (quantity < 1) {
        setSubmitError(maxAddable === 0 ? "You can't add entries to this giveaway right now." : "Choose how many entries to add.");
        return false;
      }
      setIsSubmitting(true);
      setSubmitError(null);
      try {
        const res = await giveawayWalletService.enterWalletGiveaway(
          giveawayId,
          quantity,
          requestIdRef.current,
          isTopUp
            ? null
            : {
                name_as_on_id: form.name_as_on_id.trim(),
                birthday: birthdayIso,
                email: form.email.trim().toLowerCase(),
                phone: form.phone.trim(),
                agreed_to_rules: form.agreed_to_rules,
                agreed_to_privacy: form.agreed_to_privacy,
                confirmed_age: form.confirmed_age,
                opted_in_promotions: form.opted_in_promotions,
              },
        );
        if (!res.ok) {
          setSubmitError(WALLET_ERRORS[res.status] ?? "Couldn't add your entries. Please try again.");
          return false;
        }
        requestIdRef.current = giveawayWalletService.newRequestId();
        if (!isTopUp) {
          const info = { name_as_on_id: form.name_as_on_id.trim(), birthday: birthdayIso, email: form.email.trim().toLowerCase(), phone: form.phone.trim() };
          savedInfoRef.current = info;
          setSavedInfo(info);
        }
        setQuantityRaw(1);
        onWalletSuccess?.(res);
        onSuccess();
        return true;
      } catch {
        // Same request id is kept, so retrying can never charge twice.
        setSubmitError("Network problem — please try again.");
        return false;
      } finally {
        setIsSubmitting(false);
      }
    }

    setIsSubmitting(true);
    setSubmitError(null);

    const result = await giveawayService.createEntry(giveawayId, profile.id_auto, form);

    setIsSubmitting(false);

    if (!result.success) {
      setSubmitError(result.error ?? "Failed to submit entry. Please try again.");
      return false;
    }

    // Update savedInfo in memory so the next giveaway immediately
    // shows the quick-confirm flow without needing an app restart
    const birthday = `${form.birthday.year}-${form.birthday.month.padStart(2, "0")}-${form.birthday.day.padStart(2, "0")}`;
    const newSavedInfo = {
      name_as_on_id: form.name_as_on_id.trim(),
      birthday,
      email: form.email.trim().toLowerCase(),
      phone: form.phone.trim(),
    };
    savedInfoRef.current = newSavedInfo;
    setSavedInfo(newSavedInfo);

    onSuccess();
    return true;
  }, [profile?.id_auto, giveawayId, form, onSuccess, isWallet, isTopUp, quantity, maxAddable, onWalletSuccess]);

  // ─────────────────────────────────────────────────
  // Edit / reset
  // ─────────────────────────────────────────────────
  const startEdit = useCallback(() => {
    setMode("edit");
    setErrors({});
    setSubmitError(null);
  }, []);

  const resetForm = useCallback(() => {
    setErrors({});
    setSubmitError(null);
    // Use ref so we always read the latest value synchronously,
    // even if setSavedInfo has not flushed yet
    const current = savedInfoRef.current;
    if (current) {
      setForm(prePopulatedForm(current));
      setMode("quick-confirm");
    } else {
      setForm(INITIAL_ENTRY_FORM);
      setMode("full-form");
    }
  }, []);

  return {
    // State
    mode,
    form,
    savedInfo,
    errors,
    submitError,
    isSubmitting,
    isFormComplete,
    // Options
    monthOptions,
    dayOptions,
    yearOptions,
    // Wallet
    isWallet,
    isTopUp,
    quantity,
    maxAddable,
    incrementQuantity,
    decrementQuantity,
    // Actions
    updateField,
    updateBirthday,
    toggleCheckbox,
    submitEntry,
    resetForm,
    startEdit,
  };
}
