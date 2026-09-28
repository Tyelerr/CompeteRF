// src/views/components/venues/VenueManagementRow.tsx
// WEB-only Venue Management list row: a wide, short card that uses desktop width —
//   [ name · status / address / city · ID ]   [ Active Events · Directors · Views ]   [ Manage ▾ / Reassign Owner ]
// Below ROW_MIN_WIDTH it stacks (info → stats → actions). Presentation only: every action is a
// callback supplied by the screen (the same routes/handlers the mobile card uses). Native keeps
// BarOwnerVenueCard.

import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { ActionMenu, ActionMenuItem } from "../admin/ActionMenu";

// Viewport width at which info / stats / actions sit side by side.
const ROW_MIN_WIDTH = 760;

interface VenueManagementRowProps {
  venue: {
    id: number;
    venue: string;
    address: string;
    city: string;
    state: string;
    zip_code: string;
    status: string;
    activeTournaments: number;
    totalDirectors: number;
    totalViews: number;
  };
  onOpenDetails: () => void;
  onManageTables: () => void;
  onManageDirectors: () => void;
  onReassignOwner?: () => void; // admins only — omitted = hidden
}

const statusColor = (status: string): string => {
  switch (status) {
    case "active":
      return COLORS.success;
    case "pending":
      return COLORS.warning;
    default:
      return COLORS.textSecondary;
  }
};

export const VenueManagementRow = ({
  venue,
  onOpenDetails,
  onManageTables,
  onManageDirectors,
  onReassignOwner,
}: VenueManagementRowProps) => {
  const { width } = useWindowDimensions();
  const wide = width >= ROW_MIN_WIDTH;
  const sc = statusColor(venue.status);

  const actions: ActionMenuItem[] = [
    { label: "Details", onPress: onOpenDetails },
    { label: "Manage Tables", onPress: onManageTables },
    { label: "Manage Directors", onPress: onManageDirectors },
  ];

  const stats: { value: number; one: string; many: string }[] = [
    { value: venue.activeTournaments, one: "Active Event", many: "Active Events" },
    { value: venue.totalDirectors, one: "Director", many: "Directors" },
    { value: venue.totalViews, one: "View", many: "Views" },
  ];

  return (
    <TouchableOpacity
      style={[styles.card, wide && styles.cardWide]}
      onPress={onOpenDetails}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`Open ${venue.venue}`}
    >
      <View style={[styles.info, wide && styles.infoWide]}>
        <View style={styles.titleRow}>
          <Text style={styles.name} numberOfLines={1}>
            {venue.venue}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: sc + "20" }]}>
            <Text style={[styles.statusText, { color: sc }]}>{venue.status}</Text>
          </View>
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          {venue.address}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {venue.city}, {venue.state} {venue.zip_code}
        </Text>
        <Text style={styles.idText}>ID {venue.id}</Text>
      </View>

      <View style={[styles.stats, wide && styles.statsWide]}>
        {stats.map((s, i) => (
          <View key={s.many} style={[styles.stat, i > 0 && styles.statDivided]}>
            <Text style={styles.statValue}>{s.value}</Text>
            <Text style={styles.statLabel} numberOfLines={1}>
              {s.value === 1 ? s.one : s.many}
            </Text>
          </View>
        ))}
      </View>

      <View style={[styles.actions, wide && styles.actionsWide]}>
        <ActionMenu items={actions} />
        {onReassignOwner ? (
          <TouchableOpacity style={styles.reassignBtn} onPress={onReassignOwner} activeOpacity={0.7}>
            <Text style={styles.reassignText}>Reassign Owner</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    width: "100%" as any,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    gap: SPACING.md,
  },
  cardWide: { flexDirection: "row", alignItems: "center", gap: SPACING.lg },

  info: { minWidth: 0 },
  infoWide: { flex: 1 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, marginBottom: 2 },
  name: { flexShrink: 1, fontSize: FONT_SIZES.md, fontWeight: "700", color: COLORS.text },
  statusBadge: { paddingHorizontal: SPACING.sm, paddingVertical: 2, borderRadius: RADIUS.full },
  statusText: { fontSize: FONT_SIZES.xs, fontWeight: "600", textTransform: "capitalize" },
  meta: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary },
  idText: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 2 },

  stats: {
    flexDirection: "row",
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.xs,
  },
  statsWide: { width: 300 },
  stat: { flex: 1, alignItems: "center", paddingHorizontal: SPACING.xs },
  statDivided: { borderLeftWidth: 1, borderLeftColor: COLORS.border },
  statValue: { fontSize: FONT_SIZES.lg, fontWeight: "700", color: COLORS.primary },
  statLabel: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary },

  actions: { gap: SPACING.xs },
  actionsWide: { width: 150 },
  reassignBtn: {
    borderWidth: 1,
    borderColor: COLORS.warning + "99",
    backgroundColor: COLORS.warning + "14",
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.xs + 2,
    alignItems: "center",
  },
  reassignText: { color: COLORS.warning, fontSize: FONT_SIZES.xs, fontWeight: "600" },
});
