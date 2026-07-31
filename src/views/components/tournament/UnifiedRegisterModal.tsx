// src/views/components/tournament/UnifiedRegisterModal.tsx
// ONE adaptive, search-first registration modal for Singles AND Scotch Doubles.
// It behaves like a single continuous form that progressively reveals the next
// part — no separate "Continue to Teammate" screen, no nested popups.
//
// Singles:  search -> select -> inline Fargo -> Add Player (Player 1 of 1).
// Doubles:  Player 1 of 2 (search/select) -> Player 2 of 2 (P1 shown compact with
//           inline Fargo, P2 search revealed underneath) -> select P2 + inline Fargo
//           -> Team Review -> Create Team. "Save as Waiting for Teammate" is a
//           secondary text action at the bottom of the Player 2 search.
//
// A team row is created ONLY on explicit "Save as Waiting for Teammate" or the final
// "Create Team". Same player can't fill both slots. Everything is keyed on players.id.
// Create Player is a persistent centered blue link in a fixed footer (results scroll
// above it, it stays above the keyboard + safe-area inset). Phone uses the shared
// US formatter (formatUsPhoneInput/digitsOnly) and submits E.164 (+1XXXXXXXXXX).

import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Keyboard,
  Modal as RNModal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { webMs, webSc } from "../../../utils/scaling";
import { digitsOnly, formatUsPhoneInput } from "../../../utils/phone";
import { Button } from "../common/button";
import { Input } from "../common/input";
import { useUnifiedPlayerSearch } from "../../../viewmodels/hooks/use.unified.player.search";
import { playerRegistrationService } from "../../../models/services/player.registration.service";
import { PlayerSearchResult } from "../../../models/types/player.registration.types";
import { TeamCard } from "./TeamCard";

export type RegisterMode = "singles" | "doubles";

export interface UnifiedRegisterModalProps {
  visible: boolean;
  onClose: () => void;
  tournamentId: number | null;
  mode: RegisterMode;
  // Resume doubles at Player 2 for an existing waiting team ("+ Add Teammate").
  resumeTeam?: { teamId: number; captainName?: string | null } | null;
  // Open directly in edit mode for an existing PENDING player (attached to this
  // tournament). Prefills the form via get_pending_player and saves via update.
  editPlayer?: { playerId: string } | null;
  onRegistered?: (playerId: string, registrationId: number) => void;
  onTeamSaved?: (teamId: number) => void;
  onEdited?: (playerId: string) => void;
  // Optional chip preview for Team Review (chip tournaments pass chipsForFargo).
  computeChips?: (p1Fargo: number | null, p2Fargo: number | null) => number | null;
}

type Step = "search" | "create" | "fargo" | "draft" | "p2search";
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

// Live keyboard height so the results list (and only the results list) can shrink,
// keeping the header + search field fixed and fully visible.
const useKeyboardHeight = (): number => {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvt, (e) => setHeight(e.endCoordinates?.height ?? 0));
    const hide = Keyboard.addListener(hideEvt, () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
};

