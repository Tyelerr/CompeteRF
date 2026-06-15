// src/views/components/tournament/live/PrizePoolView.tsx
// Prize Pool setup for the Manage Tournament hub (Setup phase, before the bracket
// is drawn). Compact card layout: a summary card, a payout card for the entry
// pool, one per side pot, and a final totals card.
//
// Payout percentages ALWAYS total 100 — the +/- steppers redistribute on every
// nudge and presets are normalized — so there is no percent-error state. Manual
// dollar editing lives behind a "Custom Edit" toggle and is clamped to the pool.
// The parent owns the working config + persistence; this component emits changes.

import { useEffect, useState } from "react";
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
  computeBreakdown,
  entryPoolTotal,
  placesFromPercents,
  presetSplit,
  setPercent,
  sidePotTotal,
} from "../../../../utils/prize-pool";

export interface PrizePoolSidePot {
  name: string;
  amount: number; // per-player buy-in
  players: number; // entrants who bought into this pot
}

export interface PrizePoolFee {
  name: string;
  perPlayer: number; // per-player slice carved from the entry fee
}

interface PrizePoolViewProps {
  config: PrizePoolConfig;
  onChange: (next: PrizePoolConfig) => void;
  locked: boolean;
  players: number; // effective player count for the entry pool
  entryFee: number;
  addedMoney: number;
  sidePots: PrizePoolSidePot[];
  fees: PrizePoolFee[]; // built-in entry-fee deductions (defined in Settings)
  feesAddedOnTop: boolean; // true = fees collected on top of entry, not deducted
}

// Dollar nudge for the Custom-mode steppers (type an exact amount, then adjust).
const AMT_STEP = 5;

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

// Editable percent cell: typed value commits on blur and rebalances the others
// so the total stays 100. Local draft keeps typing smooth; it resyncs when the
// committed value changes (via steppers, presets, or a sibling row's edit).
const PercentCell = ({
  value,
  disabled,
  onCommit,
}: {
  value: number;
  disabled: boolean;
  onCommit: (v: number) => void;
}) => {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  if (disabled) {
    return (
      <Text allowFontScaling={false} style={styles.payPct}>
        {value}%
      </Text>
    );
  }
  return (
    <View style={styles.pctInputWrap}>
      <TextInput
        allowFontScaling={false}
        style={styles.pctInput}
        value={draft}
        onChangeText={(t) => setDraft(t.replace(/[^0-9]/g, ""))}
        onEndEditing={() => {
          const v = parseInt(draft, 10);
          if (isNaN(v)) setDraft(String(value));
          else onCommit(v);
        }}
        keyboardType="number-pad"
        maxLength={3}
        selectTextOnFocus
      />
      <Text allowFontScaling={false} style={styles.pctSign}>
        %
      </Text>
    </View>
  );
};

