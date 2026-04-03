import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { GroupedDirector } from "../../../models/types/director.types";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { Platform } from "react-native";
import { moderateScale, scale } from "../../../utils/scaling";
const isWeb = Platform.OS === "web";
const wxMs = (v: number) => isWeb ? v : moderateScale(v);
const wxSc = (v: number) => isWeb ? v : scale(v);

interface DirectorCardProps {
  director: GroupedDirector;
  onPress?: () => void;
  onRemove?: () => void;
  onRestore?: () => void;
  onEditVenues?: () => void;
  isProcessing?: boolean;
  showActions?: boolean;
  canRemove?: boolean;
  canRestore?: boolean;
  canEditVenues?: boolean;
}

const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
};

const formatTimeAgo = (dateString: string): string => {
  const diffDays = Math.floor((Date.now() - new Date(dateString).getTime()) / 86400000);
  if (diffDays === 0) return "today";
  if (diffDays < 7) return `${diffDays}d`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo`;
  return `${Math.floor(diffDays / 365)}y`;
};

const MAX_VISIBLE = 4;

const VENUE_ROW_HEIGHT = wxSc(64);

const VenueRow = ({ a, isFullyArchived }: { a: any; isFullyArchived: boolean }) => (
  <View style={styles.venueRow}>
    <Text allowFontScaling={false} style={styles.venueIcon}>🏢</Text>
    <View style={styles.venueInfo}>
      <Text allowFontScaling={false} style={[styles.venueName, isFullyArchived && styles.textMuted]} numberOfLines={1}>
        {a.venue_name}
      </Text>
      <View style={styles.venueMeta}>
        <Text allowFontScaling={false} style={styles.venueMetaText}>
          📅 {formatDate(a.assigned_at)} ({formatTimeAgo(a.assigned_at)})
        </Text>
        <Text allowFontScaling={false} style={styles.venueMetaText}>
          🏆 {a.tournament_count} tournament{a.tournament_count !== 1 ? "s" : ""}
        </Text>
      </View>
    </View>
  </View>
);

const PAGE_SIZE = 5;

const VenueList = ({ assignments, isFullyArchived }: { assignments: any[]; isFullyArchived: boolean }) => {
  const [visibleCount, setVisibleCount] = useState(MAX_VISIBLE);
  if (!assignments || assignments.length === 0) return null;
  const visible = assignments.slice(0, visibleCount);
  const remaining = assignments.length - visibleCount;
  const canShowLess = visibleCount > MAX_VISIBLE;
  const showFooter = remaining > 0 || canShowLess;

  return (
    <View style={styles.venuesBox}>
      {visible.map((a) => (
        <VenueRow key={a.id} a={a} isFullyArchived={isFullyArchived} />
      ))}
      {showFooter && (
        <View style={styles.venueFooterRow}>
          {remaining > 0 && (
            <TouchableOpacity
              style={styles.viewMoreButton}
              onPress={(e) => { e.stopPropagation(); setVisibleCount((v) => v + PAGE_SIZE); }}
            >
              <Text allowFontScaling={false} style={styles.viewMoreText}>
                + View {Math.min(remaining, PAGE_SIZE)} more
                {remaining > PAGE_SIZE ? ` (${remaining} left)` : ""}
              </Text>
            </TouchableOpacity>
          )}
          {canShowLess && (
            <TouchableOpacity
              style={styles.viewLessButton}
              onPress={(e) => { e.stopPropagation(); setVisibleCount(MAX_VISIBLE); }}
            >
              <Text allowFontScaling={false} style={styles.viewLessText}>Show less</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
};

export const DirectorCard: React.FC<DirectorCardProps> = ({
  director,
  onPress,
  onRemove,
  onRestore,
  onEditVenues,
  isProcessing = false,
  showActions = true,
  canRemove = false,
  canRestore = false,
  canEditVenues = false,
}) => {
  const activeAssignments = director.assignments.filter((a) => a.status === "active");
  const isFullyArchived = director.active_venue_count === 0;

  return (
    <TouchableOpacity
      style={[styles.card, isFullyArchived && styles.cardArchived]}
      onPress={onPress}
      activeOpacity={0.8}
      disabled={isProcessing}
    >
      {/* ── Header: avatar + info + edit button ── */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text allowFontScaling={false} style={styles.avatarText}>
            {(director.profile.name || director.profile.user_name || "?").charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.directorInfo}>
          <Text allowFontScaling={false} style={[styles.directorName, isFullyArchived && styles.textMuted]}>
            {director.profile.name || director.profile.user_name}
          </Text>
          <Text allowFontScaling={false} style={styles.directorEmail}>{director.profile.email}</Text>
          <Text allowFontScaling={false} style={styles.directorId}>ID: {director.profile.id_auto}</Text>
        </View>
        {showActions && canEditVenues && onEditVenues && !isFullyArchived && (
          <TouchableOpacity
            style={styles.editVenuesButton}
            onPress={(e) => { e.stopPropagation(); onEditVenues(); }}
            disabled={isProcessing}
          >
            <Text allowFontScaling={false} style={styles.editVenuesButtonText}>Edit Venues</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Venue assignments ── */}
      <VenueList assignments={isFullyArchived ? director.assignments : activeAssignments} isFullyArchived={isFullyArchived} />

      {/* ── Action buttons ── */}
      {showActions && (
        <View style={styles.actionsRow}>
          {canRemove && !isFullyArchived && onRemove && (
            <TouchableOpacity
              style={styles.removeButton}
              onPress={(e) => { e.stopPropagation(); onRemove(); }}
              disabled={isProcessing}
            >
              <Text allowFontScaling={false} style={styles.removeButtonText}>
                {isProcessing ? "Removing..." : "Remove Director"}
              </Text>
            </TouchableOpacity>
          )}
          {canRestore && isFullyArchived && onRestore && (
            <TouchableOpacity
              style={styles.restoreButton}
              onPress={(e) => { e.stopPropagation(); onRestore(); }}
              disabled={isProcessing}
            >
              <Text allowFontScaling={false} style={styles.restoreButtonText}>
                {isProcessing ? "Restoring..." : "Restore Director"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: wxSc(12),
    padding: wxSc(SPACING.md),
    marginBottom: wxSc(SPACING.md),
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardArchived: { opacity: 0.65, borderColor: COLORS.textSecondary },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: wxSc(SPACING.sm),
  },
  avatar: {
    width: wxSc(48),
    height: wxSc(48),
    borderRadius: wxSc(24),
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
    marginRight: wxSc(SPACING.sm),
    flexShrink: 0,
  },
  avatarText: {
    fontSize: wxMs(FONT_SIZES.lg),
    fontWeight: "700",
    color: COLORS.white,
  },
  directorInfo: { flex: 1 },
  directorName: {
    fontSize: wxMs(FONT_SIZES.md),
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: wxSc(2),
  },
  directorEmail: {
    fontSize: wxMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    marginBottom: wxSc(2),
  },
  directorId: {
    fontSize: wxMs(FONT_SIZES.xs),
    color: COLORS.textMuted,
  },
  textMuted: { color: COLORS.textSecondary },
  editVenuesButton: {
    backgroundColor: COLORS.primary + "20",
    borderWidth: 1,
    borderColor: COLORS.primary + "60",
    borderRadius: wxSc(8),
    paddingHorizontal: wxSc(SPACING.sm),
    paddingVertical: wxSc(SPACING.xs),
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  editVenuesButtonText: {
    fontSize: wxMs(FONT_SIZES.xs),
    fontWeight: "600",
    color: COLORS.primary,
  },
  venuesBox: {
    backgroundColor: COLORS.background,
    borderRadius: wxSc(8),
    padding: wxSc(SPACING.sm),
    marginBottom: wxSc(SPACING.sm),
    gap: wxSc(SPACING.sm),
  },
  venueRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: wxSc(SPACING.xs),
  },
  venueIcon: { fontSize: wxMs(FONT_SIZES.md), marginTop: wxSc(1) },
  venueInfo: { flex: 1 },
  venueName: {
    fontSize: wxMs(FONT_SIZES.sm),
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: wxSc(2),
  },
  venueMeta: { gap: wxSc(2) },
  venueMetaText: {
    fontSize: wxMs(FONT_SIZES.xs),
    color: COLORS.textSecondary,
  },
  actionsRow: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: wxSc(SPACING.sm),
  },
  removeButton: {
    backgroundColor: "#ef4444",
    borderRadius: wxSc(8),
    paddingVertical: wxSc(SPACING.sm),
    alignItems: "center",
    justifyContent: "center",
  },
  removeButtonText: {
    fontSize: wxMs(FONT_SIZES.sm),
    fontWeight: "600",
    color: "#ffffff",
  },
  restoreButton: {
    backgroundColor: "#10b981",
    borderRadius: wxSc(8),
    paddingVertical: wxSc(SPACING.sm),
    alignItems: "center",
    justifyContent: "center",
  },
  restoreButtonText: {
    fontSize: wxMs(FONT_SIZES.sm),
    fontWeight: "600",
    color: "#ffffff",
  },
  venueFooterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: wxSc(SPACING.xs),
    gap: wxSc(SPACING.sm),
  },
  viewMoreButton: {
    flex: 1,
    paddingVertical: wxSc(SPACING.xs),
    paddingHorizontal: wxSc(SPACING.sm),
    backgroundColor: COLORS.primary + "15",
    borderRadius: wxSc(6),
    borderWidth: 1,
    borderColor: COLORS.primary + "40",
    alignItems: "center",
  },
  viewMoreText: {
    fontSize: wxMs(FONT_SIZES.xs),
    color: COLORS.primary,
    fontWeight: "600",
  },
  viewLessButton: {
    paddingVertical: wxSc(SPACING.xs),
    paddingHorizontal: wxSc(SPACING.sm),
    alignItems: "center",
  },
  viewLessText: {
    fontSize: wxMs(FONT_SIZES.xs),
    color: COLORS.textMuted,
    fontWeight: "500",
  },
});