export const UnifiedRegisterModal = ({
  visible,
  onClose,
  tournamentId,
  mode,
  resumeTeam = null,
  editPlayer = null,
  onRegistered,
  onTeamSaved,
  onEdited,
  computeChips,
}: UnifiedRegisterModalProps) => {
  const isDoubles = mode === "doubles";
  const { height: winH } = useWindowDimensions();
  const kb = useKeyboardHeight();

  const [step, setStep] = useState<Step>("search");
  const [slot, setSlot] = useState<Slot>(1);
  const [selected, setSelected] = useState<Record<Slot, PlayerSearchResult | null>>({ 1: null, 2: null });
  const [fargo, setFargo] = useState<Record<Slot, string>>({ 1: "", 2: "" });
  const [teamName, setTeamName] = useState("");
  const [teamId, setTeamId] = useState<number | null>(null);
  // Non-null while editing an existing PENDING player (submit calls update, not create).
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);

  // Inline create-player form. phoneDigits holds up to 10 US digits; we submit E.164.
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneDigits, setPhoneDigits] = useState("");

  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const isSearchStep = step === "search" || step === "p2search";
  // Top offset when the search step is top-anchored (so it shrinks from the bottom
  // when the keyboard opens instead of sliding up under the header).
  const topOffset = Math.round(winH * 0.07);
  // Results list cap: fills the room below the fixed header+search and above the
  // keyboard+footer. RESERVE ≈ header + search + footer + paddings (a layout reserve,
  // not a keyboard push offset). Sizes to content when short, scrolls when long.
  const resultsMax = Math.max(webSc(140), Math.round(winH - topOffset - kb - webSc(240)));

  const search = useUnifiedPlayerSearch(tournamentId);
  const lastRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);

  // Reset all state whenever the modal (re)opens.
  useEffect(() => {
    if (!visible) return;
    setErrorMsg(null);
    setFlash(null);
    setBusy(false);
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhoneDigits("");
    setFargo({ 1: "", 2: "" });
    setTeamName("");
    setSelected({ 1: null, 2: null });
    if (editPlayer && tournamentId != null) {
      // Edit an existing PENDING player: jump to the form, prefill from the server.
      setEditingPlayerId(editPlayer.playerId);
      setTeamId(null);
      setSlot(1);
      setStep("create");
      playerRegistrationService
        .getPendingPlayer(tournamentId, editPlayer.playerId)
        .then((f) => {
          if (!f) return;
          setFirstName(f.first_name ?? "");
          setLastName(f.last_name ?? "");
          setEmail(f.email ?? "");
          setPhoneDigits(digitsOnly(f.phone ?? "").slice(-10));
        })
        .catch(() => {});
    } else if (resumeTeam) {
      setEditingPlayerId(null);
      setTeamId(resumeTeam.teamId);
      setSlot(2);
      setStep("draft"); // open the existing waiting team's card; Add Player 2 from it
    } else {
      setEditingPlayerId(null);
      setTeamId(null);
      setSlot(1);
      setStep("search");
    }
    search.reset();
    if (!editPlayer) search.loadRecents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, resumeTeam, editPlayer]);

  const title = editPlayer ? "Edit Player" : isDoubles ? "Add Team" : "Add Player";
  const stepLabel = useMemo(() => {
    if (editPlayer) return "";
    if (!isDoubles) return "Player 1 of 1";
    if (step === "draft") return ""; // the card shows its own status
    if (step === "p2search") return "Player 2 of 2";
    return "Player 1 of 2";
  }, [step, isDoubles, editPlayer]);

  // Exclude the already-picked Player 1 from Player 2 results (no same player twice).
  const excludeId = slot === 2 ? selected[1]?.player_id : undefined;
  const visibleResults = useMemo(
    () => search.results.filter((r) => r.player_id !== excludeId),
    [search.results, excludeId],
  );
  const visibleRecents = useMemo(
    () => search.recents.filter((r) => r.player_id !== excludeId),
    [search.recents, excludeId],
  );

  const parseFargo = (slotKey: Slot): number | null => {
    const raw = fargo[slotKey].trim();
    if (!raw) return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  };

  const prefill = (slotKey: Slot, player: PlayerSearchResult) => {
    setSelected((s) => ({ ...s, [slotKey]: player }));
    setFargo((f) => ({ ...f, [slotKey]: player.fargo != null ? String(player.fargo) : "" }));
  };

  // --- Selection --------------------------------------------------------------

  const pickPlayer = (player: PlayerSearchResult) => {
    if (!isDoubles && player.is_registered) return; // already registered (singles)
    if (isDoubles && player.on_team) return; // already on a team (doubles)
    if (slot === 2 && selected[1]?.player_id === player.player_id) return;
    setErrorMsg(null);
    prefill(slot, player);
    if (slot === 1) {
      if (isDoubles) {
        setStep("draft"); // show the editable New Team card
      } else {
        setStep("fargo");
      }
    } else {
      // Player 2 chosen from the p2 search -> back to the draft card (now complete).
      setStep("draft");
    }
  };

  const clearTeammate = () => {
    setSelected((s) => ({ ...s, 2: null }));
    setFargo((f) => ({ ...f, 2: "" }));
    setErrorMsg(null);
    search.reset();
    search.loadRecents();
  };

  // --- Inline create ----------------------------------------------------------

  const openCreate = () => {
    const { first, last } = splitName(search.query);
    setFirstName(first);
    setLastName(last);
    setEmail("");
    setPhoneDigits("");
    setErrorMsg(null);
    setStep("create");
  };

  const backFromCreate = () => {
    setErrorMsg(null);
    // Standalone edit has no prior step — Back closes the modal.
    if (editingPlayerId) {
      onClose();
      return;
    }
    // Otherwise return to the previous search WITHOUT clearing the term.
    setStep(slot === 2 ? "p2search" : "search");
  };

  const submitEdit = async () => {
    if (tournamentId == null || !editingPlayerId) return;
    if (!firstName.trim() || !lastName.trim()) {
      setErrorMsg("First and last name are required.");
      return;
    }
    if (!email.trim()) {
      setErrorMsg("A valid email is required.");
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    try {
      const e164 = phoneDigits.length === 10 ? `+1${phoneDigits}` : null;
      const res = await playerRegistrationService.updatePendingPlayer({
        tournamentId,
        playerId: editingPlayerId,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: e164,
      });
      if (res.outcome === "UPDATED") {
        onEdited?.(editingPlayerId);
        onClose();
        return;
      }
      // Collision — do NOT auto-switch; show a clear, actionable message.
      const who = res.outcome === "EMAIL_BELONGS_TO_ACTIVE_PLAYER" ? "an existing Compete" : "another pending";
      setErrorMsg(
        `That email already belongs to ${who} player (${res.display_name}${res.email_masked ? ` · ${res.email_masked}` : ""}). Use a different email, or cancel and add that player instead.`,
      );
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Could not save the player.");
    } finally {
      setBusy(false);
    }
  };

  const submitCreate = async () => {
    if (editingPlayerId) return submitEdit();
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
      const e164 = phoneDigits.length === 10 ? `+1${phoneDigits}` : null;
      const res = await playerRegistrationService.createPendingPlayer({
        tournamentId,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: e164,
      });
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
        on_team: false,
        team_name: null,
      };
      if (slot === 2 && selected[1]?.player_id === picked.player_id) {
        setErrorMsg("That player is already Player 1.");
        setBusy(false);
        return;
      }
      if (res.outcome !== "CREATED_PENDING") {
        setFlash(res.outcome === "MATCHED_ACTIVE" ? "Existing player reused." : "Existing pending player reused.");
      }
      setSelected((s) => ({ ...s, [slot]: picked }));
      setFargo((f) => ({ ...f, [slot]: "" }));
      if (slot === 1 && isDoubles) {
        setStep("draft"); // P1 created -> editable New Team card
      } else if (slot === 1) {
        setStep("fargo");
      } else {
        setStep("draft"); // P2 created -> back to the (now complete) draft card
      }
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Could not create the player.");
    } finally {
      setBusy(false);
    }
  };

  // --- Terminal writes (the ONLY row-creating actions) ------------------------

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
      setSelected({ 1: null, 2: null });
      setFargo({ 1: "", 2: "" });
      setSlot(1);
      search.reset();
      search.loadRecents();
      setStep("search");
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
        // Persist immediately so a retry after a later RPC failure REUSES this team
        // instead of creating a duplicate.
        setTeamId(effectiveTeamId);
      }
      await playerRegistrationService.addTeamMember(
        effectiveTeamId,
        selected[2].player_id,
        parseFargo(2),
      );
      if (teamName.trim()) {
        await playerRegistrationService.setTeamName(effectiveTeamId, teamName.trim());
      }
      onTeamSaved?.(effectiveTeamId);
      onClose();
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Could not create the team.");
      setBusy(false);
    }
  };

  // --- Small render helpers ---------------------------------------------------

  const badge = (status: string, long = false) => (
    <View style={[styles.badge, status === "ACTIVE" ? styles.badgeActive : styles.badgePending]}>
      <Text allowFontScaling={false} style={styles.badgeText}>
        {status === "ACTIVE" ? (long ? "Compete Account" : "Compete") : long ? "Pending Account" : "Pending"}
      </Text>
    </View>
  );

  const renderRow = (r: PlayerSearchResult) => {
    // Unavailable at the point of selection: doubles → already on a team; singles →
    // already registered. Shown disabled (not a late error).
    const unavailable = isDoubles ? r.on_team : r.is_registered;
    const unavailableLabel = isDoubles ? "Already on a team" : "Already registered";
    return (
      <TouchableOpacity
        key={r.player_id}
        style={[styles.row, unavailable && styles.rowDisabled]}
        activeOpacity={0.7}
        disabled={unavailable}
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
          <View style={styles.rowNameLine}>
            <Text allowFontScaling={false} style={styles.rowName} numberOfLines={1}>{r.display_name}</Text>
            {r.account_status === "PENDING" && (
              <View style={styles.pendingTag}>
                <Text allowFontScaling={false} style={styles.pendingTagText}>Pending</Text>
              </View>
            )}
          </View>
          <Text allowFontScaling={false} style={styles.rowSub} numberOfLines={1}>
            {r.username ? `@${r.username}` : r.email_masked ?? ""}
            {r.fargo != null ? `  ·  Fargo ${r.fargo}` : ""}
            {unavailable && isDoubles && r.team_name ? `  ·  On ${r.team_name}` : ""}
          </Text>
        </View>
        <View style={styles.rowRight}>
          {unavailable ? (
            <View style={styles.unavailBadge}>
              <Text allowFontScaling={false} style={styles.unavailBadgeText}>{unavailableLabel}</Text>
            </View>
          ) : (
            <View style={styles.selectBadge}>
              <Text allowFontScaling={false} style={styles.selectBadgeText}>Select</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const createLinkLabel = () => {
    const q = search.query.trim();
    return q.length >= 2 ? `+ Create “${q}”` : "+ Create a new player";
  };

  // Fixed search field + scrollable results + fixed create footer. The search field
  // sits directly below the (fixed) header and is NOT inside the scroll, so it stays
  // fully visible when the keyboard opens; only the results list shrinks (resultsMax).
  const renderSearchStep = (placeholder: string, topNode?: ReactNode) => {
    const trimmed = search.query.trim();
    const showRecents = trimmed.length < 2;
    return (
      <>
        <View style={styles.searchWrap}>
          {topNode}
          <View style={styles.searchBar}>
            <TextInput
              allowFontScaling={false}
              style={styles.searchInput}
              value={search.query}
              onChangeText={search.setQuery}
              placeholder={placeholder}
              placeholderTextColor={COLORS.textMuted}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {search.isSearching && <ActivityIndicator size="small" color={COLORS.primary} />}
          </View>
        </View>

        <ScrollView
          style={{ maxHeight: resultsMax }}
          contentContainerStyle={styles.resultsContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {showRecents ? (
            search.isLoadingRecents ? (
              <ActivityIndicator color={COLORS.primary} style={{ marginTop: webSc(SPACING.lg) }} />
            ) : visibleRecents.length > 0 ? (
              <>
                <Text allowFontScaling={false} style={styles.sectionLabel}>Recent players</Text>
                {visibleRecents.map(renderRow)}
              </>
            ) : (
              <Text allowFontScaling={false} style={styles.hint}>Start typing to search players.</Text>
            )
          ) : (
            <>
              {visibleResults.map(renderRow)}
              {!search.isSearching && visibleResults.length === 0 && (
                <Text allowFontScaling={false} style={styles.hint}>No players found for “{trimmed}”.</Text>
              )}
            </>
          )}
        </ScrollView>

        <View style={styles.searchFooter}>
          <TouchableOpacity onPress={openCreate} activeOpacity={0.7} style={styles.createLinkWrap}>
            <Text allowFontScaling={false} style={styles.createLink}>{createLinkLabel()}</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  };

  // --- Steps ------------------------------------------------------------------

  const renderSearch = () => renderSearchStep("Search by name, username, or email…");

  const renderCreate = () => (
    <KeyboardAwareScrollView
      style={{ maxHeight: Math.round(winH * 0.62) }}
      contentContainerStyle={styles.createContent}
      keyboardShouldPersistTaps="handled"
      enableOnAndroid
      enableAutomaticScroll
      extraScrollHeight={24}
      showsVerticalScrollIndicator={false}
    >
      <Text allowFontScaling={false} style={styles.createHeading}>{editingPlayerId ? "Edit player" : "Create player"}</Text>
      <Text allowFontScaling={false} style={styles.hint}>
        {editingPlayerId
          ? "Update this pending player’s details. Their history and team stay intact."
          : "We’ll reuse an existing player if this email already exists."}
      </Text>

      <Text allowFontScaling={false} style={styles.fieldLabel}>First name</Text>
      <TextInput
        allowFontScaling={false}
        style={styles.fieldInput}
        value={firstName}
        onChangeText={setFirstName}
        autoCapitalize="words"
        autoFocus
        returnKeyType="next"
        blurOnSubmit={false}
        onSubmitEditing={() => lastRef.current?.focus()}
      />

      <Text allowFontScaling={false} style={styles.fieldLabel}>Last name</Text>
      <TextInput
        ref={lastRef}
        allowFontScaling={false}
        style={styles.fieldInput}
        value={lastName}
        onChangeText={setLastName}
        autoCapitalize="words"
        returnKeyType="next"
        blurOnSubmit={false}
        onSubmitEditing={() => emailRef.current?.focus()}
      />

      <Text allowFontScaling={false} style={styles.fieldLabel}>Email</Text>
      <TextInput
        ref={emailRef}
        allowFontScaling={false}
        style={styles.fieldInput}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="next"
        blurOnSubmit={false}
        onSubmitEditing={() => phoneRef.current?.focus()}
      />

      <Text allowFontScaling={false} style={styles.fieldLabel}>Phone (optional)</Text>
      <View style={styles.phoneRow}>
        <View style={styles.countryPrefix}>
          <Text allowFontScaling={false} style={styles.countryPrefixText}>🇺🇸 +1</Text>
        </View>
        <TextInput
          ref={phoneRef}
          allowFontScaling={false}
          style={styles.phoneInput}
          value={formatUsPhoneInput(phoneDigits)}
          onChangeText={(t) => setPhoneDigits(digitsOnly(t).slice(0, 10))}
          placeholder="(555) 123-4567"
          placeholderTextColor={COLORS.textMuted}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          returnKeyType="done"
          onSubmitEditing={() => Keyboard.dismiss()}
        />
      </View>

      {errorMsg && <Text allowFontScaling={false} style={styles.error}>{errorMsg}</Text>}

      <View style={styles.createFooter}>
        <TouchableOpacity style={styles.backBtn} onPress={backFromCreate} disabled={busy} activeOpacity={0.7}>
          <Text allowFontScaling={false} style={styles.backBtnText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.createBtn, busy && styles.createBtnDisabled]}
          onPress={submitCreate}
          disabled={busy}
          activeOpacity={0.85}
        >
          {busy ? (
            <ActivityIndicator color={COLORS.white} />
          ) : (
            <Text allowFontScaling={false} style={styles.createBtnText} numberOfLines={1}>{editingPlayerId ? "Save" : "Create & Continue"}</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAwareScrollView>
  );

  const renderFargo = () => (
    <KeyboardAwareScrollView
      style={{ maxHeight: Math.round(winH * 0.6) }}
      contentContainerStyle={styles.searchContent}
      keyboardShouldPersistTaps="handled"
      enableOnAndroid
      extraScrollHeight={20}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.selectedCard}>
        <Text allowFontScaling={false} style={styles.selectedName}>{selected[1]?.display_name}</Text>
        {selected[1] && badge(selected[1].account_status, true)}
      </View>
      <Input
        label="Fargo rating (optional)"
        value={fargo[1]}
        onChangeText={(t) => setFargo((f) => ({ ...f, 1: t.replace(/[^0-9]/g, "") }))}
        keyboardType="numeric"
        helper="You can verify it after adding."
      />
      {errorMsg && <Text allowFontScaling={false} style={styles.error}>{errorMsg}</Text>}
      <View style={styles.actionsRow}>
        <View style={styles.actionBtn}>
          <Button title="Back" variant="ghost" onPress={() => { setErrorMsg(null); setStep("search"); }} />
        </View>
        <View style={styles.actionBtn}><Button title="Add Player" onPress={doRegisterSingles} loading={busy} /></View>
      </View>
    </KeyboardAwareScrollView>
  );

  // Doubles: the editable New Team card IS the review — no wizard steps.
  const renderDraft = () => {
    const p1Name = selected[1]?.display_name ?? resumeTeam?.captainName ?? "Player 1";
    const p2 = selected[2];
    const chips = computeChips ? computeChips(parseFargo(1), parseFargo(2)) : null;
    return (
      <>
          <TeamCard
            mode="draft"
            title={title}
            onClose={onClose}
            doubles
            label="New Team"
            statusLabel={p2 ? "Ready" : "Waiting"}
            statusColor={p2 ? COLORS.secondary : COLORS.warning}
            chipsPillText={`${chips ?? 0} Chips`}
            teamName={teamName || null}
            onChangeTeamName={setTeamName}
            player1={{
              name: p1Name,
              idLabel: null,
              fargo: parseFargo(1),
              fargoEditable: !!selected[1],
              onChangeFargo: (v) => setFargo((f) => ({ ...f, 1: v.replace(/[^0-9]/g, "") })),
              removable: !!selected[1] && !resumeTeam,
              onRemove: () => { setErrorMsg(null); setSlot(1); search.reset(); search.loadRecents(); setStep("search"); },
            }}
            player2={
              p2
                ? {
                    name: p2.display_name,
                    idLabel: null,
                    fargo: parseFargo(2),
                    fargoEditable: true,
                    onChangeFargo: (v) => setFargo((f) => ({ ...f, 2: v.replace(/[^0-9]/g, "") })),
                    removable: true,
                    onRemove: clearTeammate,
                  }
                : null
            }
            showAddPartner={!p2}
            onAddPlayer2={() => { setErrorMsg(null); setSlot(2); search.reset(); search.loadRecents(); setStep("p2search"); }}
            assignedChipsText={String(chips ?? 0)}
            paid={false}
            checkedIn={false}
            onSaveWaiting={doSaveWaiting}
            onCreateTeam={doCreateTeam}
            onCancel={onClose}
            saving={busy}
          />
          {errorMsg && <Text allowFontScaling={false} style={styles.error}>{errorMsg}</Text>}
      </>
    );
  };

  // Player 2 search, opened from the draft card's "Add Player 2".
  const renderP2Search = () =>
    renderSearchStep(
      "Search teammate by name, username, or email…",
      <Text allowFontScaling={false} style={styles.p1Reminder}>
        Player 1 ✓  {selected[1]?.display_name ?? resumeTeam?.captainName ?? ""}
      </Text>,
    );

  return (
    <RNModal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable
        style={[styles.overlay, isSearchStep && { justifyContent: "flex-start", paddingTop: topOffset }]}
        onPress={() => Keyboard.dismiss()}
      >
        <View style={styles.kav}>
          {step === "draft" ? (
            // The gray card IS the modal surface here — no outer sheet/header/border.
            <KeyboardAwareScrollView
              style={{ maxHeight: Math.round(winH * 0.85) }}
              keyboardShouldPersistTaps="handled"
              enableOnAndroid
              extraScrollHeight={20}
              showsVerticalScrollIndicator={false}
            >
              {renderDraft()}
            </KeyboardAwareScrollView>
          ) : (
            <View style={[styles.sheet, { maxHeight: isSearchStep ? Math.round(winH - topOffset - kb - webSc(16)) : Math.round(winH * 0.85) }]}>
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
              {step === "p2search" && renderP2Search()}
            </View>
          )}
        </View>
      </Pressable>
    </RNModal>
  );
};

const styles = StyleSheet.create({
  // Centered floating card (matches the screen's other dialogs), not a bottom sheet.
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center", paddingHorizontal: webSc(SPACING.md), paddingVertical: webSc(SPACING.lg) },
  kav: { width: "100%", maxWidth: 480, alignSelf: "center" },
  sheet: {
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    width: "100%",
    overflow: "hidden",
  },
  // Draft step sizes to the card's content (sheet uses a pixel maxHeight inline so
  // it caps + scrolls only when the card is tall, e.g. a complete team + side pots).
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
  flash: { color: COLORS.secondary, fontSize: webMs(FONT_SIZES.sm), paddingHorizontal: webSc(SPACING.md), paddingTop: webSc(SPACING.sm) },

  stepBody: { paddingHorizontal: webSc(SPACING.md), paddingTop: webSc(SPACING.sm) },
  searchContent: { paddingHorizontal: webSc(SPACING.md), paddingTop: webSc(SPACING.sm), paddingBottom: webSc(SPACING.md) },
  // Fixed search section (below the header, always visible).
  searchWrap: { paddingHorizontal: webSc(SPACING.md), paddingTop: webSc(SPACING.sm) },
  resultsContent: { paddingHorizontal: webSc(SPACING.md) },
  // Fixed create-player footer (stays above the keyboard / below the results).
  searchFooter: { borderTopWidth: 1, borderTopColor: COLORS.border },
  p1Reminder: { color: COLORS.secondary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "600", marginBottom: webSc(SPACING.xs) },

  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: webSc(SPACING.md),
    marginBottom: webSc(SPACING.sm),
  },
  searchInput: { flex: 1, color: COLORS.text, fontSize: webMs(FONT_SIZES.md), paddingVertical: webSc(SPACING.md) },
  results: { marginTop: webSc(SPACING.sm) },
  sectionLabel: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), textTransform: "uppercase", letterSpacing: 1, marginBottom: webSc(SPACING.xs) },

  row: { flexDirection: "row", alignItems: "center", paddingVertical: webSc(SPACING.sm), borderBottomWidth: 1, borderBottomColor: COLORS.border },
  rowDisabled: { opacity: 0.45 },
  avatar: { width: webSc(40), height: webSc(40), borderRadius: RADIUS.full, backgroundColor: COLORS.surfaceLight },
  avatarFallback: { width: webSc(40), height: webSc(40), borderRadius: RADIUS.full, backgroundColor: COLORS.surfaceLight, alignItems: "center", justifyContent: "center" },
  avatarInitials: { color: COLORS.textSecondary, fontWeight: "700", fontSize: webMs(FONT_SIZES.sm) },
  rowMain: { flex: 1, marginLeft: webSc(SPACING.sm) },
  rowName: { color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "600" },
  rowSub: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs), marginTop: 2 },
  rowRight: { alignItems: "flex-end" },
  rowNameLine: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.xs) },
  pendingTag: { backgroundColor: "#3a2f0d", borderWidth: 1, borderColor: COLORS.warning, borderRadius: RADIUS.full, paddingHorizontal: 6, paddingVertical: 1 },
  pendingTagText: { color: COLORS.warning, fontSize: webMs(FONT_SIZES.xs - 1), fontWeight: "700" },
  selectBadge: { borderWidth: 1, borderColor: COLORS.primary, borderRadius: RADIUS.full, paddingHorizontal: webSc(SPACING.md), paddingVertical: 4 },
  selectBadgeText: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  unavailBadge: { borderWidth: 1, borderColor: COLORS.warning + "66", backgroundColor: COLORS.warning + "22", borderRadius: RADIUS.full, paddingHorizontal: webSc(SPACING.sm), paddingVertical: 4 },
  unavailBadgeText: { color: COLORS.warning, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700" },
  badge: { paddingHorizontal: webSc(SPACING.sm), paddingVertical: 2, borderRadius: RADIUS.full },
  badgeActive: { backgroundColor: "#0d2f22", borderWidth: 1, borderColor: COLORS.secondary },
  badgePending: { backgroundColor: "#3a2f0d", borderWidth: 1, borderColor: COLORS.warning },
  badgeText: { color: COLORS.text, fontSize: webMs(FONT_SIZES.xs), fontWeight: "600" },
  registeredTag: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), marginTop: 2 },

  hint: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.sm), marginTop: webSc(SPACING.md) },

  // Fixed footer (create link stays put while results scroll above it).
  footer: { paddingTop: webSc(SPACING.sm), borderTopWidth: 1, borderTopColor: COLORS.border },
  createLinkWrap: { alignItems: "center", paddingVertical: webSc(SPACING.sm) },
  createLink: { color: COLORS.primary, fontWeight: "600", fontSize: webMs(FONT_SIZES.md), textAlign: "center" },
  waitingWrap: { alignItems: "center", paddingVertical: webSc(SPACING.xs) },
  waitingLink: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm), textAlign: "center" },

  createHeading: { color: COLORS.text, fontSize: webMs(FONT_SIZES.lg), fontWeight: "700", marginBottom: webSc(SPACING.xs) },

  // Compact Create-player form (tighter than the shared Input so the modal stays small).
  createContent: { paddingHorizontal: webSc(SPACING.md), paddingTop: webSc(SPACING.sm), paddingBottom: webSc(SPACING.md) },
  fieldLabel: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "600", marginTop: webSc(SPACING.sm), marginBottom: webSc(SPACING.xs) },
  fieldInput: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingVertical: webSc(10),
    paddingHorizontal: webSc(SPACING.md),
    fontSize: webMs(FONT_SIZES.md),
    color: COLORS.text,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
  },
  createFooter: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.md), marginTop: webSc(SPACING.md) },
  backBtn: { paddingVertical: webSc(SPACING.sm), paddingHorizontal: webSc(SPACING.md) },
  backBtnText: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.md), fontWeight: "600" },
  createBtn: { flex: 1, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: webSc(SPACING.sm), minHeight: webSc(44), alignItems: "center", justifyContent: "center" },
  createBtnDisabled: { opacity: 0.6 },
  createBtnText: { color: COLORS.white, fontSize: webMs(FONT_SIZES.md), fontWeight: "700" },

  // Phone field (matches the SMS-verify visual; reuses the shared US formatter).
  phoneLabel: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.text, marginBottom: webSc(SPACING.xs), fontWeight: "500" },
  phoneRow: { flexDirection: "row", alignItems: "center", marginBottom: webSc(SPACING.md) },
  countryPrefix: {
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderTopLeftRadius: RADIUS.md,
    borderBottomLeftRadius: RADIUS.md,
    paddingHorizontal: webSc(SPACING.md),
    paddingVertical: webSc(SPACING.md),
  },
  countryPrefixText: { color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "600" },
  phoneInput: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderLeftWidth: 0,
    borderColor: COLORS.border,
    borderTopRightRadius: RADIUS.md,
    borderBottomRightRadius: RADIUS.md,
    paddingVertical: webSc(SPACING.md),
    paddingHorizontal: webSc(SPACING.md),
    fontSize: webMs(FONT_SIZES.md),
    color: COLORS.text,
  },

  selectedCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.md, padding: webSc(SPACING.md), marginBottom: webSc(SPACING.md) },
  selectedName: { color: COLORS.text, fontSize: webMs(FONT_SIZES.lg), fontWeight: "600" },
  changeLink: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.xs), marginTop: 2 },

  // Player 1 compact block on the Player-2 step.
  p1Block: { backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.md, padding: webSc(SPACING.md), marginBottom: webSc(SPACING.sm) },
  p1Header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  p1HeaderRight: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm) },
  p1Label: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), textTransform: "uppercase", letterSpacing: 1 },
  p1Name: { color: COLORS.text, fontSize: webMs(FONT_SIZES.lg), fontWeight: "600", marginTop: 2 },
  p1FargoRow: { flexDirection: "row", alignItems: "center", marginTop: webSc(SPACING.sm) },
  p1FargoLabel: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm), marginRight: webSc(SPACING.sm) },
  p1FargoInput: {
    minWidth: webSc(80),
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingVertical: webSc(SPACING.sm),
    paddingHorizontal: webSc(SPACING.md),
    color: COLORS.text,
    fontSize: webMs(FONT_SIZES.md),
  },
  teammateLabel: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), textTransform: "uppercase", letterSpacing: 1, marginBottom: webSc(SPACING.xs) },

  reviewMember: { backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.md, padding: webSc(SPACING.md) },
  reviewName: { color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "600" },
  reviewMeta: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs), marginTop: 2 },
  plus: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.lg), textAlign: "center", paddingVertical: webSc(SPACING.xs) },
  chipsLine: { color: COLORS.secondary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "600", marginTop: webSc(SPACING.md) },

  actionsRow: { flexDirection: "row", marginTop: webSc(SPACING.md), gap: webSc(SPACING.sm) },
  actionBtn: { flex: 1 },
  error: { color: COLORS.error, fontSize: webMs(FONT_SIZES.sm), marginTop: webSc(SPACING.sm) },
});
