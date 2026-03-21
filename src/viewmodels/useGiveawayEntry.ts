import { useCallback, useEffect, useMemo, useState } from "react";
import { giveawayService } from "../models/services/giveaway.service";
import {
  Giveaway,
  GiveawayEntryForm,
  INITIAL_ENTRY_FORM,
} from "../models/types/giveaway.types";
import { useAuthStore } from "./stores/auth.store";

interface ValidationErrors {
  name_as_on_id?: string;
  birthday?: string;
  email?: string;
  phone?: string;
  checkboxes?: string;
}

export function useGiveawayEntry(giveaway: Giveaway | null) {
  const profile = useAuthStore((s) => s.profile);

  const [form, setForm] = useState<GiveawayEntryForm>(INITIAL_ENTRY_FORM);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  useEffect(() => {
    if (profile?.email) {
      setForm((prev) => ({ ...prev, email: profile.email || "" }));
    }
  }, [profile?.email]);

  useEffect(() => {
    setForm({ ...INITIAL_ENTRY_FORM, email: profile?.email || "" });
    setErrors({});
    setSubmitError(null);
    setSubmitSuccess(false);
  }, [giveaway?.id, profile?.email]);

  const updateField = useCallback(
    <K extends keyof GiveawayEntryForm>(field: K, value: GiveawayEntryForm[K]) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      setErrors((prev) => ({ ...prev, [field]: undefined }));
      setSubmitError(null);
    },
    [],
  );

  const updateBirthday = useCallback(
    (field: "month" | "day" | "year", value: string) => {
      setForm((prev) => ({ ...prev, birthday: { ...prev.birthday, [field]: value } }));
      setErrors((prev) => ({ ...prev, birthday: undefined }));
    },
    [],
  );

  const toggleCheckbox = useCallback((field: keyof GiveawayEntryForm) => {
    setForm((prev) => ({ ...prev, [field]: !prev[field] }));
    setErrors((prev) => ({ ...prev, checkboxes: undefined }));
  }, []);

  const validate = useCallback((): boolean => {
    const newErrors: ValidationErrors = {};

    if (!form.name_as_on_id.trim()) {
      newErrors.name_as_on_id = "Full name is required";
    }

    const { month, day, year } = form.birthday;
    if (!month || !day || !year) {
      newErrors.birthday = "Complete birthday is required";
    } else {
      const birthDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      const today = new Date();
      const age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      const dayDiff = today.getDate() - birthDate.getDate();
      const actualAge = monthDiff < 0 || (monthDiff === 0 && dayDiff < 0) ? age - 1 : age;
      const minAge = giveaway?.min_age || 18;
      if (actualAge < minAge) {
        newErrors.birthday = `You must be at least ${minAge} years old to enter`;
      }
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!form.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!emailRegex.test(form.email)) {
      newErrors.email = "Please enter a valid email address";
    }

    const phoneDigits = form.phone.replace(/\D/g, "");
    if (!form.phone.trim()) {
      newErrors.phone = "Phone number is required";
    } else if (phoneDigits.length < 10) {
      newErrors.phone = "Please enter a valid phone number";
    }

    if (!form.confirmed_age || !form.agreed_to_rules || !form.agreed_to_privacy || !form.understood_one_entry) {
      newErrors.checkboxes = "You must agree to all required terms";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [form, giveaway?.min_age]);

  const isFormComplete = useMemo(() => {
    const { month, day, year } = form.birthday;
    return (
      form.name_as_on_id.trim() !== "" &&
      month !== "" && day !== "" && year !== "" &&
      form.email.trim() !== "" &&
      form.phone.trim() !== "" &&
      form.confirmed_age &&
      form.agreed_to_rules &&
      form.agreed_to_privacy &&
      form.understood_one_entry
    );
  }, [form]);

  const submitEntry = useCallback(async (): Promise<boolean> => {
    // getState() reads the Zustand store synchronously at call time —
    // immune to any useCallback memoisation or context re-render lag.
    const currentProfile = useAuthStore.getState().profile;

    if (!giveaway || !currentProfile?.id_auto) {
      setSubmitError("Please log in to enter the giveaway");
      return false;
    }

    if (!validate()) return false;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const result = await giveawayService.createEntry(giveaway.id, currentProfile.id_auto, form);
      if (result.success) {
        setSubmitSuccess(true);
        return true;
      } else {
        setSubmitError(result.error || "Failed to submit entry");
        return false;
      }
    } catch (err) {
      console.error("Error submitting entry:", err);
      setSubmitError("An unexpected error occurred. Please try again.");
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [giveaway, form, validate]);

  const resetForm = useCallback(() => {
    setForm({ ...INITIAL_ENTRY_FORM, email: profile?.email || "" });
    setErrors({});
    setSubmitError(null);
    setSubmitSuccess(false);
  }, [profile?.email]);

  const monthOptions = useMemo(() => [
    { label: "Month", value: "" },
    { label: "January", value: "1" }, { label: "February", value: "2" },
    { label: "March", value: "3" }, { label: "April", value: "4" },
    { label: "May", value: "5" }, { label: "June", value: "6" },
    { label: "July", value: "7" }, { label: "August", value: "8" },
    { label: "September", value: "9" }, { label: "October", value: "10" },
    { label: "November", value: "11" }, { label: "December", value: "12" },
  ], []);

  const dayOptions = useMemo(() => {
    const days = [{ label: "Day", value: "" }];
    for (let i = 1; i <= 31; i++) days.push({ label: String(i), value: String(i) });
    return days;
  }, []);

  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years = [{ label: "Year", value: "" }];
    for (let i = currentYear - 18; i >= currentYear - 100; i--) {
      years.push({ label: String(i), value: String(i) });
    }
    return years;
  }, []);

  return {
    form, errors,
    updateField, updateBirthday, toggleCheckbox,
    submitEntry, resetForm,
    isSubmitting, isFormComplete, submitError, submitSuccess,
    monthOptions, dayOptions, yearOptions,
    rulesText: giveaway?.rules_text || null,
    minAge: giveaway?.min_age || 18,
  };
}
