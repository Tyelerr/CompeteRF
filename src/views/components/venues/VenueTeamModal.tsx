// src/views/components/venues/VenueTeamModal.tsx

import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { moderateScale, scale } from "../../../utils/scaling";
import { TeamMember, UserSearchResult, useVenueTeam } from "../../../viewmodels/useVenueTeam";

const isWeb = Platform.OS === "web";
const wxMs = (v: number) => (isWeb ? v : moderateScale(v));
const wxSc = (v: number) => (isWeb ? v : scale(v));

// ── User Search Modal ────────────────────────────────────────────────────────
const AddMemberSheet = ({
  visible,
  title,
  subtitle,
  results,
  searching,
  onSearch,
  onSelect,
  onCancel,
}: {
  visible: boolean;
  title: string;
  subtitle: string;
  results: UserSearchResult[];
  searching: boolean;
  onSearch: (q: string) => void;
  onSelect: (user: UserSearchResult) => void;
  onCancel: () => void;
}) => {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!visible) { setQuery(""); }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={ss.overlay}>
        <View style={ss.card}>
          <Text allowFontScaling={false} style={ss.title}>{title}</Text>
          <Text allowFontScaling={false} style={ss.subtitle}>{subtitle}</Text>

          <TextInput
            allowFontScaling={false}
            style={ss.input}
            value={query}
            onChangeText={(t) => { setQuery(t); onSearch(t); }}
            placeholder="Search by name or email..."
            placeholderTextColor={COLORS.textMuted}
            autoFocus
            autoCapitalize="none"
          />

          {searching && (
            <Text allowFontScaling={false} style={ss.hint}>Searching...</Text>
          )}
          {!searching && query.length > 0 && query.length < 2 && (
            <Text allowFontScaling={false} style={ss.hint}>Type at least 2 characters</Text>
          )}
          {!searching && query.length >= 2 && results.length === 0 && (
            <Text allowFontScaling={false} style={ss.hint}>No users found</Text>
          )}

          <ScrollView style={ss.results} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {results.map((user) => (
              <TouchableOpacity
                key={user.id}
                style={ss.resultRow}
                onPress={() => onSelect(user)}
              >
                <View style={ss.avatar}>
                  <Text allowFontScaling={false} style={ss.avatarText}>
                    {(user.name || user.email).charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={ss.resultInfo}>
                  <Text allowFontScaling={false} style={ss.resultName}>{user.name}</Text>
                  <Text allowFontScaling={false} style={ss.resultEmail}>{user.email}</Text>
                </View>
                <View style={ss.addChip}>
                  <Text allowFontScaling={false} style={ss.addChipText}>Add</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <TouchableOpacity style={ss.cancelBtn} onPress={onCancel}>
            <Text allowFontScaling={false} style={ss.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

// ── Member Row ────────────────────────────────────────────────────────────────
const MemberRow = ({
  member,
  canRemove,
  onRemove,
}: {
  member: TeamMember;
  canRemove: boolean;
  onRemove: () => void;
}) => (
  <View style={ms.row}>
    <View style={ms.avatar}>
      <Text allowFontScaling={false} style={ms.avatarText}>
        {(member.name || member.email).charAt(0).toUpperCase()}
      </Text>
    </View>
    <View style={ms.info}>
      <Text allowFontScaling={false} style={ms.name}>{member.name}</Text>
      <Text allowFontScaling={false} style={ms.email}>{member.email}</Text>
    </View>
    {member.isPrimary && (
      <View style={ms.primaryBadge}>
        <Text allowFontScaling={false} style={ms.primaryBadgeText}>Primary</Text>
      </View>
    )}
    {canRemove && (
      <TouchableOpacity style={ms.removeBtn} onPress={onRemove}>
        <Text allowFontScaling={false} style={ms.removeBtnText}>{"\u2715"}</Text>
      </TouchableOpacity>
    )}
  </View>
);

// ── Section Header ────────────────────────────────────────────────────────────
const SectionHeader = ({
  icon,
  title,
  subtitle,
  onAdd,
  addLabel,
}: {
  icon: string;
  title: string;
  subtitle: string;
  onAdd: () => void;
  addLabel: string;
}) => (
  <View style={sh.wrap}>
    <View style={sh.left}>
      <Text allowFontScaling={false} style={sh.title}>{icon} {title}</Text>
      <Text allowFontScaling={false} style={sh.subtitle}>{subtitle}</Text>
    </View>
    <TouchableOpacity style={sh.addBtn} onPress={onAdd}>
      <Text allowFontScaling={false} style={sh.addBtnText}>{"\u002B"} {addLabel}</Text>
    </TouchableOpacity>
  </View>
);

// ── Main Modal ────────────────────────────────────────────────────────────────
interface Props {
  visible: boolean;
  venueId: number | null;
  venueName: string;
  currentUserId: number;
  onClose: () => void;
}

export const VenueTeamModal = ({ visible, venueId, venueName, currentUserId, onClose }: Props) => {
  const vm = useVenueTeam(venueId);
  const [addingRole, setAddingRole] = useState<"co_owner" | "director" | null>(null);

  useEffect(() => {
    if (visible && venueId) {
      vm.loadTeam();
    }
  }, [visible, venueId]);

  const handleRemoveCoOwner = useCallback((member: TeamMember) => {
    Alert.alert(
      "Remove Co-Owner",
      `Remove ${member.name} as a co-owner of ${venueName}?\n\nThey will lose access to manage this venue.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            const ok = await vm.removeCoOwner(member);
            if (ok) Alert.alert("Done", `${member.name} has been removed as co-owner.`);
          },
        },
      ]
    );
  }, [vm.removeCoOwner, venueName]);

  const handleRemoveDirector = useCallback((member: TeamMember) => {
    Alert.alert(
      "Remove Director",
      `Remove ${member.name} as a director at ${venueName}?\n\nThey will no longer be able to submit tournaments for this venue.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            const ok = await vm.removeDirector(member);
            if (ok) Alert.alert("Done", `${member.name} has been removed as director.`);
          },
        },
      ]
    );
  }, [vm.removeDirector, venueName]);

  const handleSelectUser = useCallback(async (user: UserSearchResult) => {
    if (!addingRole) return;

    const roleLabel = addingRole === "co_owner" ? "Co-Owner" : "Director";
    Alert.alert(
      `Add as ${roleLabel}`,
      `Add ${user.name} as a ${roleLabel} at ${venueName}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Add",
          onPress: async () => {
            const ok = addingRole === "co_owner"
              ? await vm.addCoOwner(user.id, user.name)
              : await vm.addDirector(user.id, user.name);
            if (ok) {
              Alert.alert("Added!", `${user.name} has been added as ${roleLabel}.`);
              setAddingRole(null);
              vm.clearSearch();
            }
          },
        },
      ]
    );
  }, [addingRole, venueName, vm]);

  return (
    <Modal visible={visible} animationType="slide" transparent={false} statusBarTranslucent>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text allowFontScaling={false} style={styles.closeBtnText}>{"\u2190"} Back</Text>
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text allowFontScaling={false} style={styles.headerTitle}>Manage Team</Text>
            <Text allowFontScaling={false} style={styles.headerSubtitle}>{venueName}</Text>
          </View>
          <View style={styles.placeholder} />
        </View>

        {vm.loading ? (
          <View style={styles.loadingWrap}>
            <Text allowFontScaling={false} style={styles.loadingText}>Loading team...</Text>
          </View>
        ) : (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* ── Owner Section ──────────────────────────────────────────── */}
            <View style={styles.section}>
              <View style={styles.sectionLabelRow}>
                <Text allowFontScaling={false} style={styles.sectionTitle}>
                  {"\uD83D\uDC51"} Owner
                </Text>
                <Text allowFontScaling={false} style={styles.sectionHint}>
                  Primary — cannot be changed here
                </Text>
              </View>
              {vm.primaryOwner ? (
                <MemberRow
                  member={vm.primaryOwner}
                  canRemove={false}
                  onRemove={() => {}}
                />
              ) : (
                <Text allowFontScaling={false} style={styles.emptyText}>No primary owner found</Text>
              )}
            </View>

            {/* ── Co-Owners Section ──────────────────────────────────────── */}
            <View style={styles.section}>
              <SectionHeader
                icon={"\uD83E\uDD1D"}
                title="Co-Owners"
                subtitle="Can manage this venue alongside the owner"
                onAdd={() => { vm.clearSearch(); setAddingRole("co_owner"); }}
                addLabel="Add Co-Owner"
              />
              {vm.coOwners.length === 0 ? (
                <Text allowFontScaling={false} style={styles.emptyText}>
                  No co-owners yet — add a spouse, business partner, or manager
                </Text>
              ) : (
                vm.coOwners.map((m) => (
                  <MemberRow
                    key={m.id}
                    member={m}
                    canRemove={m.userId !== currentUserId}
                    onRemove={() => handleRemoveCoOwner(m)}
                  />
                ))
              )}
            </View>

            {/* ── Directors Section ──────────────────────────────────────── */}
            <View style={styles.section}>
              <SectionHeader
                icon={"\uD83C\uDFC6"}
                title="Tournament Directors"
                subtitle="Can submit and manage tournaments at this venue"
                onAdd={() => { vm.clearSearch(); setAddingRole("director"); }}
                addLabel="Add Director"
              />
              {vm.directors.length === 0 ? (
                <Text allowFontScaling={false} style={styles.emptyText}>
                  No directors yet — add someone to manage tournaments here
                </Text>
              ) : (
                vm.directors.map((m) => (
                  <MemberRow
                    key={m.id}
                    member={m}
                    canRemove={true}
                    onRemove={() => handleRemoveDirector(m)}
                  />
                ))
              )}
            </View>
          </ScrollView>
        )}
      </View>

      {/* Add Member Sheet */}
      <AddMemberSheet
        visible={addingRole !== null}
        title={addingRole === "co_owner" ? "Add Co-Owner" : "Add Director"}
        subtitle={
          addingRole === "co_owner"
            ? "Co-owners can manage venue details, directors, and tournaments"
            : "Directors can submit and manage tournaments at this venue"
        }
        results={vm.searchResults}
        searching={vm.searching}
        onSearch={vm.searchUsers}
        onSelect={handleSelectUser}
        onCancel={() => { setAddingRole(null); vm.clearSearch(); }}
      />
    </Modal>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.md,
    paddingTop: Platform.OS === "ios" ? wxSc(56) : wxSc(40),
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  closeBtn: { padding: SPACING.xs },
  closeBtnText: { fontSize: wxMs(FONT_SIZES.sm), color: COLORS.primary, fontWeight: "600" },
  headerCenter: { alignItems: "center" },
  headerTitle: { fontSize: wxMs(FONT_SIZES.lg), fontWeight: "700", color: COLORS.text },
  headerSubtitle: { fontSize: wxMs(FONT_SIZES.xs), color: COLORS.textSecondary, marginTop: wxSc(2) },
  placeholder: { width: wxSc(60) },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { fontSize: wxMs(FONT_SIZES.md), color: COLORS.textSecondary },
  scroll: { flex: 1 },
  scrollContent: { padding: SPACING.md, paddingBottom: SPACING.xl * 2 },
  section: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  sectionLabelRow: { marginBottom: SPACING.sm },
  sectionTitle: { fontSize: wxMs(FONT_SIZES.md), fontWeight: "700", color: COLORS.text },
  sectionHint: { fontSize: wxMs(FONT_SIZES.xs), color: COLORS.textMuted, marginTop: wxSc(2) },
  emptyText: {
    fontSize: wxMs(FONT_SIZES.sm),
    color: COLORS.textMuted,
    fontStyle: "italic",
    paddingVertical: SPACING.sm,
  },
});

const ms = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border + "60",
  },
  avatar: {
    width: wxSc(36),
    height: wxSc(36),
    borderRadius: wxSc(18),
    backgroundColor: COLORS.primary + "20",
    borderWidth: 1,
    borderColor: COLORS.primary + "40",
    alignItems: "center",
    justifyContent: "center",
    marginRight: SPACING.sm,
  },
  avatarText: { fontSize: wxMs(FONT_SIZES.md), fontWeight: "700", color: COLORS.primary },
  info: { flex: 1 },
  name: { fontSize: wxMs(FONT_SIZES.sm), fontWeight: "600", color: COLORS.text },
  email: { fontSize: wxMs(FONT_SIZES.xs), color: COLORS.textSecondary, marginTop: wxSc(1) },
  primaryBadge: {
    backgroundColor: COLORS.primary + "20",
    borderWidth: 1,
    borderColor: COLORS.primary + "50",
    borderRadius: wxSc(10),
    paddingHorizontal: SPACING.sm,
    paddingVertical: wxSc(2),
    marginLeft: SPACING.sm,
  },
  primaryBadgeText: { fontSize: wxMs(FONT_SIZES.xs), color: COLORS.primary, fontWeight: "700" },
  removeBtn: {
    width: wxSc(28),
    height: wxSc(28),
    borderRadius: wxSc(14),
    backgroundColor: COLORS.error + "15",
    borderWidth: 1,
    borderColor: COLORS.error + "40",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: SPACING.sm,
  },
  removeBtnText: { fontSize: wxMs(FONT_SIZES.xs), color: COLORS.error, fontWeight: "700" },
});

const sh = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: SPACING.sm,
  },
  left: { flex: 1, marginRight: SPACING.sm },
  title: { fontSize: wxMs(FONT_SIZES.md), fontWeight: "700", color: COLORS.text },
  subtitle: { fontSize: wxMs(FONT_SIZES.xs), color: COLORS.textSecondary, marginTop: wxSc(2) },
  addBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: wxSc(6),
    alignSelf: "flex-start",
  },
  addBtnText: { fontSize: wxMs(FONT_SIZES.xs), color: COLORS.white, fontWeight: "700" },
});

const ss = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: Platform.OS === "ios" ? wxSc(160) : wxSc(120),
    paddingHorizontal: SPACING.xl,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: wxSc(16),
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    width: "100%",
    maxWidth: wxSc(400),
    maxHeight: "80%",
  },
  title: { fontSize: wxMs(FONT_SIZES.lg), fontWeight: "700", color: COLORS.text, marginBottom: wxSc(4) },
  subtitle: { fontSize: wxMs(FONT_SIZES.sm), color: COLORS.textSecondary, marginBottom: SPACING.md, lineHeight: wxMs(FONT_SIZES.sm) * 1.5 },
  input: {
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: wxMs(FONT_SIZES.md),
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  hint: { fontSize: wxMs(FONT_SIZES.xs), color: COLORS.textMuted, fontStyle: "italic", marginBottom: SPACING.sm },
  results: { maxHeight: wxSc(240) },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border + "60",
  },
  avatar: {
    width: wxSc(36),
    height: wxSc(36),
    borderRadius: wxSc(18),
    backgroundColor: COLORS.primary + "20",
    alignItems: "center",
    justifyContent: "center",
    marginRight: SPACING.sm,
  },
  avatarText: { fontSize: wxMs(FONT_SIZES.md), fontWeight: "700", color: COLORS.primary },
  resultInfo: { flex: 1 },
  resultName: { fontSize: wxMs(FONT_SIZES.sm), fontWeight: "600", color: COLORS.text },
  resultEmail: { fontSize: wxMs(FONT_SIZES.xs), color: COLORS.textSecondary },
  addChip: {
    backgroundColor: COLORS.primary,
    borderRadius: wxSc(12),
    paddingHorizontal: SPACING.sm,
    paddingVertical: wxSc(4),
    marginLeft: SPACING.sm,
  },
  addChipText: { fontSize: wxMs(FONT_SIZES.xs), color: COLORS.white, fontWeight: "700" },
  cancelBtn: {
    marginTop: SPACING.md,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
  },
  cancelBtnText: { fontSize: wxMs(FONT_SIZES.md), color: COLORS.textSecondary, fontWeight: "600" },
});