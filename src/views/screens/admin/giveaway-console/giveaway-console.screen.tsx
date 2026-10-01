// src/views/screens/admin/giveaway-console/giveaway-console.screen.tsx
// WEB / DESKTOP Super Admin → Giveaway Management console (one page, no Giveaways/Manage tabs):
//   shared section header (Giveaways · Participants · Winners · Entry Wallet, + New Giveaway) →
//   stat strip → toolbar (search · status · sort) → table (one primary action per row + ⋯ menu)
//   → centered Giveaway / Winner detail modals.
// Rendered only on web by app/(tabs)/admin/giveaway-management.tsx; native keeps its screen.
// Every write reuses useAdminGiveaways and the shared GiveawayAdminModals.
import { Ionicons } from "@expo/vector-icons";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { COLORS } from "../../../../theme/colors";
import {
  CONSOLE_SORTS,
  CONSOLE_STATUS_FILTERS,
  ENTRY_METHOD_LABEL,
  capacityRatio,
  formatMoney,
  getEndsLabel,
  getMenuActions,
  getPrimaryAction,
} from "../../../../utils/giveaway-console";
import { AdminGiveaway } from "../../../../viewmodels/useAdminGiveaways";
import { useGiveawayConsole } from "../../../../viewmodels/useGiveawayConsole";
import { GiveawayAdminModals } from "../../../components/giveaway/GiveawayAdminModals";
import { GiveawayDetailModal } from "./GiveawayDetailModal";
import { GiveawayAdminHeader, GiveawayAdminPage } from "./giveaway-admin-shell";
import { WinnerDetailModal } from "./WinnerDetailModal";
import { ConsoleButton, StatusPill } from "./giveaway-console.parts";
import { COLS, consoleSt } from "./giveaway-console.styles";

type ConsoleVm = ReturnType<typeof useGiveawayConsole>;

const RESTORE_LABEL = { awarded: "Awarded", active: "Active", draft: "Draft" } as const;

