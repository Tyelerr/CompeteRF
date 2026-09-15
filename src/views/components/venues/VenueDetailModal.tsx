// src/views/components/venues/VenueDetailModal.tsx
// Read-only public venue detail (Phase 1). Opened from a venue card. Shows ONLY
// existing data: name, address, phone, website, photo, equipment inventory
// (venue_tables), program flags, and upcoming tournaments (the authoritative
// tournaments.venue_id relationship via tournamentService.getTournamentsByVenue —
// one query per open, no N+1). No marketing fields, reviews, follows, or streams.

import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { moderateScale, scale } from "../../../utils/scaling";
import { tournamentService } from "../../../models/services/tournament.service";
import { venueTableService, VenueTableRecord } from "../../../models/services/venue-table.service";
import { Tournament } from "../../../models/types/tournament.types";
import { Venue } from "../../../models/types/venue.types";
import { useGooglePlacePhoto } from "../../../viewmodels/hooks/use.google.place.photo";

const isWeb = Platform.OS === "web";
const ms = (v: number) => (isWeb ? v : moderateScale(v));
const sc = (v: number) => (isWeb ? v : scale(v));

interface Props {
  venue: Venue | null; // seed for instant header render
  visible: boolean;
  onClose: () => void;
}

const fmtDate = (d?: string | null) => {
  if (!d) return "";
  const dt = new Date(`${d}T00:00:00`);
  return dt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
};
const fmtMoney = (n?: number | null) => `$${Number(n || 0)}`;
const fmtSize = (t: VenueTableRecord) => t.custom_size || t.table_size;
const initialsOf = (name: string): string =>
  (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";

// Google Places html_attributions look like `<a href="URL">Name</a>`. Extract the
// name (required attribution) and the link, if present.
const parseAttribution = (html: string): { name: string; href: string | null } => {
  const href = html.match(/href="([^"]+)"/)?.[1] ?? null;
  const name = html.replace(/<[^>]+>/g, "").trim() || "Google user";
  return { name, href };
};

