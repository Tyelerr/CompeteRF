// src/views/screens/admin/giveaway-console/earning-rules.screen.tsx
// WEB desktop Giveaway Management → Earning Rules (Super Admin). Edits the server-side
// giveaway_earning_rules row (referral rewards, attribution window, monthly cap, review threshold,
// milestone bonuses) and reviews flagged referrals. Rules apply to new referral claims; credits
// already issued are never changed. Entries never expire.
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, Pressable, Switch, Text, TextInput, View } from "react-native";
import { COLORS } from "../../../../theme/colors";
import { formatConsoleDate } from "../../../../utils/giveaway-console";
import { RULE_LIMITS } from "../../../../utils/earning-rules";
import { useGiveawayEarningRules } from "../../../../viewmodels/useGiveawayEarningRules";
import { DetailSection } from "./AdminModal";
import { GiveawayAdminHeader, GiveawayAdminPage, useGiveawayAdminNav } from "./giveaway-admin-shell";
import { ConsoleButton, StatusPill } from "./giveaway-console.parts";
import { consoleSt, tint } from "./giveaway-console.styles";
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
          <View style={consoleSt.formColumns}>
            <View style={consoleSt.formCol}>
              <ReferralRules vm={vm} />
            </View>
            <View style={[consoleSt.formCol, { gap: 24 }]}>
              <Milestones vm={vm} />
              <DetailSection title="Entry expiration">
                <View style={rulesSt.pad}>
                  <Text allowFontScaling={false} style={consoleSt.cellText}>Never</Text>
                  <Text allowFontScaling={false} style={rulesSt.help}>
                    Giveaway Entries stay in the wallet until spent. Expiration isn&apos;t enabled.
                  </Text>
                </View>
              </DetailSection>
              <DetailSection title="More ways to earn (later)">
                <View style={[rulesSt.pad, { flexDirection: "row", flexWrap: "wrap", gap: 8 }]}>
                  {["Complete profile", "First tournament registration", "First tournament played"].map((t) => (
                    <View key={t} style={rulesSt.futureChip}>
                      <Text allowFontScaling={false} style={rulesSt.futureChipText}>{t}</Text>
                    </View>
                  ))}
                </View>
              </DetailSection>
            </View>
          </View>
          <FlaggedReferrals vm={vm} />
        </>
      )}
    </GiveawayAdminPage>
  );
}

function Stats({ vm }: { vm: Vm }) {
  const s = vm.stats!;
  const items = [
    { label: "Referrals (all time)", value: s.referrals_total },
    { label: "Referrals this month", value: s.referrals_this_month },
    { label: "Referrer entries this month", value: s.referrer_credits_this_month },
    { label: "New-user entries this month", value: s.referred_credits_this_month },
    { label: "Milestone bonuses awarded", value: s.milestone_awards_total },
    { label: "Open review flags", value: s.flagged_open },
  ];
  return (
    <View style={consoleSt.statStrip}>
      {items.map((it, i) => (
        <View key={it.label} style={[consoleSt.stat, i > 0 && consoleSt.statDivider]}>
          <Text allowFontScaling={false} style={consoleSt.statValue}>{Number(it.value).toLocaleString()}</Text>
          <Text allowFontScaling={false} style={consoleSt.statLabel}>{it.label}</Text>
        </View>
      ))}
    </View>
  );
}

function NumberRow({ vm, field, label, unit, help }: { vm: Vm; field: NumField; label: string; unit: string; help: string }) {
  const err = vm.errors?.fields[field];
  const lim = RULE_LIMITS[field];
  return (
    <View style={rulesSt.row}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text allowFontScaling={false} style={rulesSt.label}>{label}</Text>
        <Text allowFontScaling={false} style={rulesSt.help}>{help}</Text>
        {err ? <Text allowFontScaling={false} style={rulesSt.error}>{err}</Text> : null}
      </View>
      <View style={rulesSt.inputWrap}>
        <TextInput
          style={[rulesSt.input, err && rulesSt.inputError]}
          value={vm.draft![field]}
          onChangeText={(t) => vm.setNumber(field, t)}
          keyboardType="number-pad"
          accessibilityLabel={label}
          maxLength={String(lim.max).length}
        />
        <Text allowFontScaling={false} style={rulesSt.unit}>{unit}</Text>
      </View>
    </View>
  );
}

function ToggleRow({ value, onChange, label, help }: { value: boolean; onChange: (v: boolean) => void; label: string; help: string }) {
  return (
    <View style={rulesSt.row}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text allowFontScaling={false} style={rulesSt.label}>{label}</Text>
        <Text allowFontScaling={false} style={rulesSt.help}>{help}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={label}
        trackColor={{ false: COLORS.surfaceLight, true: COLORS.primary }}
        thumbColor={COLORS.white}
        {...({ activeThumbColor: COLORS.white } as any)}
      />
    </View>
  );
}

