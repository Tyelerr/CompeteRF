import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Alert } from "react-native";
import { giveawayService } from "../models/services/giveaway.service";
import { imageUploadService } from "../models/services/image-upload.services";
import { useAuthContext } from "../providers/AuthProvider";

export type EndType = "date" | "entries" | "both";

export interface CreateGiveawayFormData {
  name: string;
  description: string;
  prize_value: string;
  end_type: EndType;
  max_entries: string;
  end_date: { month: string; day: string; year: string };
  min_age: string;
  rules_text: string;
}

const INITIAL_FORM: CreateGiveawayFormData = {
  name: "",
  description: "",
  prize_value: "",
  end_type: "both",
  max_entries: "500",
  end_date: { month: "", day: "", year: "" },
  min_age: "18",
  rules_text: "",
};

export const useCreateGiveaway = () => {
  const router = useRouter();
  const { profile } = useAuthContext();

  // Form state
  const [formData, setFormData] =
    useState<CreateGiveawayFormData>(INITIAL_FORM);
  const [formErrors, setFormErrors] = useState<
    Partial<Record<keyof CreateGiveawayFormData, string>>
  >({});

  // Image state
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // Submit state
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Update form field
  const updateField = useCallback(
    <K extends keyof CreateGiveawayFormData>(
      field: K,
      value: CreateGiveawayFormData[K],
    ) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
      setFormErrors((prev) => ({ ...prev, [field]: undefined }));
    },
    [],
  );

  // Update end date
  const updateEndDate = useCallback(
    (field: "month" | "day" | "year", value: string) => {
      setFormData((prev) => ({
        ...prev,
        end_date: { ...prev.end_date, [field]: value },
      }));
    },
    [],
  );

  // Pick and upload image
  const handlePickImage = useCallback(async () => {
    try {
      const uri = await imageUploadService.pickImage();
      if (!uri) return;

      setImageUri(uri);
      setIsUploadingImage(true);

      const result = await imageUploadService.uploadImage(
        uri,
        "giveaway-images",
        "prizes",
      );

      if (result.success && result.url) {
        setImageUrl(result.url);
      } else {
        Alert.alert("Upload Failed", result.error || "Could not upload image");
        setImageUri(null);
      }
    } catch (error) {
      console.error("Image pick error:", error);
      Alert.alert("Error", "Could not access image library");
    } finally {
      setIsUploadingImage(false);
    }
  }, []);

  // Remove image
  const handleRemoveImage = useCallback(async () => {
    if (imageUrl) {
      await imageUploadService.deleteImage(imageUrl, "giveaway-images");
    }
    setImageUri(null);
    setImageUrl(null);
  }, [imageUrl]);

  // Validate form
  const validateForm = useCallback((): boolean => {
    const errors: Partial<Record<keyof CreateGiveawayFormData, string>> = {};

    if (!formData.name.trim()) {
      errors.name = "Prize name is required";
    }

    if (!formData.prize_value.trim()) {
      errors.prize_value = "Prize value is required";
    } else if (
      isNaN(parseFloat(formData.prize_value)) ||
      parseFloat(formData.prize_value) <= 0
    ) {
      errors.prize_value = "Please enter a valid amount";
    }

    // Validate based on end type
    if (formData.end_type === "entries" || formData.end_type === "both") {
      if (!formData.max_entries.trim()) {
        errors.max_entries = "Maximum entries is required";
      } else if (
        isNaN(parseInt(formData.max_entries)) ||
        parseInt(formData.max_entries) <= 0
      ) {
        errors.max_entries = "Please enter a valid number";
      }
    }

    if (formData.end_type === "date" || formData.end_type === "both") {
      const { month, day, year } = formData.end_date;
      if (!month || !day || !year) {
        errors.end_date = "End date is required";
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, [formData]);

  // Submit form
  const handleSubmit = useCallback(async (): Promise<boolean> => {
    if (!profile?.id_auto) {
      Alert.alert("Error", "You must be logged in");
      return false;
    }

    if (!validateForm()) return false;

    setIsSubmitting(true);

    try {
      // Format end date if provided and end_type includes date
      let endDate: string | undefined;
      if (
        (formData.end_type === "date" || formData.end_type === "both") &&
        formData.end_date.month &&
        formData.end_date.day &&
        formData.end_date.year
      ) {
        endDate = `${formData.end_date.year}-${formData.end_date.month.padStart(2, "0")}-${formData.end_date.day.padStart(2, "0")}`;
      }

      // Only include max_entries if end_type includes entries
      const maxEntries =
        formData.end_type === "entries" || formData.end_type === "both"
          ? parseInt(formData.max_entries)
          : undefined;

      const result = await giveawayService.createGiveaway(
        {
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
          prize_value: parseFloat(formData.prize_value),
          max_entries: maxEntries,
          end_date: endDate,
          min_age: parseInt(formData.min_age) || 18,
          rules_text: formData.rules_text.trim() || undefined,
          image_url: imageUrl || undefined,
        },
        profile.id_auto,
      );

      if (result.success) {
        Alert.alert("Success", "Giveaway created successfully!", [
          { text: "OK", onPress: () => router.back() },
        ]);
        return true;
      } else {
        Alert.alert("Error", result.error || "Failed to create giveaway");
        return false;
      }
    } catch (error) {
      console.error("Submit error:", error);
      Alert.alert("Error", "An unexpected error occurred");
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [profile?.id_auto, formData, imageUrl, validateForm, router]);

  // Cancel and go back
  const handleCancel = useCallback(() => {
    // Clean up uploaded image if exists
    if (imageUrl) {
      imageUploadService.deleteImage(imageUrl, "giveaway-images");
    }
    router.back();
  }, [imageUrl, router]);

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
    for (let i = currentYear; i <= currentYear + 5; i++) {
      years.push({ label: String(i), value: String(i) });
    }
    return years;
  }, []);

  return {
    // Form
    formData,
    formErrors,
    updateField,
    updateEndDate,

    // Image
    imageUri,
    imageUrl,
    isUploadingImage,
    pickImage: handlePickImage,
    removeImage: handleRemoveImage,

    // Submit
    isSubmitting,
    submit: handleSubmit,
    cancel: handleCancel,

    // Dropdown options
    monthOptions,
    dayOptions,
    yearOptions,
  };
};
