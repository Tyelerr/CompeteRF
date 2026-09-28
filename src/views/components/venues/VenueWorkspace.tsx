// src/views/components/venues/VenueWorkspace.tsx
// WEB-only Venue Management control panel: a persistent left sidebar (venue picker when
// there is more than one venue, venue identity, Details / Tables / Directors navigation, and
// separated secondary actions such as Reassign Owner) with the selected section on the right.
//
// Presentation / navigation only. The three sections are the EXISTING components and
// viewmodels the edit-venue screen uses — DetailsTab + useEditVenue (save), TablesTab +
// useVenueTables, DirectorsTab + useEditVenue (search / add / remove) — so no venue, table or
// director logic is duplicated. The body is keyed by venue id, so switching venues remounts it
// and nothing from the previous venue can linger. Below WIDE_MIN it reflows to a stacked header
// (picker + identity + section tabs) above the content. Native keeps its existing screens.

import { ReactNode } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { useEditVenue } from "../../../viewmodels/useEditVenue";
import { useVenueTables } from "../../../viewmodels/useVenueTables";
import { Dropdown } from "../common/dropdown";
import { DetailsTab } from "./DetailsTab";
import { DirectorsTab } from "./DirectorsTab";
import { TablesTab } from "./TablesTab";

// Side-by-side sidebar + content from this viewport width; below it the layout stacks.
const WIDE_MIN = 900;
// Up to this many venues the picker is a plain list; more → one searchable dropdown.
const LIST_PICKER_MAX = 6;
const SIDEBAR_WIDTH = 300;

export type VenueSection = "details" | "tables" | "directors";

export interface VenueWorkspaceVenue {
  id: number;
  venue: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  status: string;
  photo_url?: string | null;
  activeTournaments: number;
  totalDirectors: number;
  totalViews: number;
}

export interface VenueWorkspaceAction {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  tone?: "warning" | "primary";
}

interface Props {
  venues: VenueWorkspaceVenue[];
  selected: VenueWorkspaceVenue;
  onSelectVenue: (id: number) => void;
  section: VenueSection;
  onSelectSection: (s: VenueSection) => void;
  // Optional back link at the top of the sidebar (omit when the page has its own header Back).
  backLabel?: string;
  onBack?: () => void;
  // Secondary actions under the navigation (e.g. Reassign Owner — warning tone, Manage Team).
  actions?: VenueWorkspaceAction[];
  // Optional small link above the picker (e.g. "+ Add Venue").
  topAction?: { label: string; onPress: () => void };
}

const statusColor = (status: string): string =>
  status === "active" ? COLORS.success : status === "pending" ? COLORS.warning : COLORS.textSecondary;

const SECTIONS: { key: VenueSection; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "details", label: "Details", icon: "document-text-outline" },
  { key: "tables", label: "Tables", icon: "grid-outline" },
  { key: "directors", label: "Directors", icon: "people-outline" },
];

