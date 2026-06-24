// src/views/components/tournament/TournamentSettingsPreview.tsx
// Live, player-facing preview of a tournament as it's being built in the Manage
// hub Settings form (web two-column event builder). Pure over the live form
// values, so it updates in real time as the TD types.

import { Image, StyleSheet, Text, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { Tournament } from "../../../models/types/tournament.types";
import { GAME_TYPE_MAP } from "../../../utils/game-type.utils";
import { formatDate, formatTime } from "../../../utils/formatters";
import { getTournamentImageUrl } from "../../../utils/tournament-helpers";

interface VenueLike {
  venue?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
}
interface PreviewForm {
  name: string;
  description: string;
  gameType: string;
  tournamentFormat: string;
  tournamentDate: string;
  startTime: string;
  entryFee: string;
  addedMoney: string;
  tableSize: string;
  maxFargo: string;
  openTournament: boolean;
  isRecurring: boolean;
  recurrenceType: string;
  externalBracketUrl: string;
  raceMode: string;
  raceWinners: number;
  raceLosers: number;
  raceFinals: number;
  diffMinRace: number;
  raceGroups: { id: string }[];
  sidePots: { name: string; amount: string }[];
  chipTiers?: { minFargo: string; maxFargo: string; chips: string }[];
}

const prettify = (s: string | null | undefined): string =>
  (s ?? "")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");

const SINGLE_ELIM = ["single-elimination", "single-elim"];

const raceSummary = (f: PreviewForm): string => {
  if (f.raceMode === "fixed") {
    const hasLosers = !SINGLE_ELIM.includes((f.tournamentFormat || "").toLowerCase());
    return hasLosers
      ? `Winners ${f.raceWinners} · Losers ${f.raceLosers} · Finals ${f.raceFinals}`
      : `Race to ${f.raceWinners}`;
  }
  if (f.raceMode === "differential") return `Fargo differential (min ${f.diffMinRace})`;
  if (f.raceMode === "groups")
    return f.raceGroups.length ? `${f.raceGroups.length} race groups` : "Race groups";
  return "—";
};

const money = (v: string): string => {
  const n = parseFloat(v);
  return isNaN(n) || n === 0 ? "" : `$${n % 1 === 0 ? n : n.toFixed(2)}`;
};

const Row = ({
  label,
  value,
  valueStyle,
}: {
  label: string;
  value: string;
  valueStyle?: object;
}) =>
  value ? (
    <View style={styles.row}>
      <Text allowFontScaling={false} style={styles.rowLabel}>
        {label}
      </Text>
      <Text
        allowFontScaling={false}
        style={[styles.rowValue, valueStyle]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  ) : null;

export const TournamentSettingsPreview = ({
  form,
  venue,
  tablesCount,
  isExternal,
}: {
  form: PreviewForm;
  venue?: VenueLike | null;
  tablesCount?: number;
  isExternal?: boolean;
}) => {
  const gameLabel = form.gameType
    ? GAME_TYPE_MAP[form.gameType] ?? prettify(form.gameType)
    : "";
  const imageUrl = form.gameType
    ? getTournamentImageUrl({ game_type: form.gameType } as Tournament)
    : null;
  const dateStr = form.tournamentDate ? formatDate(form.tournamentDate) : "";
  const timeStr = form.startTime ? formatTime(form.startTime) : "";
  const dateTime = [dateStr, timeStr].filter(Boolean).join(" · ");
  const cityState = [venue?.city, venue?.state].filter(Boolean).join(", ");
  const entry = money(form.entryFee);
  const added = money(form.addedMoney);
  const fargo = form.openTournament
    ? "Open (no cap)"
    : form.maxFargo
      ? `Up to ${form.maxFargo}`
      : "";
  const pots = form.sidePots.filter((p) => p.name.trim());

  return (
    <View style={styles.card}>
      <Text allowFontScaling={false} style={styles.previewLabel}>
        LIVE PREVIEW
      </Text>

      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          style={styles.headerImg}
          resizeMode="cover"
        />
      ) : (
        <View style={styles.headerImgPlaceholder}>
          <Text allowFontScaling={false} style={styles.headerImgEmoji}>
            🎱
          </Text>
        </View>
      )}

      <View style={styles.badges}>
        {!!gameLabel && (
          <View style={styles.gameBadge}>
            <Text allowFontScaling={false} style={styles.gameBadgeText}>
              {gameLabel}
            </Text>
          </View>
        )}
        {!!form.tournamentFormat && (
          <View style={styles.fmtBadge}>
            <Text allowFontScaling={false} style={styles.fmtBadgeText}>
              {prettify(form.tournamentFormat)}
            </Text>
          </View>
        )}
        {isExternal && (
          <View style={styles.extBadge}>
            <Text allowFontScaling={false} style={styles.extBadgeText}>
              External
            </Text>
          </View>
        )}
        {form.isRecurring && (
          <View style={styles.fmtBadge}>
            <Text allowFontScaling={false} style={styles.fmtBadgeText}>
              🔄 {form.recurrenceType ? prettify(form.recurrenceType) : "Recurring"}
            </Text>
          </View>
        )}
      </View>

      <Text allowFontScaling={false} style={styles.name} numberOfLines={2}>
        {form.name.trim() || "Untitled Tournament"}
      </Text>

      {!!form.description.trim() && (
        <Text allowFontScaling={false} style={styles.desc} numberOfLines={4}>
          {form.description.trim()}
        </Text>
      )}

      <View style={styles.divider} />

      <Row label="When" value={dateTime} />

      {venue?.venue ? (
        <View style={styles.venueBlock}>
          <Text allowFontScaling={false} style={styles.venueLabel}>
            Venue
          </Text>
          <Text allowFontScaling={false} style={styles.venueName} numberOfLines={1}>
            {venue.venue}
          </Text>
          {!!venue.address && (
            <Text allowFontScaling={false} style={styles.venueSub} numberOfLines={1}>
              {venue.address}
            </Text>
          )}
          {!!cityState && (
            <Text allowFontScaling={false} style={styles.venueSub} numberOfLines={1}>
              {cityState} {venue.zip_code ?? ""}
            </Text>
          )}
          {!!form.tableSize && (
            <Text allowFontScaling={false} style={styles.venueSub} numberOfLines={1}>
              Table size: {form.tableSize}
            </Text>
          )}
        </View>
      ) : null}

      <Row label="Race" value={raceSummary(form)} />

      {form.tournamentFormat === "chip-tournament" && !!form.chipTiers?.length && (
        <>
          <View style={styles.divider} />
          <Text allowFontScaling={false} style={styles.rowLabel}>
            🎠 Chip Count
          </Text>
          {form.chipTiers.map((t, i) => {
            const min = t.minFargo.trim() || "0";
            const max = t.maxFargo.trim();
            const range = max === "" ? `${min} & Above` : min === "0" ? `${max} & Under` : `${min}–${max}`;
            const n = parseInt(t.chips || "0", 10);
            return (
              <View key={i} style={styles.potRow}>
                <Text allowFontScaling={false} style={styles.potName} numberOfLines={1}>
                  {range}
                </Text>
                <Text allowFontScaling={false} style={styles.potAmt}>
                  {n} Chip{n === 1 ? "" : "s"}
                </Text>
              </View>
            );
          })}
        </>
      )}

      <Row
        label="Entry Fee"
        value={entry || "Free"}
        valueStyle={styles.greenValue}
      />
      <Row label="Added Money" value={added ? `+ ${added}` : ""} valueStyle={styles.greenValue} />
      <Row label="Fargo" value={fargo} />
      {!isExternal && (
        <Row
          label="Tables"
          value={tablesCount ? String(tablesCount) : ""}
        />
      )}
      {isExternal && (
        <Row label="Bracket" value={form.externalBracketUrl.trim()} />
      )}

      {pots.length > 0 && (
        <>
          <View style={styles.divider} />
          <Text allowFontScaling={false} style={styles.rowLabel}>
            Side Pots
          </Text>
          {pots.map((p, i) => (
            <View key={i} style={styles.potRow}>
              <Text allowFontScaling={false} style={styles.potName} numberOfLines={1}>
                {p.name.trim()}
              </Text>
              <Text allowFontScaling={false} style={styles.potAmt}>
                {money(p.amount) || "—"}
              </Text>
            </View>
          ))}
        </>
      )}
    </View>
  );
};

