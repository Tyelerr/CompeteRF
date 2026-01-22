import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { TABLE_BRANDS, TABLE_SIZES } from "../../../utils/constants";
import { Dropdown } from "../common/dropdown";

interface TableCardProps {
  table: {
    id: number;
    table_size: string;
    brand: string | null;
    quantity: number;
    custom_size: string | null;
  };
  onUpdate: (updates: {
    table_size?: string;
    brand?: string;
    quantity?: number;
  }) => void;
  onDelete: () => void;
  disabled?: boolean;
}

export const TableCard = ({
  table,
  onUpdate,
  onDelete,
  disabled = false,
}: TableCardProps) => {
  const getDisplaySize = () => {
    if (table.table_size === "custom" && table.custom_size) {
      return table.custom_size;
    }
    return table.table_size;
  };

  const handleQuantityChange = (delta: number) => {
    const newQuantity = Math.max(1, table.quantity + delta);
    onUpdate({ quantity: newQuantity });
  };

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        {/* Size Dropdown */}
        <View style={styles.dropdownContainer}>
          <Text style={styles.label}>Size</Text>
          <Dropdown
            options={TABLE_SIZES}
            value={table.table_size}
            onSelect={(value) => onUpdate({ table_size: value })}
            placeholder="Size"
            disabled={disabled}
          />
        </View>

        {/* Brand Dropdown */}
        <View style={styles.dropdownContainer}>
          <Text style={styles.label}>Brand</Text>
          <Dropdown
            options={TABLE_BRANDS}
            value={table.brand || ""}
            onSelect={(value) => onUpdate({ brand: value })}
            placeholder="Brand"
            disabled={disabled}
          />
        </View>
      </View>

      <View style={styles.bottomRow}>
        {/* Quantity Stepper */}
        <View style={styles.quantityContainer}>
          <Text style={styles.label}>Qty</Text>
          <View style={styles.stepper}>
            <TouchableOpacity
              style={styles.stepperButton}
              onPress={() => handleQuantityChange(-1)}
              disabled={disabled || table.quantity <= 1}
            >
              <Text style={styles.stepperText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.quantityText}>{table.quantity}</Text>
            <TouchableOpacity
              style={styles.stepperButton}
              onPress={() => handleQuantityChange(1)}
              disabled={disabled}
            >
              <Text style={styles.stepperText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Delete Button */}
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={onDelete}
          disabled={disabled}
        >
          <Text style={styles.deleteText}>🗑️ Remove</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  row: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  bottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  dropdownContainer: {
    flex: 1,
  },
  label: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginBottom: 4,
    fontWeight: "600",
  },
  quantityContainer: {
    alignItems: "flex-start",
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  stepperButton: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  stepperText: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.primary,
    fontWeight: "600",
  },
  quantityText: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.text,
    paddingHorizontal: SPACING.sm,
    minWidth: 30,
    textAlign: "center",
  },
  deleteButton: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  deleteText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.error,
  },
});
