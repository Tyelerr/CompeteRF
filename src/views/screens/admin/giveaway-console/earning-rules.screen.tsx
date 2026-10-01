// src/views/screens/admin/giveaway-console/earning-rules.screen.tsx
// WEB desktop Giveaway Management → Earning Rules (Super Admin). Edits the server-side
// giveaway_earning_rules row (referral rewards, attribution window, monthly cap, review threshold,
// milestone bonuses) and reviews flagged referrals. Rules apply to new referral claims; credits
// already issued are never changed. Entries never expire.
//
// Layout: stat strip → 2-column settings grid (left: Referral rewards; right: Milestone bonuses,
// Entry expiration, More ways to earn) → full-width Flagged referrals. Every panel shares one
// header / row / padding treatment, and every numeric control sits in the same fixed
// [input][unit] column so values and units line up across panels. Stacks to one column on
// narrow web widths.
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, Pressable, Switch, Text, TextInput, View, useWindowDimensions } from "react-native";
import { COLORS } from "../../../../theme/colors";
import { formatConsoleDate } from "../../../../utils/giveaway-console";
import { RULE_LIMITS } from "../../../../utils/earning-rules";
import { useGiveawayEarningRules } from "../../../../viewmodels/useGiveawayEarningRules";
import { GiveawayAdminHeader, GiveawayAdminPage, useGiveawayAdminNav } from "./giveaway-admin-shell";
import { ConsoleButton, StatusPill } from "./giveaway-console.parts";
import { consoleSt } from "./giveaway-console.styles";
import { rulesSt } from "./earning-rules.styles";

type Vm = ReturnType<typeof useGiveawayEarningRules>;
type NumField = "referrer_reward" | "referred_reward" | "attribution_window_days" | "monthly_referrer_cap" | "velocity_flag_threshold";

const REWARD_PILL: Record<string, string> = { rewarded: "active", capped: "ended", not_eligible: "archived", failed: "cancelled", pending: "draft" };
const REWARD_LABEL: Record<string, string> = { rewarded: "Rewarded", capped: "Capped", not_eligible: "Not eligible", failed: "Failed", pending: "Pending" };