const ms = (v: number) => v; // web-only component — no device scaling
const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
  },
  previewLabel: {
    fontSize: ms(FONT_SIZES.xs),
    fontWeight: "800",
    color: COLORS.primary,
    letterSpacing: 1.5,
    marginBottom: SPACING.sm,
  },
  greenValue: { color: COLORS.success },
  headerImg: { width: "100%", height: 130, borderRadius: RADIUS.md, marginBottom: SPACING.sm },
  headerImgPlaceholder: {
    width: "100%",
    height: 130,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.sm,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
  },
  headerImgEmoji: { fontSize: 40 },
  desc: { fontSize: ms(FONT_SIZES.sm), color: COLORS.textSecondary, lineHeight: ms(FONT_SIZES.sm) * 1.5, marginBottom: SPACING.xs },
  venueBlock: { paddingVertical: 5 },
  venueLabel: { fontSize: ms(FONT_SIZES.sm), color: COLORS.textSecondary, fontWeight: "600", marginBottom: 2 },
  venueName: { fontSize: ms(FONT_SIZES.sm), color: COLORS.text, fontWeight: "700" },
  venueSub: { fontSize: ms(FONT_SIZES.xs), color: COLORS.textSecondary },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.xs, marginBottom: SPACING.sm },
  gameBadge: { backgroundColor: COLORS.primary, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 4 },
  gameBadgeText: { color: "#fff", fontSize: ms(FONT_SIZES.xs), fontWeight: "700" },
  fmtBadge: { backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 4 },
  fmtBadgeText: { color: COLORS.textSecondary, fontSize: ms(FONT_SIZES.xs), fontWeight: "600" },
  extBadge: { backgroundColor: COLORS.warning, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 4 },
  extBadgeText: { color: "#000", fontSize: ms(FONT_SIZES.xs), fontWeight: "800" },
  name: { fontSize: ms(FONT_SIZES.xl), fontWeight: "800", color: COLORS.text, marginBottom: SPACING.sm },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: SPACING.sm },
  row: { flexDirection: "row", justifyContent: "space-between", gap: SPACING.md, paddingVertical: 5 },
  rowLabel: { fontSize: ms(FONT_SIZES.sm), color: COLORS.textSecondary, fontWeight: "600" },
  rowValue: { fontSize: ms(FONT_SIZES.sm), color: COLORS.text, fontWeight: "700", flexShrink: 1, textAlign: "right" },
  potRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  potName: { fontSize: ms(FONT_SIZES.sm), color: COLORS.text, flexShrink: 1 },
  potAmt: { fontSize: ms(FONT_SIZES.sm), color: COLORS.success, fontWeight: "700" },
});
