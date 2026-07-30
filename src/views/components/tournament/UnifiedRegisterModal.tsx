// src/views/components/tournament/UnifiedRegisterModal.tsx
// ONE adaptive, search-first registration modal for Singles AND Scotch Doubles.
// Built in isolation (Phase 5 UI commit) — not yet wired into any screen.
//
// Flow (see PHASE5_REVIEW.md / the locked direction):
//   • Opens straight on a focused search — no "existing vs create" fork.
//   • Unified ACTIVE + PENDING results (debounced); Recent Players before typing.
//   • No result -> inline "Create <query>" -> first/last/email/(phone) -> the
//     service creates OR reuses by normalized email and returns players.id.
//   • Inline Fargo confirmation (replaces the old popup).
//   • Singles: search -> Fargo -> Add Player (Player 1 of 1).
//   • Doubles: Player 1 of 2 -> Fargo -> [Continue to Teammate | Save as Waiting
//     for Teammate] -> Player 2 of 2 -> Fargo -> Team Review -> Create Team.
//   • NO team row is created during intermediate steps — only on "Save as Waiting
//     for Teammate" or the final "Create Team".
//   • Same player can't fill both slots. Everything keyed on the stable players.id.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal as RNModal,
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
import { webMs, webSc } from "../../../utils/scaling";
import { Button } from "../common/button";
import { Input } from "../common/input";
import { useUnifiedPlayerSearch } from "../../../viewmodels/hooks/use.unified.player.search";
import { playerRegistrationService } from "../../../models/services/player.registration.service";
import { PlayerSearchResult } from "../../../models/types/player.registration.types";

export type RegisterMode = "singles" | "doubles";

export interface UnifiedRegisterModalProps {
  visible: boolean;
  onClose: () => void;
  tournamentId: number | null;
  mode: RegisterMode;
  // Resume the doubles flow at Player 2 for an existing waiting team
  // ("+ Add Teammate"). When set, Player 1 is skipped.
  resumeTeam?: { teamId: number; captainName?: string | null } | null;
  // Parent refresh hooks (fire-and-refresh). The modal owns all writes.
  onRegistered?: (playerId: string, registrationId: number) => void;
  onTeamSaved?: (teamId: number) => void;
}

type Step = "search" | "create" | "fargo" | "review";
type Slot = 1 | 2;

const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";

const splitName = (q: string): { first: string; last: string } => {
  const parts = q.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
};

