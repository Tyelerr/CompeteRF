import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { Platform } from "react-native";
import { moderateScale, scale } from "../../../utils/scaling";
import { ActionMenu, ActionMenuItem } from "../admin/ActionMenu";
const isWeb = Platform.OS === "web";
const wxMs = (v: number) => isWeb ? v : moderateScale(v);
const wxSc = (v: number) => isWeb ? v : scale(v);

export interface TournamentCardData {
  id: number; name: string; game_type: string; tournament_format: string;
  tournament_date: string; start_time: string; status: string;
  venue_name: string; director_name: string; views_count: number;
  favorites_count: number; thumbnail?: string; can_edit: boolean;
  can_delete: boolean; cancelled_at?: string; cancelled_by_name?: string;
  cancellation_reason?: string; archived_at?: string; archived_by_name?: string;
}

interface TournamentCardProps {
  tournament: TournamentCardData;
  onPress: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onArchive?: () => void;
  onCancel?: () => void;
  onRestore?: () => void;
  onReassign?: () => void;
  isProcessing?: boolean;
  showActions?: boolean;
}

const formatDate = (dateString: string): string => { const [y,m,d] = dateString.split("-").map(Number); return new Date(y,m-1,d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); };

const formatTime = (timeString: string): string => {
  if (!timeString) return "";
  const [hours, minutes] = timeString.split(":");
  const hour = parseInt(hours, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutes} ${ampm}`;
};

const formatDateTime = (dateString: string | null): string => {
  if (!dateString) return "";
  return new Date(dateString).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
};

const getStatusColor = (status: string): string => {
  switch (status) {
    case "active": return COLORS.success;
    case "completed": return COLORS.primary;
    case "cancelled": return COLORS.error;
    case "archived": return COLORS.textSecondary;
    default: return COLORS.textSecondary;
  }
};

export const TournamentCard = ({ tournament, onPress, onEdit, onArchive, onCancel, onRestore, onReassign, isProcessing = false, showActions = true }: TournamentCardProps) => {
  const statusColor = getStatusColor(tournament.status);
  const isArchived = tournament.status === "archived";
  const isCancelled = tournament.status === "cancelled";
  const isActive = tournament.status === "active";
  const isCompleted = tournament.status === "completed";

  const actions: ActionMenuItem[] = [];
  if (showActions) {
    if (tournament.can_edit && onEdit) actions.push({ label: "Edit", onPress: onEdit });
    if (onReassign) actions.push({ label: "Reassign Director", onPress: onReassign });
    if (tournament.can_delete) {
      if (isActive && onCancel) actions.push({ label: "Delete", destructive: true, onPress: onCancel });
      if ((isActive || isCompleted) && onArchive) actions.push({ label: "Archive", onPress: onArchive });
      if ((isCancelled || isArchived) && onRestore) actions.push({ label: "Restore", onPress: onRestore });
    }
  }

  return (
    <TouchableOpacity style={[styles.card, isArchived && styles.cardArchived]} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.cardHeader}>
        <Text allowFontScaling={false} style={[styles.tournamentName, isArchived && styles.textArchived]} numberOfLines={1}>{tournament.name}</Text>
        <View style={styles.headerRight}>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + "20" }]}>
            <Text allowFontScaling={false} style={[styles.statusText, { color: statusColor }]}>{tournament.status}</Text>
          </View>
          <View style={styles.idBadge}>
            <Text allowFontScaling={false} style={styles.idText}>ID: {tournament.id}</Text>
          </View>
        </View>
      </View>

      <Text allowFontScaling={false} style={[styles.gameType, isArchived && styles.textArchived]}>
        {tournament.game_type} • {tournament.tournament_format.replace("_", " ")}
      </Text>

      <View style={styles.infoRow}>
        <Text allowFontScaling={false} style={styles.infoIcon}>📅</Text>
        <Text allowFontScaling={false} style={[styles.infoText, isArchived && styles.textArchived]}>
          {formatDate(tournament.tournament_date)}{tournament.start_time && ` at ${formatTime(tournament.start_time)}`}
        </Text>
      </View>
      <View style={styles.infoRow}>
        <Text allowFontScaling={false} style={styles.infoIcon}>📍</Text>
        <Text allowFontScaling={false} style={[styles.infoText, isArchived && styles.textArchived]} numberOfLines={1}>{tournament.venue_name}</Text>
      </View>
      <View style={styles.infoRow}>
        <Text allowFontScaling={false} style={styles.infoIcon}>👤</Text>
        <Text allowFontScaling={false} style={[styles.infoText, isArchived && styles.textArchived]}>TD: {tournament.director_name}</Text>
      </View>

      {isCancelled && tournament.cancelled_at && (
        <View style={styles.statusInfoBox}>
          <Text allowFontScaling={false} style={styles.statusInfoTitle}>❌ Cancelled</Text>
          <Text allowFontScaling={false} style={styles.statusInfoText}>By: {tournament.cancelled_by_name || "Unknown"}</Text>
          <Text allowFontScaling={false} style={styles.statusInfoText}>On: {formatDateTime(tournament.cancelled_at)}</Text>
          {tournament.cancellation_reason && <Text allowFontScaling={false} style={styles.statusInfoReason}>Reason: {tournament.cancellation_reason}</Text>}
        </View>
      )}

      {isArchived && tournament.archived_at && (
        <View style={[styles.statusInfoBox, styles.statusInfoBoxArchived]}>
          <Text allowFontScaling={false} style={styles.statusInfoTitle}>📦 Archived</Text>
          <Text allowFontScaling={false} style={styles.statusInfoText}>By: {tournament.archived_by_name || "Unknown"}</Text>
          <Text allowFontScaling={false} style={styles.statusInfoText}>On: {formatDateTime(tournament.archived_at)}</Text>
        </View>
      )}

      <View style={styles.bottomRow}>
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text allowFontScaling={false} style={[styles.statValue, isArchived && styles.textArchived]}>{tournament.views_count}</Text>
            <Text allowFontScaling={false} style={styles.statLabel}>Views</Text>
          </View>
          <View style={styles.stat}>
            <Text allowFontScaling={false} style={[styles.statValue, isArchived && styles.textArchived]}>{tournament.favorites_count}</Text>
            <Text allowFontScaling={false} style={styles.statLabel}>Favorites</Text>
          </View>
        </View>
        {actions.length > 0 && <ActionMenu items={actions} disabled={isProcessing} />}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: { backgroundColor: COLORS.surface, borderRadius: wxSc(12), padding: wxSc(SPACING.md), marginBottom: wxSc(SPACING.md), borderWidth: 1, borderColor: COLORS.border },
  cardArchived: { opacity: 0.7, borderColor: COLORS.textSecondary },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: wxSc(SPACING.xs) },
  headerRight: { alignItems: "flex-end", flexDirection: "column", gap: wxSc(SPACING.xs) },
  tournamentName: { fontSize: wxMs(FONT_SIZES.md), fontWeight: "700", color: COLORS.text, flex: 1, marginRight: wxSc(SPACING.sm) },
  textArchived: { color: COLORS.textSecondary },
  statusBadge: { paddingHorizontal: wxSc(SPACING.sm), paddingVertical: 2, borderRadius: wxSc(12) },
  statusText: { fontSize: wxMs(FONT_SIZES.xs), fontWeight: "600", textTransform: "capitalize" },
  idBadge: { backgroundColor: "#000000", paddingHorizontal: wxSc(SPACING.sm), paddingVertical: 4, borderRadius: wxSc(12) },
  idText: { fontSize: wxMs(FONT_SIZES.xs), fontWeight: "600", color: COLORS.white },
  gameType: { fontSize: wxMs(FONT_SIZES.sm), color: COLORS.primary, marginBottom: wxSc(SPACING.sm), textTransform: "capitalize" },
  infoRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  infoIcon: { fontSize: wxMs(FONT_SIZES.sm), marginRight: wxSc(SPACING.xs), width: wxSc(20) },
  infoText: { fontSize: wxMs(FONT_SIZES.sm), color: COLORS.textSecondary, flex: 1 },
  statusInfoBox: { backgroundColor: COLORS.background, borderRadius: wxSc(8), padding: wxSc(SPACING.sm), marginTop: wxSc(SPACING.sm), borderLeftWidth: 3, borderLeftColor: COLORS.error },
  statusInfoBoxArchived: { borderLeftColor: COLORS.textSecondary },
  statusInfoTitle: { fontSize: wxMs(FONT_SIZES.sm), fontWeight: "600", color: COLORS.text, marginBottom: 4 },
  statusInfoText: { fontSize: wxMs(FONT_SIZES.xs), color: COLORS.textSecondary },
  statusInfoReason: { fontSize: wxMs(FONT_SIZES.xs), color: COLORS.text, marginTop: 4, fontStyle: "italic" },
  bottomRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: wxSc(SPACING.sm), paddingTop: wxSc(SPACING.sm), borderTopWidth: 1, borderTopColor: COLORS.border },
  statsRow: { flexDirection: "row", gap: wxSc(SPACING.lg) },
  stat: { alignItems: "center" },
  statValue: { fontSize: wxMs(FONT_SIZES.lg), fontWeight: "700", color: COLORS.text },
  statLabel: { fontSize: wxMs(FONT_SIZES.xs), color: COLORS.textSecondary },
});



