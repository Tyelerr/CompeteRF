import { useCallback, useEffect, useMemo, useState } from "react";
import { giveawayService } from "../models/services/giveaway.service";
import {
  Giveaway,
  GiveawayEntryForm,
  INITIAL_ENTRY_FORM,
} from "../models/types/giveaway.types";
import { useAuthContext } from "../providers/AuthProvider";

interface ValidationErrors {
  name_as_on_id?: string;
  birthday?: string;
  email?: string;
  phone?: string;
  checkboxes?: string;
}

export function useGiveawayEntry(giveaway: Giveaway | null) {
  const { profile } = useAuthContext();

  const [form, setForm] = useState<GiveawayEntryForm>(INITIAL_ENTRY_FORM);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Pre-fill email from profile if available
  useEffect(() => {
    if (profile?.email) {
      setForm((prev) => ({
        ...prev,
        email: profile.email || "",
      }));
    }
  }, [profile?.email]);

  // Reset form when giveaway changes
  useEffect(() => {
    console.log(
      `🔍 Giveaway changed, resetting form. Giveaway ID:`,
      giveaway?.id,
    );
    setForm({
      ...INITIAL_ENTRY_FORM,
      email: profile?.email || "",
    });
    setErrors({});
    setSubmitError(null);
    setSubmitSuccess(false);
  }, [giveaway?.id, profile?.email]);

  // Debug: Log form state changes
  useEffect(() => {
    console.log(`🔍 Form state updated:`, form);
    console.log(`🔍 Birthday specifically:`, form.birthday);
  }, [form]);

  const updateField = useCallback(
    <K extends keyof GiveawayEntryForm>(
      field: K,
      value: GiveawayEntryForm[K],
    ) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      setErrors((prev) => ({ ...prev, [field]: undefined }));
      setSubmitError(null);
    },
    [],
  );

  // THE KEY FUNCTION FOR BIRTHDAY DROPDOWNS
  const updateBirthday = useCallback(
    (field: "month" | "day" | "year", value: string) => {
      console.log(`🔍 updateBirthday called:`, { field, value });
      setForm((prev) => {
        console.log(`🔍 Previous form birthday:`, prev.birthday);
        const newForm = {
          ...prev,
          birthday: { ...prev.birthday, [field]: value },
        };
        console.log(`🔍 New form birthday:`, newForm.birthday);
        return newForm;
      });
      setErrors((prev) => ({ ...prev, birthday: undefined }));
    },
    [],
  );

  const toggleCheckbox = useCallback((field: keyof GiveawayEntryForm) => {
    setForm((prev) => ({
      ...prev,
      [field]: !prev[field],
    }));
    setErrors((prev) => ({ ...prev, checkboxes: undefined }));
  }, []);

  const validate = useCallback((): boolean => {
    const newErrors: ValidationErrors = {};

    // Name validation
    if (!form.name_as_on_id.trim()) {
      newErrors.name_as_on_id = "Full name is required";
    }

    // Birthday validation
    const { month, day, year } = form.birthday;
    if (!month || !day || !year) {
      newErrors.birthday = "Complete birthday is required";
    } else {
      const birthDate = new Date(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
      );
      const today = new Date();
      const age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      const dayDiff = today.getDate() - birthDate.getDate();

      const actualAge =
        monthDiff < 0 || (monthDiff === 0 && dayDiff < 0) ? age - 1 : age;

      const minAge = giveaway?.min_age || 18;
      if (actualAge < minAge) {
        newErrors.birthday = `You must be at least ${minAge} years old to enter`;
      }
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!form.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!emailRegex.test(form.email)) {
      newErrors.email = "Please enter a valid email address";
    }

    // Phone validation
    const phoneDigits = form.phone.replace(/\D/g, "");
    if (!form.phone.trim()) {
      newErrors.phone = "Phone number is required";
    } else if (phoneDigits.length < 10) {
      newErrors.phone = "Please enter a valid phone number";
    }

    // Required checkboxes
    if (
      !form.confirmed_age ||
      !form.agreed_to_rules ||
      !form.agreed_to_privacy ||
      !form.understood_one_entry
    ) {
      newErrors.checkboxes = "You must agree to all required terms";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [form, giveaway?.min_age]);

  const isFormComplete = useMemo(() => {
    const { month, day, year } = form.birthday;
    return (
      form.name_as_on_id.trim() !== "" &&
      month !== "" &&
      day !== "" &&
      year !== "" &&
      form.email.trim() !== "" &&
      form.phone.trim() !== "" &&
      form.confirmed_age &&
      form.agreed_to_rules &&
      form.agreed_to_privacy &&
      form.understood_one_entry
    );
  }, [form]);

  const submitEntry = useCallback(async (): Promise<boolean> => {
    if (!giveaway || !profile?.id_auto) {
      setSubmitError("Please log in to enter the giveaway");
      return false;
    }

    if (!validate()) {
      return false;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const result = await giveawayService.createEntry(
        giveaway.id,
        profile.id_auto,
        form,
      );

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
  }, [giveaway, profile?.id_auto, form, validate]);

  const resetForm = useCallback(() => {
    setForm({
      ...INITIAL_ENTRY_FORM,
      email: profile?.email || "",
    });
    setErrors({});
    setSubmitError(null);
    setSubmitSuccess(false);
  }, [profile?.email]);

  // Dropdown options
  const monthOptions = useMemo(
    () => [
      { label: "Month", value: "" },
      { label: "January", value: "1" },
      { label: "February", value: "2" },
      { label: "March", value: "3" },
      { label: "April", value: "4" },
      { label: "May", value: "5" },
      { label: "June", value: "6" },
      { label: "July", value: "7" },
      { label: "August", value: "8" },
      { label: "September", value: "9" },
      { label: "October", value: "10" },
      { label: "November", value: "11" },
      { label: "December", value: "12" },
    ],
    [],
  );

  const dayOptions = useMemo(() => {
    const days = [{ label: "Day", value: "" }];
    for (let i = 1; i <= 31; i++) {
      days.push({ label: String(i), value: String(i) });
    }
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
    // Form state
    form,
    errors,

    // Actions
    updateField,
    updateBirthday, // This fixes the birthday dropdown
    toggleCheckbox,
    submitEntry,
    resetForm,

    // Status
    isSubmitting,
    isFormComplete,
    submitError,
    submitSuccess,

    // Dropdown options
    monthOptions,
    dayOptions,
    yearOptions,

    // Giveaway data
    rulesText: giveaway?.rules_text || null,
    minAge: giveaway?.min_age || 18,
  };
}