export function GiveawayConsoleScreen() {
  const vm = useGiveawayConsole();

  return (
    <>
      <GiveawayAdminPage>
        <GiveawayAdminHeader
          title="Giveaway Management"
          section="giveaways"
          backLabel="Admin"
          onBack={vm.goBack}
          actions={vm.canManage ? <ConsoleButton label="New Giveaway" icon="add" variant="primary" onPress={vm.goCreate} /> : null}
        />

        {!vm.canManage ? (
          <View style={consoleSt.readOnlyBanner}>
            <Text allowFontScaling={false} style={consoleSt.readOnlyText}>
              Read-only. Creating, publishing, ending, drawing and archiving giveaways requires a Super Admin account.
            </Text>
          </View>
        ) : null}

        <StatStrip vm={vm} />
        <Toolbar vm={vm} />

        {vm.loading ? (
          <View style={consoleSt.empty}>
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : (
          <GiveawayTable vm={vm} />
        )}
      </GiveawayAdminPage>

      {vm.detail ? (
        <GiveawayDetailModal
          giveaway={vm.detail}
          uniqueEntrants={vm.uniqueEntrantsOf(vm.detail.id)}
          canManage={vm.canManage}
          onClose={vm.closeDetail}
          onPrimary={vm.runPrimary}
          onMenu={vm.runMenu}
        />
      ) : null}

      <WinnerDetailModal vm={vm.vm} canManage={vm.canManage} />

      {vm.menu ? <RowMenu vm={vm} /> : null}

      <ConfirmDialog vm={vm} />

      <GiveawayAdminModals
        vm={vm.vm}
        endEarlyTarget={vm.endEarlyTarget}
        endingEarly={vm.endingEarly}
        closeEndEarlyModal={vm.closeEndEarlyModal}
        confirmEndEarly={vm.confirmEndEarly}
        renderWinnerDetails={false}
      />
    </>
  );
}

// ── Stat strip ─────────────────────────────────────────────────────────────────────────────────
function StatStrip({ vm }: { vm: ConsoleVm }) {
  const st = vm.stats;
  const items = [
    { label: "Active giveaways", value: st.activeCount.toLocaleString() },
    { label: "Active prize value", value: formatMoney(st.activePrizeValue) },
    { label: "Entries on active", value: st.activeEntries.toLocaleString() },
    { label: "Unique participants", value: st.uniqueParticipants == null ? "—" : st.uniqueParticipants.toLocaleString() },
    { label: "Total awarded", value: formatMoney(st.totalAwarded) },
    { label: "Total giveaways", value: st.totalGiveaways.toLocaleString() },
  ];
  return (
    <View style={consoleSt.statStrip}>
      {items.map((it, i) => (
        <View key={it.label} style={[consoleSt.stat, i > 0 && consoleSt.statDivider]}>
          <Text allowFontScaling={false} style={consoleSt.statValue}>{it.value}</Text>
          <Text allowFontScaling={false} style={consoleSt.statLabel}>{it.label}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Toolbar ────────────────────────────────────────────────────────────────────────────────────
function Toolbar({ vm }: { vm: ConsoleVm }) {
  const [sortOpen, setSortOpen] = useState(false);
  const sortLabel = CONSOLE_SORTS.find((x) => x.value === vm.sort)?.label ?? "Newest";
  return (
    <View style={[consoleSt.toolbar, { zIndex: 5 }]}>
      <View style={consoleSt.search}>
        <Ionicons name="search" size={15} color={COLORS.textMuted} />
        <TextInput
          style={consoleSt.searchInput}
          placeholder="Search name, description or #id"
          placeholderTextColor={COLORS.textMuted}
          value={vm.search}
          onChangeText={vm.setSearch}
          accessibilityLabel="Search giveaways"
        />
        {vm.search ? (
          <Pressable onPress={() => vm.setSearch("")} accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
          </Pressable>
        ) : null}
      </View>

      <View style={consoleSt.segment} accessibilityRole={"tablist" as any}>
        {CONSOLE_STATUS_FILTERS.map((f, i) => {
          const active = vm.statusFilter === f.value;
          return (
            <Pressable
              key={f.value}
              onPress={() => vm.setStatusFilter(f.value)}
              accessibilityRole={"tab" as any}
              accessibilityState={{ selected: active }}
              style={({ hovered }: any) => [
                consoleSt.segmentItem,
                i === 0 && consoleSt.segmentItemFirst,
                hovered && !active && consoleSt.segmentItemHover,
                active && consoleSt.segmentItemActive,
              ]}
            >
              <Text allowFontScaling={false} style={[consoleSt.segmentText, active && consoleSt.segmentTextActive]}>
                {f.label}{" "}
                <Text style={[consoleSt.segmentCount, active && consoleSt.segmentCountActive]}>{vm.counts[f.value]}</Text>
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={consoleSt.toolbarSpacer} />
      <Text allowFontScaling={false} style={consoleSt.resultCount}>
        {vm.rows.length} {vm.rows.length === 1 ? "giveaway" : "giveaways"}
      </Text>

      <View>
        <ConsoleButton
          label={`Sort: ${sortLabel}`}
          icon="swap-vertical"
          onPress={() => setSortOpen((o) => !o)}
          accessibilityLabel={`Sort by ${sortLabel}`}
        />
        {sortOpen ? (
          <>
            <Pressable style={consoleSt.menuLayer} onPress={() => setSortOpen(false)} accessibilityLabel="Close sort menu" />
            <View style={[consoleSt.menuBox, { right: 0, top: 40, zIndex: 901 }]}>
              {CONSOLE_SORTS.map((o) => (
                <Pressable
                  key={o.value}
                  onPress={() => {
                    vm.setSort(o.value);
                    setSortOpen(false);
                  }}
                  style={({ hovered }: any) => [consoleSt.menuItem, hovered && consoleSt.menuItemHover]}
                >
                  <Text allowFontScaling={false} style={[consoleSt.menuItemText, vm.sort === o.value && { color: COLORS.primaryLight, fontWeight: "700" }]}>
                    {vm.sort === o.value ? "✓  " : "    "}
                    {o.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}
      </View>
    </View>
  );
}

// ── Table ──────────────────────────────────────────────────────────────────────────────────────
function HeadCell({ label, width, flex }: { label: string; width?: number; flex?: boolean }) {
  return (
    <View style={[consoleSt.cell, flex ? consoleSt.cellName : { width }]}>
      <Text allowFontScaling={false} style={consoleSt.headCell} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function GiveawayTable({ vm }: { vm: ConsoleVm }) {
  return (
    <View style={consoleSt.tableWrap}>
      {/* Web-only screen: a plain overflow-x container (a horizontal ScrollView would size its
          content to the longest name and push the Action column out of view). */}
      <View style={consoleSt.tableScroll}>
        <View style={consoleSt.table}>
          <View style={consoleSt.headRow}>
            <HeadCell label="" width={COLS.thumb} />
            <HeadCell label="Giveaway" flex />
            <HeadCell label="Status" width={COLS.status} />
            <HeadCell label="Entry method" width={COLS.method} />
            <HeadCell label="Prize" width={COLS.prize} />
            <HeadCell label="Entries / cap" width={COLS.entries} />
            <HeadCell label="Entrants" width={COLS.unique} />
            <HeadCell label="Ends" width={COLS.ends} />
            <HeadCell label="Winner" width={COLS.winner} />
            <HeadCell label="Action" width={COLS.action} />
            <HeadCell label="" width={COLS.menu} />
          </View>

          {vm.rows.length === 0 ? (
            <View style={consoleSt.empty}>
              <Ionicons name="gift-outline" size={36} color={COLORS.textMuted} />
              <Text allowFontScaling={false} style={consoleSt.emptyTitle}>No giveaways</Text>
              <Text allowFontScaling={false} style={consoleSt.emptySub}>
                {vm.search
                  ? "Nothing matches your search."
                  : vm.statusFilter === "all"
                    ? "Create your first giveaway to get started."
                    : `No ${vm.statusFilter} giveaways.`}
              </Text>
            </View>
          ) : (
            vm.rows.map((g, i) => <GiveawayRow key={g.id} vm={vm} g={g} last={i === vm.rows.length - 1} />)
          )}
        </View>
      </View>
    </View>
  );
}

function GiveawayRow({ vm, g, last }: { vm: ConsoleVm; g: AdminGiveaway; last: boolean }) {
  const primary = getPrimaryAction(g);
  const ends = getEndsLabel(g);
  const ratio = capacityRatio(g);
  const entries = g.entry_count ?? 0;
  const unique = vm.uniqueEntrantsOf(g.id);
  const busy = vm.vm.processing === g.id;
  const selected = vm.detail?.id === g.id;

  return (
    // Not role="button": the row contains real buttons (action, ⋯) and a <button> can't nest one.
    // The giveaway name below is the keyboard/screen-reader way to open the drawer.
    <Pressable
      onPress={() => vm.openDetail(g)}
      style={({ hovered }: any) => [consoleSt.row, last && consoleSt.rowLast, hovered && consoleSt.rowHover, selected && consoleSt.rowSelected]}
    >
      <View style={[consoleSt.cell, { width: COLS.thumb }]}>
        {g.image_url ? (
          <Image source={{ uri: g.image_url }} style={consoleSt.thumb} resizeMode="cover" />
        ) : (
          <View style={[consoleSt.thumb, consoleSt.thumbEmpty]}>
            <Ionicons name="gift-outline" size={18} color={COLORS.textMuted} />
          </View>
        )}
      </View>

      <View style={[consoleSt.cell, consoleSt.cellName]}>
        <Text
          allowFontScaling={false}
          style={consoleSt.nameText}
          numberOfLines={1}
          accessibilityRole="link"
          accessibilityLabel={`Open details for ${g.name}`}
          onPress={() => vm.openDetail(g)}
        >
          {g.name}
        </Text>
        <Text allowFontScaling={false} style={consoleSt.cellSub}>#{g.id}</Text>
      </View>

      <View style={[consoleSt.cell, { width: COLS.status }]}>
        <StatusPill status={g.status} />
      </View>

      <View style={[consoleSt.cell, { width: COLS.method }]}>
        <Text allowFontScaling={false} style={consoleSt.cellText}>{ENTRY_METHOD_LABEL[g.entry_mode] ?? g.entry_mode}</Text>
        {g.entry_mode === "wallet" && g.per_user_max ? (
          <Text allowFontScaling={false} style={consoleSt.cellSub}>max {g.per_user_max}/user</Text>
        ) : null}
      </View>

      <View style={[consoleSt.cell, { width: COLS.prize }]}>
        <Text allowFontScaling={false} style={consoleSt.cellText}>{formatMoney(g.prize_value)}</Text>
      </View>

      {/* Entries / cap and Entrants are two independent links to Participants filtered to this
          giveaway. Each Pressable wraps only its own content (no shared hitbox), and as the inner
          press target it keeps the row's detail modal from opening. */}
      <View style={[consoleSt.cell, { width: COLS.entries }]}>
        {entries > 0 ? (
          <Pressable
            onPress={() => vm.goParticipants(g.id)}
            accessibilityRole="link"
            accessibilityLabel={`View ${entries} entries for ${g.name}`}
            style={({ hovered, focused }: any) => [consoleSt.countTarget, (hovered || focused) && consoleSt.countTargetHover]}
          >
            {({ hovered }: any) => (
              <>
                <Text allowFontScaling={false} style={[consoleSt.countLinkText, hovered && consoleSt.countLinkTextHover]}>
                  {entries.toLocaleString()}
                  {g.max_entries ? <Text style={consoleSt.cellMuted}> / {g.max_entries.toLocaleString()}</Text> : null}
                </Text>
                {ratio != null ? (
                  <View style={consoleSt.bar}>
                    <View style={[consoleSt.barFill, ratio >= 1 && consoleSt.barFull, { width: `${ratio * 100}%` }]} />
                  </View>
                ) : null}
              </>
            )}
          </Pressable>
        ) : (
          <>
            <Text allowFontScaling={false} style={consoleSt.cellMuted}>
              0{g.max_entries ? ` / ${g.max_entries.toLocaleString()}` : ""}
            </Text>
            {ratio != null ? (
              <View style={consoleSt.bar}>
                <View style={[consoleSt.barFill, { width: "0%" }]} />
              </View>
            ) : null}
          </>
        )}
      </View>

      <View style={[consoleSt.cell, { width: COLS.unique }]}>
        {entries > 0 && unique != null ? (
          <Pressable
            onPress={() => vm.goParticipants(g.id)}
            accessibilityRole="link"
            accessibilityLabel={`View ${unique} entrants for ${g.name}`}
            style={({ hovered, focused }: any) => [consoleSt.countTarget, (hovered || focused) && consoleSt.countTargetHover]}
          >
            {({ hovered }: any) => (
              <Text allowFontScaling={false} style={[consoleSt.countLinkText, hovered && consoleSt.countLinkTextHover]}>
                {unique.toLocaleString()}
              </Text>
            )}
          </Pressable>
        ) : (
          <Text allowFontScaling={false} style={consoleSt.cellMuted}>{unique == null ? "—" : unique.toLocaleString()}</Text>
        )}
      </View>

      <View style={[consoleSt.cell, { width: COLS.ends }]}>
        <Text allowFontScaling={false} style={consoleSt.cellText} numberOfLines={1}>{ends.primary}</Text>
        {ends.secondary ? <Text allowFontScaling={false} style={consoleSt.cellSub} numberOfLines={1}>{ends.secondary}</Text> : null}
      </View>

      <View style={[consoleSt.cell, { width: COLS.winner }]}>
        {g.winner_id ? (
          <Text allowFontScaling={false} style={consoleSt.cellText} numberOfLines={1}>{g.winner_name || `#${g.winner_id}`}</Text>
        ) : (
          <Text allowFontScaling={false} style={consoleSt.cellMuted}>—</Text>
        )}
      </View>

      <View style={[consoleSt.cell, { width: COLS.action }]}>
        {primary && vm.canManage ? (
          <ConsoleButton
            label={primary.label}
            variant={primary.kind === "end" ? "danger" : primary.kind === "publish" || primary.kind === "draw" ? "primary" : "default"}
            disabled={primary.disabled}
            busy={busy}
            onPress={() => vm.runPrimary(primary.kind, g)}
          />
        ) : primary?.kind === "view_winner" ? (
          <ConsoleButton label={primary.label} onPress={() => vm.runPrimary(primary.kind, g)} />
        ) : (
          <Text allowFontScaling={false} style={consoleSt.cellMuted}>—</Text>
        )}
      </View>

      <View style={[consoleSt.cell, { width: COLS.menu, paddingRight: 0 }]}>
        {vm.canManage ? <RowMenuButton vm={vm} g={g} /> : null}
      </View>
    </Pressable>
  );
}

// ── ⋯ menu ─────────────────────────────────────────────────────────────────────────────────────
function RowMenuButton({ vm, g }: { vm: ConsoleVm; g: AdminGiveaway }) {
  const ref = useRef<View>(null);
  const open = () => {
    const node = ref.current as any;
    if (node?.measureInWindow) {
      node.measureInWindow((x: number, y: number, w: number, h: number) => vm.openMenu({ giveaway: g, x: x + w, y: y + h }));
    } else {
      vm.openMenu({ giveaway: g, x: 0, y: 0 });
    }
  };
  return (
    <Pressable
      ref={ref}
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={`More actions for ${g.name}`}
      style={({ hovered }: any) => [consoleSt.menuBtn, hovered && consoleSt.menuBtnHover]}
    >
      <Ionicons name="ellipsis-horizontal" size={18} color={COLORS.textSecondary} />
    </Pressable>
  );
}

function RowMenu({ vm }: { vm: ConsoleVm }) {
  const menu = vm.menu!;
  const actions = getMenuActions(menu.giveaway);
  const winH = Dimensions.get("window").height;
  const height = actions.length * 37 + 10;
  const top = menu.y + 4 + height > winH ? Math.max(8, menu.y - 36 - height) : menu.y + 4;
  const left = Math.max(8, menu.x - 210);
  const firstDanger = actions.findIndex((a) => a.destructive);
  return (
    <View style={consoleSt.menuLayer}>
      <Pressable style={{ flex: 1 }} onPress={vm.closeMenu} accessibilityLabel="Close menu" />
      <View style={[consoleSt.menuBox, { top, left }]} accessibilityRole={"menu" as any}>
        {actions.map((a, i) => (
          <React.Fragment key={a.kind}>
            {i === firstDanger && i > 0 ? <View style={consoleSt.menuSep} /> : null}
            <Pressable
              onPress={() => vm.runMenu(a.kind, menu.giveaway)}
              accessibilityRole={"menuitem" as any}
              style={({ hovered }: any) => [consoleSt.menuItem, hovered && consoleSt.menuItemHover]}
            >
              <Text allowFontScaling={false} style={[consoleSt.menuItemText, a.destructive && consoleSt.menuItemDanger]}>{a.label}</Text>
            </Pressable>
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

// ── Archive / Restore confirmation ─────────────────────────────────────────────────────────────
function ConfirmDialog({ vm }: { vm: ConsoleVm }) {
  const c = vm.confirm;
  const isArchive = c?.kind === "archive";
  const toActive = c?.kind === "restore" && c.target === "active";
  return (
    <Modal visible={!!c} transparent animationType="fade" onRequestClose={vm.closeConfirm}>
      <Pressable style={consoleSt.dialogOverlay} onPress={vm.closeConfirm}>
        <Pressable style={consoleSt.dialog} onPress={(e) => e.stopPropagation()}>
          {c ? (
            <>
              <Text allowFontScaling={false} style={consoleSt.dialogTitle}>
                {isArchive ? "Archive giveaway?" : "Restore giveaway?"}
              </Text>
              <Text allowFontScaling={false} style={consoleSt.dialogBody}>
                <Text style={{ color: COLORS.text, fontWeight: "600" }}>{c.giveaway.name}</Text> (#{c.giveaway.id})
              </Text>
              {isArchive ? (
                <Text allowFontScaling={false} style={consoleSt.dialogBody}>
                  It will be hidden from the public Giveaways page and moved to Archived. Entries and any
                  winner record are kept, and you can restore it later.
                </Text>
              ) : c.kind === "restore" ? (
                <>
                  <Text allowFontScaling={false} style={consoleSt.dialogBody}>
                    It will be restored to{" "}
                    <Text style={{ color: COLORS.text, fontWeight: "700" }}>{RESTORE_LABEL[c.target]}</Text>
                    {c.target === "awarded"
                      ? " (it has a winner) and shown publicly as a completed giveaway."
                      : c.target === "draft"
                        ? " (it was never published). It stays hidden until you publish it."
                        : "."}
                  </Text>
                  {toActive ? (
                    <View style={consoleSt.dialogWarn}>
                      <Text allowFontScaling={false} style={consoleSt.dialogWarnText}>
                        Restoring this giveaway will make it active and open for entries again.
                      </Text>
                    </View>
                  ) : null}
                </>
              ) : null}
              {vm.confirmError ? <Text allowFontScaling={false} style={consoleSt.dialogError}>{vm.confirmError}</Text> : null}
              <View style={consoleSt.dialogBtns}>
                <ConsoleButton label="Cancel" onPress={vm.closeConfirm} disabled={vm.confirming} />
                <ConsoleButton
                  label={isArchive ? "Archive" : toActive ? "Restore & reopen" : "Restore"}
                  variant={isArchive || toActive ? "danger" : "primary"}
                  busy={vm.confirming}
                  onPress={vm.runConfirm}
                />
              </View>
            </>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
