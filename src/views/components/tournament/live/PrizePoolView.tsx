// src/views/components/tournament/live/PrizePoolView.tsx
// Prize Pool setup section for the Manage Tournament hub (Setup phase, before the
// bracket is drawn). Configures and previews the tournament money: entry pool,
// side pots, optional added money, and the payout split per pool with manual
// dollar overrides ("custom"), live validation, and a full prize summary.
//
// Presentational + self-contained: the parent owns the working PrizePoolConfig
// and persistence; this component renders the UI and emits config changes. All
// dollar figures are derived live from the player count, so reopening the
// bracket and re-drawing recalculates automatically.

import { useMemo } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../../../theme/colors";
import { RADIUS, SPACING } from "../../../../theme/spacing";
import { FONT_SIZES } from "../../../../theme/typography";
import { webMs, webSc } from "../../../../utils/scaling";
import { ToggleSwitch } from "../../common/toggle-switch";
import {
  PrizePlace,
  PrizePoolConfig,
} from "../../../../models/types/tournament-settings.types";
import {
  computeBreakdown,
  defaultEntrySplit,
  defaultSidePotSplit,
  entryPoolTotal,
  placesFromPercents,
  sidePotTotal,
} from "../../../../utils/prize-pool";

const MAX_PLACES = 16;

export interface PrizePoolSidePot {
  name: string;
  amount: number; // per-player buy-in
  players: number; // entrants who bought into this pot
}

interface PrizePoolViewProps {
  config: PrizePoolConfig;
  onChange: (next: PrizePoolConfig) => void;
  locked: boolean;
  players: number; // effective player count for the entry pool
  entryFee: number;
  addedMoney: number;
  sidePots: PrizePoolSidePot[];
}

const money = (n: number): string => {
  const r = Math.round((n + Number.EPSILON) * 100) / 100;
  return Number.isInteger(r) ? `$${r}` : `$${r.toFixed(2)}`;
};
const pctStr = (n: number): string => {
  const r = Math.round((n + Number.EPSILON) * 100) / 100;
  return Number.isInteger(r) ? String(r) : r.toFixed(2);
};

// ── Small building blocks ─────────────────────────────────────────────────────
const Section = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <View style={styles.section}>
    <Text allowFontScaling={false} style={styles.sectionTitle}>
      {title}
    </Text>
    {children}
  </View>
);

const SummaryRow = ({
  label,
  value,
  strong,
  warn,
}: {
  label: string;
  value: string;
  strong?: boolean;
  warn?: boolean;
}) => (
  <View style={styles.sumRow}>
    <Text
      allowFontScaling={false}
      style={[styles.sumLabel, strong && styles.sumLabelStrong]}
    >
      {label}
    </Text>
    <Text
      allowFontScaling={false}
      style={[
        styles.sumValue,
        strong && styles.sumValueStrong,
        warn && styles.sumValueWarn,
      ]}
    >
      {value}
    </Text>
  </View>
);

