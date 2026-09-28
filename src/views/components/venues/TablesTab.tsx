import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
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
import { ActionMenu } from "../admin/ActionMenu";

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
  // "desktop" (web Venue workspace): layered surfaces, a one-line Add New Table form and a
  // scannable Current Tables list (summary rows; Edit expands the existing TableCard editor for
  // that one table). Same props / handlers. Default "stacked" = unchanged.
  layout?: "stacked" | "desktop";
}

export const TablesTab = (props: TablesTabProps) =>
  props.layout === "desktop" ? <DesktopTables {...props} /> : <StackedTables {...props} />;

const sizeLabel = (tb: VenueTable, options: { label: string; value: string }[]): string => {
  if (tb.table_size === "custom") return tb.custom_size || "Custom";
  return options.find((o) => o.value === tb.table_size)?.label ?? tb.table_size;
};

const DesktopTables = ({
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
  // Only one table's full editor is open at a time.
  const [editingId, setEditingId] = useState<number | null>(null);

  if (loading) {
    return (
      <View style={styles.centerContent}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={dt.container}>
      {/* Add New Table — darker inset surface so its fields read as a distinct form. */}
      <View style={dt.addCard}>
        <Text style={dt.addTitle}>Add New Table</Text>
        <View style={dt.addRow}>
          <View style={dt.addField}>
            <Text style={dt.label}>Size</Text>
            <Dropdown
              options={tableSizeOptions}
              value={newTable.table_size}
              onSelect={(value) => onUpdateNewTable("table_size", value)}
              placeholder="Size"
            />
          </View>
          <View style={dt.addField}>
            <Text style={dt.label}>Brand</Text>
            <Dropdown
              options={brandOptions}
              value={newTable.brand}
              onSelect={(value) => onUpdateNewTable("brand", value)}
              placeholder="Brand"
            />
          </View>
          <View>
            <Text style={dt.label}>Quantity</Text>
            <View style={dt.stepper}>
              <TouchableOpacity
                style={dt.stepBtn}
                onPress={() => onUpdateNewTable("quantity", Math.max(1, newTable.quantity - 1))}
                accessibilityLabel="Decrease quantity"
              >
                <Text style={dt.stepText}>−</Text>
              </TouchableOpacity>
              <Text style={dt.qtyText}>{newTable.quantity}</Text>
              <TouchableOpacity
                style={dt.stepBtn}
                onPress={() => onUpdateNewTable("quantity", newTable.quantity + 1)}
                accessibilityLabel="Increase quantity"
              >
                <Text style={dt.stepText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
          <TouchableOpacity
            style={[dt.addBtn, saving && styles.addButtonDisabled]}
            onPress={onAddTable}
            disabled={saving}
            activeOpacity={0.85}
          >
            <Text style={dt.addBtnText}>{saving ? "Adding..." : "+ Add Table"}</Text>
          </TouchableOpacity>
        </View>
        {newTable.table_size === "custom" && (
          <View style={dt.customRow}>
            <Text style={dt.label}>Custom Size</Text>
            <TextInput
              style={dt.input}
              value={newTable.custom_size}
              onChangeText={(text) => onUpdateNewTable("custom_size", text)}
              placeholder="e.g., 10ft x 5ft"
              placeholderTextColor={COLORS.textMuted}
            />
          </View>
        )}
      </View>

      {/* Current Tables — summary rows; Edit opens the existing TableCard editor inline. */}
      <View style={dt.listHead}>
        <Text style={dt.listTitle}>Current Tables</Text>
        <Text style={dt.listCount}>{tables.length}</Text>
      </View>

      {tables.length === 0 ? (
        <View style={dt.empty}>
          <Text style={dt.emptyText}>No tables added yet</Text>
          <Text style={dt.emptySub}>Add your pool tables to help players know what to expect.</Text>
        </View>
      ) : (
        <>
          <View style={dt.colHead}>
            <Text style={[dt.colLabel, dt.cName]}>TABLE</Text>
            <Text style={[dt.colLabel, dt.cSize]}>SIZE</Text>
            <Text style={[dt.colLabel, dt.cBrand]}>BRAND</Text>
            <Text style={[dt.colLabel, dt.cQty]}>QTY</Text>
            <View style={dt.cActions} />
          </View>
          {tables.map((tb, i) => {
            const editing = editingId === tb.id;
            return (
              <View key={tb.id} style={[dt.rowWrap, editing && dt.rowWrapEditing]}>
                <Pressable
                  onPress={() => setEditingId(editing ? null : tb.id)}
                  style={(state: any) => [dt.row, state.hovered && !editing && dt.rowHover]}
                  // No button role on the row: on web that renders a <button>, and the ⋮ menu
                  // (itself a <button>) must not nest inside one. Edit / ⋮ are the accessible controls.
                >
                  <Text style={[dt.value, dt.cName]} numberOfLines={1}>Table {i + 1}</Text>
                  <Text style={[dt.value, dt.cSize]} numberOfLines={1}>{sizeLabel(tb, tableSizeOptions)}</Text>
                  <Text style={[dt.value, dt.cBrand, !tb.brand && dt.valueDim]} numberOfLines={1}>{tb.brand || "—"}</Text>
                  <Text style={[dt.value, dt.cQty]}>{tb.quantity}</Text>
                  <View style={[dt.cActions, dt.actionsRow]}>
                    <TouchableOpacity
                      style={[dt.editBtn, editing && dt.editBtnOn]}
                      onPress={() => setEditingId(editing ? null : tb.id)}
                      activeOpacity={0.8}
                    >
                      <Text style={[dt.editText, editing && dt.editTextOn]}>{editing ? "Done" : "Edit"}</Text>
                    </TouchableOpacity>
                    <ActionMenu
                      compact
                      compactIcon="ellipsis-vertical"
                      accessibilityLabel={`Table ${i + 1} actions`}
                      items={[
                        { label: editing ? "Close Editor" : "Edit", onPress: () => setEditingId(editing ? null : tb.id) },
                        { label: "Remove", destructive: true, onPress: () => onDeleteTable(tb.id) },
                      ]}
                    />
                  </View>
                </Pressable>
                {editing ? (
                  <View style={dt.editor}>
                    <TableCard
                      table={tb}
                      index={i}
                      onUpdate={(updates) => onUpdateTable(tb.id, updates)}
                      onDelete={() => onDeleteTable(tb.id)}
                      disabled={saving}
                    />
                  </View>
                ) : null}
              </View>
            );
          })}
        </>
      )}
    </View>
  );
};

const StackedTables = ({
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

// Desktop layers: panel (surface #1F1F1F) › Add card inset (#111) with black inputs ›
// table rows on a lighter surface (#2A2A2A). Values white; labels brighter grey.
const dt = StyleSheet.create({
  container: { paddingHorizontal: SPACING.sm, paddingTop: SPACING.sm },
  addCard: {
    backgroundColor: COLORS.backgroundLight,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    padding: SPACING.md,
  },
  addTitle: { color: COLORS.text, fontSize: FONT_SIZES.md, fontWeight: "800", marginBottom: SPACING.sm },
  addRow: { flexDirection: "row", alignItems: "flex-end", gap: SPACING.md, flexWrap: "wrap" },
  addField: { flex: 1, minWidth: 160 },
  label: { color: COLORS.textSecondary, fontSize: FONT_SIZES.sm, fontWeight: "600", marginBottom: 6 },
  input: {
    backgroundColor: COLORS.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    maxWidth: 320,
  },
  customRow: { marginTop: SPACING.md },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  stepBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  stepText: { color: COLORS.primary, fontSize: FONT_SIZES.lg, fontWeight: "700" },
  qtyText: { color: COLORS.text, fontSize: FONT_SIZES.md, fontWeight: "700", minWidth: 28, textAlign: "center" },
  addBtn: { backgroundColor: COLORS.primary, borderRadius: 8, paddingVertical: 11, paddingHorizontal: SPACING.lg },
  addBtnText: { color: COLORS.white, fontSize: FONT_SIZES.sm, fontWeight: "700" },

  listHead: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, marginTop: SPACING.lg, marginBottom: SPACING.sm },
  listTitle: { color: COLORS.text, fontSize: FONT_SIZES.md, fontWeight: "800" },
  listCount: { color: COLORS.text, fontSize: FONT_SIZES.xs, fontWeight: "800", backgroundColor: COLORS.surfaceLight, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 1, overflow: "hidden" },

  colHead: { flexDirection: "row", alignItems: "center", paddingHorizontal: SPACING.md, paddingBottom: 6 },
  colLabel: { color: COLORS.textSecondary, fontSize: FONT_SIZES.xs, fontWeight: "700", letterSpacing: 0.8 },
  cName: { flex: 1.3 },
  cSize: { flex: 1 },
  cBrand: { flex: 1.3 },
  cQty: { width: 60 },
  cActions: { width: 120 },

  rowWrap: { backgroundColor: COLORS.surfaceLight, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, marginBottom: 6, overflow: "hidden" },
  rowWrapEditing: { borderColor: COLORS.primary + "99" },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: SPACING.md, paddingVertical: 10, borderWidth: 1, borderColor: "transparent", borderRadius: 10 },
  rowHover: { borderColor: COLORS.primary + "66" },
  value: { color: COLORS.text, fontSize: FONT_SIZES.md, fontWeight: "700" },
  valueDim: { color: COLORS.textMuted, fontWeight: "600" },
  actionsRow: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: SPACING.xs },
  editBtn: { borderWidth: 1, borderColor: COLORS.primary + "88", borderRadius: 6, paddingVertical: 5, paddingHorizontal: SPACING.md },
  editBtnOn: { backgroundColor: COLORS.primary },
  editText: { color: COLORS.primaryLight, fontSize: FONT_SIZES.sm, fontWeight: "700" },
  editTextOn: { color: COLORS.white },
  editor: { paddingHorizontal: SPACING.sm, paddingBottom: SPACING.sm },

  empty: { alignItems: "center", paddingVertical: SPACING.lg, borderWidth: 1, borderStyle: "dashed", borderColor: COLORS.borderLight, borderRadius: 10 },
  emptyText: { color: COLORS.text, fontSize: FONT_SIZES.md, fontWeight: "700" },
  emptySub: { color: COLORS.textSecondary, fontSize: FONT_SIZES.sm, marginTop: 4 },
});

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