export function EarningRulesScreen() {
  const nav = useGiveawayAdminNav();
  const vm = useGiveawayEarningRules();

  const footer =
    vm.canManage && vm.draft ? (
      <View style={consoleSt.formFooter}>
        <View style={consoleSt.formFooterInner}>
          <Text allowFontScaling={false} style={consoleSt.formFooterNote} numberOfLines={2}>
            {vm.saveError
              ? vm.saveError
              : vm.savedNotice
                ? vm.savedNotice
                : vm.dirty
                  ? "Unsaved changes — rules apply to new referral claims; credits already issued never change."
                  : vm.saved?.updated_at
                    ? `Last changed ${formatConsoleDate(vm.saved.updated_at)}${vm.saved.updated_by_name ? ` by ${vm.saved.updated_by_name}` : ""}`
                    : "Defaults"}
          </Text>
          <ConsoleButton label="Discard" onPress={vm.discard} disabled={!vm.dirty || vm.saving} />
          <ConsoleButton label="Save rules" variant="primary" onPress={vm.save} disabled={!vm.canSave} busy={vm.saving} />
        </View>
      </View>
    ) : null;

  return (
    <GiveawayAdminPage footer={footer}>
      <GiveawayAdminHeader
        title="Earning Rules"
        subtitle="How users earn Giveaway Entries. Entries go into one general wallet and never expire."
        section="rules"
        backLabel="Giveaway Management"
        onBack={() => nav.back()}
      />

      {!vm.canManage ? (
        <View style={consoleSt.readOnlyBanner}>
          <Text allowFontScaling={false} style={consoleSt.readOnlyText}>Earning rules are available to Super Admins only.</Text>
        </View>
      ) : vm.loading ? (
        <View style={consoleSt.empty}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : vm.loadError || !vm.draft ? (
        <View style={consoleSt.empty}>
          <Text allowFontScaling={false} style={consoleSt.emptySub}>{vm.loadError ?? "Couldn't load earning rules."}</Text>
          <ConsoleButton label="Retry" icon="refresh" onPress={vm.reload} />
        </View>
      ) : (
        <>
          {vm.stats ? <Stats vm={vm} /> : null}
          <View style={rulesSt.grid}>
            <View style={rulesSt.col}>
              <ReferralRules vm={vm} />
            </View>
            <View style={rulesSt.col}>
              <Milestones vm={vm} />
              <Panel title="Entry expiration">
                <View style={rulesSt.infoRow}>
                  <Text allowFontScaling={false} style={rulesSt.label}>Never</Text>
                  <Text allowFontScaling={false} style={rulesSt.help}>Giveaway Entries stay in the wallet until spent.</Text>
                </View>
              </Panel>
              <Panel title="More ways to earn" badge="Later">
                <View style={rulesSt.pillRow}>
                  {["Complete profile", "First tournament registration", "First tournament played"].map((t) => (
                    <View key={t} style={rulesSt.futureChip}>
                      <Text allowFontScaling={false} style={rulesSt.futureChipText}>{t}</Text>
                    </View>
                  ))}
                </View>
              </Panel>
            </View>
          </View>
          <FlaggedReferrals vm={vm} />
        </>
      )}
    </GiveawayAdminPage>
  );
}

// ── Shared panel (same radius / border / header height / padding everywhere) ──────────────────
function Panel({
  title,
  badge,
  right,
  stretch,
  children,
}: {
  title: string;
  badge?: string | null;
  right?: React.ReactNode;
  stretch?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={[rulesSt.panel, stretch && rulesSt.panelStretch]}>
      <View style={rulesSt.panelHeader}>
        <Text allowFontScaling={false} style={rulesSt.panelTitle}>{title}</Text>
        {badge ? (
          <View style={rulesSt.badge}>
            <Text allowFontScaling={false} style={rulesSt.badgeText}>{badge}</Text>
          </View>
        ) : null}
        <View style={{ flex: 1 }} />
        {right}
      </View>
      {children}
    </View>
  );
}

function Stats({ vm }: { vm: Vm }) {
  const s = vm.stats!;
  // 6 equal cells on desktop; a balanced 3 × 2 grid on narrower web widths.
  const { width } = useWindowDimensions();
  const perRow = width >= 1200 ? 6 : 3;
  const items = [
    { label: "Referrals (all time)", value: s.referrals_total },
    { label: "Referrals this month", value: s.referrals_this_month },
    { label: "Referrer entries this month", value: s.referrer_credits_this_month },
    { label: "New-user entries this month", value: s.referred_credits_this_month },
    { label: "Milestone bonuses awarded", value: s.milestone_awards_total },
    { label: "Open review flags", value: s.flagged_open },
  ];
  return (
    <View style={rulesSt.statStrip}>
      {items.map((it, i) => (
        <View
          key={it.label}
          style={[
            rulesSt.stat,
            { width: `${100 / perRow}%` },
            i % perRow > 0 && rulesSt.statDivider,
            i >= perRow && rulesSt.statRowDivider,
          ]}
        >
          <Text allowFontScaling={false} style={rulesSt.statValue}>{Number(it.value).toLocaleString()}</Text>
          <Text allowFontScaling={false} style={rulesSt.statLabel} numberOfLines={1}>{it.label}</Text>
        </View>
      ))}
    </View>
  );
}

/** One fixed-width [input][unit] control, identical everywhere on the page. */
function NumberInput({
  value,
  onChange,
  label,
  unit,
  error,
  maxLength,
}: {
  value: string;
  onChange: (t: string) => void;
  label: string;
  unit?: string;
  error?: boolean;
  maxLength: number;
}) {
  return (
    <View style={[rulesSt.control, unit === undefined && rulesSt.controlBare]}>
      <TextInput
        style={[rulesSt.input, error && rulesSt.inputError]}
        value={value}
        onChangeText={onChange}
        keyboardType="number-pad"
        accessibilityLabel={label}
        maxLength={maxLength}
      />
      {unit !== undefined ? <Text allowFontScaling={false} style={rulesSt.unit} numberOfLines={1}>{unit}</Text> : null}
    </View>
  );
}

function SettingRow({ label, help, error, children }: { label: string; help: string; error?: string; children: React.ReactNode }) {
  return (
    <View style={rulesSt.row}>
      <View style={rulesSt.rowText}>
        <Text allowFontScaling={false} style={rulesSt.label}>{label}</Text>
        <Text allowFontScaling={false} style={rulesSt.help}>{help}</Text>
        {error ? <Text allowFontScaling={false} style={rulesSt.error}>{error}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function NumberRow({ vm, field, label, unit, help }: { vm: Vm; field: NumField; label: string; unit: string; help: string }) {
  const err = vm.errors?.fields[field];
  return (
    <SettingRow label={label} help={help} error={err}>
      <NumberInput
        value={vm.draft![field]}
        onChange={(t) => vm.setNumber(field, t)}
        label={label}
        unit={unit}
        error={!!err}
        maxLength={String(RULE_LIMITS[field].max).length}
      />
    </SettingRow>
  );
}

function ToggleRow({ value, onChange, label, help }: { value: boolean; onChange: (v: boolean) => void; label: string; help: string }) {
  return (
    <SettingRow label={label} help={help}>
      {/* Same control column as the number inputs, so the switch lines up with them. */}
      <View style={rulesSt.control}>
        <Switch
          value={value}
          onValueChange={onChange}
          accessibilityLabel={label}
          trackColor={{ false: COLORS.surfaceLight, true: COLORS.primary }}
          thumbColor={COLORS.white}
          {...({ activeThumbColor: COLORS.white } as any)}
        />
        <Text allowFontScaling={false} style={rulesSt.unit}>{value ? "On" : "Off"}</Text>
      </View>
    </SettingRow>
  );
}

function ReferralRules({ vm }: { vm: Vm }) {
  const d = vm.draft!;
  const off = !d.referral_rewards_enabled;
  return (
    <Panel title="Referral rewards" stretch>
      <ToggleRow
        value={d.referral_rewards_enabled}
        onChange={(v) => vm.update("referral_rewards_enabled", v)}
        label="Referral rewards enabled"
        help="A referral succeeds when a new account's Compete profile is created and the invite is claimed. Off stops new credits; attribution still works."
      />
      <View style={off ? rulesSt.dim : undefined}>
        <NumberRow vm={vm} field="referrer_reward" label="Referrer reward" unit="entries" help="Given to the person who shared the invite, per successful referral." />
        <NumberRow vm={vm} field="referred_reward" label="New user reward" unit="entries" help="Given to the newly referred user (once — one referral per account)." />
        <NumberRow vm={vm} field="attribution_window_days" label="Attribution window" unit="days" help="An invite can be claimed only by accounts created within this many days." />
        <NumberRow
          vm={vm}
          field="monthly_referrer_cap"
          label="Monthly referrer cap"
          unit="/ month"
          help="Max per-referral rewards a referrer can earn each calendar month (Arizona time). New users and milestone bonuses aren't capped."
        />
        <NumberRow
          vm={vm}
          field="velocity_flag_threshold"
          label="Review flag"
          unit="in 24 h"
          help="More referrals than this for one referrer within 24 hours are flagged below for review. Rewards are not withheld."
        />
      </View>
    </Panel>
  );
}

function Milestones({ vm }: { vm: Vm }) {
  const d = vm.draft!;
  const off = !d.milestones_enabled || !d.referral_rewards_enabled;
  const sorted = [...d.milestones].sort((a, b) => (Number(a.threshold) || 0) - (Number(b.threshold) || 0));
  return (
    <Panel
      title="Milestone bonuses"
      right={<ConsoleButton label="Add milestone" icon="add" onPress={vm.addMilestone} disabled={d.milestones.length >= RULE_LIMITS.milestone_count} />}
    >
      <ToggleRow
        value={d.milestones_enabled}
        onChange={(v) => vm.update("milestones_enabled", v)}
        label="Milestone bonuses enabled"
        help="One-time bonus when a referrer reaches each number of successful referrals, on top of the per-referral reward."
      />
      <View style={off ? rulesSt.dim : undefined}>
        {sorted.length === 0 ? (
          <View style={rulesSt.infoRow}>
            <Text allowFontScaling={false} style={rulesSt.help}>No milestones. Add one to reward referral streaks.</Text>
          </View>
        ) : (
          sorted.map((m) => {
            const err = vm.errors?.milestones[m.key];
            return (
              <View key={m.key} style={rulesSt.milestoneRow}>
                <View style={rulesSt.milestoneCells}>
                  <NumberInput value={m.threshold} onChange={(t) => vm.setMilestone(m.key, "threshold", t)} label="Referrals needed" error={!!err} maxLength={6} />
                  <Text allowFontScaling={false} style={rulesSt.milestoneJoin}>referrals → +</Text>
                  <NumberInput value={m.bonus} onChange={(t) => vm.setMilestone(m.key, "bonus", t)} label="Bonus entries" unit="entries" error={!!err} maxLength={4} />
                  <View style={{ flex: 1 }} />
                  <Pressable
                    onPress={() => vm.removeMilestone(m.key)}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${m.threshold}-referral milestone`}
                    style={({ hovered }: any) => [consoleSt.menuBtn, hovered && consoleSt.menuBtnHover]}
                  >
                    <Ionicons name="trash-outline" size={16} color={COLORS.error} />
                  </Pressable>
                </View>
                {err ? <Text allowFontScaling={false} style={rulesSt.error}>{err}</Text> : null}
              </View>
            );
          })
        )}
        {vm.errors?.milestonesGeneral ? (
          <View style={rulesSt.infoRow}>
            <Text allowFontScaling={false} style={rulesSt.error}>{vm.errors.milestonesGeneral}</Text>
          </View>
        ) : null}
        <View style={rulesSt.footnote}>
          <Text allowFontScaling={false} style={rulesSt.help}>
            Each milestone pays once per referrer. Adding or lowering a milestone below someone&apos;s current count pays it on their next successful referral.
          </Text>
        </View>
      </View>
    </Panel>
  );
}

function FlaggedReferrals({ vm }: { vm: Vm }) {
  const open = vm.flagged.filter((f) => !f.reviewed_at);
  return (
    <View style={rulesSt.flaggedWrap}>
      <Panel title="Referrals flagged for review" badge={`${open.length} open`}>
        {vm.flagged.length === 0 ? (
          <View style={rulesSt.infoRow}>
            <Text allowFontScaling={false} style={rulesSt.label}>No referrals currently need review.</Text>
            <Text allowFontScaling={false} style={rulesSt.help}>
              A referral is flagged when one referrer exceeds the review threshold within 24 hours. Flags never withhold rewards.
            </Text>
          </View>
        ) : (
          <>
            {vm.flagged.map((f) => (
              <View key={f.id} style={[rulesSt.flagRow, f.reviewed_at ? rulesSt.dim : null]}>
                <View style={{ width: 120 }}>
                  <Text allowFontScaling={false} style={consoleSt.cellText}>{formatConsoleDate(f.flagged_at)}</Text>
                  <Text allowFontScaling={false} style={consoleSt.cellSub}>#{f.id}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text allowFontScaling={false} style={consoleSt.cellText} numberOfLines={1}>
                    {f.referrer_name ?? "Deleted account"}
                    {f.referrer_username ? <Text style={consoleSt.cellMuted}> @{f.referrer_username}</Text> : null}
                    <Text style={consoleSt.cellMuted}>  →  </Text>
                    {f.referred_name ?? "Unknown"}
                    {f.referred_username ? <Text style={consoleSt.cellMuted}> @{f.referred_username}</Text> : null}
                  </Text>
                  <Text allowFontScaling={false} style={consoleSt.cellSub} numberOfLines={1}>{f.flag_reason}</Text>
                </View>
                <View style={{ width: 280, flexDirection: "row", gap: 6 }}>
                  <StatusPill status={REWARD_PILL[f.reward_status] ?? "draft"} label={`Referrer: ${REWARD_LABEL[f.reward_status] ?? f.reward_status}`} />
                  <StatusPill status={REWARD_PILL[f.referred_reward_status] ?? "draft"} label={`New: ${REWARD_LABEL[f.referred_reward_status] ?? f.referred_reward_status}`} />
                </View>
                <View style={{ width: 130, alignItems: "flex-end" }}>
                  {f.reviewed_at ? (
                    <Text allowFontScaling={false} style={consoleSt.cellSub}>Reviewed {formatConsoleDate(f.reviewed_at)}</Text>
                  ) : (
                    <ConsoleButton label="Mark reviewed" busy={vm.reviewing === f.id} onPress={() => vm.reviewFlag(f.id)} />
                  )}
                </View>
              </View>
            ))}
            <View style={rulesSt.footnote}>
              <Text allowFontScaling={false} style={rulesSt.help}>
                Flags never withhold credits. To take entries back, use Entry Wallet → Remove entries (reason required, ledgered).
              </Text>
            </View>
          </>
        )}
      </Panel>
    </View>
  );
}
