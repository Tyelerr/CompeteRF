// src/views/screens/admin/chip/chip-manage.screen.tsx
// Chip Tournament manage flow (TD / Bar Owner). Structured like the bracket hub:
// a Setup / Live / Results phase with sub-page tabs. Setup pages = Settings (name,
// format, buy-backs, Fargo chip table), Players (registration), Tables (add/remove
// + mark stream), Review & Start. Live pages = Dashboard, Tables (winner buttons +
// timers), Queue, Players (chips/records + buy-back). Results = Standings.
// Rules in chip.engine.ts; persistence (real tables) in chip.service.ts.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../../../theme/colors";
import { RADIUS, SPACING } from "../../../../theme/spacing";
import { FONT_SIZES } from "../../../../theme/typography";
import { webMs, webSc } from "../../../../utils/scaling";
import { Dropdown } from "../../../components/common/dropdown";
import {
  PhaseNav,
  PhaseNavPhase,
} from "../../../components/tournament/live/PhaseNav";
import { useChipTournament } from "../../../../viewmodels/use.chip.tournament";
import {
  chipsForFargo,
  dashboard,
  LONG_MATCH_MS,
  matchElapsedMs,
  teamFargoOf,
  teamName,
} from "../../../../models/services/chip.engine";
import { ChipEntry } from "../../../../models/types/chip.types";

const isWeb = Platform.OS === "web";

const FORMAT_OPTS = [
  { label: "Singles", value: "singles" },
  { label: "Scotch Doubles", value: "scotch_doubles" },
];
const DEFAULT_SINGLES_TIERS = [
  { minFargo: 700, maxFargo: null as number | null, chips: 1 },
  { minFargo: 600, maxFargo: 699, chips: 2 },
  { minFargo: 500, maxFargo: 599, chips: 3 },
  { minFargo: 400, maxFargo: 499, chips: 4 },
  { minFargo: 0, maxFargo: 399, chips: 5 },
];
const DEFAULT_DOUBLES_TIERS = [
  { minFargo: 1300, maxFargo: null as number | null, chips: 2 },
  { minFargo: 1200, maxFargo: 1299, chips: 3 },
  { minFargo: 1100, maxFargo: 1199, chips: 4 },
  { minFargo: 1000, maxFargo: 1099, chips: 5 },
  { minFargo: 0, maxFargo: 999, chips: 6 },
];

const SETUP_PAGES = ["Settings", "Players", "Tables", "Review"];
const LIVE_PAGES = ["Dashboard", "Tables", "Queue", "Players"];
const RESULTS_PAGES = ["Standings", "History"];
const DEFAULT_PAGE: Record<string, string> = {
  setup: "Settings",
  live: "Tables",
  results: "Standings",
};