export function VenueWorkspace({
  venues,
  selected,
  onSelectVenue,
  section,
  onSelectSection,
  backLabel,
  onBack,
  actions = [],
  topAction,
}: Props) {
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_MIN;

  const picker =
    venues.length <= 1 ? null : venues.length <= LIST_PICKER_MAX && wide ? (
      <View style={st.pickerList}>
        <Text style={st.sideLabel}>VENUE</Text>
        {venues.map((v) => {
          const on = v.id === selected.id;
          return (
            <TouchableOpacity
              key={v.id}
              style={[st.pickerItem, on && st.pickerItemOn]}
              onPress={() => onSelectVenue(v.id)}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <Text style={[st.pickerItemText, on && st.pickerItemTextOn]} numberOfLines={1}>
                {v.venue}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    ) : (
      <View style={st.pickerDropdown}>
        <View style={st.pickerHead}>
          <Text style={st.sideLabel}>VENUE</Text>
          <Text style={st.pickerCount}>{venues.length} venues</Text>
        </View>
        <Dropdown
          options={venues.map((v) => ({ label: `${v.venue} · ${v.city}, ${v.state}`, value: String(v.id) }))}
          value={String(selected.id)}
          onSelect={(val) => onSelectVenue(Number(val))}
          searchable
          searchPlaceholder="Search venues…"
          hideCheck
          selectedBlueText
        />
      </View>
    );

  const identity = (
    <View style={st.identity}>
      {selected.photo_url && wide ? (
        <Image source={{ uri: selected.photo_url }} style={st.photo} resizeMode="cover" />
      ) : null}
      <View style={st.nameRow}>
        <Text style={st.name} numberOfLines={2}>
          {selected.venue}
        </Text>
        <View style={[st.statusBadge, { backgroundColor: statusColor(selected.status) + "22", borderColor: statusColor(selected.status) + "66" }]}>
          <Text style={[st.statusText, { color: statusColor(selected.status) }]}>{selected.status}</Text>
        </View>
      </View>
      <View style={st.metaRow}>
        <Ionicons name="location-outline" size={14} color={COLORS.textMuted} style={st.metaIcon} />
        <View style={st.metaCol}>
          <Text style={st.meta} numberOfLines={1}>{selected.address}</Text>
          <Text style={st.meta} numberOfLines={1}>{selected.city}, {selected.state} {selected.zip_code}</Text>
        </View>
      </View>
      <Text style={st.idText}>ID {selected.id}</Text>
    </View>
  );

  const actionButtons = actions.map((a) => (
    <TouchableOpacity
      key={a.label}
      style={[st.actionBtn, a.tone === "warning" ? st.actionWarn : st.actionPlain]}
      onPress={a.onPress}
      activeOpacity={0.75}
    >
      <Ionicons name={a.icon} size={16} color={a.tone === "warning" ? COLORS.warning : COLORS.primary} />
      <Text style={[st.actionText, { color: a.tone === "warning" ? COLORS.warning : COLORS.primary }]}>{a.label}</Text>
    </TouchableOpacity>
  ));

  if (!wide) {
    // Narrow web: stacked header (back · picker · identity · section tabs) above the content.
    return (
      <ScrollView style={st.fill} contentContainerStyle={st.narrowContent}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} style={st.back}>
            <Text style={st.backText}>← {backLabel ?? "Back"}</Text>
          </TouchableOpacity>
        ) : null}
        {topAction ? (
          <TouchableOpacity onPress={topAction.onPress} style={st.topAction}>
            <Text style={st.topActionText}>{topAction.label}</Text>
          </TouchableOpacity>
        ) : null}
        {picker}
        {identity}
        <View style={st.tabsRow}>
          {SECTIONS.map((s) => (
            <TouchableOpacity key={s.key} style={[st.tab, section === s.key && st.tabOn]} onPress={() => onSelectSection(s.key)}>
              <Text style={[st.tabText, section === s.key && st.tabTextOn]}>{s.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <VenueWorkspaceBody key={selected.id} venue={selected} section={section} />
        {actionButtons.length ? <View style={st.narrowActions}>{actionButtons}</View> : null}
      </ScrollView>
    );
  }

  return (
    <View style={st.row}>
      <ScrollView style={st.sidebar} contentContainerStyle={st.sidebarContent} showsVerticalScrollIndicator={false}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} style={st.back}>
            <Text style={st.backText}>← {backLabel ?? "Back"}</Text>
          </TouchableOpacity>
        ) : null}
        {topAction ? (
          <TouchableOpacity onPress={topAction.onPress} style={st.topAction}>
            <Text style={st.topActionText}>{topAction.label}</Text>
          </TouchableOpacity>
        ) : null}
        {picker}
        {identity}
        <View style={st.nav}>
          {SECTIONS.map((s) => {
            const on = section === s.key;
            return (
              <TouchableOpacity
                key={s.key}
                style={[st.navItem, on && st.navItemOn]}
                onPress={() => onSelectSection(s.key)}
                activeOpacity={0.75}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
              >
                <Ionicons name={s.icon} size={18} color={on ? COLORS.primary : COLORS.textSecondary} />
                <Text style={[st.navText, on && st.navTextOn]}>{s.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {actionButtons.length ? (
          <>
            <View style={st.divider} />
            <View style={st.sideActions}>{actionButtons}</View>
          </>
        ) : null}
      </ScrollView>
      <ScrollView style={st.fill} contentContainerStyle={st.mainContent}>
        <VenueWorkspaceBody key={selected.id} venue={selected} section={section} />
      </ScrollView>
    </View>
  );
}

// The selected venue's section content. Mounted per venue (key) so its viewmodels start
// fresh for each venue — the same hooks + components the edit-venue screen uses.
function VenueWorkspaceBody({ venue, section }: { venue: VenueWorkspaceVenue; section: VenueSection }) {
  const venueVM = useEditVenue(venue.id);
  const tablesVM = useVenueTables(venue.id);

  const stats: { icon: keyof typeof Ionicons.glyphMap; value: number; label: string }[] = [
    { icon: "calendar-outline", value: venue.activeTournaments, label: venue.activeTournaments === 1 ? "Active Event" : "Active Events" },
    { icon: "people-outline", value: venue.totalDirectors, label: venue.totalDirectors === 1 ? "Director" : "Directors" },
    { icon: "eye-outline", value: venue.totalViews, label: venue.totalViews === 1 ? "View" : "Views" },
  ];

  const heading: Record<VenueSection, { title: string; sub: string }> = {
    details: { title: "Venue Information", sub: "Name, address and contact details shown on your venue page." },
    tables: { title: "Tables", sub: "The pool tables at this venue — players see these on your venue page." },
    directors: { title: `Directors (${venueVM.directors.length})`, sub: "Tournament directors assigned to this venue." },
  };

  let body: ReactNode;
  if (venueVM.loading) {
    body = (
      <View style={st.loading}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  } else if (!venueVM.venue) {
    body = <Text style={st.error}>Venue not found.</Text>;
  } else if (section === "details") {
    body = (
      <DetailsTab
        layout="desktop"
        venue={venueVM.editedVenue!}
        onChange={venueVM.setEditedVenue}
        onSave={venueVM.saveDetails}
        saving={venueVM.saving}
      />
    );
  } else if (section === "tables") {
    body = (
      <TablesTab
        layout="desktop"
        tables={tablesVM.tables}
        newTable={tablesVM.newTable}
        loading={tablesVM.loading}
        saving={tablesVM.saving}
        tableSizeOptions={tablesVM.tableSizeOptions}
        brandOptions={tablesVM.brandOptions}
        onAddTable={tablesVM.addTable}
        onUpdateTable={tablesVM.updateTable}
        onDeleteTable={tablesVM.deleteTable}
        onUpdateNewTable={tablesVM.updateNewTable}
      />
    );
  } else {
    body = (
      <DirectorsTab
        directors={venueVM.directors}
        searchQuery={venueVM.searchQuery}
        searchResults={venueVM.searchResults}
        searching={venueVM.searching}
        onSearch={venueVM.searchDirectors}
        onAddDirector={venueVM.addDirector}
        onRemoveDirector={venueVM.removeDirector}
      />
    );
  }

  return (
    <View>
      <View style={st.statsRow}>
        {stats.map((s) => (
          <View key={s.icon} style={st.statCard}>
            <Ionicons name={s.icon} size={16} color={COLORS.primary} />
            <Text style={st.statLabel} numberOfLines={1}>{s.label}</Text>
            <Text style={st.statValue}>{s.value}</Text>
          </View>
        ))}
      </View>
      <View style={st.panel}>
        <Text style={st.panelTitle}>{heading[section].title}</Text>
        <Text style={st.panelSub}>{heading[section].sub}</Text>
        {body}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  fill: { flex: 1 },
  row: { flex: 1, flexDirection: "row", gap: SPACING.md, paddingHorizontal: SPACING.md, paddingTop: SPACING.sm },

  sidebar: {
    width: SIDEBAR_WIDTH,
    flexGrow: 0,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.md,
  },
  sidebarContent: { padding: SPACING.md },
  back: { paddingVertical: 2, marginBottom: SPACING.sm },
  backText: { color: COLORS.primary, fontSize: FONT_SIZES.sm, fontWeight: "600" },
  topAction: { alignSelf: "flex-start", marginBottom: SPACING.sm },
  topActionText: { color: COLORS.primary, fontSize: FONT_SIZES.xs, fontWeight: "700" },
  sideLabel: { color: COLORS.textMuted, fontSize: FONT_SIZES.xs, fontWeight: "800", letterSpacing: 1 },

  pickerList: { marginBottom: SPACING.md, gap: 2 },
  pickerItem: { paddingVertical: SPACING.sm, paddingHorizontal: SPACING.sm, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: "transparent" },
  pickerItemOn: { backgroundColor: COLORS.primary + "1F", borderColor: COLORS.primary + "88" },
  pickerItemText: { color: COLORS.textSecondary, fontSize: FONT_SIZES.sm, fontWeight: "600" },
  pickerItemTextOn: { color: COLORS.text },
  pickerDropdown: { marginBottom: SPACING.md, paddingBottom: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  pickerHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: SPACING.xs },
  pickerCount: { color: COLORS.textMuted, fontSize: FONT_SIZES.xs },

  identity: { marginBottom: SPACING.md },
  photo: { width: "100%" as any, height: 140, borderRadius: RADIUS.md, marginBottom: SPACING.md, backgroundColor: COLORS.surfaceLight },
  nameRow: { flexDirection: "row", alignItems: "flex-start", gap: SPACING.sm, marginBottom: SPACING.sm },
  name: { flex: 1, color: COLORS.text, fontSize: FONT_SIZES.xl, fontWeight: "800", lineHeight: 28 },
  statusBadge: { borderWidth: 1, borderRadius: RADIUS.full, paddingHorizontal: SPACING.sm, paddingVertical: 2, marginTop: 4 },
  statusText: { fontSize: FONT_SIZES.xs, fontWeight: "700", textTransform: "capitalize" },
  metaRow: { flexDirection: "row", alignItems: "flex-start" },
  metaIcon: { marginRight: 6, marginTop: 2 },
  metaCol: { flex: 1, minWidth: 0 },
  meta: { color: COLORS.textSecondary, fontSize: FONT_SIZES.sm, lineHeight: 19 },
  idText: { color: COLORS.textMuted, fontSize: FONT_SIZES.xs, fontWeight: "600", marginTop: SPACING.xs, marginLeft: 20 },

  nav: { gap: 4, paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.border },
  navItem: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, paddingVertical: 10, paddingHorizontal: SPACING.sm, borderRadius: RADIUS.sm, borderLeftWidth: 3, borderLeftColor: "transparent" },
  navItemOn: { backgroundColor: COLORS.primary + "24", borderLeftColor: COLORS.primary },
  navText: { color: COLORS.textSecondary, fontSize: FONT_SIZES.md, fontWeight: "600" },
  navTextOn: { color: COLORS.text, fontWeight: "700" },

  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: SPACING.md },
  sideActions: { gap: SPACING.sm },
  actionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACING.xs, borderWidth: 1, borderRadius: RADIUS.sm, paddingVertical: SPACING.sm },
  actionWarn: { borderColor: COLORS.warning + "99", backgroundColor: COLORS.warning + "14" },
  actionPlain: { borderColor: COLORS.primary + "66", backgroundColor: COLORS.primary + "10" },
  actionText: { fontSize: FONT_SIZES.sm, fontWeight: "700" },

  mainContent: { paddingBottom: SPACING.xl * 2 },
  // Compact stats strip: icon · label · value, one short row.
  statsRow: { flexDirection: "row", gap: SPACING.sm, marginBottom: SPACING.sm, flexWrap: "wrap" },
  statCard: { flex: 1, minWidth: 150, flexDirection: "row", alignItems: "center", gap: SPACING.sm, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md },
  statLabel: { flex: 1, color: COLORS.textSecondary, fontSize: FONT_SIZES.sm, fontWeight: "600" },
  statValue: { color: COLORS.text, fontSize: FONT_SIZES.lg, fontWeight: "800" },

  panel: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.lg, paddingTop: SPACING.md, paddingHorizontal: SPACING.sm, paddingBottom: SPACING.md },
  panelTitle: { color: COLORS.text, fontSize: FONT_SIZES.lg, fontWeight: "800", paddingHorizontal: SPACING.sm },
  panelSub: { color: COLORS.textSecondary, fontSize: FONT_SIZES.sm, paddingHorizontal: SPACING.sm, marginTop: 2, marginBottom: SPACING.xs },
  loading: { paddingVertical: SPACING.xl, alignItems: "center" },
  error: { color: COLORS.error, padding: SPACING.md },

  // Narrow web
  narrowContent: { padding: SPACING.md, paddingBottom: SPACING.xl * 2 },
  tabsRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: COLORS.border, marginBottom: SPACING.md },
  tab: { flex: 1, alignItems: "center", paddingVertical: SPACING.sm },
  tabOn: { borderBottomWidth: 2, borderBottomColor: COLORS.primary },
  tabText: { color: COLORS.textSecondary, fontSize: FONT_SIZES.sm, fontWeight: "600" },
  tabTextOn: { color: COLORS.primary },
  narrowActions: { gap: SPACING.sm, marginTop: SPACING.md },
});
