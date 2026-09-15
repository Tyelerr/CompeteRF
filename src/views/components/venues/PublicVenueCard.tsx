// src/views/components/venues/PublicVenueCard.tsx
// Read-only public venue card for the Billiards → Venues grid.
//   • Mobile: compact HORIZONTAL card (photo/initials left, info right) — list feel.
//   • Web:    VERTICAL card with a short cover image, for a 3–4 col grid.
// Shows only reliable existing data: name, city/state, equipment summary (batched,
// passed in), league/tournament badges, and a "Next Tournament" row (batched, passed
// in). No photo → a subtle charcoal panel with venue initials (never a huge empty
// 8-ball region). No fabricated content.

import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Image, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { moderateScale, scale } from "../../../utils/scaling";
import { Venue } from "../../../models/types/venue.types";
import { useGooglePlacePhoto } from "../../../viewmodels/hooks/use.google.place.photo";
import type { VenueNextTournament, VenueTableSummary } from "../../../viewmodels/useVenueDiscovery";

const isWeb = Platform.OS === "web";
const ms = (v: number) => (isWeb ? v : moderateScale(v));
const sc = (v: number) => (isWeb ? v : scale(v));

const webCardExtra: any = isWeb
  ? { cursor: "pointer", transition: "border-color 0.15s ease, box-shadow 0.15s ease" }
  : null;
const webCardHoverExtra: any = { boxShadow: `0 8px 24px 0 ${COLORS.primary}44` };

interface Props {
  venue: Venue;
  summary?: VenueTableSummary;
  next?: VenueNextTournament;
  onPress: () => void;
  cardWidth?: number;
}