export const UnifiedRegisterModal = ({
  visible,
  onClose,
  tournamentId,
  mode,
  resumeTeam = null,
  onRegistered,
  onTeamSaved,
}: UnifiedRegisterModalProps) => {
  const isDoubles = mode === "doubles";

  const [step, setStep] = useState<Step>("search");
  const [slot, setSlot] = useState<Slot>(1);
  const [selected, setSelected] = useState<Record<Slot, PlayerSearchResult | null>>({ 1: null, 2: null });
  const [fargo, setFargo] = useState<Record<Slot, string>>({ 1: "", 2: "" });
  const [teamName, setTeamName] = useState("");
  const [teamId, setTeamId] = useState<number | null>(null);

  // Inline create-player form
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const search = useUnifiedPlayerSearch(tournamentId);
  const searchInputRef = useRef<TextInput>(null);

  // Reset all state whenever the modal (re)opens.
  useEffect(() => {
    if (!visible) return;
    setErrorMsg(null);
    setFlash(null);
    setBusy(false);
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
    setFargo({ 1: "", 2: "" });
    setTeamName("");
    if (resumeTeam) {
      // Resume at Player 2; Player 1 is the existing captain.
      setTeamId(resumeTeam.teamId);
      setSelected({ 1: null, 2: null });
      setSlot(2);
      setStep("search");
    } else {
      setTeamId(null);
      setSelected({ 1: null, 2: null });
      setSlot(1);
      setStep("search");
    }
    search.reset();
    search.loadRecents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, resumeTeam]);

  const title = isDoubles ? "Add Team" : "Add Player";
  const stepLabel = useMemo(() => {
    if (step === "review") return "Team Review";
    if (!isDoubles) return "Player 1 of 1";
    return slot === 1 ? "Player 1 of 2" : "Player 2 of 2";
  }, [step, isDoubles, slot]);

  // Exclude the already-picked Player 1 from Player 2 results (no same player twice).
  const visibleResults = useMemo(() => {
    const otherId = slot === 2 ? selected[1]?.player_id : undefined;
    return search.results.filter((r) => r.player_id !== otherId);
  }, [search.results, slot, selected]);

  const visibleRecents = useMemo(() => {
    const otherId = slot === 2 ? selected[1]?.player_id : undefined;
    return search.recents.filter((r) => r.player_id !== otherId);
  }, [search.recents, slot, selected]);

  const goSearch = useCallback(() => {
    setErrorMsg(null);
    search.reset();
    search.loadRecents();
    setStep("search");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickPlayer = (player: PlayerSearchResult) => {
    if (!isDoubles && player.is_registered) return; // already in this tournament
    if (slot === 2 && selected[1]?.player_id === player.player_id) return; // guard
    setSelected((s) => ({ ...s, [slot]: player }));
    setFargo((f) => ({ ...f, [slot]: player.fargo != null ? String(player.fargo) : "" }));
    setErrorMsg(null);
    setStep("fargo");
  };

  const openCreate = () => {
    const { first, last } = splitName(search.query);
    setFirstName(first);
    setLastName(last);
    setEmail("");
    setPhone("");
    setErrorMsg(null);
    setStep("create");
  };

  const submitCreate = async () => {
    if (tournamentId == null) return;
    if (!firstName.trim() || !lastName.trim()) {
      setErrorMsg("First and last name are required.");
      return;
    }
    if (!email.trim()) {
      setErrorMsg("Email is required to create a player.");
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await playerRegistrationService.createPendingPlayer({
        tournamentId,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
      });
      // Whether created or reused, we now have a stable players.id to select.
      const picked: PlayerSearchResult = {
        player_id: res.player_id,
        account_status: res.account_status,
        display_name: res.display_name,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email_masked: res.email_masked,
        username: null,
        avatar_url: null,
        fargo: null,
        is_registered: false,
      };
      if (slot === 2 && selected[1]?.player_id === picked.player_id) {
        setErrorMsg("That player is already Player 1.");
        setBusy(false);
        return;
      }
      setSelected((s) => ({ ...s, [slot]: picked }));
      setFargo((f) => ({ ...f, [slot]: "" }));
      if (res.outcome !== "CREATED_PENDING") {
        setFlash(res.outcome === "MATCHED_ACTIVE" ? "Existing player reused." : "Existing pending player reused.");
      }
      setStep("fargo");
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Could not create the player.");
    } finally {
      setBusy(false);
    }
  };

  const parseFargo = (slotKey: Slot): number | null => {
    const raw = fargo[slotKey].trim();
    if (!raw) return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  };

  // --- Terminal actions (the ONLY writes that create rows) -----------------

  const doRegisterSingles = async () => {
    if (tournamentId == null || !selected[1]) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const regId = await playerRegistrationService.registerPlayer(
        tournamentId,
        selected[1].player_id,
        parseFargo(1),
      );
      onRegistered?.(selected[1].player_id, regId);
      setFlash(`${selected[1].display_name} added.`);
      // Stay open to add more.
      setSelected({ 1: null, 2: null });
      setFargo({ 1: "", 2: "" });
      goSearch();
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Could not add the player.");
    } finally {
      setBusy(false);
    }
  };

  const doSaveWaiting = async () => {
    if (tournamentId == null || !selected[1]) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const newTeamId = await playerRegistrationService.createTeam(
        tournamentId,
        selected[1].player_id,
        parseFargo(1),
      );
      onTeamSaved?.(newTeamId);
      onClose();
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Could not save the team.");
      setBusy(false);
    }
  };

  const doCreateTeam = async () => {
    if (tournamentId == null || !selected[2]) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      let effectiveTeamId = teamId;
      if (effectiveTeamId == null) {
        if (!selected[1]) throw new Error("Player 1 is missing.");
        effectiveTeamId = await playerRegistrationService.createTeam(
          tournamentId,
          selected[1].player_id,
          parseFargo(1),
        );
      }
      await playerRegistrationService.addTeamMember(
        effectiveTeamId,
        selected[2].player_id,
        parseFargo(2),
      );
      onTeamSaved?.(effectiveTeamId);
      onClose();
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Could not create the team.");
      setBusy(false);
    }
  };

  // --- Renderers -----------------------------------------------------------

  const renderRow = (r: PlayerSearchResult) => {
    const disabled = !isDoubles && r.is_registered;
    return (
      <TouchableOpacity
        key={r.player_id}
        style={[styles.row, disabled && styles.rowDisabled]}
        activeOpacity={0.7}
        disabled={disabled}
        onPress={() => pickPlayer(r)}
      >
        {r.avatar_url ? (
          <Image source={{ uri: r.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarFallback}>
            <Text allowFontScaling={false} style={styles.avatarInitials}>{initials(r.display_name)}</Text>
          </View>
        )}
        <View style={styles.rowMain}>
          <Text allowFontScaling={false} style={styles.rowName} numberOfLines={1}>{r.display_name}</Text>
          <Text allowFontScaling={false} style={styles.rowSub} numberOfLines={1}>
            {r.username ? `@${r.username}` : r.email_masked ?? ""}
            {r.fargo != null ? `  ·  Fargo ${r.fargo}` : ""}
          </Text>
        </View>
        <View style={styles.rowRight}>
          <View style={[styles.badge, r.account_status === "ACTIVE" ? styles.badgeActive : styles.badgePending]}>
            <Text allowFontScaling={false} style={styles.badgeText}>
              {r.account_status === "ACTIVE" ? "Compete" : "Pending"}
            </Text>
          </View>
          {disabled && <Text allowFontScaling={false} style={styles.registeredTag}>Registered</Text>}
        </View>
      </TouchableOpacity>
    );
  };

  const renderSearch = () => {
    const trimmed = search.query.trim();
    const showRecents = trimmed.length < 2;
    return (
      <View style={styles.stepBody}>
        <View style={styles.searchBar}>
          <TextInput
            ref={searchInputRef}
            allowFontScaling={false}
            style={styles.searchInput}
            value={search.query}
            onChangeText={search.setQuery}
            placeholder="Search by name, username, or email…"
            placeholderTextColor={COLORS.textMuted}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
          />
          {search.isSearching && <ActivityIndicator size="small" color={COLORS.primary} />}
        </View>

        {slot === 2 && (
          <Text allowFontScaling={false} style={styles.p1Chip}>
            Player 1 ✓  {selected[1]?.display_name ?? resumeTeam?.captainName ?? ""}
          </Text>
        )}

        <ScrollView keyboardShouldPersistTaps="handled" style={styles.results}>
          {showRecents ? (
            <>
              {search.isLoadingRecents ? (
                <ActivityIndicator color={COLORS.primary} style={{ marginTop: webSc(SPACING.lg) }} />
              ) : visibleRecents.length > 0 ? (
                <>
                  <Text allowFontScaling={false} style={styles.sectionLabel}>Recent players</Text>
                  {visibleRecents.map(renderRow)}
                </>
              ) : (
                <Text allowFontScaling={false} style={styles.hint}>Start typing to search players.</Text>
              )}
            </>
          ) : (
            <>
              {visibleResults.map(renderRow)}
              {!search.isSearching && visibleResults.length === 0 && (
                <View style={styles.noResults}>
                  <Text allowFontScaling={false} style={styles.hint}>No players found for “{trimmed}”.</Text>
                  <TouchableOpacity style={styles.createCta} activeOpacity={0.7} onPress={openCreate}>
                    <Text allowFontScaling={false} style={styles.createCtaText}>+ Create “{trimmed}”</Text>
                  </TouchableOpacity>
                </View>
              )}
              {visibleResults.length > 0 && (
                <TouchableOpacity style={styles.createInline} activeOpacity={0.7} onPress={openCreate}>
                  <Text allowFontScaling={false} style={styles.createInlineText}>+ Create a new player</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </ScrollView>
      </View>
    );
  };

  const renderCreate = () => (
    <ScrollView style={styles.stepBody} keyboardShouldPersistTaps="handled">
      <Text allowFontScaling={false} style={styles.createHeading}>Create player</Text>
      <Text allowFontScaling={false} style={styles.hint}>
        We’ll reuse an existing player if this email already exists.
      </Text>
      <Input label="First name" value={firstName} onChangeText={setFirstName} autoCapitalize="words" />
      <Input label="Last name" value={lastName} onChangeText={setLastName} autoCapitalize="words" />
      <Input label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      <Input label="Phone (optional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      {errorMsg && <Text allowFontScaling={false} style={styles.error}>{errorMsg}</Text>}
      <View style={styles.actionsRow}>
        <View style={styles.actionBtn}><Button title="Back" variant="ghost" onPress={goSearch} /></View>
        <View style={styles.actionBtn}><Button title="Create & Continue" onPress={submitCreate} loading={busy} /></View>
      </View>
    </ScrollView>
  );

  const renderFargo = () => {
    const player = selected[slot];
    const isP1Doubles = isDoubles && slot === 1;
    const isP2Doubles = isDoubles && slot === 2;
    return (
      <ScrollView style={styles.stepBody} keyboardShouldPersistTaps="handled">
        <View style={styles.selectedCard}>
          <Text allowFontScaling={false} style={styles.selectedName}>{player?.display_name}</Text>
          <View style={[styles.badge, player?.account_status === "ACTIVE" ? styles.badgeActive : styles.badgePending]}>
            <Text allowFontScaling={false} style={styles.badgeText}>
              {player?.account_status === "ACTIVE" ? "Compete Account" : "Pending Account"}
            </Text>
          </View>
        </View>

        <Input
          label="Fargo rating (optional)"
          value={fargo[slot]}
          onChangeText={(t) => setFargo((f) => ({ ...f, [slot]: t.replace(/[^0-9]/g, "") }))}
          keyboardType="numeric"
          helper="You can verify it after adding."
        />
        {errorMsg && <Text allowFontScaling={false} style={styles.error}>{errorMsg}</Text>}

        {!isDoubles && (
          <View style={styles.actionsRow}>
            <View style={styles.actionBtn}><Button title="Back" variant="ghost" onPress={goSearch} /></View>
            <View style={styles.actionBtn}><Button title="Add Player" onPress={doRegisterSingles} loading={busy} /></View>
          </View>
        )}

        {isP1Doubles && (
          <View style={styles.stackActions}>
            <Button title="Continue to Teammate" onPress={() => { setErrorMsg(null); setSlot(2); goSearch(); }} />
            <View style={{ height: webSc(SPACING.sm) }} />
            <Button title="Save as Waiting for Teammate" variant="outline" onPress={doSaveWaiting} loading={busy} />
            <View style={{ height: webSc(SPACING.sm) }} />
            <Button title="Back" variant="ghost" onPress={goSearch} />
          </View>
        )}

        {isP2Doubles && (
          <View style={styles.actionsRow}>
            <View style={styles.actionBtn}><Button title="Back" variant="ghost" onPress={goSearch} /></View>
            <View style={styles.actionBtn}><Button title="Continue to Review" onPress={() => { setErrorMsg(null); setStep("review"); }} /></View>
          </View>
        )}
      </ScrollView>
    );
  };

  const renderReview = () => {
    const p1Name = selected[1]?.display_name ?? resumeTeam?.captainName ?? "Player 1";
    const p2 = selected[2];
    return (
      <ScrollView style={styles.stepBody} keyboardShouldPersistTaps="handled">
        <Text allowFontScaling={false} style={styles.createHeading}>Team review</Text>

        <View style={styles.reviewMember}>
          <Text allowFontScaling={false} style={styles.reviewName}>{p1Name}</Text>
          <Text allowFontScaling={false} style={styles.reviewMeta}>
            {fargo[1].trim() ? `Fargo ${fargo[1].trim()}` : "No Fargo"}
          </Text>
        </View>
        <Text allowFontScaling={false} style={styles.plus}>+</Text>
        <View style={styles.reviewMember}>
          <Text allowFontScaling={false} style={styles.reviewName}>{p2?.display_name}</Text>
          <Text allowFontScaling={false} style={styles.reviewMeta}>
            {fargo[2].trim() ? `Fargo ${fargo[2].trim()}` : "No Fargo"}
            {"  ·  "}
            {p2?.account_status === "ACTIVE" ? "Compete" : "Pending"}
          </Text>
        </View>

        <Input label="Team name (optional)" value={teamName} onChangeText={setTeamName} placeholder={`${p1Name} / ${p2?.display_name ?? ""}`} />
        {errorMsg && <Text allowFontScaling={false} style={styles.error}>{errorMsg}</Text>}

        <View style={styles.actionsRow}>
          <View style={styles.actionBtn}><Button title="Back" variant="ghost" onPress={() => { setErrorMsg(null); setStep("fargo"); }} /></View>
          <View style={styles.actionBtn}><Button title="Create Team" onPress={doCreateTeam} loading={busy} /></View>
        </View>
      </ScrollView>
    );
  };

  return (
    <RNModal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.kav}
        >
          <View style={styles.sheet}>
            <View style={styles.header}>
              <View>
                <Text allowFontScaling={false} style={styles.title}>{title}</Text>
                <Text allowFontScaling={false} style={styles.subtitle}>{stepLabel}</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeButton} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text allowFontScaling={false} style={styles.closeText}>✕</Text>
              </TouchableOpacity>
            </View>

            {flash && <Text allowFontScaling={false} style={styles.flash}>{flash}</Text>}

            {step === "search" && renderSearch()}
            {step === "create" && renderCreate()}
            {step === "fargo" && renderFargo()}
            {step === "review" && renderReview()}
          </View>
        </KeyboardAvoidingView>
      </View>
    </RNModal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  kav: { width: "100%" },
  sheet: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    height: "88%",
    paddingBottom: webSc(SPACING.md),
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: webSc(SPACING.md),
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: { fontSize: webMs(FONT_SIZES.xl), fontWeight: "700", color: COLORS.text },
  subtitle: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.textSecondary, marginTop: webSc(SPACING.xs) },
  closeButton: { padding: webSc(SPACING.sm) },
  closeText: { fontSize: webMs(FONT_SIZES.xl), color: COLORS.textSecondary },
  flash: {
    color: COLORS.secondary,
    fontSize: webMs(FONT_SIZES.sm),
    paddingHorizontal: webSc(SPACING.md),
    paddingTop: webSc(SPACING.sm),
  },
  stepBody: { flex: 1, paddingHorizontal: webSc(SPACING.md), paddingTop: webSc(SPACING.sm) },

  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: webSc(SPACING.md),
  },
  searchInput: {
    flex: 1,
    color: COLORS.text,
    fontSize: webMs(FONT_SIZES.md),
    paddingVertical: webSc(SPACING.md),
  },
  p1Chip: {
    color: COLORS.secondary,
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "600",
    marginTop: webSc(SPACING.sm),
  },
  results: { flex: 1, marginTop: webSc(SPACING.sm) },
  sectionLabel: {
    color: COLORS.textMuted,
    fontSize: webMs(FONT_SIZES.xs),
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: webSc(SPACING.xs),
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: webSc(SPACING.sm),
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  rowDisabled: { opacity: 0.45 },
  avatar: { width: webSc(40), height: webSc(40), borderRadius: RADIUS.full, backgroundColor: COLORS.surfaceLight },
  avatarFallback: {
    width: webSc(40),
    height: webSc(40),
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: { color: COLORS.textSecondary, fontWeight: "700", fontSize: webMs(FONT_SIZES.sm) },
  rowMain: { flex: 1, marginLeft: webSc(SPACING.sm) },
  rowName: { color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "600" },
  rowSub: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs), marginTop: 2 },
  rowRight: { alignItems: "flex-end" },
  badge: { paddingHorizontal: webSc(SPACING.sm), paddingVertical: 2, borderRadius: RADIUS.full },
  badgeActive: { backgroundColor: "#0d2f22", borderWidth: 1, borderColor: COLORS.secondary },
  badgePending: { backgroundColor: "#3a2f0d", borderWidth: 1, borderColor: COLORS.warning },
  badgeText: { color: COLORS.text, fontSize: webMs(FONT_SIZES.xs), fontWeight: "600" },
  registeredTag: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), marginTop: 2 },

  hint: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.sm), marginTop: webSc(SPACING.md) },
  noResults: { alignItems: "flex-start", marginTop: webSc(SPACING.md) },
  createCta: {
    marginTop: webSc(SPACING.md),
    paddingVertical: webSc(SPACING.md),
    paddingHorizontal: webSc(SPACING.lg),
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  createCtaText: { color: COLORS.primary, fontWeight: "700", fontSize: webMs(FONT_SIZES.md) },
  createInline: { paddingVertical: webSc(SPACING.md), marginTop: webSc(SPACING.xs) },
  createInlineText: { color: COLORS.primary, fontWeight: "600", fontSize: webMs(FONT_SIZES.sm) },

  createHeading: { color: COLORS.text, fontSize: webMs(FONT_SIZES.lg), fontWeight: "700", marginBottom: webSc(SPACING.xs) },

  selectedCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.md,
    padding: webSc(SPACING.md),
    marginBottom: webSc(SPACING.md),
  },
  selectedName: { color: COLORS.text, fontSize: webMs(FONT_SIZES.lg), fontWeight: "600", flex: 1 },

  reviewMember: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.md,
    padding: webSc(SPACING.md),
  },
  reviewName: { color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "600" },
  reviewMeta: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs), marginTop: 2 },
  plus: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.lg), textAlign: "center", paddingVertical: webSc(SPACING.xs) },

  actionsRow: { flexDirection: "row", marginTop: webSc(SPACING.md), gap: webSc(SPACING.sm) },
  actionBtn: { flex: 1 },
  stackActions: { marginTop: webSc(SPACING.md) },
  error: { color: COLORS.error, fontSize: webMs(FONT_SIZES.sm), marginTop: webSc(SPACING.sm) },
});
