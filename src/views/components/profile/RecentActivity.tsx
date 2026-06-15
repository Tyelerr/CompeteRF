// src/views/components/profile/RecentActivity.tsx
// Profile "Recent Activity" feed: the player's recent tournaments — name, date,
// their W/L record (green W, red L) and final placement. Each row is tappable to
// open that tournament's bracket.

import { Ionicons } from "@expo/vector-icons";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { moderateScale, scale } from "../../../utils/scaling";
import { RecentActivityItem } from "../../../utils/player.performance";

const isWeb = Platform.OS === "web";
const wxMs = (v: number) => (isWeb ? v : moderateScale(v));
const wxSc = (v: number) => (isWeb ? v : scale(v));

const fmtDate = (d: string | null): string => {
  if (!d) return "";
  const dt = new Date(d);
  return Number.isNaN(dt.getTime())
    ? ""
    : dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

// Gold / silver / bronze tint for the place chip; champion gets the warm accent.
const placeColor = (label: string | null): string => {
  if (!label) return COLORS.border;
  if (label.startsWith("1st")) return COLORS.warning;
  if (label.startsWith("2nd")) return COLORS.textSecondary;
  if (label.startsWith("3rd")) return COLORS.secondary;
  return COLORS.border;
};

const Row = ({
  item,
  onOpen,
}: {
  item: RecentActivityItem;
  onOpen: (id: number) => void;
}) => {
  const played = item.wins + item.losses > 0;
  return (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={0.7}
      onPress={() => onOpen(item.tournamentId)}
    >
      <View style={styles.main}>
        <Text allowFontScaling={false} style={styles.name} numberOfLines={1}>
          {item.name}
        </Text>
        <View style={styles.metaRow}>
          <Text allowFontScaling={false} style={styles.date}>
            {fmtDate(item.date)}
          </Text>
          {played && (
            <Text allowFontScaling={false} style={styles.record}>
              <Text style={styles.win}>{item.wins}W</Text>
              <Text style={styles.dotSep}> · </Text>
              <Text style={styles.loss}>{item.losses}L</Text>
            </Text>
          )}
          {!item.finished && <Text allowFontScaling={false} style={styles.live}>LIVE</Text>}
        </View>
      </View>

      {item.placeLabel ? (
        <View
          style={[styles.placeChip, { borderColor: placeColor(item.placeLabel) }]}
        >
          <Text
            allowFontScaling={false}
            style={[styles.placeText, { color: placeColor(item.placeLabel) }]}
            numberOfLines={1}
          >
            {item.placeLabel}
          </Text>
        </View>
      ) : null}
      <Ionicons name="chevron-forward" size={wxMs(16)} color={COLORS.textMuted} />
    </TouchableOpacity>
  );
};

export const RecentActivity = ({
  items,
  onOpen,
}: {
  items: RecentActivityItem[];
  onOpen: (tournamentId: number) => void;
}) => (
  <View style={styles.section}>
    <Text allowFontScaling={false} style={styles.title}>
      RECENT ACTIVITY
    </Text>
    {items.length === 0 ? (
      <View style={styles.empty}>
        <Text allowFontScaling={false} style={styles.emptyText}>
          Your tournaments and results will show up here.
        </Text>
      </View>
    ) : (
      <View style={styles.card}>
        {items.map((it, i) => (
          <View key={`${it.tournamentId}-${i}`}>
            {i > 0 && <View style={styles.divider} />}
            <Row item={it} onOpen={onOpen} />
          </View>
        ))}
      </View>
    )}
  </View>
);

const styles = StyleSheet.create({
  section: { marginHorizontal: wxSc(SPACING.md), marginTop: wxSc(SPACING.lg) },
  title: {
    fontSize: wxMs(FONT_SIZES.md),
    fontWeight: "800",
    color: COLORS.text,
    letterSpacing: 0.5,
    marginBottom: wxSc(SPACING.sm),
  },
  empty: {
    backgroundColor: COLORS.backgroundCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    paddingVertical: wxSc(SPACING.xl),
    alignItems: "center",
  },
  emptyText: { fontSize: wxMs(FONT_SIZES.sm), color: COLORS.textMuted },
  card: {
    backgroundColor: COLORS.backgroundCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    paddingHorizontal: wxSc(SPACING.md),
  },
  divider: { height: 1, backgroundColor: COLORS.border },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: wxSc(SPACING.sm),
    paddingVertical: wxSc(SPACING.sm),
  },
  main: { flex: 1 },
  name: { fontSize: wxMs(FONT_SIZES.md), fontWeight: "800", color: COLORS.text },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: wxSc(SPACING.sm),
    marginTop: wxSc(2),
  },
  date: { fontSize: wxMs(FONT_SIZES.xs), color: COLORS.textSecondary, fontWeight: "600" },
  record: { fontSize: wxMs(FONT_SIZES.xs), fontWeight: "800" },
  win: { color: COLORS.success },
  loss: { color: COLORS.error },
  dotSep: { color: COLORS.textMuted },
  live: {
    fontSize: wxMs(9),
    fontWeight: "900",
    color: COLORS.error,
    letterSpacing: 0.5,
  },
  placeChip: {
    minWidth: wxSc(44),
    alignItems: "center",
    paddingHorizontal: wxSc(SPACING.sm),
    paddingVertical: wxSc(3),
    borderRadius: wxSc(RADIUS.sm),
    borderWidth: 1,
    backgroundColor: COLORS.background,
  },
  placeText: { fontSize: wxMs(FONT_SIZES.xs), fontWeight: "900" },
});