const fmtClock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export const ChipManageScreen = ({ id }: { id: number }) => {
  const vm = useChipTournament(id);
  const router = useRouter();
  const [selectedPhase, setSelectedPhase] = useState<"setup" | "live" | "results">("setup");
  const [page, setPage] = useState<string>("Settings");
  const lastPhase = useRef<string>("setup");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (vm.phase !== "live") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [vm.phase]);

  // Follow the lifecycle: when the tournament changes phase (Start / End), jump
  // the nav to that phase's first page.
  useEffect(() => {
    if (vm.phase !== lastPhase.current) {
      lastPhase.current = vm.phase;
      setSelectedPhase(vm.phase);
      setPage(DEFAULT_PAGE[vm.phase]);
    }
  }, [vm.phase]);

  if (vm.loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }
  if (vm.error || !vm.chip || !vm.tournament) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{vm.error ?? "Tournament not found."}</Text>
      </View>
    );
  }

  const { chip, tournament } = vm;
  const doubles = chip.settings.format === "scotch_doubles";
  const entryById = (eid: string | null | undefined) =>
    chip.entries.find((e) => e.id === eid) ?? null;
  const chipPreview = (e: ChipEntry) =>
    chipsForFargo(chip.settings.tiers, teamFargoOf(e, chip.settings.format));
  const seedTiers = () =>
    vm.updateSettings({
      tiers: (doubles ? DEFAULT_DOUBLES_TIERS : DEFAULT_SINGLES_TIERS).map((t, i) => ({ id: `seed_${i}`, ...t })),
    });

  // ── Setup · Settings (incl. the Fargo chip table) ────────────────────────────
  const renderSettingsTab = () => (
    <>
      <Section title="Settings">
        <Field label="Tournament Name">
          <TextInput allowFontScaling={false} style={styles.input} value={tournament.name} onChangeText={vm.setName} placeholder="Tournament name" placeholderTextColor={COLORS.textMuted} />
        </Field>
        <Field label="Format">
          <Dropdown options={FORMAT_OPTS} value={chip.settings.format} onSelect={(v) => vm.updateSettings({ format: v as any })} />
        </Field>
        <ToggleRow
          label="Allow Buy-Backs"
          sub="Eliminated players can buy back into the queue"
          value={chip.settings.buyBacksAllowed}
          onChange={(v) => vm.updateSettings({ buyBacksAllowed: v })}
        />
      </Section>

      <Section title="Fargo Chip Table" action={<HeaderBtn label="+ Add Tier" onPress={vm.addTier} />}>
        <Text style={styles.hint}>
          {doubles
            ? "Combined team Fargo (Player 1 + Player 2) → starting chips."
            : "Player Fargo → starting chips. Higher Fargo = fewer chips."}
        </Text>
        {chip.settings.tiers.length === 0 ? (
          <TouchableOpacity style={styles.seedBtn} onPress={seedTiers}>
            <Text style={styles.seedBtnText}>Use default {doubles ? "doubles" : "singles"} table</Text>
          </TouchableOpacity>
        ) : (
          <>
            <View style={styles.tierHead}>
              <Text style={[styles.tierHeadText, styles.tierMin]}>Min</Text>
              <Text style={[styles.tierHeadText, styles.tierMax]}>Max</Text>
              <Text style={[styles.tierHeadText, styles.tierChips]}>Chips</Text>
              <View style={styles.tierDel} />
            </View>
            {chip.settings.tiers.map((t) => (
              <View key={t.id} style={styles.tierRow}>
                <TextInput allowFontScaling={false} style={[styles.tierInput, styles.tierMin]} value={String(t.minFargo ?? "")} onChangeText={(v) => vm.updateTier(t.id, { minFargo: parseInt(v.replace(/\D/g, "") || "0", 10) })} keyboardType="numeric" placeholder="0" placeholderTextColor={COLORS.textMuted} />
                <TextInput allowFontScaling={false} style={[styles.tierInput, styles.tierMax]} value={t.maxFargo == null ? "" : String(t.maxFargo)} onChangeText={(v) => { const d = v.replace(/\D/g, ""); vm.updateTier(t.id, { maxFargo: d === "" ? null : parseInt(d, 10) }); }} keyboardType="numeric" placeholder="∞" placeholderTextColor={COLORS.textMuted} />
                <TextInput allowFontScaling={false} style={[styles.tierInput, styles.tierChips]} value={String(t.chips ?? "")} onChangeText={(v) => vm.updateTier(t.id, { chips: parseInt(v.replace(/\D/g, "") || "0", 10) })} keyboardType="numeric" placeholder="1" placeholderTextColor={COLORS.textMuted} />
                <TouchableOpacity style={styles.tierDel} onPress={() => vm.removeTier(t.id)}>
                  <Text style={styles.delX}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}
      </Section>
    </>
  );

  // ── Setup · Players (registration) ───────────────────────────────────────────
  const renderPlayersSetup = () => (
    <Section title={`Players (${chip.entries.length})`} action={<HeaderBtn label="+ Add Player" onPress={vm.addEntry} />}>
      {chip.entries.length === 0 && <Text style={styles.hint}>No players yet. Add players to register them.</Text>}
      {chip.entries.map((e, i) => (
        <View key={e.id} style={styles.entryCard}>
          <View style={styles.entryTop}>
            <Text style={styles.entryNum}>#{i + 1}</Text>
            <View style={styles.entryChipPill}><Text style={styles.entryChipText}>{chipPreview(e)} chips</Text></View>
            <TouchableOpacity onPress={() => vm.removeEntry(e.id)}><Text style={styles.delX}>✕</Text></TouchableOpacity>
          </View>
          <View style={styles.entryRow}>
            <TextInput allowFontScaling={false} style={[styles.input, styles.flex2]} value={e.p1Name} onChangeText={(v) => vm.updateEntry(e.id, { p1Name: v })} placeholder={doubles ? "Player 1" : "Player name"} placeholderTextColor={COLORS.textMuted} />
            <TextInput allowFontScaling={false} style={[styles.input, styles.flex1]} value={e.p1Fargo == null ? "" : String(e.p1Fargo)} onChangeText={(v) => { const d = v.replace(/\D/g, ""); vm.updateEntry(e.id, { p1Fargo: d === "" ? null : parseInt(d, 10) }); }} keyboardType="numeric" placeholder="Fargo" placeholderTextColor={COLORS.textMuted} />
          </View>
          {doubles && (
            <View style={styles.entryRow}>
              <TextInput allowFontScaling={false} style={[styles.input, styles.flex2]} value={e.p2Name ?? ""} onChangeText={(v) => vm.updateEntry(e.id, { p2Name: v })} placeholder="Player 2" placeholderTextColor={COLORS.textMuted} />
              <TextInput allowFontScaling={false} style={[styles.input, styles.flex1]} value={e.p2Fargo == null ? "" : String(e.p2Fargo)} onChangeText={(v) => { const d = v.replace(/\D/g, ""); vm.updateEntry(e.id, { p2Fargo: d === "" ? null : parseInt(d, 10) }); }} keyboardType="numeric" placeholder="Fargo" placeholderTextColor={COLORS.textMuted} />
            </View>
          )}
          {!doubles && (
            <TextInput allowFontScaling={false} style={styles.input} value={e.p1Phone ?? ""} onChangeText={(v) => vm.updateEntry(e.id, { p1Phone: v })} placeholder="Phone (optional)" placeholderTextColor={COLORS.textMuted} keyboardType="phone-pad" />
          )}
          <View style={styles.entryToggles}>
            <MiniToggle label="Paid" value={e.paid} onChange={(v) => vm.updateEntry(e.id, { paid: v })} />
            <MiniToggle label="Checked in" value={e.checkedIn} onChange={(v) => vm.updateEntry(e.id, { checkedIn: v })} />
          </View>
        </View>
      ))}
    </Section>
  );

  // ── Setup · Tables (incl. stream marking) ────────────────────────────────────
  const renderTablesSetup = () => (
    <Section title={`Tables (${chip.tables.length})`} action={<HeaderBtn label="+ Add Table" onPress={vm.addTable} />}>
      <Text style={styles.hint}>Mark a table as the stream table here.</Text>
      {chip.tables.map((t) => (
        <View key={t.id} style={styles.tableSetupRow}>
          <View style={styles.tableSetupTop}>
            <Text style={styles.tableLabel}>{t.label}</Text>
            <TouchableOpacity style={[styles.streamPill, t.isStream && styles.streamPillOn]} onPress={() => vm.updateTable(t.id, { isStream: !t.isStream })}>
              <Text style={[styles.streamText, t.isStream && styles.streamTextOn]}>📺 Stream</Text>
            </TouchableOpacity>
            <View style={styles.flexSpacer} />
            <TouchableOpacity onPress={() => vm.removeTable(t.id)}><Text style={styles.delX}>✕</Text></TouchableOpacity>
          </View>
          {t.isStream && (
            <TextInput allowFontScaling={false} style={styles.input} value={t.streamUrl ?? ""} onChangeText={(v) => vm.updateTable(t.id, { streamUrl: v })} placeholder="Stream link (optional)" placeholderTextColor={COLORS.textMuted} />
          )}
        </View>
      ))}
      {chip.tables.length === 0 && <Text style={styles.hint}>Add at least one table to run the queue.</Text>}
    </Section>
  );

  // ── Setup · Review & Start ───────────────────────────────────────────────────
  const renderReview = () => {
    const ready = chip.entries.filter((e) => e.checkedIn).length >= 2 && chip.tables.length >= 1 && chip.settings.tiers.length >= 1;
    return (
      <Section title="Review & Start">
        <View style={styles.reviewRow}>
          <Review label="Checked in" value={chip.entries.filter((e) => e.checkedIn).length} sub={`${chip.entries.length} registered`} />
          <Review label="Tables" value={chip.tables.length} />
          <Review label="Tiers" value={chip.settings.tiers.length} />
        </View>
        <TouchableOpacity style={[styles.startBtn, !ready && styles.startBtnDisabled]} disabled={!ready || vm.starting} onPress={vm.start}>
          {vm.starting ? <ActivityIndicator color="#fff" /> : <Text style={styles.startBtnText}>{ready ? "Start Tournament" : "Need 2+ checked-in players, a table, and a chip tier"}</Text>}
        </TouchableOpacity>
      </Section>
    );
  };

  // ── Live · Dashboard ─────────────────────────────────────────────────────────
  const renderLiveDashboard = () => {
    const d = dashboard(chip);
    return (
      <Section title="Dashboard">
        <View style={styles.cardGrid}>
          <StatCard label="Remaining" value={d.playersRemaining} />
          <StatCard label="Eliminated" value={d.eliminated} />
          <StatCard label="In Queue" value={d.queueCount} />
          <StatCard label="Active Tables" value={d.activeTables} />
          <StatCard label="Matches" value={d.matchesPlayed} />
          <StatCard label="Avg Match" value={d.avgMatchMs ? fmtClock(d.avgMatchMs) : "—"} />
        </View>
        {chip.winnerId && <Text style={styles.champ}>🏆 {teamName(entryById(chip.winnerId)!)} wins!</Text>}
        <View style={styles.reviewRow}>
          <TouchableOpacity style={styles.secondaryBtn} onPress={vm.reshuffle}><Text style={styles.secondaryBtnText}>🔀 Reshuffle</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.secondaryBtn, styles.dangerBtn]} onPress={vm.endTournament}><Text style={[styles.secondaryBtnText, styles.dangerText]}>End Tournament</Text></TouchableOpacity>
        </View>
      </Section>
    );
  };

  // ── Live · Tables ────────────────────────────────────────────────────────────
  const renderLiveTables = () => (
    <Section title="Tables">
      {chip.tables.map((table) => {
        const match = chip.matches.find((m) => m.id === table.matchId && m.status === "in_progress");
        const elapsed = match ? matchElapsedMs(match, now) : 0;
        const long = elapsed > LONG_MATCH_MS;
        const a = match ? entryById(match.aId) : null;
        const b = match ? entryById(match.bId) : null;
        const holder = entryById(table.holderId);
        return (
          <View key={table.id} style={[styles.liveTable, long && styles.liveTableLong]}>
            <View style={styles.liveTableHead}>
              <Text style={styles.tableLabel}>{table.label}{table.isStream ? "  📺" : ""}</Text>
              {match ? <Text style={[styles.timer, long && styles.timerLong]}>{fmtClock(elapsed)}</Text> : <Text style={styles.openTag}>{holder ? "Waiting…" : "Open"}</Text>}
            </View>
            {match && a && b ? (
              <View style={styles.matchBody}>
                <WinnerBtn entry={a} onPress={() => vm.recordWinner(match.id, a.id)} />
                <Text style={styles.vs}>vs</Text>
                <WinnerBtn entry={b} onPress={() => vm.recordWinner(match.id, b.id)} />
              </View>
            ) : holder ? (
              <Text style={styles.hint}>{teamName(holder)} stays — waiting for a challenger.</Text>
            ) : (
              <Text style={styles.hint}>No match.</Text>
            )}
          </View>
        );
      })}
    </Section>
  );

  // ── Live · Queue ─────────────────────────────────────────────────────────────
  const renderLiveQueue = () => (
    <Section title={`Queue (${chip.queue.length})`}>
      {chip.queue.map((qid, i) => {
        const e = entryById(qid);
        if (!e) return null;
        return (
          <View key={qid} style={styles.queueRow}>
            <Text style={styles.queuePos}>{i + 1}</Text>
            <Text style={styles.queueName} numberOfLines={1}>{teamName(e)}</Text>
            <Text style={styles.queueMeta}>{e.chips} chip{e.chips === 1 ? "" : "s"} · {e.wins}-{e.losses}</Text>
          </View>
        );
      })}
      {chip.queue.length === 0 && <Text style={styles.hint}>Queue is empty.</Text>}
    </Section>
  );

  // ── Live · Players (records + buy-back) ──────────────────────────────────────
  const renderLivePlayers = () => {
    const alive = chip.entries.filter((e) => e.status !== "eliminated");
    const out = chip.entries.filter((e) => e.status === "eliminated");
    return (
      <>
        <Section title={`Players (${alive.length})`}>
          {alive.map((e) => (
            <View key={e.id} style={styles.playerRow}>
              <Text style={styles.playerName} numberOfLines={1}>{teamName(e)}</Text>
              <Text style={styles.playerMeta}>{e.chips} · {e.wins}-{e.losses} · {e.status}</Text>
              <TouchableOpacity style={styles.chipStep} onPress={() => vm.adjustChips(e.id, -1)}><Text style={styles.chipStepText}>−</Text></TouchableOpacity>
              <TouchableOpacity style={styles.chipStep} onPress={() => vm.adjustChips(e.id, 1)}><Text style={styles.chipStepText}>+</Text></TouchableOpacity>
            </View>
          ))}
        </Section>
        {out.length > 0 && (
          <Section title={`Eliminated (${out.length})`}>
            {out.map((e) => (
              <View key={e.id} style={styles.playerRow}>
                <Text style={[styles.playerName, styles.playerOut]} numberOfLines={1}>{teamName(e)}</Text>
                <Text style={styles.playerMeta}>{e.wins}-{e.losses} · {e.eliminations}K</Text>
                {chip.settings.buyBacksAllowed && (
                  <TouchableOpacity style={styles.buyBackBtn} onPress={() => vm.buyBack(e.id)}><Text style={styles.buyBackText}>Buy back</Text></TouchableOpacity>
                )}
              </View>
            ))}
          </Section>
        )}
      </>
    );
  };

  // ── Results · Standings ──────────────────────────────────────────────────────
  const renderStandings = () => {
    const alive = [...chip.entries].filter((e) => e.status !== "eliminated").sort((a, b) => b.chips - a.chips || b.wins - a.wins);
    const out = [...chip.entries].filter((e) => e.status === "eliminated").sort((a, b) => b.wins - a.wins);
    const row = (e: ChipEntry, rank: number) => (
      <View key={e.id} style={styles.standRow}>
        <Text style={styles.standRank}>{rank}</Text>
        <Text style={styles.standName} numberOfLines={1}>{teamName(e)}</Text>
        <Text style={styles.standMeta}>{e.chips} · {e.wins}-{e.losses} · {e.eliminations}K</Text>
      </View>
    );
    return (
      <>
        {chip.winnerId && <Section title="Champion"><Text style={styles.champ}>🏆 {teamName(entryById(chip.winnerId)!)}</Text></Section>}
        <Section title="Standings">
          <Text style={styles.hint}>Chips · W-L · Eliminations</Text>
          {alive.map((e, i) => row(e, i + 1))}
        </Section>
        {out.length > 0 && <Section title="Eliminated">{out.map((e, i) => row(e, alive.length + i + 1))}</Section>}
      </>
    );
  };

  // ── Results · History (timeline from chip_events) ────────────────────────────
  const renderHistory = () => (
    <Section title="History">
      {chip.events.length === 0 && <Text style={styles.hint}>No events yet.</Text>}
      {chip.events.map((ev) => (
        <View key={ev.id} style={styles.histRow}>
          <Text style={styles.histText} numberOfLines={2}>{ev.text}</Text>
        </View>
      ))}
    </Section>
  );

  // ── Phase nav model (Setup / Live / Results dropdown buttons) ─────────────────
  const started = vm.phase === "live" || vm.phase === "results";
  const finished = vm.phase === "results";
  const mkPages = (keys: string[]) => keys.map((k) => ({ key: k, label: k, glyph: "○" }));
  const phases: PhaseNavPhase[] = [
    {
      key: "setup",
      label: "Setup",
      glyph: started ? "✓" : "●",
      state: started ? "done" : "current",
      locked: false,
      pages: mkPages(SETUP_PAGES),
    },
    {
      key: "live",
      label: "Live",
      glyph: vm.phase === "live" ? "⏺" : finished ? "✓" : "🔒",
      state: vm.phase === "live" ? "live" : finished ? "done" : "locked",
      locked: !started,
      pages: mkPages(LIVE_PAGES),
    },
    {
      key: "results",
      label: "Results",
      glyph: finished ? "✓" : started ? "●" : "🔒",
      state: finished ? "done" : started ? "current" : "locked",
      locked: !started,
      pages: mkPages(RESULTS_PAGES),
    },
  ];

  const content = () => {
    if (selectedPhase === "setup") {
      if (page === "Players") return renderPlayersSetup();
      if (page === "Tables") return renderTablesSetup();
      if (page === "Review") return renderReview();
      return renderSettingsTab();
    }
    if (selectedPhase === "live") {
      if (page === "Dashboard") return renderLiveDashboard();
      if (page === "Queue") return renderLiveQueue();
      if (page === "Players") return renderLivePlayers();
      return renderLiveTables();
    }
    return page === "History" ? renderHistory() : renderStandings();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.back}>‹ Back</Text></TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>{tournament.name || "Chip Tournament"}</Text>
        </View>
        <View style={{ width: webSc(44) }} />
      </View>

      <PhaseNav
        phases={phases}
        selectedKey={selectedPhase}
        activePageKey={page}
        onSelectPage={(phaseKey, pageKey) => {
          setSelectedPhase(phaseKey as "setup" | "live" | "results");
          setPage(pageKey);
        }}
        onLockedPress={(phaseKey) =>
          Alert.alert(
            "Not yet",
            phaseKey === "live"
              ? "Start the tournament from Setup → Review first."
              : "Results open once the tournament is running.",
          )
        }
      />

      <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, isWeb && styles.contentWeb]} keyboardShouldPersistTaps="handled">
        {content()}
      </ScrollView>
    </View>
  );
};

