import { useState } from "react";
import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";

interface DropdownOption {
  label: string;
  value: string;
}

interface DropdownProps {
  label?: string;
  placeholder?: string;
  options: DropdownOption[];
  value?: string;
  onSelect: (value: string) => void;
  error?: string;
  disabled?: boolean;
}

export const Dropdown = ({
  label,
  placeholder = "Select...",
  options,
  value,
  onSelect,
  error,
  disabled = false,
}: DropdownProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const selectedOption = options.find((o) => o.value === value);

  const handlePress = () => {
    if (!disabled) {
      setIsOpen(true);
    }
  };

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TouchableOpacity
        style={[
          styles.selector,
          error && styles.selectorError,
          disabled && styles.selectorDisabled,
        ]}
        onPress={handlePress}
        activeOpacity={disabled ? 1 : 0.7}
      >
        <Text
          style={[
            styles.selectorText,
            !selectedOption && styles.placeholder,
            disabled && styles.textDisabled,
          ]}
        >
          {selectedOption?.label || placeholder}
        </Text>
        <Text style={[styles.arrow, disabled && styles.textDisabled]}>▼</Text>
      </TouchableOpacity>
      {error && <Text style={styles.error}>{error}</Text>}

      <Modal visible={isOpen} transparent animationType="fade">
        <TouchableOpacity
          style={styles.overlay}
          onPress={() => setIsOpen(false)}
          activeOpacity={1}
        >
          <View style={styles.dropdown}>
            <FlatList
              data={options}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.option,
                    item.value === value && styles.optionSelected,
                  ]}
                  onPress={() => {
                    onSelect(item.value);
                    setIsOpen(false);
                  }}
                >
                  <Text
                    style={[
                      styles.optionText,
                      item.value === value && styles.optionTextSelected,
                    ]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: SPACING.lg,
  },
  label: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  selector: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginHorizontal: SPACING.sm,
  },
  selectorError: {
    borderColor: COLORS.error,
  },
  selectorDisabled: {
    backgroundColor: COLORS.background,
    opacity: 0.6,
  },
  selectorText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
  },
  placeholder: {
    color: COLORS.textMuted,
  },
  textDisabled: {
    color: COLORS.textSecondary,
  },
  arrow: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
  },
  error: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.error,
    marginTop: SPACING.xs,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    padding: SPACING.lg,
  },
  dropdown: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    maxHeight: 300,
  },
  option: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  optionSelected: {
    backgroundColor: COLORS.primaryDark,
  },
  optionText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
  },
  optionTextSelected: {
    color: COLORS.white,
    fontWeight: "600",
  },
});
