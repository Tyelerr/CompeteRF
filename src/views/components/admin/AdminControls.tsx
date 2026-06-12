// src/views/components/admin/AdminControls.tsx
// Shared chrome for the admin "manager" pages so they all match the Tournament
// Analytics look: a centered header (back · title · subtitle), a search bar with
// icon + clear, and a filter row that lays out dropdowns evenly.

import { ReactNode, Children } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../../theme/colors";
import { SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { webMs, webSc } from "../../../utils/scaling";

const isWeb = Platform.OS === "web";

// ── Header ────────────────────────────────────────────────────────────────────
export const AdminHeader = ({
  title,
  subtitle,
  onBack,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
}) => (
  <View style={[styles.header, isWeb && styles.headerWeb]}>
    <TouchableOpacity
      onPress={onBack}
      style={[styles.backBtn, isWeb && styles.backBtnWeb]}
    >
      <Text allowFontScaling={false} style={styles.backText}>
        {"←"} Back
      </Text>
    </TouchableOpacity>
    <Text allowFontScaling={false} style={styles.headerTitle} numberOfLines={1}>
      {title}
    </Text>
    {subtitle ? (
      <Text allowFontScaling={false} style={styles.headerSubtitle}>
        {subtitle}
      </Text>
    ) : null}
  </View>
);

// ── Search bar ────────────────────────────────────────────────────────────────
export const AdminSearchBar = ({
  value,
  onChangeText,
  placeholder = "Search...",
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
}) => (
  <View style={styles.searchWrap}>
    <Text allowFontScaling={false} style={styles.searchIcon}>
      {"🔍"}
    </Text>
    <TextInput
      allowFontScaling={false}
      style={styles.searchInput}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={COLORS.textMuted}
    />
    {value.length > 0 && (
      <TouchableOpacity onPress={() => onChangeText("")}>
        <Text allowFontScaling={false} style={styles.searchClear}>
          {"✕"}
        </Text>
      </TouchableOpacity>
    )}
  </View>
);

// ── Filter row ────────────────────────────────────────────────────────────────
// Lays out its children (typically <Dropdown>s) evenly across one row.
export const AdminFilterRow = ({ children }: { children: ReactNode }) => (
  <View style={styles.filterRow}>
    {Children.map(children, (child) =>
      child ? <View style={styles.filterCol}>{child}</View> : null,
    )}
  </View>
);

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xl + SPACING.lg,
    paddingBottom: SPACING.md,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerWeb: { paddingTop: SPACING.lg },
  backBtn: {
    position: "absolute",
    left: SPACING.md,
    top: SPACING.xl + SPACING.lg,
    zIndex: 1,
  },
  backBtnWeb: { top: SPACING.lg },
  backText: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.primary,
    fontWeight: "600",
  },
  headerTitle: {
    fontSize: webMs(FONT_SIZES.lg),
    fontWeight: "700",
    color: COLORS.text,
    letterSpacing: 1,
    textAlign: "center",
    paddingHorizontal: webSc(56),
  },
  headerSubtitle: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  // Search
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderRadius: webSc(8),
    borderWidth: 1,
    borderColor: COLORS.border,
    height: webSc(40),
  },
  searchIcon: { fontSize: webMs(14), marginRight: SPACING.sm, opacity: 0.6 },
  searchInput: { flex: 1, fontSize: webMs(FONT_SIZES.sm), color: COLORS.text },
  searchClear: {
    fontSize: webMs(FONT_SIZES.md),
    color: COLORS.textMuted,
    paddingHorizontal: SPACING.xs,
  },
  // Filter row
  filterRow: {
    flexDirection: "row",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    zIndex: 10,
  },
  filterCol: { flex: 1 },
});