const initialsOf = (name: string): string =>
  (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";

const tablesLine = (s?: VenueTableSummary): string | null => {
  if (!s || s.tableCount <= 0) return null;
  const sizes = s.sizes.slice(0, 3).join(", ");
  const noun = s.tableCount === 1 ? "table" : "tables";
  return sizes ? `${s.tableCount} ${noun} · ${sizes}` : `${s.tableCount} ${noun}`;
};

const shortDate = (d?: string | null): string => {
  if (!d) return "";
  const dt = new Date(`${d}T00:00:00`);
  return dt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
};

const fmtTime = (t?: string | null): string => {
  if (!t) return "";
  const [hStr, mStr] = t.split(":");
  let h = parseInt(hStr, 10);
  if (isNaN(h)) return "";
  const m = (mStr ?? "00").slice(0, 2);
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
};

export const PublicVenueCard = ({ venue, summary, next, onPress, cardWidth }: Props) => {
  const [hovered, setHovered] = useState(false);
  const tables = tablesLine(summary);

  // Image priority: Compete photo_url → Google Places photo (fallback) → initials.
  // Google is only requested when there's no Compete photo but a place id exists; the
  // hook caches per-session and returns null while loading (→ initials, no spinner).
  const google = useGooglePlacePhoto(venue.google_place_id, !venue.photo_url);
  const imageUrl = venue.photo_url ?? google.url ?? null;

  // Lowercase render helpers (plain function calls — NOT nested components).
  const renderPhoto = (style: any) =>
    imageUrl ? (
      <Image source={{ uri: imageUrl }} style={style} resizeMode="cover" />
    ) : (
      <View style={[style, styles.fallback]}>
        <Text allowFontScaling={false} style={styles.fallbackInitials}>{initialsOf(venue.venue)}</Text>
        <Text allowFontScaling={false} style={styles.fallbackDot}>{"🎱"}</Text>
      </View>
    );

  const renderNext = () => {
    if (!next) return null;
    const when = [shortDate(next.date), fmtTime(next.time)].filter(Boolean).join(" · ");
    return (
      <View style={styles.nextBlock}>
        <View style={styles.nextHeadRow}>
          <Ionicons name="trophy" size={ms(12)} color={COLORS.primary} />
          <Text allowFontScaling={false} style={styles.nextLabel}>Next Tournament</Text>
        </View>
        <Text allowFontScaling={false} style={styles.nextName} numberOfLines={1}>{next.name}</Text>
        {when ? <Text allowFontScaling={false} style={styles.nextWhen} numberOfLines={1}>{when}</Text> : null}
      </View>
    );
  };

  const renderBadges = () =>
    (venue.has_tournaments || venue.has_leagues) && !next ? (
      <View style={styles.badgeRow}>
        {venue.has_tournaments ? (
          <View style={styles.badge}><Text allowFontScaling={false} style={styles.badgeText}>Tournaments</Text></View>
        ) : null}
        {venue.has_leagues ? (
          <View style={[styles.badge, styles.badgeAlt]}><Text allowFontScaling={false} style={[styles.badgeText, styles.badgeTextAlt]}>Leagues</Text></View>
        ) : null}
      </View>
    ) : null;

  // ── Mobile: horizontal list card ─────────────────────────────────────────────
  if (!isWeb) {
    return (
      <TouchableOpacity
        style={[styles.hCard, cardWidth !== undefined ? { width: cardWidth } : undefined]}
        activeOpacity={0.7}
        onPress={onPress}
      >
        {renderPhoto(styles.hImage)}
        <View style={styles.hContent}>
          <Text allowFontScaling={false} style={styles.name} numberOfLines={2}>{venue.venue}</Text>
          <Text allowFontScaling={false} style={styles.cityState} numberOfLines={1}>{venue.city}, {venue.state}</Text>
          {tables ? <Text allowFontScaling={false} style={styles.meta} numberOfLines={1}>{tables}</Text> : null}
          {renderNext()}
          {renderBadges()}
        </View>
        <Ionicons name="chevron-forward" size={ms(18)} color={COLORS.textMuted} style={styles.chevron} />
      </TouchableOpacity>
    );
  }

  // ── Web: vertical grid card ──────────────────────────────────────────────────
  return (
    <TouchableOpacity
      style={[styles.vCard, webCardExtra, hovered && styles.vCardHover, hovered && webCardHoverExtra]}
      activeOpacity={0.85}
      onPress={onPress}
      // @ts-ignore web-only
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {renderPhoto(styles.vImage)}
      <View style={styles.vContent}>
        <Text allowFontScaling={false} style={styles.name} numberOfLines={2}>{venue.venue}</Text>
        <Text allowFontScaling={false} style={styles.cityState} numberOfLines={1}>{venue.city}, {venue.state}</Text>
        {tables ? <Text allowFontScaling={false} style={styles.meta} numberOfLines={1}>{tables}</Text> : null}
        {renderNext()}
        {renderBadges()}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  // Shared
  name: { fontSize: ms(FONT_SIZES.md), fontWeight: "800", color: COLORS.text },
  cityState: { fontSize: ms(FONT_SIZES.sm), color: COLORS.textSecondary, marginTop: 2 },
  meta: { fontSize: ms(FONT_SIZES.xs), color: COLORS.textMuted, marginTop: sc(SPACING.xs) },
  nextBlock: { marginTop: sc(SPACING.xs) },
  nextHeadRow: { flexDirection: "row", alignItems: "center", gap: sc(4) },
  nextLabel: { fontSize: ms(FONT_SIZES.xs - 1), fontWeight: "800", color: COLORS.primary, textTransform: "uppercase", letterSpacing: 0.4 },
  nextName: { fontSize: ms(FONT_SIZES.sm), fontWeight: "600", color: COLORS.text, marginTop: 1 },
  nextWhen: { fontSize: ms(FONT_SIZES.xs), color: COLORS.textSecondary, marginTop: 1 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: sc(SPACING.xs), marginTop: sc(SPACING.xs) },
  badge: { backgroundColor: COLORS.primary + "22", borderRadius: RADIUS.sm, paddingHorizontal: sc(SPACING.sm), paddingVertical: sc(2) },
  badgeAlt: { backgroundColor: COLORS.success + "22" },
  badgeText: { fontSize: ms(FONT_SIZES.xs - 1), fontWeight: "700", color: COLORS.primary },
  badgeTextAlt: { color: COLORS.success },
  fallback: { alignItems: "center", justifyContent: "center", backgroundColor: COLORS.background },
  fallbackInitials: { fontSize: ms(FONT_SIZES.lg), fontWeight: "800", color: COLORS.textSecondary, letterSpacing: 1 },
  fallbackDot: { fontSize: ms(FONT_SIZES.sm), marginTop: 2, opacity: 0.7 },

  // Mobile horizontal card
  hCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
    marginBottom: sc(SPACING.sm),
  },
  hImage: { width: sc(96), height: sc(96), backgroundColor: COLORS.background },
  hContent: { flex: 1, paddingVertical: sc(SPACING.sm), paddingHorizontal: sc(SPACING.md) },
  chevron: { marginRight: sc(SPACING.sm) },

  // Web vertical card (grid item — flex:1 shares the row width evenly)
  vCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
  },
  vCardHover: { borderColor: COLORS.primary },
  vImage: { width: "100%", height: 120, backgroundColor: COLORS.background },
  vContent: { padding: SPACING.sm },
});

export default PublicVenueCard;