const Stepper = ({
  value,
  min,
  max,
  onChange,
  disabled,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) => (
  <View style={styles.stepper}>
    <TouchableOpacity
      style={[styles.stepBtn, (disabled || value <= min) && styles.stepBtnOff]}
      disabled={disabled || value <= min}
      onPress={() => onChange(Math.max(min, value - 1))}
    >
      <Text allowFontScaling={false} style={styles.stepBtnText}>
        {"−"}
      </Text>
    </TouchableOpacity>
    <Text allowFontScaling={false} style={styles.stepValue}>
      {value}
    </Text>
    <TouchableOpacity
      style={[styles.stepBtn, (disabled || value >= max) && styles.stepBtnOff]}
      disabled={disabled || value >= max}
      onPress={() => onChange(Math.min(max, value + 1))}
    >
      <Text allowFontScaling={false} style={styles.stepBtnText}>
        +
      </Text>
    </TouchableOpacity>
  </View>
);

// ── Payout table (entry pool or a single side pot) ────────────────────────────
const PayoutTable = ({
  pool,
  places,
  locked,
  defaultSplit,
  onPlaces,
}: {
  pool: number;
  places: PrizePlace[];
  locked: boolean;
  defaultSplit: (n: number) => number[];
  onPlaces: (next: PrizePlace[]) => void;
}) => {
  const breakdown = useMemo(
    () => computeBreakdown(pool, places),
    [pool, places],
  );
  const count = places.length;

  const setCount = (n: number) => {
    if (n === count) return;
    // Changing the number of paid places resets to a clean default split.
    onPlaces(placesFromPercents(defaultSplit(n)));
  };

  const editPercent = (i: number, text: string) => {
    const v = parseFloat(text);
    const pct = isNaN(v) ? 0 : v;
    onPlaces(
      places.map((p, idx) =>
        idx === i ? { percent: pct, amountOverride: null } : p,
      ),
    );
  };

  const editAmount = (i: number, text: string) => {
    const v = parseFloat(text);
    onPlaces(
      places.map((p, idx) =>
        idx === i ? { ...p, amountOverride: isNaN(v) ? 0 : v } : p,
      ),
    );
  };

  const clearOverride = (i: number) =>
    onPlaces(
      places.map((p, idx) =>
        idx === i ? { ...p, amountOverride: null } : p,
      ),
    );

  return (
    <View>
      <View style={styles.placesHeader}>
        <Text allowFontScaling={false} style={styles.hint}>
          Paying {count} place{count === 1 ? "" : "s"}
        </Text>
        {!locked && (
          <Stepper value={count} min={1} max={MAX_PLACES} onChange={setCount} />
        )}
      </View>

      <View style={styles.tableHeadRow}>
        <Text allowFontScaling={false} style={[styles.th, styles.thPlace]}>
          Place
        </Text>
        <Text allowFontScaling={false} style={[styles.th, styles.thPct]}>
          %
        </Text>
        <Text allowFontScaling={false} style={[styles.th, styles.thAmt]}>
          Payout
        </Text>
      </View>

      {breakdown.places.map((row, i) => (
        <View key={i} style={styles.placeRow}>
          <View style={styles.thPlace}>
            <Text allowFontScaling={false} style={styles.placeLabel}>
              {ordinal(row.place)}
            </Text>
            {row.custom && (
              <Text allowFontScaling={false} style={styles.customBadge}>
                custom
              </Text>
            )}
          </View>

          <View style={styles.thPct}>
            {locked ? (
              <Text allowFontScaling={false} style={styles.cellStatic}>
                {pctStr(row.percent)}%
              </Text>
            ) : (
              <TextInput
                allowFontScaling={false}
                style={[styles.cellInput, row.custom && styles.cellInputMuted]}
                value={pctStr(row.percent)}
                onChangeText={(t) => editPercent(i, t)}
                keyboardType="decimal-pad"
                selectTextOnFocus
              />
            )}
          </View>

          <View style={[styles.thAmt, styles.amtCell]}>
            {locked ? (
              <Text allowFontScaling={false} style={styles.cellStatic}>
                {money(row.amount)}
              </Text>
            ) : (
              <>
                <Text allowFontScaling={false} style={styles.amtDollar}>
                  $
                </Text>
                <TextInput
                  allowFontScaling={false}
                  style={[styles.cellInput, styles.amtInput]}
                  value={pctStr(row.amount)}
                  onChangeText={(t) => editAmount(i, t)}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                />
                {row.custom && (
                  <TouchableOpacity
                    onPress={() => clearOverride(i)}
                    style={styles.resetBtn}
                  >
                    <Text allowFontScaling={false} style={styles.resetText}>
                      {"↺"}
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        </View>
      ))}

      <View style={styles.totalsRow}>
        <Text allowFontScaling={false} style={styles.totalsLabel}>
          Totals
        </Text>
        <Text
          allowFontScaling={false}
          style={[
            styles.totalsPct,
            !breakdown.percentValid && styles.totalsWarn,
          ]}
        >
          {pctStr(breakdown.percentTotal)}%
        </Text>
        <Text
          allowFontScaling={false}
          style={[
            styles.totalsAmt,
            !breakdown.amountValid && styles.totalsWarn,
          ]}
        >
          {money(breakdown.payoutTotal)}
        </Text>
      </View>

      {!breakdown.percentValid && (
        <Text allowFontScaling={false} style={styles.warn}>
          Percentages total {pctStr(breakdown.percentTotal)}% — they should add up
          to 100%.
        </Text>
      )}
      {!breakdown.amountValid && (
        <Text allowFontScaling={false} style={styles.warn}>
          Payouts exceed the {money(breakdown.pool)} pool by{" "}
          {money(Math.abs(breakdown.remaining))}.
        </Text>
      )}
      {breakdown.percentValid &&
        breakdown.amountValid &&
        breakdown.remaining > 0.01 && (
          <Text allowFontScaling={false} style={styles.hint}>
            {money(breakdown.remaining)} unassigned.
          </Text>
        )}
    </View>
  );
};

// ── Main view ─────────────────────────────────────────────────────────────────
export const PrizePoolView = ({
  config,
  onChange,
  locked,
  players,
  entryFee,
  addedMoney,
  sidePots,
}: PrizePoolViewProps) => {
  const entryPool = entryPoolTotal(
    players,
    entryFee,
    config.includeAddedMoney,
    addedMoney,
  );
  const entryBreakdown = computeBreakdown(entryPool, config.entryPlaces);

  // Per side pot: pool + payout config (config.sidePots is kept aligned by name
  // by the parent before this renders).
  const sidePotRows = sidePots.map((sp) => {
    const cfg = config.sidePots.find((s) => s.name === sp.name);
    const places = cfg?.places ?? placesFromPercents(defaultSidePotSplit(2));
    const pool = sidePotTotal(sp.players, sp.amount);
    return { sp, places, pool, breakdown: computeBreakdown(pool, places) };
  });

  const sidePotsTotal = sidePotRows.reduce((s, r) => s + r.pool, 0);
  const includedAdded = config.includeAddedMoney ? addedMoney : 0;
  const totalPrizePool = entryPool + sidePotsTotal;
  const totalPayout =
    entryBreakdown.payoutTotal +
    sidePotRows.reduce((s, r) => s + r.breakdown.payoutTotal, 0);
  const totalRemaining =
    Math.round((totalPrizePool - totalPayout + Number.EPSILON) * 100) / 100;

  const setEntryPlaces = (next: PrizePlace[]) =>
    onChange({ ...config, entryPlaces: next });

  const setSidePotPlaces = (name: string, next: PrizePlace[]) =>
    onChange({
      ...config,
      sidePots: config.sidePots.map((s) =>
        s.name === name ? { ...s, places: next } : s,
      ),
    });

  return (
    <View>
      {locked && (
        <View style={styles.lockBanner}>
          <Text allowFontScaling={false} style={styles.lockBannerText}>
            {"🔒"} Prize pool is locked with the bracket. Reopen the
            draw to edit it.
          </Text>
        </View>
      )}

      {/* Entry Pool */}
      <Section title="Entry Pool">
        <SummaryRow label="Players entered" value={String(players)} />
        <SummaryRow label="Entry fee" value={money(entryFee)} />
        {addedMoney > 0 && (
          <ToggleSwitch
            label={`Include added money (${money(addedMoney)})`}
            value={config.includeAddedMoney}
            onValueChange={(v) =>
              !locked && onChange({ ...config, includeAddedMoney: v })
            }
            disabled={locked}
          />
        )}
        <SummaryRow
          label={`Entry pool${
            config.includeAddedMoney && addedMoney > 0 ? " (incl. added)" : ""
          }`}
          value={`${players} × ${money(entryFee)}${
            includedAdded > 0 ? ` + ${money(includedAdded)}` : ""
          } = ${money(entryPool)}`}
          strong
        />
      </Section>

      {/* Entry payout split */}
      <Section title="Entry Payouts">
        <PayoutTable
          pool={entryPool}
          places={config.entryPlaces}
          locked={locked}
          defaultSplit={defaultEntrySplit}
          onPlaces={setEntryPlaces}
        />
      </Section>

      {/* Side pots */}
      {sidePotRows.length > 0 && (
        <Section title="Side Pots">
          {sidePotRows.map((r) => (
            <View key={r.sp.name} style={styles.sidePotBlock}>
              <Text allowFontScaling={false} style={styles.sidePotName}>
                {r.sp.name || "Unnamed pot"}
              </Text>
              <SummaryRow
                label="Buy-in / players"
                value={`${r.sp.players} × ${money(r.sp.amount)} = ${money(
                  r.pool,
                )}`}
                strong
              />
              {r.sp.players === 0 ? (
                <Text allowFontScaling={false} style={styles.hint}>
                  No entries recorded yet. Players are counted as they buy in at
                  check-in.
                </Text>
              ) : (
                <PayoutTable
                  pool={r.pool}
                  places={r.places}
                  locked={locked}
                  defaultSplit={defaultSidePotSplit}
                  onPlaces={(next) => setSidePotPlaces(r.sp.name, next)}
                />
              )}
            </View>
          ))}
        </Section>
      )}

      {/* Prize summary */}
      <Section title="Prize Summary">
        <SummaryRow label="Players entered" value={String(players)} />
        <SummaryRow label="Entry fee" value={money(entryFee)} />
        <SummaryRow label="Entry pool" value={money(entryPool)} />
        {sidePotRows.map((r) => (
          <SummaryRow
            key={r.sp.name}
            label={`Side pot · ${r.sp.name || "Unnamed"}`}
            value={money(r.pool)}
          />
        ))}
        <SummaryRow
          label="Added money"
          value={
            addedMoney > 0
              ? config.includeAddedMoney
                ? `${money(addedMoney)} (in pool)`
                : `${money(addedMoney)} (excluded)`
              : money(0)
          }
        />
        <SummaryRow
          label="Total prize pool"
          value={money(totalPrizePool)}
          strong
        />
        <SummaryRow label="Total payout" value={money(totalPayout)} strong />
        <SummaryRow
          label={totalRemaining < 0 ? "Over-allocated" : "Unassigned"}
          value={money(Math.abs(totalRemaining))}
          warn={Math.abs(totalRemaining) > 0.01}
        />
      </Section>
    </View>
  );
};

const ordinal = (n: number): string => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

const styles = StyleSheet.create({
  section: {
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.md),
    padding: webSc(SPACING.md),
    marginBottom: webSc(SPACING.md),
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sectionTitle: {
    fontSize: webMs(FONT_SIZES.md),
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: webSc(SPACING.sm),
  },
  hint: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.textSecondary,
    marginTop: webSc(2),
  },
  warn: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.error,
    marginTop: webSc(SPACING.xs),
    fontWeight: "600",
  },
  // Summary rows
  sumRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: webSc(SPACING.xs),
  },
  sumLabel: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    flex: 1,
    marginRight: webSc(SPACING.sm),
  },
  sumLabelStrong: { color: COLORS.text, fontWeight: "600" },
  sumValue: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.text,
    fontWeight: "500",
    textAlign: "right",
  },
  sumValueStrong: {
    fontWeight: "700",
    color: COLORS.primary,
  },
  sumValueWarn: { color: COLORS.error, fontWeight: "700" },
  // Stepper
  placesHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: webSc(SPACING.xs),
  },
  stepper: { flexDirection: "row", alignItems: "center" },
  stepBtn: {
    width: webSc(30),
    height: webSc(30),
    borderRadius: webSc(RADIUS.sm),
    backgroundColor: COLORS.primary + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  stepBtnOff: { opacity: 0.4 },
  stepBtnText: {
    fontSize: webMs(FONT_SIZES.lg),
    color: COLORS.primary,
    fontWeight: "700",
  },
  stepValue: {
    fontSize: webMs(FONT_SIZES.md),
    color: COLORS.text,
    fontWeight: "700",
    minWidth: webSc(34),
    textAlign: "center",
  },
  // Payout table
  tableHeadRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: webSc(SPACING.xs),
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  th: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.textMuted,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  thPlace: { flex: 1.2, flexDirection: "row", alignItems: "center" },
  thPct: { flex: 1, alignItems: "flex-start" },
  thAmt: { flex: 1.4 },
  placeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: webSc(SPACING.xs),
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border + "60",
  },
  placeLabel: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.text,
    fontWeight: "600",
  },
  customBadge: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.warning,
    fontWeight: "700",
    marginLeft: webSc(SPACING.xs),
  },
  cellStatic: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.text,
    fontWeight: "500",
  },
  cellInput: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.text,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: webSc(RADIUS.sm),
    paddingVertical: webSc(SPACING.xs),
    paddingHorizontal: webSc(SPACING.sm),
    minWidth: webSc(48),
  },
  cellInputMuted: { color: COLORS.textMuted },
  amtCell: { flexDirection: "row", alignItems: "center" },
  amtDollar: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    marginRight: webSc(2),
  },
  amtInput: { flex: 1 },
  resetBtn: {
    marginLeft: webSc(SPACING.xs),
    padding: webSc(SPACING.xs),
  },
  resetText: {
    fontSize: webMs(FONT_SIZES.md),
    color: COLORS.primary,
    fontWeight: "700",
  },
  totalsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: webSc(SPACING.sm),
  },
  totalsLabel: {
    flex: 1.2,
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.text,
    fontWeight: "700",
  },
  totalsPct: {
    flex: 1,
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.text,
    fontWeight: "700",
  },
  totalsAmt: {
    flex: 1.4,
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.primary,
    fontWeight: "700",
  },
  totalsWarn: { color: COLORS.error },
  // Side pots
  sidePotBlock: {
    marginBottom: webSc(SPACING.md),
    paddingBottom: webSc(SPACING.sm),
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  sidePotName: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.text,
    fontWeight: "700",
    marginBottom: webSc(SPACING.xs),
  },
  // Lock banner
  lockBanner: {
    backgroundColor: COLORS.primary + "15",
    borderRadius: webSc(RADIUS.sm),
    padding: webSc(SPACING.sm),
    marginBottom: webSc(SPACING.md),
    borderWidth: 1,
    borderColor: COLORS.primary + "40",
  },
  lockBannerText: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.primary,
    fontWeight: "600",
  },
});
