import { useEffect, useState } from "react";
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { moderateScale, scale } from "../../../utils/scaling";
import { CHECK_INSET, FieldCheck } from "./field-check";

const isWeb = Platform.OS === "web";

interface DatePickerProps { value: string; onChange: (date: string) => void; placeholder?: string; }

const parseLocalDate = (dateString: string): Date => {
  const [y, m, d] = dateString.split("-").map(Number);
  return new Date(y, m - 1, d);
};

const formatDisplay = (dateString: string, placeholder: string) => {
  if (!dateString) return placeholder;
  return parseLocalDate(dateString).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

export const DatePicker = ({ value, onChange, placeholder = "Select Date" }: DatePickerProps) => {
  const [showModal, setShowModal] = useState(false);
  const [tempDate, setTempDate] = useState(new Date());
  const [hasSelected, setHasSelected] = useState(false);
  const showCheck = !!value;

  useEffect(() => {
    if (showModal) { setTempDate(value ? parseLocalDate(value) : new Date()); setHasSelected(!!value); }
  }, [showModal]);

  const handleConfirm = () => {
    // tempDate is a LOCAL wall-clock Date: it starts as new Date() (local now) or
    // parseLocalDate(value) (local midnight), and the native picker returns the
    // selected day in local time. So read LOCAL parts to get exactly the calendar
    // day the TD tapped. (Reading getUTC* here converted to UTC first, which rolled
    // the date to an adjacent day depending on offset/time-of-day — e.g. an evening
    // selection in a negative-offset zone could jump forward a day.)
    const y = tempDate.getFullYear();
    const m = String(tempDate.getMonth() + 1).padStart(2, "0");
    const d = String(tempDate.getDate()).padStart(2, "0");
    onChange(y + "-" + m + "-" + d);
    setShowModal(false);
  };

  if (isWeb) {
    return (
      <View style={wStyles.wrap}>
        <FieldCheck complete={showCheck} />
        <input type="date" value={value || ""} onChange={(e) => onChange(e.target.value)}
          onClick={(e) => {
            const el = e.currentTarget as HTMLInputElement & { showPicker?: () => void };
            try { el.showPicker?.(); } catch { /* not user-activated */ }
          }}
          style={{ flex: 1, minWidth: 0, maxWidth: "100%", boxSizing: "border-box", backgroundColor: "transparent", border: "none", padding: "8px 0", fontSize: 13, color: value ? COLORS.text : COLORS.textMuted, outline: "none", cursor: "pointer", colorScheme: "dark" } as React.CSSProperties}
        />
      </View>
    );
  }

  const DateTimePicker = require("@react-native-community/datetimepicker").default;
  const formatSelectedDate = (date: Date) => date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

  return (
    <>
      <TouchableOpacity style={styles.button} onPress={() => setShowModal(true)}>
        <FieldCheck complete={showCheck} />
        <Text allowFontScaling={false} style={[styles.buttonText, !value && styles.placeholder]}>{formatDisplay(value, placeholder)}</Text>
      </TouchableOpacity>
      <Modal visible={showModal} animationType="fade" transparent onRequestClose={() => setShowModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowModal(false)}>
          <TouchableOpacity style={styles.modalContainer} activeOpacity={1} onPress={(e) => e.stopPropagation()}>
            <Text allowFontScaling={false} style={styles.modalTitle}>Select Date</Text>
            <View style={styles.selectedDateContainer}>
              <Text allowFontScaling={false} style={styles.selectedDateText}>{hasSelected ? formatSelectedDate(tempDate) : "Tap a date below"}</Text>
            </View>
            <View style={styles.pickerContainer}>
              <DateTimePicker value={tempDate} mode="date" display="inline" onChange={(_: any, d?: Date) => { if (d) { setTempDate(d); setHasSelected(true); } }} themeVariant="dark" style={styles.picker} />
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setShowModal(false)}>
                <Text allowFontScaling={false} style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.confirmButton, !hasSelected && styles.confirmButtonDisabled]} onPress={handleConfirm} disabled={!hasSelected}>
                <Text allowFontScaling={false} style={[styles.confirmButtonText, !hasSelected && styles.confirmButtonTextDisabled]}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

const wStyles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", minHeight: 36, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 6, paddingHorizontal: CHECK_INSET },
});

const styles = StyleSheet.create({
  button: { flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: COLORS.surface, borderRadius: RADIUS.md, paddingVertical: scale(SPACING.md), paddingHorizontal: CHECK_INSET, borderWidth: 1, borderColor: COLORS.border },
  buttonText: { fontSize: moderateScale(FONT_SIZES.md), color: COLORS.text },
  placeholder: { color: COLORS.textMuted },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.8)", justifyContent: "center", alignItems: "center", padding: scale(SPACING.lg) },
  modalContainer: { backgroundColor: COLORS.background, borderRadius: RADIUS.xl, padding: scale(SPACING.md), width: "100%", maxWidth: 360 },
  modalTitle: { fontSize: moderateScale(FONT_SIZES.lg), fontWeight: "600", color: COLORS.text, textAlign: "center", marginBottom: scale(SPACING.sm) },
  selectedDateContainer: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: scale(SPACING.md), marginBottom: scale(SPACING.md), alignItems: "center" },
  selectedDateText: { fontSize: moderateScale(FONT_SIZES.md), color: COLORS.primary, fontWeight: "500" },
  pickerContainer: { alignItems: "center" },
  picker: { height: 320, width: "100%" },
  modalButtons: { flexDirection: "row", gap: scale(SPACING.md), marginTop: scale(SPACING.md) },
  cancelButton: { flex: 1, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: scale(SPACING.md), alignItems: "center" },
  cancelButtonText: { fontSize: moderateScale(FONT_SIZES.md), color: COLORS.text },
  confirmButton: { flex: 1, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, padding: scale(SPACING.md), alignItems: "center" },
  confirmButtonDisabled: { backgroundColor: COLORS.border },
  confirmButtonText: { fontSize: moderateScale(FONT_SIZES.md), color: COLORS.white, fontWeight: "600" },
  confirmButtonTextDisabled: { color: COLORS.textMuted },
});