// Editable dollar cell (Custom mode): typed whole-dollar amount commits on blur
// as an exact override for that place. Local draft keeps typing smooth.
const AmountCell = ({
  value,
  disabled,
  onCommit,
}: {
  value: number;
  disabled: boolean;
  onCommit: (v: number) => void;
}) => {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  if (disabled) {
    return (
      <Text allowFontScaling={false} style={styles.payAmt}>
        {money(value)}
      </Text>
    );
  }
  return (
    <View style={styles.amtInputWrap}>
      <Text allowFontScaling={false} style={styles.amtSign}>
        $
      </Text>
      <TextInput
        allowFontScaling={false}
        style={styles.amtInput}
        value={draft}
        onChangeText={(t) => setDraft(t.replace(/[^0-9]/g, ""))}
        onEndEditing={() => {
          const v = parseInt(draft, 10);
          if (isNaN(v)) setDraft(String(value));
          else onCommit(v);
        }}
        keyboardType="number-pad"
        maxLength={7}
        selectTextOnFocus
      />
    </View>
  );
};

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
  const breakdown = computeBreakdown(pool, places);
  const percents = places.map((p) => p.percent);
  const preset = activePreset(places);
  const count = places.length;
  // Custom = anything that isn't a named preset (adjusted percents OR typed dollar
  // overrides). Either way the card is dollar-editable, so nudging a stepper off a
  // preset drops straight into editable Custom rather than a dead "Custom" label.
  const customMode = preset === "custom";
  const remaining = breakdown.remaining; // pool − total assigned

  const setCount = (n: number) => {
    const clamped = Math.max(1, Math.min(MAX_PLACES, n));
    if (clamped === count) return;
    // Reset to a clean preset that totals 100 (keep the chosen shape if named).
    const key: PresetKey = preset === "custom" ? "topHeavy" : preset;
    onPlaces(placesFromPercents(presetSplit(key, clamped)));
  };

  const applyPreset = (key: PresetKey) => {
    if (key === "custom") {
      // Enter dollar mode: seed each place with its current payout as an exact
      // amount the TD can then edit.
      onPlaces(
        places.map((p, i) => ({ ...p, amountOverride: breakdown.places[i].amount })),
      );
      return;
    }
    onPlaces(placesFromPercents(presetSplit(key, count)));
  };

  const bump = (i: number, delta: number) =>
    onPlaces(placesFromPercents(adjustPercents(percents, i, delta)));

  const commitPercent = (i: number, v: number) =>
    onPlaces(placesFromPercents(setPercent(percents, i, v)));

  const commitAmount = (i: number, dollars: number) =>
    onPlaces(
      places.map((p, k) =>
        k === i ? { ...p, amountOverride: Math.max(0, Math.round(dollars)) } : p,
      ),
    );

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
                onPress={() => applyPreset(p.key)}
              >
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.presetText,
                    active && styles.presetTextActive,
                  ]}
                >
                  {p.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Payout rows. Percent mode: place · [−] percent [+] · amount. Custom mode:
          place · derived percent · editable $ amount. */}
      {breakdown.places.map((r, i) => {
        const derivedPct = pool > 0 ? Math.round((r.amount / pool) * 100) : 0;
        return (
          <View key={i} style={styles.payRow}>
            <Text allowFontScaling={false} style={styles.payPlace}>
              {ordinal(r.place)}
            </Text>
            {customMode ? (
              <>
                <Text allowFontScaling={false} style={styles.derivedPct}>
                  {derivedPct}%
                </Text>
                {locked ? (
                  <Text allowFontScaling={false} style={styles.payAmt}>
                    {money(r.amount)}
                  </Text>
                ) : (
                  <View style={styles.amtGroup}>
                    <TouchableOpacity
                      style={[styles.pctBtn, r.amount <= 0 && styles.pctBtnOff]}
                      disabled={r.amount <= 0}
                      onPress={() => commitAmount(i, Math.max(0, r.amount - AMT_STEP))}
                    >
                      <Text allowFontScaling={false} style={styles.pctBtnText}>
                        {"−"}
                      </Text>
                    </TouchableOpacity>
                    <AmountCell
                      value={r.amount}
                      disabled={false}
                      onCommit={(v) => commitAmount(i, v)}
                    />
                    <TouchableOpacity
                      style={styles.pctBtn}
                      onPress={() => commitAmount(i, r.amount + AMT_STEP)}
                    >
                      <Text allowFontScaling={false} style={styles.pctBtnText}>
                        +
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
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
                  <PercentCell
                    value={r.percent}
                    disabled={locked}
                    onCommit={(v) => commitPercent(i, v)}
                  />
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
                <Text allowFontScaling={false} style={styles.payAmt}>
                  {money(r.amount)}
                </Text>
              </>
            )}
          </View>
        );
      })}

      {/* Leftover / over-allocation note. */}
      {remaining > 0.004 ? (
        <Text allowFontScaling={false} style={styles.leftoverText}>
          {money(remaining)} still to pay out
        </Text>
      ) : remaining < -0.004 ? (
        <Text allowFontScaling={false} style={styles.overText}>
          {money(-remaining)} over the pool — trim a payout
        </Text>
      ) : (
        <Text allowFontScaling={false} style={styles.fullyText}>
          Pool fully paid out
        </Text>
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
  fees,
  feesAddedOnTop,
}: PrizePoolViewProps) => {
  const grossEntry = Math.max(0, players) * Math.max(0, entryFee);
  const feePerPlayer = fees.reduce((s, f) => s + Math.max(0, f.perPlayer), 0);
  const totalFees = Math.max(0, players) * feePerPlayer;
  const includedAdded = config.includeAddedMoney ? Math.max(0, addedMoney) : 0;
  // Net entry payout pool. Included mode: entry minus fees. On-top mode: full
  // entry to the pool (fees collected separately). Plus added money.
  const entryPool = entryPoolTotal(
    players,
    entryFee,
    feePerPlayer,
    feesAddedOnTop,
    config.includeAddedMoney,
    addedMoney,
  );
  const netEntryBeforeAdded = Math.max(0, entryPool - includedAdded);
  const entryBreakdown = computeBreakdown(entryPool, config.entryPlaces);

  const sidePotRows = sidePots.map((sp) => {
    const cfg = config.sidePots.find((s) => s.name === sp.name);
    const places = cfg?.places ?? placesFromPercents(presetSplit("topHeavy", 2));
    const pool = sidePotTotal(sp.players, sp.amount);
    return { sp, places, pool, breakdown: computeBreakdown(pool, places) };
  });

  const sidePotsTotal = sidePotRows.reduce((s, r) => s + r.pool, 0);
  // On-top fees are extra money collected from players; included fees are part
  // of the entry already counted in grossEntry.
  const totalCollected =
    grossEntry + sidePotsTotal + includedAdded + (feesAddedOnTop ? totalFees : 0);
  const totalPrizePool = entryPool + sidePotsTotal; // net of fees
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

      {/* Money collected + fees → net pool */}
      <Card title="Prize Pool Summary">
        <Row label="Players entered" value={String(players)} />
        <Row label="Entry fee" value={money(entryFee)} />
        <Row
          label="Gross entry"
          value={`${players} × ${money(entryFee)} = ${money(grossEntry)}`}
        />
        {fees.map((f, i) => (
          <Row
            key={i}
            label={`${feesAddedOnTop ? "+" : "−"} ${f.name || "Fee"}`}
            value={`${players} × ${money(f.perPlayer)} = ${money(
              Math.max(0, players) * Math.max(0, f.perPlayer),
            )}`}
          />
        ))}
        {fees.length > 0 && (
          <Row
            label={feesAddedOnTop ? "Entry to pool" : "Net entry"}
            value={money(netEntryBeforeAdded)}
          />
        )}
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

      {/* Entry payouts (over the NET pool) */}
      <PayoutCard
        title="Entry Payouts"
        pool={entryPool}
        poolNote={
          fees.length > 0 || includedAdded > 0
            ? `${money(grossEntry)} entry${
                !feesAddedOnTop && totalFees > 0 ? ` − ${money(totalFees)} fees` : ""
              }${includedAdded > 0 ? ` + ${money(includedAdded)} added` : ""}`
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

      {/* Final summary: collected → fees → net pool → payouts */}
      <Card title="Summary">
        <Row label="Gross entry collected" value={money(grossEntry)} />
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
        <Row label="Total collected" value={money(totalCollected)} strong />
        <Row label="Total fees / deductions" value={money(totalFees)} />
        <Row label="Net payout pool" value={money(totalPrizePool)} strong />
        <Row label="Total payouts assigned" value={money(totalPayout)} strong />
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
  pctInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: webSc(RADIUS.sm),
    paddingHorizontal: webSc(SPACING.xs),
    marginHorizontal: webSc(SPACING.xs),
  },
  pctInput: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.text,
    fontWeight: "700",
    paddingVertical: webSc(SPACING.xs),
    minWidth: webSc(34),
    textAlign: "center",
  },
  pctSign: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    fontWeight: "700",
  },
  payAmt: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.text,
    fontWeight: "700",
    width: webSc(80),
    textAlign: "right",
  },
  // Custom (dollar) mode
  derivedPct: {
    flex: 1,
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    fontWeight: "600",
    textAlign: "center",
  },
  amtGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: webSc(SPACING.xs),
  },
  amtInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: webSc(RADIUS.sm),
    paddingHorizontal: webSc(SPACING.xs),
    width: webSc(72),
    justifyContent: "flex-end",
  },
  amtSign: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    fontWeight: "700",
  },
  amtInput: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.text,
    fontWeight: "700",
    paddingVertical: webSc(SPACING.xs),
    minWidth: webSc(50),
    textAlign: "right",
  },
  leftoverText: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.warning,
    fontWeight: "700",
    marginTop: webSc(SPACING.sm),
    textAlign: "right",
  },
  overText: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.error,
    fontWeight: "700",
    marginTop: webSc(SPACING.sm),
    textAlign: "right",
  },
  fullyText: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.success,
    fontWeight: "700",
    marginTop: webSc(SPACING.sm),
    textAlign: "right",
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
