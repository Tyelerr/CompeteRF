import DateTimePicker from "@react-native-community/datetimepicker";
import { useEffect, useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";

interface DatePickerProps {
  value: string;
  onChange: (date: string) => void;
  placeholder?: string;
}

/** Turn a Date into "YYYY-MM-DD" using LOCAL year/month/day */
const toLocalDateString = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

/** Parse "YYYY-MM-DD" as LOCAL midnight (not UTC) */
const parseLocalDate = (dateString: string): Date => {
  const [y, m, d] = dateString.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export const DatePicker = ({
  value,
  onChange,
  placeholder = "Select Date",
}: DatePickerProps) => {
  const [showModal, setShowModal] = useState(false);
  const [tempDate, setTempDate] = useState(new Date());
  const [hasSelected, setHasSelected] = useState(false);

  // Reset to today or selected value when modal opens
  useEffect(() => {
    if (showModal) {
      setTempDate(value ? parseLocalDate(value) : new Date());
      setHasSelected(true);
    }
  }, [showModal]);

  const formatDate = (dateString: string) => {
    if (!dateString) return placeholder;
    const date = parseLocalDate(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatSelectedDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const handleChange = (event: any, selectedDate?: Date) => {
    if (selectedDate) {
      setTempDate(selectedDate);
      setHasSelected(true);
    }
  };

  const handleConfirm = () => {
    const dateString = toLocalDateString(tempDate);
    onChange(dateString);
    setShowModal(false);
  };

  const handleCancel = () => {
    setShowModal(false);
  };

  return (
    <>
      <TouchableOpacity
        style={styles.button}
        onPress={() => setShowModal(true)}
      >
        <Text style={[styles.buttonText, !value && styles.placeholder]}>
          {formatDate(value)}
        </Text>
      </TouchableOpacity>

      <Modal
        visible={showModal}
        animationType="fade"
        transparent={true}
        onRequestClose={handleCancel}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={handleCancel}
        >
          <TouchableOpacity
            style={styles.modalContainer}
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={styles.modalTitle}>Select Date</Text>

            {/* Show selected date */}
            <View style={styles.selectedDateContainer}>
              <Text style={styles.selectedDateText}>
                {hasSelected
                  ? formatSelectedDate(tempDate)
                  : "Tap a date below"}
              </Text>
            </View>

            <View style={styles.pickerContainer}>
              <DateTimePicker
                value={tempDate}
                mode="date"
                display="inline"
                onChange={handleChange}
                themeVariant="dark"
                style={styles.picker}
              />
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={handleCancel}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.confirmButton,
                  !hasSelected && styles.confirmButtonDisabled,
                ]}
                onPress={handleConfirm}
                disabled={!hasSelected}
              >
                <Text
                  style={[
                    styles.confirmButtonText,
                    !hasSelected && styles.confirmButtonTextDisabled,
                  ]}
                >
                  Confirm
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  button: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  buttonText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
  },
  placeholder: {
    color: COLORS.textMuted,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.lg,
  },
  modalContainer: {
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.xl,
    padding: SPACING.md,
    width: "100%",
    maxWidth: 360,
  },
  modalTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "600",
    color: COLORS.text,
    textAlign: "center",
    marginBottom: SPACING.sm,
  },
  selectedDateContainer: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    alignItems: "center",
  },
  selectedDateText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.primary,
    fontWeight: "500",
  },
  pickerContainer: {
    alignItems: "center",
  },
  picker: {
    height: 320,
    width: "100%",
  },
  modalButtons: {
    flexDirection: "row",
    gap: SPACING.md,
    marginTop: SPACING.md,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
  },
  confirmButton: {
    flex: 1,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: "center",
  },
  confirmButtonDisabled: {
    backgroundColor: COLORS.border,
  },
  confirmButtonText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.white,
    fontWeight: "600",
  },
  confirmButtonTextDisabled: {
    color: COLORS.textMuted,
  },
});