function ReferralRules({ vm }: { vm: Vm }) {
  const d = vm.draft!;
  const off = !d.referral_rewards_enabled;
  return (
    <DetailSection title="Referral rewards">
      <ToggleRow
        value={d.referral_rewards_enabled}
        onChange={(v) => vm.update("referral_rewards_enabled", v)}
        label="Referral rewards enabled"
        help="A referral succeeds when a new account's Compete profile is created and the invite is claimed. Turning this off stops new credits; attribution still works."
      />
      <View style={off ? rulesSt.dim : undefined}>
        <NumberRow vm={vm} field="referrer_reward" label="Referrer reward" unit="entries" help="Given to the person who shared the invite, per successful referral." />
        <NumberRow vm={vm} field="referred_reward" label="New user reward" unit="entries" help="Given to the newly referred user (once — one referral per account)." />
        <NumberRow
          vm={vm}
          field="attribution_window_days"
          label="Attribution window"
          unit="days"
          help="An invite can be claimed only by accounts created within this many days."
        />
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
    </DetailSection>
  );
}

function Milestones({ vm }: { vm: Vm }) {
  const d = vm.draft!;
  const off = !d.milestones_enabled || !d.referral_rewards_enabled;
  const sorted = [...d.milestones].sort((a, b) => (Number(a.threshold) || 0) - (Number(b.threshold) || 0));
  return (
    <DetailSection
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
          <Text allowFontScaling={false} style={consoleSt.prose}>No milestones. Add one to reward referral streaks.</Text>
        ) : (
          sorted.map((m) => {
            const err = vm.errors?.milestones[m.key];
            return (
              <View key={m.key} style={rulesSt.milestoneRow}>
                <View style={rulesSt.inputWrap}>
                  <TextInput
                    style={[rulesSt.input, err && rulesSt.inputError]}
                    value={m.threshold}
                    onChangeText={(t) => vm.setMilestone(m.key, "threshold", t)}
                    keyboardType="number-pad"
                    accessibilityLabel="Referrals needed"
                    maxLength={6}
                  />
                  <Text allowFontScaling={false} style={rulesSt.unit}>referrals →</Text>
                </View>
                <View style={rulesSt.inputWrap}>
                  <Text allowFontScaling={false} style={rulesSt.unit}>+</Text>
                  <TextInput
                    style={[rulesSt.input, err && rulesSt.inputError]}
                    value={m.bonus}
                    onChangeText={(t) => vm.setMilestone(m.key, "bonus", t)}
                    keyboardType="number-pad"
                    accessibilityLabel="Bonus entries"
                    maxLength={4}
                  />
                  <Text allowFontScaling={false} style={rulesSt.unit}>entries</Text>
                </View>
                <View style={{ flex: 1 }}>{err ? <Text allowFontScaling={false} style={rulesSt.error}>{err}</Text> : null}</View>
                <Pressable
                  onPress={() => vm.removeMilestone(m.key)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${m.threshold}-referral milestone`}
                  style={({ hovered }: any) => [consoleSt.menuBtn, hovered && consoleSt.menuBtnHover]}
                >
                  <Ionicons name="trash-outline" size={16} color={COLORS.error} />
                </Pressable>
              </View>
            );
          })
        )}
        {vm.errors?.milestonesGeneral ? <Text allowFontScaling={false} style={[rulesSt.error, rulesSt.pad]}>{vm.errors.milestonesGeneral}</Text> : null}
        <Text allowFontScaling={false} style={[rulesSt.help, rulesSt.pad]}>
          Each milestone pays once per referrer. Raising or adding a milestone below someone&apos;s current count pays it on their next successful referral.
        </Text>
      </View>
    </DetailSection>
  );
}

function FlaggedReferrals({ vm }: { vm: Vm }) {
  const open = vm.flagged.filter((f) => !f.reviewed_at);
  return (
    <View style={{ marginTop: 24 }}>
      <DetailSection title={`Referrals flagged for review (${open.length} open)`}>
        {vm.flagged.length === 0 ? (
          <Text allowFontScaling={false} style={consoleSt.prose}>
            Nothing flagged. Referrals are flagged when one referrer exceeds the review threshold within 24 hours.
          </Text>
        ) : (
          vm.flagged.map((f) => (
            <View key={f.id} style={[consoleSt.miniRow, f.reviewed_at ? rulesSt.dim : null]}>
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
              <View style={{ width: 230, flexDirection: "row", gap: 6 }}>
                <StatusPill status={REWARD_PILL[f.reward_status] ?? "draft"} label={`Referrer: ${REWARD_LABEL[f.reward_status] ?? f.reward_status}`} />
                <StatusPill status={REWARD_PILL[f.referred_reward_status] ?? "draft"} label={`New: ${REWARD_LABEL[f.referred_reward_status] ?? f.referred_reward_status}`} />
              </View>
              <View style={{ width: 120, alignItems: "flex-end" }}>
                {f.reviewed_at ? (
                  <Text allowFontScaling={false} style={consoleSt.cellSub}>Reviewed {formatConsoleDate(f.reviewed_at)}</Text>
                ) : (
                  <ConsoleButton label="Mark reviewed" busy={vm.reviewing === f.id} onPress={() => vm.reviewFlag(f.id)} />
                )}
              </View>
            </View>
          ))
        )}
        {vm.flagged.length > 0 ? (
          <View style={[consoleSt.notice, { borderColor: COLORS.border, backgroundColor: tint(COLORS.textMuted), margin: 12 }]}>
            <Text allowFontScaling={false} style={[consoleSt.noticeText, { color: COLORS.textSecondary }]}>
              Flags never withhold credits. To take entries back, use Entry Wallet → Remove entries (reason
              required, ledgered).
            </Text>
          </View>
        ) : null}
      </DetailSection>
    </View>
  );
}
