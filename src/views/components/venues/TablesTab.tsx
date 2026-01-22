import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../../theme/colors";
import { SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { NewTable, VenueTable } from "../../../viewmodels/useVenueTables";
import { Dropdown } from "../common/dropdown";
import { TableCard } from "./TableCard";

interface TablesTabProps {
  tables: VenueTable[];
  newTable: NewTable;
  loading: boolean;
  saving: boolean;
  tableSizeOptions: { label: string; value: string }[];
  brandOptions: { label: string; value: string }[];
  onAddTable: () => void;
  onUpdateTable: (id: number, updates: Partial<VenueTable>) => void;
  onDeleteTable: (id: number) => void;
  onUpdateNewTable: (field: keyof NewTable, value: string | number) => void;
}

export const TablesTab = ({
  tables,
  newTable,
  loading,
  saving,
  tableSizeOptions,
  brandOptions,
  onAddTable,
  onUpdateTable,
  onDeleteTable,
  onUpdateNewTable,
}: TablesTabProps) => {
  if (loading) {
    return (
      <View style={styles.centerContent}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Add New Table Form */}
      <View style={styles.addTableCard}>
        <Text style={styles.sectionTitle}>Add New Table</Text>
        <View style={styles.row}>
          <View style={[styles.formGroup, { flex: 1 }]}>
            <Text style={styles.label}>Size</Text>
            <Dropdown
              options={tableSizeOptions}
              value={newTable.table_size}
              onSelect={(value) => onUpdateNewTable("table_size", value)}
              placeholder="Size"
            />
          </View>
          <View style={[styles.formGroup, { flex: 1, marginLeft: SPACING.sm }]}>
            <Text style={styles.label}>Brand</Text>
            <Dropdown
              options={brandOptions}
              value={newTable.brand}
              onSelect={(value) => onUpdateNewTable("brand", value)}
              placeholder="Brand"
            />
          </View>
        </View>

        {newTable.table_size === "custom" && (
          <View style={styles.formGroup}>
            <Text style={styles.label}>Custom Size</Text>
            <TextInput
              style={styles.input}
              value={newTable.custom_size}
              onChangeText={(text) => onUpdateNewTable("custom_size", text)}
              placeholder="e.g., 10ft x 5ft"
              placeholderTextColor={COLORS.textSecondary}
            />
          </View>
        )}

        <View style={styles.bottomRow}>
          <View style={styles.quantityInput}>
            <Text style={styles.label}>Quantity</Text>
            <View style={styles.stepper}>
              <TouchableOpacity
                style={styles.stepperButton}
                onPress={() =>
                  onUpdateNewTable(
                    "quantity",
                    Math.max(1, newTable.quantity - 1),
                  )
                }
              >
                <Text style={styles.stepperText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.quantityText}>{newTable.quantity}</Text>
              <TouchableOpacity
                style={styles.stepperButton}
                onPress={() =>
                  onUpdateNewTable("quantity", newTable.quantity + 1)
                }
              >
                <Text style={styles.stepperText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.addButton, saving && styles.addButtonDisabled]}
            onPress={onAddTable}
            disabled={saving}
          >
            <Text style={styles.addButtonText}>
              {saving ? "Adding..." : "+ Add Table"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Existing Tables */}
      {tables.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>
            Current Tables ({tables.length})
          </Text>
          {tables.map((table) => (
            <TableCard
              key={table.id}
              table={table}
              onUpdate={(updates) => onUpdateTable(table.id, updates)}
              onDelete={() => onDeleteTable(table.id)}
              disabled={saving}
            />
          ))}
        </>
      )}

      {tables.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🎱</Text>
          <Text style={styles.emptyText}>No tables added yet</Text>
          <Text style={styles.emptySubtext}>
            Add your pool tables to help players know what to expect
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: SPACING.md,
  },
  centerContent: {
    padding: SPACING.xl,
    alignItems: "center",
  },
  sectionTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.sm,
    marginTop: SPACING.md,
  },
  addTableCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  formGroup: {
    marginBottom: SPACING.md,
  },
  label: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: 6,
    fontWeight: "600",
  },
  input: {
    backgroundColor: COLORS.background,
    borderRadius: 8,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  row: {
    flexDirection: "row",
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "flex-end",
  },
  quantityInput: {
    flex: 1,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignSelf: "flex-start",
  },
  stepperButton: {
    width: 40,
    height: 40,
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
  addButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    marginLeft: SPACING.md,
  },
  addButtonDisabled: {
    opacity: 0.6,
  },
  addButtonText: {
    color: COLORS.surface,
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
  },
  emptyState: {
    alignItems: "center",
    padding: SPACING.xl,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: SPACING.sm,
  },
  emptyText: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.text,
  },
  emptySubtext: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginTop: SPACING.xs,
  },
});
