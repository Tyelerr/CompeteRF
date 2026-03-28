import { useEffect, useState } from "react";
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { moderateScale, scale } from "../../../utils/scaling";

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

  useEffect(() => {
    if (showModal) { setTempDate(value ? parseLocalDate(value) : new Date()); setHasSelected(!!value); }
  }, [showModal]);

  const handleConfirm = () => {
    // DateTimePicker returns UTC midnight — extract using UTC methods to avoid
    // local timezone shifting the date back by one day in US timezones.
    const y = tempDate.getUTCFullYear();
    const m = String(tempDate.getUTCMonth() + 1).padStart(2, "0");
    const d = String(tempDate.getUTCDate()).padStart(2, "0");
    onChange(y + "-" + m + "-" + d);
    setShowModal(false);
  };

  if (isWeb) {
    return (
      <View style={wStyles.wrap}>
        <input type="date" value={value || ""} onChange={(e) => onChange(e.target.value)}
          style={{ flex: 1, width: "100%", backgroundColor: COLORS.surface, border: "1px solid " + COLORS.border, borderRadius: 6, padding: "8px 10px", fontSize: 13, color: value ? COLORS.text : COLORS.textMuted, outline: "none", cursor: "pointer", colorScheme: "dark" } as React.CSSProperties}
        />
      </View>
    );
  }

  const DateTimePicker = require("@react-native-community/datetimepicker").default;
  const formatSelectedDate = (date: Date) => date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

  return (
    <>
      <TouchableOpacity style={styles.button} onPress={() => setShowModal(true)}>
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

const wStyles = StyleSheet.create({ wrap: { flex: 1, height: 36 } });

const styles = StyleSheet.create({
  button: { flex: 1, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: scale(SPACING.md), alignItems: "center", borderWidth: 1, borderColor: COLORS.border },
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