// ── presentational helpers ──────────────────────────────────────────────────────
const Section = ({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) => (
  <View style={styles.section}>
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action}
    </View>
    {children}
  </View>
);
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <View style={styles.fieldWrap}>
    <Text style={styles.fieldLabel}>{label}</Text>
    {children}
  </View>
);
const ToggleRow = ({ label, sub, value, onChange }: { label: string; sub?: string; value: boolean; onChange: (v: boolean) => void }) => (
  <View style={styles.toggleRow}>
    <View style={styles.flexSpacer}>
      <Text style={styles.toggleLabel}>{label}</Text>
      {sub ? <Text style={styles.toggleSub}>{sub}</Text> : null}
    </View>
    <Switch value={value} onValueChange={onChange} trackColor={{ true: COLORS.primary }} />
  </View>
);
const MiniToggle = ({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) => (
  <TouchableOpacity style={[styles.miniToggle, value && styles.miniToggleOn]} onPress={() => onChange(!value)}>
    <Text style={[styles.miniToggleText, value && styles.miniToggleTextOn]}>{value ? "✓ " : ""}{label}</Text>
  </TouchableOpacity>
);
const HeaderBtn = ({ label, onPress }: { label: string; onPress: () => void }) => (
  <TouchableOpacity style={styles.headerBtn} onPress={onPress}><Text style={styles.headerBtnText}>{label}</Text></TouchableOpacity>
);
const Review = ({ label, value, sub }: { label: string; value: number; sub?: string }) => (
  <View style={styles.reviewCard}>
    <Text style={styles.reviewValue}>{value}</Text>
    <Text style={styles.reviewLabel}>{label}</Text>
    {sub ? <Text style={styles.reviewSub}>{sub}</Text> : null}
  </View>
);
const StatCard = ({ label, value }: { label: string; value: number | string }) => (
  <View style={styles.statCard}>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);
const WinnerBtn = ({ entry, onPress }: { entry: ChipEntry; onPress: () => void }) => (
  <TouchableOpacity style={styles.winnerBtn} onPress={onPress}>
    <Text style={styles.winnerName} numberOfLines={2}>{teamName(entry)}</Text>
    <Text style={styles.winnerMeta}>{entry.chips} chip{entry.chips === 1 ? "" : "s"}</Text>
    <Text style={styles.winnerTap}>Tap = winner</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.background },
  errorText: { color: COLORS.error, fontSize: webMs(FONT_SIZES.md) },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: webSc(SPACING.md), paddingTop: webSc(SPACING.lg), paddingBottom: webSc(SPACING.sm), backgroundColor: COLORS.surface },
  back: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.md), fontWeight: "600" },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: { color: COLORS.text, fontSize: webMs(FONT_SIZES.lg), fontWeight: "700" },
  phaseBadge: { marginTop: 2, backgroundColor: COLORS.primary + "22", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  phaseBadgeText: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.xs), fontWeight: "800", letterSpacing: 1 },

  tabBar: { flexDirection: "row", backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingHorizontal: webSc(SPACING.sm) },
  tab: { paddingVertical: webSc(SPACING.sm), paddingHorizontal: webSc(SPACING.md), borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabOn: { borderBottomColor: COLORS.primary },
  tabText: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "600" },
  tabTextOn: { color: COLORS.primary, fontWeight: "700" },

  scroll: { flex: 1 },
  content: { padding: webSc(SPACING.md), paddingBottom: webSc(SPACING.xl * 2) },
  contentWeb: { maxWidth: 760, width: "100%" as any, alignSelf: "center" as any },

  section: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, padding: webSc(SPACING.md), marginBottom: webSc(SPACING.md) },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: webSc(SPACING.sm) },
  sectionTitle: { color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "700" },
  hint: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.sm), marginBottom: webSc(SPACING.sm) },

  fieldWrap: { marginBottom: webSc(SPACING.sm) },
  fieldLabel: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm), marginBottom: webSc(SPACING.xs), fontWeight: "500" },
  input: { backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingVertical: webSc(SPACING.sm), paddingHorizontal: 10, color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), ...(isWeb ? ({ outlineStyle: "none" } as object) : null) },
  flex1: { flex: 1 },
  flex2: { flex: 2 },

  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: webSc(SPACING.xs), gap: webSc(SPACING.md) },
  toggleLabel: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "500" },
  toggleSub: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), marginTop: 1 },

  headerBtn: { borderWidth: 1, borderColor: COLORS.primary, borderRadius: RADIUS.sm, paddingVertical: 4, paddingHorizontal: 10 },
  headerBtnText: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "600" },

  seedBtn: { borderWidth: 1, borderColor: COLORS.border, borderStyle: "dashed", borderRadius: RADIUS.sm, padding: webSc(SPACING.md), alignItems: "center" },
  seedBtnText: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "600" },
  tierHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  tierHeadText: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700" },
  tierRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  tierInput: { backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingVertical: webSc(SPACING.xs), paddingHorizontal: 8, color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), textAlign: "center", ...(isWeb ? ({ outlineStyle: "none" } as object) : null) },
  tierMin: { flex: 1 },
  tierMax: { flex: 1 },
  tierChips: { flex: 1 },
  tierDel: { width: 28, alignItems: "center" },
  delX: { color: COLORS.error, fontSize: webMs(FONT_SIZES.md), fontWeight: "700" },

  entryCard: { backgroundColor: COLORS.background, borderRadius: RADIUS.md, padding: webSc(SPACING.sm), marginBottom: webSc(SPACING.sm), gap: webSc(SPACING.xs) },
  entryTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  entryNum: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  entryChipPill: { backgroundColor: COLORS.primary + "22", borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2 },
  entryChipText: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700" },
  entryRow: { flexDirection: "row", gap: 8 },
  entryToggles: { flexDirection: "row", gap: 8, marginTop: 2 },
  miniToggle: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingVertical: 4, paddingHorizontal: 10 },
  miniToggleOn: { borderColor: COLORS.success, backgroundColor: COLORS.success + "22" },
  miniToggleText: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm) },
  miniToggleTextOn: { color: COLORS.success, fontWeight: "700" },

  tableSetupRow: { paddingVertical: webSc(SPACING.sm), borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: webSc(SPACING.xs) },
  tableSetupTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  tableLabel: { color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "600" },
  flexSpacer: { flex: 1 },
  streamPill: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingVertical: 3, paddingHorizontal: 8 },
  streamPillOn: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + "22" },
  streamText: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs) },
  streamTextOn: { color: COLORS.primary, fontWeight: "700" },

  reviewRow: { flexDirection: "row", gap: webSc(SPACING.sm), marginBottom: webSc(SPACING.md) },
  reviewCard: { flex: 1, backgroundColor: COLORS.background, borderRadius: RADIUS.md, padding: webSc(SPACING.md), alignItems: "center" },
  reviewValue: { color: COLORS.text, fontSize: webMs(FONT_SIZES.xl), fontWeight: "800" },
  reviewLabel: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm) },
  reviewSub: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs) },

  startBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: webSc(SPACING.md), alignItems: "center" },
  startBtnDisabled: { backgroundColor: COLORS.border },
  startBtnText: { color: "#fff", fontSize: webMs(FONT_SIZES.md), fontWeight: "700" },

  cardGrid: { flexDirection: "row", flexWrap: "wrap", gap: webSc(SPACING.sm) },
  statCard: { backgroundColor: COLORS.background, borderRadius: RADIUS.md, padding: webSc(SPACING.md), alignItems: "center", minWidth: 90, flexGrow: 1 },
  statValue: { color: COLORS.text, fontSize: webMs(FONT_SIZES.xl), fontWeight: "800" },
  statLabel: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs) },

  liveTable: { backgroundColor: COLORS.background, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, padding: webSc(SPACING.sm), marginBottom: webSc(SPACING.sm) },
  liveTableLong: { borderColor: COLORS.error, backgroundColor: COLORS.error + "11" },
  liveTableHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: webSc(SPACING.xs) },
  timer: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.md), fontWeight: "700", fontVariant: ["tabular-nums"] },
  timerLong: { color: COLORS.error },
  openTag: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.sm) },
  matchBody: { flexDirection: "row", alignItems: "center", gap: 8 },
  vs: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  winnerBtn: { flex: 1, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.primary, borderRadius: RADIUS.md, padding: webSc(SPACING.sm), alignItems: "center" },
  winnerName: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", textAlign: "center" },
  winnerMeta: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs), marginTop: 2 },
  winnerTap: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.xs), marginTop: 2 },

  queueRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: webSc(SPACING.xs), borderBottomWidth: 1, borderBottomColor: COLORS.border },
  queuePos: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", width: 22 },
  queueName: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "600", flex: 1 },
  queueMeta: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs) },

  playerRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: webSc(SPACING.xs), borderBottomWidth: 1, borderBottomColor: COLORS.border },
  playerName: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "600", flex: 1 },
  playerOut: { color: COLORS.textMuted, textDecorationLine: "line-through" },
  playerMeta: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs) },
  chipStep: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, alignItems: "center", justifyContent: "center" },
  chipStepText: { color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "700" },
  buyBackBtn: { borderWidth: 1, borderColor: COLORS.success, borderRadius: RADIUS.sm, paddingVertical: 4, paddingHorizontal: 10 },
  buyBackText: { color: COLORS.success, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },

  secondaryBtn: { flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingVertical: webSc(SPACING.sm), alignItems: "center" },
  secondaryBtnText: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "600" },
  dangerBtn: { borderColor: COLORS.error },
  dangerText: { color: COLORS.error },
  champ: { color: COLORS.warning, fontSize: webMs(FONT_SIZES.lg), fontWeight: "800", textAlign: "center", marginVertical: webSc(SPACING.sm) },

  standRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: webSc(SPACING.xs), borderBottomWidth: 1, borderBottomColor: COLORS.border },
  standRank: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", width: 22 },
  standName: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "600", flex: 1 },
  standMeta: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs) },

  histRow: { paddingVertical: webSc(SPACING.xs), borderBottomWidth: 1, borderBottomColor: COLORS.border },
  histText: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm) },
});