export const VenueDetailModal = ({ venue, visible, onClose }: Props) => {
  const [tables, setTables] = useState<VenueTableRecord[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(false);
  // Same image priority as the card; reuses the session cache so a photo already
  // resolved for the card is NOT fetched again here.
  const google = useGooglePlacePhoto(venue?.google_place_id, !venue?.photo_url);

  useEffect(() => {
    if (!visible || !venue) return;
    let cancelled = false;
    // On-open fetch reset; results are set after await (data-fetch effect pattern).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setTables([]);
    setTournaments([]);
    Promise.all([
      venueTableService.getTablesForVenue(venue.id).catch(() => []),
      tournamentService.getTournamentsByVenue(venue.id).catch(() => []),
    ]).then(([t, tours]) => {
      if (cancelled) return;
      setTables(t);
      setTournaments(tours);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [visible, venue]);

  if (!venue) return null;

  const heroUrl = venue.photo_url ?? google.url ?? null;
  // Attribution is REQUIRED for Google Places photos — shown only when the Google photo
  // is actually the source (not for a Compete photo_url).
  const attribution =
    !venue.photo_url && google.url && google.attribution
      ? parseAttribution(google.attribution)
      : null;

  const openLink = (url: string) => Linking.openURL(url).catch(() => {});
  const openDirections = () => {
    const q =
      venue.latitude != null && venue.longitude != null
        ? `${venue.latitude},${venue.longitude}`
        : encodeURIComponent(`${venue.address}, ${venue.city}, ${venue.state} ${venue.zip_code}`);
    openLink(`https://www.google.com/maps/search/?api=1&query=${q}`);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.card}>
          {/* Hero: cover photo (or branded initials fallback) with the name/location
              overlaid and a close button. */}
          <View style={styles.hero}>
            {heroUrl ? (
              <Image source={{ uri: heroUrl }} style={StyleSheet.absoluteFill as any} resizeMode="cover" />
            ) : (
              <View style={[StyleSheet.absoluteFill as any, styles.heroFallback]}>
                <Text allowFontScaling={false} style={styles.heroInitials}>{initialsOf(venue.venue)}</Text>
              </View>
            )}
            <View style={styles.heroScrim} />
            <TouchableOpacity style={styles.heroClose} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={ms(20)} color={COLORS.white} />
            </TouchableOpacity>
            <View style={styles.heroText}>
              <Text allowFontScaling={false} style={styles.heroTitle} numberOfLines={2}>{venue.venue}</Text>
              <Text allowFontScaling={false} style={styles.heroSub} numberOfLines={1}>{venue.city}, {venue.state}</Text>
            </View>
            {attribution ? (
              <TouchableOpacity
                style={styles.attribution}
                disabled={!attribution.href}
                onPress={() => attribution.href && openLink(attribution.href)}
              >
                <Text allowFontScaling={false} style={styles.attributionText} numberOfLines={1}>
                  Photo: {attribution.name}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: sc(SPACING.lg) }}>
            {/* Quick actions — all from existing data (no new fields). */}
            <View style={styles.actions}>
              <ActionBtn icon="navigate-outline" label="Directions" onPress={openDirections} />
              {venue.phone ? <ActionBtn icon="call-outline" label="Call" onPress={() => openLink(`tel:${venue.phone}`)} /> : null}
              {venue.website ? <ActionBtn icon="globe-outline" label="Website" onPress={() => openLink(venue.website as string)} /> : null}
            </View>

            {/* Address */}
            <View style={styles.section}>
              <Row icon="location-outline" text={`${venue.address}, ${venue.city}, ${venue.state} ${venue.zip_code}`} />
            </View>

            {/* Program flags */}
            {(venue.has_tournaments || venue.has_leagues) && (
              <View style={styles.badgeRow}>
                {venue.has_tournaments ? <Badge label="Hosts Tournaments" /> : null}
                {venue.has_leagues ? <Badge label="Hosts Leagues" alt /> : null}
              </View>
            )}

            {/* Equipment */}
            <Text allowFontScaling={false} style={styles.sectionTitle}>Tables</Text>
            {loading ? (
              <ActivityIndicator color={COLORS.primary} style={{ marginVertical: sc(SPACING.sm) }} />
            ) : tables.length === 0 ? (
              <Text allowFontScaling={false} style={styles.empty}>No table information yet.</Text>
            ) : (
              tables.map((t) => (
                <View key={t.id} style={styles.listRow}>
                  <Text allowFontScaling={false} style={styles.listText}>
                    {t.quantity > 1 ? `${t.quantity} × ` : ""}{fmtSize(t)}{t.brand ? ` ${t.brand}` : ""}
                  </Text>
                </View>
              ))
            )}

            {/* Upcoming tournaments */}
            <Text allowFontScaling={false} style={styles.sectionTitle}>Upcoming Tournaments</Text>
            {loading ? (
              <ActivityIndicator color={COLORS.primary} style={{ marginVertical: sc(SPACING.sm) }} />
            ) : tournaments.length === 0 ? (
              <Text allowFontScaling={false} style={styles.empty}>No upcoming tournaments.</Text>
            ) : (
              tournaments.map((t) => (
                <View key={t.id} style={styles.listRow}>
                  <View style={{ flex: 1 }}>
                    <Text allowFontScaling={false} style={styles.listText} numberOfLines={1}>{t.name}</Text>
                    <Text allowFontScaling={false} style={styles.listMeta}>{fmtDate(t.tournament_date)}</Text>
                  </View>
                  <Text allowFontScaling={false} style={styles.fee}>{fmtMoney(t.entry_fee)}</Text>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const Row = ({ icon, text, onPress, link }: { icon: any; text: string; onPress?: () => void; link?: boolean }) => {
  const inner = (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={ms(15)} color={COLORS.textSecondary} />
      <Text allowFontScaling={false} style={[styles.infoText, link && styles.infoLink]} numberOfLines={2}>{text}</Text>
    </View>
  );
  return onPress ? <TouchableOpacity onPress={onPress}>{inner}</TouchableOpacity> : inner;
};

const Badge = ({ label, alt }: { label: string; alt?: boolean }) => (
  <View style={[styles.badge, alt && styles.badgeAlt]}>
    <Text allowFontScaling={false} style={[styles.badgeText, alt && styles.badgeTextAlt]}>{label}</Text>
  </View>
);

const ActionBtn = ({ icon, label, onPress }: { icon: any; label: string; onPress: () => void }) => (
  <TouchableOpacity style={styles.actionBtn} onPress={onPress} activeOpacity={0.8}>
    <Ionicons name={icon} size={ms(18)} color={COLORS.primary} />
    <Text allowFontScaling={false} style={styles.actionText}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: sc(SPACING.md) },
  card: {
    width: "100%",
    maxWidth: 520,
    maxHeight: "85%",
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
  },
  // Hero
  hero: { height: sc(170), backgroundColor: COLORS.background, justifyContent: "flex-end" },
  heroFallback: { alignItems: "center", justifyContent: "center", backgroundColor: COLORS.surface },
  heroInitials: { fontSize: ms(48), fontWeight: "800", color: COLORS.textMuted, letterSpacing: 2 },
  heroScrim: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.35)" },
  heroClose: {
    position: "absolute",
    top: sc(SPACING.sm),
    right: sc(SPACING.sm),
    width: sc(32),
    height: sc(32),
    borderRadius: sc(16),
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroText: { padding: sc(SPACING.md) },
  heroTitle: { fontSize: ms(FONT_SIZES.xl), fontWeight: "800", color: COLORS.white },
  heroSub: { fontSize: ms(FONT_SIZES.sm), color: COLORS.white, opacity: 0.85, marginTop: 2 },
  attribution: { position: "absolute", top: sc(SPACING.sm), left: sc(SPACING.sm), backgroundColor: "rgba(0,0,0,0.5)", borderRadius: RADIUS.sm, paddingHorizontal: sc(SPACING.xs), paddingVertical: sc(2) },
  attributionText: { fontSize: ms(FONT_SIZES.xs - 1), color: COLORS.white, opacity: 0.9 },
  body: { paddingHorizontal: sc(SPACING.md) },
  // Quick actions
  actions: { flexDirection: "row", gap: sc(SPACING.sm), marginTop: sc(SPACING.md) },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sc(SPACING.xs),
    paddingVertical: sc(SPACING.sm),
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  actionText: { fontSize: ms(FONT_SIZES.sm), fontWeight: "700", color: COLORS.primary },
  section: { marginTop: sc(SPACING.md), gap: sc(SPACING.xs) },
  infoRow: { flexDirection: "row", alignItems: "center", gap: sc(SPACING.xs) },
  infoText: { fontSize: ms(FONT_SIZES.sm), color: COLORS.text, flexShrink: 1 },
  infoLink: { color: COLORS.primary },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: sc(SPACING.xs), marginTop: sc(SPACING.md) },
  badge: { backgroundColor: COLORS.primary + "22", borderRadius: RADIUS.sm, paddingHorizontal: sc(SPACING.sm), paddingVertical: sc(3) },
  badgeAlt: { backgroundColor: COLORS.success + "22" },
  badgeText: { fontSize: ms(FONT_SIZES.xs), fontWeight: "700", color: COLORS.primary },
  badgeTextAlt: { color: COLORS.success },
  sectionTitle: { fontSize: ms(FONT_SIZES.md), fontWeight: "700", color: COLORS.text, marginTop: sc(SPACING.lg), marginBottom: sc(SPACING.xs) },
  empty: { fontSize: ms(FONT_SIZES.sm), color: COLORS.textMuted, fontStyle: "italic" },
  listRow: { flexDirection: "row", alignItems: "center", gap: sc(SPACING.sm), paddingVertical: sc(SPACING.sm), borderTopWidth: 1, borderTopColor: COLORS.border + "66" },
  listText: { fontSize: ms(FONT_SIZES.sm), color: COLORS.text },
  listMeta: { fontSize: ms(FONT_SIZES.xs), color: COLORS.textSecondary, marginTop: 2 },
  fee: { fontSize: ms(FONT_SIZES.sm), fontWeight: "800", color: COLORS.success },
});

export default VenueDetailModal;
