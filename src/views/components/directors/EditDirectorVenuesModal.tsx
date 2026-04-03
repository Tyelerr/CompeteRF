import React, { useEffect, useState } from "react";
import {
  Keyboard, Modal, Platform, Pressable, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { GroupedDirector, VenueOption } from "../../../models/types/director.types";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { moderateScale, scale } from "../../../utils/scaling";
const isWeb = Platform.OS === "web";
const ms = (v: number) => isWeb ? v : moderateScale(v);
const sc = (v: number) => isWeb ? v : scale(v);

interface EditDirectorVenuesModalProps {
  visible: boolean;
  director: GroupedDirector | null;
  allVenues: VenueOption[];
  onSave: (selectedVenueIds: number[]) => void;
  onCancel: () => void;
  isProcessing?: boolean;
}

const VENUE_ROW_HEIGHT = sc(56);
const VISIBLE_ROWS = 5;

export const EditDirectorVenuesModal: React.FC<EditDirectorVenuesModalProps> = ({
  visible, director, allVenues, onSave, onCancel, isProcessing = false,
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (director) {
      setSelectedIds(
        new Set(director.assignments.filter((a) => a.status === "active").map((a) => a.venue_id))
      );
      setSearch("");
    }
  }, [director]);

  const filteredVenues = allVenues.filter((v) =>
    search.trim() === "" || v.label.toLowerCase().includes(search.toLowerCase())
  );

  const toggleVenue = (venueId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(venueId) ? next.delete(venueId) : next.add(venueId);
      return next;
    });
  };

  if (!director) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
      <Pressable style={styles.overlay} onPress={onCancel}>
        <Pressable style={styles.modal} onPress={() => { if (!isWeb) Keyboard.dismiss(); }}>

          {/* Header */}
          <Pressable onPress={() => { if (!isWeb) Keyboard.dismiss(); }} style={styles.header}>
            <View style={{ width: sc(32) }} />
            <Text allowFontScaling={false} style={styles.headerTitle}>Edit Venues</Text>
            <TouchableOpacity onPress={onCancel} style={styles.closeButton} disabled={isProcessing}>
              <Text allowFontScaling={false} style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </Pressable>
          <View style={styles.divider} />

          {/* Director chip */}
          <Pressable onPress={() => { if (!isWeb) Keyboard.dismiss(); }} style={styles.directorChip}>
            <Text allowFontScaling={false} style={styles.directorChipName}>
              {director.profile.name || director.profile.user_name}
            </Text>
            <Text allowFontScaling={false} style={styles.directorChipEmail}>{director.profile.email}</Text>
          </Pressable>

          {/* Search */}
          <View style={styles.searchWrap}>
            <Text allowFontScaling={false} style={styles.searchIcon}>🔍</Text>
            <TextInput
              allowFontScaling={false}
              style={styles.searchInput}
              placeholder="Search venues..."
              placeholderTextColor={COLORS.textMuted}
              value={search}
              onChangeText={setSearch}
              returnKeyType="search"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text allowFontScaling={false} style={styles.searchClear}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Venue list — fixed height shows ~5 rows */}
          <ScrollView
            style={{ maxHeight: VENUE_ROW_HEIGHT * VISIBLE_ROWS }}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            onScrollBeginDrag={Keyboard.dismiss}
            nestedScrollEnabled
          >
            {filteredVenues.length === 0 ? (
              <View style={styles.emptyRow}>
                <Text allowFontScaling={false} style={styles.emptyText}>No venues match your search</Text>
              </View>
            ) : (
              filteredVenues.map((venue) => {
                const isChecked = selectedIds.has(venue.id);
                return (
                  <TouchableOpacity
                    key={venue.id}
                    style={[styles.venueRow, isChecked && styles.venueRowActive]}
                    onPress={() => toggleVenue(venue.id)}
                    disabled={isProcessing}
                  >
                    <View style={[styles.checkbox, isChecked && styles.checkboxChecked]}>
                      {isChecked && <Text allowFontScaling={false} style={styles.checkmark}>✓</Text>}
                    </View>
                    <Text
                      allowFontScaling={false}
                      style={[styles.venueLabel, isChecked && styles.venueLabelActive]}
                      numberOfLines={1}
                    >
                      🏢 {venue.label}
                    </Text>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>

          <View style={styles.divider} />

          {/* Footer — Save left, Cancel right */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.saveButton, (isProcessing || selectedIds.size === 0) && styles.buttonDisabled]}
              onPress={() => onSave(Array.from(selectedIds))}
              disabled={isProcessing || selectedIds.size === 0}
            >
              <Text allowFontScaling={false} style={styles.saveButtonText}>
                {isProcessing ? "Saving..." : `Save (${selectedIds.size})`}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelButton} onPress={onCancel} disabled={isProcessing}>
              <Text allowFontScaling={false} style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>

        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: sc(SPACING.lg),
  },
  modal: {
    backgroundColor: COLORS.surface,
    borderRadius: sc(20),
    width: "100%",
    maxWidth: 480,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: sc(SPACING.lg),
    paddingTop: sc(SPACING.lg),
    paddingBottom: sc(SPACING.md),
  },
  headerTitle: {
    fontSize: ms(FONT_SIZES.lg),
    fontWeight: "700",
    color: COLORS.text,
  },
  closeButton: {
    width: sc(32),
    height: sc(32),
    alignItems: "center",
    justifyContent: "center",
  },
  closeButtonText: {
    fontSize: ms(FONT_SIZES.lg),
    color: COLORS.textSecondary,
  },
  divider: { height: 1, backgroundColor: COLORS.border },
  directorChip: {
    margin: sc(SPACING.md),
    marginBottom: sc(SPACING.sm),
    backgroundColor: COLORS.primary + "15",
    borderRadius: sc(10),
    padding: sc(SPACING.md),
    borderWidth: 1,
    borderColor: COLORS.primary + "40",
  },
  directorChipName: {
    fontSize: ms(FONT_SIZES.md),
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: sc(2),
  },
  directorChipEmail: {
    fontSize: ms(FONT_SIZES.sm),
    color: COLORS.textSecondary,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.background,
    borderRadius: sc(10),
    borderWidth: 1,
    borderColor: COLORS.border,
    marginHorizontal: sc(SPACING.md),
    marginBottom: sc(SPACING.sm),
    paddingHorizontal: sc(SPACING.sm),
    height: sc(40),
    gap: sc(SPACING.xs),
  },
  searchIcon: { fontSize: ms(FONT_SIZES.sm) },
  searchInput: { flex: 1, fontSize: ms(FONT_SIZES.sm), color: COLORS.text, height: sc(40), outlineWidth: 0, outlineStyle: "none" } as any,
  searchClear: {
    fontSize: ms(FONT_SIZES.sm),
    color: COLORS.textMuted,
    paddingLeft: sc(SPACING.xs),
  },
  listContent: {
    paddingHorizontal: sc(SPACING.md),
    paddingVertical: sc(SPACING.xs),
    gap: sc(SPACING.xs),
  },
  venueRow: {
    flexDirection: "row",
    alignItems: "center",
    height: VENUE_ROW_HEIGHT,
    paddingHorizontal: sc(SPACING.md),
    borderRadius: sc(10),
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    gap: sc(SPACING.md),
  },
  venueRowActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + "10",
  },
  checkbox: {
    width: sc(24),
    height: sc(24),
    borderRadius: sc(6),
    borderWidth: 2,
    borderColor: COLORS.textMuted,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  checkboxChecked: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  checkmark: {
    fontSize: ms(FONT_SIZES.sm),
    color: COLORS.white,
    fontWeight: "700",
  },
  venueLabel: {
    flex: 1,
    fontSize: ms(FONT_SIZES.sm),
    color: COLORS.textSecondary,
  },
  venueLabelActive: { color: COLORS.text, fontWeight: "600" },
  emptyRow: {
    height: VENUE_ROW_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: ms(FONT_SIZES.sm),
    color: COLORS.textMuted,
    fontStyle: "italic",
  },
  footer: {
    flexDirection: "row",
    gap: sc(SPACING.sm),
    padding: sc(SPACING.md),
  },
  saveButton: {
    flex: 2,
    paddingVertical: sc(SPACING.md),
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonText: {
    fontSize: ms(FONT_SIZES.md),
    fontWeight: "700",
    color: COLORS.white,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: sc(SPACING.md),
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButtonText: {
    fontSize: ms(FONT_SIZES.md),
    fontWeight: "600",
    color: COLORS.text,
  },
  buttonDisabled: { opacity: 0.45 },
});

