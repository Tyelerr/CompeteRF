// src/views/screens/admin/giveaway-console/participants-console.screen.tsx
// WEB desktop Giveaway Management → Participants. A table over the existing
// useGiveawayParticipants data (giveaway_entries + giveaway name/prize — already loaded by this
// admin page; nothing new is fetched). Every row opens a centered Participant Details modal with
// that person's other entries (same user_id) from the same loaded list. Native keeps its card list.
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, Pressable, Text, TextInput, View } from "react-native";
import { COLORS } from "../../../../theme/colors";
import { formatMoney } from "../../../../utils/giveaway-console";
import {
  ParticipantEntry,
  ParticipantSortOption,
  useGiveawayParticipants,
} from "../../../../viewmodels/useGiveawayParticipants";
import { AdminModal, DetailRow, DetailSection } from "./AdminModal";
import { GiveawayAdminHeader, GiveawayAdminPage, useGiveawayAdminNav } from "./giveaway-admin-shell";
import { ContactModal } from "./ContactModal";
import { ConsoleButton, ConsoleSelect } from "./giveaway-console.parts";
import { consoleSt } from "./giveaway-console.styles";

type Entry = ParticipantEntry & { giveaway_entry_mode?: string };

const PCOLS = { giveaway: 180, email: 196, phone: 124, birthday: 112, entries: 66, entered: 104, prize: 74, actions: 108 };
const SORTS: { value: ParticipantSortOption; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "name", label: "Name" },
];
const ALL = -1;

const yesNo = (v: boolean | null | undefined) => (v ? "Yes" : "No");

