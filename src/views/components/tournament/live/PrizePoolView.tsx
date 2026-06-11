// src/views/components/tournament/live/PrizePoolView.tsx
// Prize Pool setup for the Manage Tournament hub (Setup phase, before the bracket
// is drawn). Compact card layout: a summary card, a payout card for the entry
// pool, one per side pot, and a final totals card.
//
// Payout percentages ALWAYS total 100 — the +/- steppers redistribute on every
// nudge and presets are normalized — so there is no percent-error state. Manual
// dollar editing lives behind a "Custom Edit" toggle and is clamped to the pool.
// The parent owns the working config + persistence; this component emits changes.

import { useState } from "react";
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
  MAX_PLACES,
  PRESETS,
  PresetKey,
  activePreset,
  adjustPercents,
  canDecrease,
  canIncrease,
  clampOverride,
  computeBreakdown,
  entryPoolTotal,
  placesFromPercents,
  presetSplit,
  sidePotTotal,
} from "../../../../utils/prize-pool";

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
const ordinal = (n: number): string => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

// ── Building blocks ───────────────────────────────────────────────────────────
const Card = ({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <View style={styles.card}>
    <View style={styles.cardHead}>
      <Text allowFontScaling={false} style={styles.cardTitle}>
        {title}
      </Text>
      {right}
    </View>
    {children}
  </View>
);

const Row = ({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) => (
  <View style={styles.row}>
    <Text
      allowFontScaling={false}
      style={[styles.rowLabel, strong && styles.rowLabelStrong]}
    >
      {label}
    </Text>
    <Text
      allowFontScaling={false}
      style={[styles.rowValue, strong && styles.rowValueStrong]}
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
      onPress={() => onChange(value - 1)}
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
      onPress={() => onChange(value + 1)}
    >
      <Text allowFontScaling={false} style={styles.stepBtnText}>
        +
      </Text>
    </TouchableOpacity>
  </View>
);

// ── Payout card (entry pool or a single side pot) ─────────────────────────────
const PayoutCard = ({
  title,
  pool,
  poolNote,
  places,
  locked,
  onPlaces,
}: {
  title: string;
  pool: number;
  poolNote?: string;
  places: PrizePlace[];
  locked: boolean;
  onPlaces: (next: PrizePlace[]) => void;
}) => {
  const [editing, setEditing] = useState(false);
  const breakdown = computeBreakdown(pool, places);
  const percents = places.map((p) => p.percent);
  const preset = activePreset(places);
  const count = places.length;

  const setCount = (n: number) => {
    const clamped = Math.max(1, Math.min(MAX_PLACES, n));
    if (clamped === count) return;
    // Reset to a clean preset that totals 100 (keep the chosen shape if named).
    const key: PresetKey = preset === "custom" ? "topHeavy" : preset;
    onPlaces(placesFromPercents(presetSplit(key, clamped)));
  };

  const applyPreset = (key: PresetKey) => {
    if (key === "custom") return; // Custom is a state, not an action
    setEditing(false);
    onPlaces(placesFromPercents(presetSplit(key, count)));
  };

  const bump = (i: number, delta: number) =>
    onPlaces(placesFromPercents(adjustPercents(percents, i, delta)));

  const editAmount = (i: number, text: string) => {
    const v = parseFloat(text);
    const clamped = clampOverride(pool, places, i, isNaN(v) ? 0 : v);
    onPlaces(
      places.map((p, idx) =>
        idx === i ? { ...p, amountOverride: clamped } : p,
      ),
    );
  };

  return (
    <Card
      title={title}
      right={
        <View style={styles.poolTag}>
          <Text allowFontScaling={false} style={styles.poolTagText}>
            {money(pool)}
          </Text>
        </View>
      }
    >
      {poolNote ? (
        <Text allowFontScaling={false} style={styles.note}>
          {poolNote}
        </Text>
      ) : null}

      {/* Paid places */}
      <View style={styles.controlRow}>
        <Text allowFontScaling={false} style={styles.controlLabel}>
          Paid places
        </Text>
        {locked ? (
          <Text allowFontScaling={false} style={styles.controlValue}>
            {count}
          </Text>
        ) : (
          <Stepper value={count} min={1} max={MAX_PLACES} onChange={setCount} />
        )}
      </View>

      {/* Presets */}
      {!locked && (
        <View style={styles.presets}>
          {PRESETS.map((p) => {
            const active = preset === p.key;
            return (
              <TouchableOpacity
                key={p.key}
                style={[styles.presetChip, active && styles.presetChipActive]}
                disabled={p.key === "custom"}
                onPress={() => applyPreset(p.key)}
              >
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.presetText,
                    active && styles.presetTextActive,
                    p.key === "custom" && !active && styles.presetTextMuted,
                  ]}
                >
                  {p.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Payout rows */}
      {breakdown.places.map((r, i) => (
        <View key={i} style={styles.payRow}>
          <Text allowFontScaling={false} style={styles.payPlace}>
            {ordinal(r.place)}
          </Text>

          {editing && !locked ? (
            <View style={styles.payAmtEdit}>
              <Text allowFontScaling={false} style={styles.dollar}>
                $
              </Text>
              <TextInput
                allowFontScaling={false}
                style={styles.amtInput}
                value={String(r.amount)}
                onChangeText={(t) => editAmount(i, t)}
                keyboardType="decimal-pad"
                selectTextOnFocus
              />
            </View>
          ) : (
            <>
              <View style={styles.payPctGroup}>
                {!locked && (
                  <TouchableOpacity
                    style={[
                      styles.pctBtn,
                      !canDecrease(percents, i) && styles.pctBtnOff,
                    ]}
                    disabled={!canDecrease(percents, i)}
                    onPress={() => bump(i, -1)}
                  >
                    <Text allowFontScaling={false} style={styles.pctBtnText}>
                      {"−"}
                    </Text>
                  </TouchableOpacity>
                )}
                <Text allowFontScaling={false} style={styles.payPct}>
                  {r.percent}%
                </Text>
                {!locked && (
                  <TouchableOpacity
                    style={[
                      styles.pctBtn,
                      !canIncrease(percents, i) && styles.pctBtnOff,
                    ]}
                    disabled={!canIncrease(percents, i)}
                    onPress={() => bump(i, 1)}
                  >
                    <Text allowFontScaling={false} style={styles.pctBtnText}>
                      +
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              <Text
                allowFontScaling={false}
                style={[styles.payAmt, r.custom && styles.payAmtCustom]}
              >
                {money(r.amount)}
              </Text>
            </>
          )}
        </View>
      ))}

      {/* Custom edit + remaining */}
      {!locked && (
        <View style={styles.cardFootRow}>
          <TouchableOpacity
            style={styles.customBtn}
            onPress={() => setEditing((e) => !e)}
          >
            <Text allowFontScaling={false} style={styles.customBtnText}>
              {editing ? "Done Editing" : "Custom Edit"}
            </Text>
          </TouchableOpacity>
          {(editing || breakdown.remaining > 0.01) && (
            <Text allowFontScaling={false} style={styles.remaining}>
              {money(breakdown.remaining)} unassigned
            </Text>
          )}
        </View>
      )}
    </Card>
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
  const entryBase = Math.max(0, players) * Math.max(0, entryFee);
  const includedAdded = config.includeAddedMoney ? Math.max(0, addedMoney) : 0;
  const entryPool = entryPoolTotal(
    players,
    entryFee,
    config.includeAddedMoney,
    addedMoney,
  );
  const entryBreakdown = computeBreakdown(entryPool, config.entryPlaces);

  const sidePotRows = sidePots.map((sp) => {
    const cfg = config.sidePots.find((s) => s.name === sp.name);
    const places = cfg?.places ?? placesFromPercents(presetSplit("topHeavy", 2));
    const pool = sidePotTotal(sp.players, sp.amount);
    return { sp, places, pool, breakdown: computeBreakdown(pool, places) };
  });

  const sidePotsTotal = sidePotRows.reduce((s, r) => s + r.pool, 0);
  const totalPrizePool = entryBase + includedAdded + sidePotsTotal;
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
            {"🔒"} Prize pool is locked with the bracket. Reopen the draw to edit.
          </Text>
        </View>
      )}

      {/* Summary */}
      <Card title="Prize Pool Summary">
        <Row label="Players entered" value={String(players)} />
        <Row label="Entry fee" value={money(entryFee)} />
        <Row
          label="Entry pool"
          value={`${players} × ${money(entryFee)} = ${money(entryBase)}`}
        />
        {addedMoney > 0 && (
          <ToggleSwitch
            label={`Added money (${money(addedMoney)})`}
            value={config.includeAddedMoney}
            onValueChange={(v) =>
              !locked && onChange({ ...config, includeAddedMoney: v })
            }
            disabled={locked}
          />
        )}
        <Row label="Total prize pool" value={money(totalPrizePool)} strong />
      </Card>

      {/* Entry payouts */}
      <PayoutCard
        title="Entry Payouts"
        pool={entryPool}
        poolNote={
          includedAdded > 0
            ? `${money(entryBase)} entry + ${money(includedAdded)} added`
            : undefined
        }
        places={config.entryPlaces}
        locked={locked}
        onPlaces={setEntryPlaces}
      />

      {/* Side pots */}
      {sidePotRows.map((r) => (
        <PayoutCard
          key={r.sp.name}
          title={`Side Pot · ${r.sp.name || "Unnamed"}`}
          pool={r.pool}
          poolNote={`${r.sp.players} × ${money(r.sp.amount)} buy-in`}
          places={r.places}
          locked={locked}
          onPlaces={(next) => setSidePotPlaces(r.sp.name, next)}
        />
      ))}

      {/* Final summary */}
      <Card title="Summary">
        <Row label="Entry pool" value={money(entryPool)} />
        {sidePotRows.map((r) => (
          <Row
            key={r.sp.name}
            label={`Side pot · ${r.sp.name || "Unnamed"}`}
            value={money(r.pool)}
          />
        ))}
        <Row
          label="Added money"
          value={
            addedMoney > 0
              ? config.includeAddedMoney
                ? `${money(addedMoney)} (in pool)`
                : `${money(addedMoney)} (excluded)`
              : money(0)
          }
        />
        <Row label="Total prize pool" value={money(totalPrizePool)} strong />
        <Row label="Total payout" value={money(totalPayout)} strong />
        <Row label="Unassigned" value={money(Math.max(0, totalRemaining))} />
      </Card>
    </View>
  );
};

const styles = StyleSheet.create({
  // Card
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.md),
    padding: webSc(SPACING.md),
    marginBottom: webSc(SPACING.md),
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: webSc(SPACING.sm),
  },
  cardTitle: {
    fontSize: webMs(FONT_SIZES.md),
    fontWeight: "700",
    color: COLORS.text,
  },
  poolTag: {
    backgroundColor: COLORS.primary + "18",
    borderRadius: webSc(RADIUS.sm),
    paddingHorizontal: webSc(SPACING.sm),
    paddingVertical: webSc(2),
  },
  poolTagText: {
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "700",
    color: COLORS.primary,
  },
  note: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.textSecondary,
    marginBottom: webSc(SPACING.sm),
  },
  // Summary rows
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: webSc(SPACING.xs),
  },
  rowLabel: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    flex: 1,
    marginRight: webSc(SPACING.sm),
  },
  rowLabelStrong: { color: COLORS.text, fontWeight: "700" },
  rowValue: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.text,
    fontWeight: "500",
    textAlign: "right",
  },
  rowValueStrong: { color: COLORS.primary, fontWeight: "700" },
  // Stepper (places)
  controlRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: webSc(SPACING.xs),
  },
  controlLabel: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.text,
    fontWeight: "600",
  },
  controlValue: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.text,
    fontWeight: "700",
  },
  stepper: { flexDirection: "row", alignItems: "center" },
  stepBtn: {
    width: webSc(30),
    height: webSc(30),
    borderRadius: webSc(RADIUS.sm),
    backgroundColor: COLORS.primary + "18",
    alignItems: "center",
    justifyContent: "center",
  },
  stepBtnOff: { opacity: 0.35 },
  stepBtnText: {
    fontSize: webMs(FONT_SIZES.lg),
    color: COLORS.primary,
    fontWeight: "700",
  },
  stepValue: {
    fontSize: webMs(FONT_SIZES.md),
    color: COLORS.text,
    fontWeight: "700",
    minWidth: webSc(32),
    textAlign: "center",
  },
  // Presets
  presets: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: webSc(SPACING.xs),
    marginTop: webSc(SPACING.xs),
    marginBottom: webSc(SPACING.sm),
  },
  presetChip: {
    paddingHorizontal: webSc(SPACING.sm),
    paddingVertical: webSc(SPACING.xs),
    borderRadius: webSc(RADIUS.sm),
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  presetChipActive: {
    backgroundColor: COLORS.primary + "18",
    borderColor: COLORS.primary,
  },
  presetText: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
  presetTextActive: { color: COLORS.primary, fontWeight: "700" },
  presetTextMuted: { color: COLORS.textMuted },
  // Payout rows
  payRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: webSc(SPACING.xs),
    borderTopWidth: 1,
    borderTopColor: COLORS.border + "60",
  },
  payPlace: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.text,
    fontWeight: "700",
    width: webSc(44),
  },
  payPctGroup: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  pctBtn: {
    width: webSc(28),
    height: webSc(28),
    borderRadius: webSc(RADIUS.sm),
    backgroundColor: COLORS.primary + "18",
    alignItems: "center",
    justifyContent: "center",
  },
  pctBtnOff: { opacity: 0.3 },
  pctBtnText: {
    fontSize: webMs(FONT_SIZES.md),
    color: COLORS.primary,
    fontWeight: "700",
  },
  payPct: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.text,
    fontWeight: "700",
    minWidth: webSc(48),
    textAlign: "center",
  },
  payAmt: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.text,
    fontWeight: "700",
    width: webSc(80),
    textAlign: "right",
  },
  payAmtCustom: { color: COLORS.warning },
  payAmtEdit: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    justifyContent: "flex-end",
  },
  dollar: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    marginRight: webSc(2),
  },
  amtInput: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.text,
    fontWeight: "600",
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: webSc(RADIUS.sm),
    paddingVertical: webSc(SPACING.xs),
    paddingHorizontal: webSc(SPACING.sm),
    minWidth: webSc(90),
    textAlign: "right",
  },
  // Card footer
  cardFootRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: webSc(SPACING.sm),
  },
  customBtn: {
    paddingHorizontal: webSc(SPACING.md),
    paddingVertical: webSc(SPACING.xs),
    borderRadius: webSc(RADIUS.sm),
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  customBtnText: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.primary,
    fontWeight: "700",
  },
  remaining: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.textSecondary,
    fontWeight: "600",
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