function HeadCell({ label, width, flex }: { label: string; width?: number; flex?: boolean }) {
  return (
    <View style={[consoleSt.cell, flex ? consoleSt.cellName : { width }]}>
      <Text allowFontScaling={false} style={consoleSt.headCell} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export function ParticipantsConsoleScreen() {
  const nav = useGiveawayAdminNav();
  const { giveaway: giveawayParam } = useLocalSearchParams<{ giveaway?: string }>();
  const paramId = giveawayParam && /^\d+$/.test(giveawayParam) ? Number(giveawayParam) : null;
  const vm = useGiveawayParticipants(paramId);
  const [selected, setSelected] = useState<Entry | null>(null);
  const [contactFor, setContactFor] = useState<Entry | null>(null);

  // Keep the filter in sync when the same screen is re-used with a different ?giveaway= link.
  const { selectGiveaway } = vm;
  useEffect(() => {
    selectGiveaway(paramId);
  }, [paramId, selectGiveaway]);

  const all = vm.allEntries as Entry[];
  const uniquePeople = useMemo(() => new Set(all.map((e) => e.user_id)).size, [all]);
  const giveawayOptions = useMemo(
    () => [
      { value: ALL, label: "All giveaways" },
      ...vm.giveaways
        .slice()
        .sort((a, b) => b.id - a.id)
        .map((g) => ({ value: g.id, label: `${g.name} (#${g.id})` })),
    ],
    [vm.giveaways],
  );
  const filterName = vm.selectedGiveawayId != null ? vm.giveaways.find((g) => g.id === vm.selectedGiveawayId)?.name : null;
  const sortLabel = SORTS.find((x) => x.value === vm.sortBy)?.label ?? "Newest";

  const stats = [
    { label: "Total entries", value: vm.totalCount.toLocaleString() },
    { label: "Showing", value: vm.filteredCount.toLocaleString() },
    { label: "Unique participants", value: uniquePeople.toLocaleString() },
    { label: "Giveaways with entries", value: vm.giveaways.length.toLocaleString() },
  ];

  return (
    <>
      <GiveawayAdminPage>
        <GiveawayAdminHeader
          title="Participants"
          subtitle="Everyone who entered a giveaway. Click a row for details."
          section="participants"
          backLabel="Giveaway Management"
          onBack={() => nav.back()}
        />

        <View style={consoleSt.statStrip}>
          {stats.map((it, i) => (
            <View key={it.label} style={[consoleSt.stat, i > 0 && consoleSt.statDivider]}>
              <Text allowFontScaling={false} style={consoleSt.statValue}>{it.value}</Text>
              <Text allowFontScaling={false} style={consoleSt.statLabel}>{it.label}</Text>
            </View>
          ))}
        </View>

        <View style={[consoleSt.toolbar, { zIndex: 5 }]}>
          <View style={[consoleSt.search, { width: 320 }]}>
            <Ionicons name="search" size={15} color={COLORS.textMuted} />
            <TextInput
              style={consoleSt.searchInput}
              placeholder="Search name, email or phone"
              placeholderTextColor={COLORS.textMuted}
              value={vm.searchQuery}
              onChangeText={vm.setSearchQuery}
              accessibilityLabel="Search participants"
            />
            {vm.searchQuery ? (
              <Pressable onPress={() => vm.setSearchQuery("")} accessibilityLabel="Clear search">
                <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
              </Pressable>
            ) : null}
          </View>
          <ConsoleSelect
            label={filterName ? `Giveaway: ${filterName.length > 28 ? `${filterName.slice(0, 27)}…` : filterName}` : "All giveaways"}
            icon="filter"
            value={vm.selectedGiveawayId ?? ALL}
            options={giveawayOptions}
            onChange={(v) => vm.selectGiveaway(v === ALL ? null : v)}
            align="left"
            menuWidth={340}
            accessibilityLabel="Filter by giveaway"
          />
          {vm.selectedGiveawayId != null ? (
            <ConsoleButton label="Clear filter" icon="close" onPress={() => vm.selectGiveaway(null)} />
          ) : null}
          <View style={consoleSt.toolbarSpacer} />
          <Text allowFontScaling={false} style={consoleSt.resultCount}>
            {vm.filteredCount} {vm.filteredCount === 1 ? "entry" : "entries"}
          </Text>
          <ConsoleSelect
            label={`Sort: ${sortLabel}`}
            icon="swap-vertical"
            value={vm.sortBy}
            options={SORTS}
            onChange={vm.setSortBy}
            accessibilityLabel={`Sort by ${sortLabel}`}
          />
        </View>

        {vm.loading ? (
          <View style={consoleSt.empty}>
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : (
          <View style={consoleSt.tableWrap}>
            <View style={consoleSt.tableScroll}>
              <View style={consoleSt.table}>
                <View style={consoleSt.headRow}>
                  <HeadCell label="Participant" flex />
                  <HeadCell label="Giveaway" width={PCOLS.giveaway} />
                  <HeadCell label="Email" width={PCOLS.email} />
                  <HeadCell label="Phone" width={PCOLS.phone} />
                  <HeadCell label="Birthday" width={PCOLS.birthday} />
                  <HeadCell label="Entries" width={PCOLS.entries} />
                  <HeadCell label="Entered" width={PCOLS.entered} />
                  <HeadCell label="Prize" width={PCOLS.prize} />
                  <HeadCell label="" width={PCOLS.actions} />
                </View>
                {vm.entries.length === 0 ? (
                  <View style={consoleSt.empty}>
                    <Ionicons name="people-outline" size={36} color={COLORS.textMuted} />
                    <Text allowFontScaling={false} style={consoleSt.emptyTitle}>No participants</Text>
                    <Text allowFontScaling={false} style={consoleSt.emptySub}>
                      {vm.searchQuery ? "Nothing matches your search." : "No entries for this filter yet."}
                    </Text>
                  </View>
                ) : (
                  vm.entries.map((e, i) => (
                    <ParticipantRow
                      key={e.id}
                      e={e as Entry}
                      last={i === vm.entries.length - 1}
                      selected={selected?.id === e.id}
                      onOpen={() => setSelected(e as Entry)}
                      onContact={() => setContactFor(e as Entry)}
                      formatDate={vm.formatDate}
                    />
                  ))
                )}
              </View>
            </View>
          </View>
        )}
      </GiveawayAdminPage>

      {contactFor ? (
        <ContactModal
          contact={{
            name: contactFor.name_as_on_id || "Unknown",
            subtitle: `Profile #${contactFor.user_id} · ${contactFor.giveaway_name ?? `Giveaway #${contactFor.giveaway_id}`}`,
            email: contactFor.email,
            phone: contactFor.phone,
          }}
          viewLabel="View participant"
          onView={() => {
            setSelected(contactFor);
            setContactFor(null);
          }}
          onClose={() => setContactFor(null)}
        />
      ) : null}

      {selected ? (
        <ParticipantDetailModal
          entry={selected}
          all={all}
          formatDate={vm.formatDate}
          formatBirthday={vm.formatBirthday}
          onSelectEntry={setSelected}
          onClose={() => setSelected(null)}
          onFilterGiveaway={(id) => {
            vm.selectGiveaway(id);
            setSelected(null);
          }}
        />
      ) : null}
    </>
  );
}

function ParticipantRow({
  e,
  last,
  selected,
  onOpen,
  onContact,
  formatDate,
}: {
  e: Entry;
  last: boolean;
  selected: boolean;
  onOpen: () => void;
  onContact: () => void;
  formatDate: (d: string | null) => string;
}) {
  return (
    // Not role="button": the row contains a real button (Contact); the name link below is
    // the keyboard / screen-reader way to open the details modal.
    <Pressable
      onPress={onOpen}
      style={({ hovered }: any) => [consoleSt.row, last && consoleSt.rowLast, hovered && consoleSt.rowHover, selected && consoleSt.rowSelected]}
    >
      <View style={[consoleSt.cell, consoleSt.cellName]}>
        <Text
          allowFontScaling={false}
          style={consoleSt.nameText}
          numberOfLines={1}
          accessibilityRole="link"
          accessibilityLabel={`Open participant ${e.name_as_on_id || "Unknown"}`}
          onPress={onOpen}
        >
          {e.name_as_on_id || "Unknown"}
        </Text>
        <Text allowFontScaling={false} style={consoleSt.cellSub}>Profile #{e.user_id}</Text>
      </View>
      <View style={[consoleSt.cell, { width: PCOLS.giveaway }]}>
        <Text allowFontScaling={false} style={consoleSt.cellText} numberOfLines={1}>{e.giveaway_name || "—"}</Text>
        <Text allowFontScaling={false} style={consoleSt.cellSub}>#{e.giveaway_id}</Text>
      </View>
      <View style={[consoleSt.cell, { width: PCOLS.email }]}>
        <Text allowFontScaling={false} style={consoleSt.cellText} numberOfLines={1}>{e.email || "—"}</Text>
      </View>
      <View style={[consoleSt.cell, { width: PCOLS.phone }]}>
        <Text allowFontScaling={false} style={consoleSt.cellText} numberOfLines={1}>{e.phone || "—"}</Text>
      </View>
      <View style={[consoleSt.cell, { width: PCOLS.birthday }]}>
        <Text allowFontScaling={false} style={consoleSt.cellText} numberOfLines={1}>{e.birthday ? formatDate(`${e.birthday}T00:00:00`) : "—"}</Text>
      </View>
      <View style={[consoleSt.cell, { width: PCOLS.entries }]}>
        <Text allowFontScaling={false} style={consoleSt.cellText}>{(e.quantity ?? 1).toLocaleString()}</Text>
      </View>
      <View style={[consoleSt.cell, { width: PCOLS.entered }]}>
        <Text allowFontScaling={false} style={consoleSt.cellText}>{formatDate(e.created_at)}</Text>
      </View>
      <View style={[consoleSt.cell, { width: PCOLS.prize }]}>
        <Text allowFontScaling={false} style={consoleSt.cellText}>{e.giveaway_prize ? formatMoney(e.giveaway_prize) : "—"}</Text>
      </View>
      <View style={[consoleSt.cell, { width: PCOLS.actions, flexDirection: "row", gap: 4, paddingRight: 0 }]}>
        <ConsoleButton label="Contact" icon="person-circle-outline" onPress={onContact} accessibilityLabel={`Contact ${e.name_as_on_id || "participant"}`} />
      </View>
    </Pressable>
  );
}

function ParticipantDetailModal({
  entry: e,
  all,
  formatDate,
  formatBirthday,
  onSelectEntry,
  onClose,
  onFilterGiveaway,
}: {
  entry: Entry;
  all: Entry[];
  formatDate: (d: string | null) => string;
  formatBirthday: (d: string | null) => string;
  onSelectEntry: (e: Entry) => void;
  onClose: () => void;
  onFilterGiveaway: (giveawayId: number) => void;
}) {
  // Same person = same profile id (user_id) — taken from the list this page already loaded.
  const history = all
    .filter((x) => x.user_id === e.user_id)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const totalEntries = history.reduce((sum, x) => sum + (x.quantity ?? 1), 0);

  const footer = (
    <>
      <View style={{ flex: 1 }} />
      {e.email ? <ConsoleButton label="Email" icon="mail-outline" onPress={() => Linking.openURL(`mailto:${e.email}`).catch(() => {})} /> : null}
      {e.phone ? <ConsoleButton label="Call" icon="call-outline" onPress={() => Linking.openURL(`tel:${e.phone}`).catch(() => {})} /> : null}
      <ConsoleButton label={`Show all entries for #${e.giveaway_id}`} icon="filter" onPress={() => onFilterGiveaway(e.giveaway_id)} />
      <ConsoleButton label="Close" onPress={onClose} />
    </>
  );

  return (
    <AdminModal
      title={e.name_as_on_id || "Unknown participant"}
      subtitle={`Profile #${e.user_id} · ${history.length} ${history.length === 1 ? "giveaway" : "giveaways"} entered`}
      onClose={onClose}
      footer={footer}
      width={900}
      accessibilityLabel={`Participant ${e.name_as_on_id || "Unknown"}`}
    >
      <View style={consoleSt.modalColumns}>
        <View style={consoleSt.modalColLeft}>
          <DetailSection title="Contact (as entered)">
            <DetailRow k="Name on ID" v={e.name_as_on_id || "—"} />
            <DetailRow k="Email" v={e.email || "—"} />
            <DetailRow k="Phone" v={e.phone || "—"} />
            <DetailRow k="Birthday" v={formatBirthday(e.birthday)} />
            <DetailRow k="Profile ID" v={`#${e.user_id}`} />
          </DetailSection>
          <DetailSection title="Confirmations">
            <DetailRow k="Agreed to rules" v={yesNo(e.agreed_to_rules)} />
            <DetailRow k="Agreed to privacy" v={yesNo(e.agreed_to_privacy)} />
            <DetailRow k="Confirmed age" v={yesNo(e.confirmed_age)} />
            <DetailRow k="Promotions opt-in" v={yesNo(e.opted_in_promotions)} />
          </DetailSection>
        </View>
        <View style={consoleSt.modalColRight}>
          <DetailSection title="This entry">
            <DetailRow k="Giveaway" v={`${e.giveaway_name || "—"} (#${e.giveaway_id})`} />
            <DetailRow k="Entries" v={(e.quantity ?? 1).toLocaleString()} />
            <DetailRow k="Entered" v={formatDate(e.created_at)} />
            <DetailRow k="Prize value" v={e.giveaway_prize ? formatMoney(e.giveaway_prize) : "—"} />
          </DetailSection>
          <DetailSection
            title={`Giveaway participation (${history.length})`}
            right={<Text allowFontScaling={false} style={consoleSt.cellSub}>{totalEntries.toLocaleString()} total entries</Text>}
          >
            {history.map((h) => {
              const current = h.id === e.id;
              return (
                <Pressable
                  key={h.id}
                  onPress={() => (current ? undefined : onSelectEntry(h))}
                  accessibilityRole={current ? undefined : "link"}
                  accessibilityLabel={current ? undefined : `Show entry for ${h.giveaway_name}`}
                  style={({ hovered }: any) => [
                    consoleSt.miniRow,
                    { cursor: current ? "default" : "pointer" } as any,
                    hovered && !current && consoleSt.miniRowHover,
                    current && consoleSt.rowSelected,
                  ]}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text allowFontScaling={false} style={consoleSt.cellText} numberOfLines={1}>
                      {h.giveaway_name || `Giveaway #${h.giveaway_id}`}
                      {current ? <Text style={consoleSt.cellMuted}>  · viewing</Text> : null}
                    </Text>
                    <Text allowFontScaling={false} style={consoleSt.cellSub}>
                      #{h.giveaway_id} · {(h.quantity ?? 1).toLocaleString()} {(h.quantity ?? 1) === 1 ? "entry" : "entries"}
                    </Text>
                  </View>
                  <Text allowFontScaling={false} style={consoleSt.cellSub}>{formatDate(h.created_at)}</Text>
                  <Text allowFontScaling={false} style={[consoleSt.cellText, { width: 70, textAlign: "right" }]}>
                    {h.giveaway_prize ? formatMoney(h.giveaway_prize) : "—"}
                  </Text>
                </Pressable>
              );
            })}
          </DetailSection>
        </View>
      </View>
    </AdminModal>
  );
}
