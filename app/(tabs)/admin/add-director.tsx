import { moderateScale, scale } from "../../../src/utils/scaling";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Platform,
} from "react-native";
import { supabase } from "../../../src/lib/supabase";
import { useAuthContext } from "../../../src/providers/AuthProvider";
import { COLORS } from "../../../src/theme/colors";
import { SPACING } from "../../../src/theme/spacing";
import { FONT_SIZES } from "../../../src/theme/typography";

const isWeb = Platform.OS === "web";

interface SearchUser {
  id_auto: number;
  name: string;
  email: string;
  user_name: string;
  role: string;
}

interface UserVenue {
  id: number;
  venue: string;
  city: string;
  state: string;
}

const PROTECTED_ROLES = ["super_admin", "compete_admin", "bar_owner"];

export default function AddDirectorScreen() {
  const router = useRouter();
  const { profile } = useAuthContext();

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [venues, setVenues] = useState<UserVenue[]>([]);
  const [selectedVenue, setSelectedVenue] = useState<number | null>(null);
  const [selectedUser, setSelectedUser] = useState<SearchUser | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    loadVenues();
  }, []);

  const loadVenues = async () => {
    if (!profile?.id_auto) return;
    try {
      const { data, error } = await supabase
        .from("venue_owners")
        .select(`venues (id, venue, city, state)`)
        .eq("owner_id", profile.id_auto)
        .is("archived_at", null);

      if (error) { console.error("Error loading venues:", error); return; }

      const venueList = (data || []).map((vo: any) => vo.venues).filter(Boolean) as UserVenue[];
      setVenues(venueList);
    } catch (error) {
      console.error("Error loading venues:", error);
    }
  };

  const searchUsers = useCallback(
    async (query: string) => {
      if (!query.trim() || query.trim().length < 2) { setSearchResults([]); return; }
      setSearching(true);
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("id_auto, name, email, user_name, role")
          .or(`email.ilike.%${query}%,name.ilike.%${query}%,user_name.ilike.%${query}%`)
          .neq("id_auto", profile!.id_auto)
          .eq("status", "active")
          .limit(20);
        if (error) throw error;
        setSearchResults(data || []);
      } catch (error) {
        console.error("Error searching users:", error);
      } finally {
        setSearching(false);
      }
    },
    [profile],
  );

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback(
    (text: string) => {
      setSearchQuery(text);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (text.trim().length < 2) { setSearchResults([]); return; }
      debounceRef.current = setTimeout(() => { searchUsers(text); }, 400);
    },
    [searchUsers],
  );

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const canBeDirector = (user: SearchUser): boolean => {
    return user.role === "basic_user" || user.role === "tournament_director";
  };

  const getRoleLabel = (role: string): { text: string; color: string } => {
    if (PROTECTED_ROLES.includes(role)) {
      return { text: "Unavailable \u2013 Has elevated account role", color: "#ef4444" };
    }
    if (role === "tournament_director") {
      return { text: "Already a Tournament Director", color: "#22c55e" };
    }
    if (role === "basic_user") {
      return { text: "Will be promoted to Tournament Director", color: "#f59e0b" };
    }
    return { text: "Unavailable", color: COLORS.textSecondary };
  };

  const handleSelectDirector = (user: SearchUser) => {
    if (!canBeDirector(user)) {
      Alert.alert("Cannot Select", `${user.name} has an elevated account role and cannot be added as a venue director.`);
      return;
    }
    setSelectedUser(user);
    setSearchQuery("");
    setSearchResults([]);
  };

  const handleSave = async () => {
    if (!selectedUser || !selectedVenue) {
      Alert.alert("Error", "Please select a director and a venue.");
      return;
    }
    const venueName = venues.find((v) => v.id === selectedVenue)?.venue || "this venue";
    if (selectedUser.role === "basic_user") {
      Alert.alert(
        "Promote & Assign Director?",
        `This will:\n\n\u2022 Promote ${selectedUser.name} to Tournament Director\n\u2022 Assign them as a director at ${venueName}\n\nContinue?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Yes, Promote & Add", onPress: () => executeAdd() },
        ],
      );
    } else {
      Alert.alert(
        "Assign Director?",
        `Add ${selectedUser.name} as a director at ${venueName}?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Add Director", onPress: () => executeAdd() },
        ],
      );
    }
  };

  const executeAdd = async () => {
    if (!selectedUser || !selectedVenue) return;
    setAdding(true);
    try {
      const { data: existing } = await supabase
        .from("venue_directors")
        .select("id")
        .eq("venue_id", selectedVenue)
        .eq("director_id", selectedUser.id_auto)
        .is("archived_at", null)
        .single();

      if (existing) {
        Alert.alert("Already Assigned", "This user is already a director at this venue.");
        setAdding(false);
        return;
      }

      if (selectedUser.role === "basic_user") {
        const { data: updatedProfile, error: roleError } = await supabase
          .from("profiles")
          .update({ role: "tournament_director" })
          .eq("id_auto", selectedUser.id_auto)
          .select("id_auto, role")
          .single();

        if (roleError) {
          console.error("Failed to update user role:", roleError);
          Alert.alert("Error", `Failed to promote user: ${roleError.message}`);
          setAdding(false);
          return;
        }

        if (!updatedProfile) {
          console.error("Role update returned null \u2013 likely RLS block");
          Alert.alert("Permission Error", "The database blocked the role update. Please ensure the RLS policy has been applied in Supabase.");
          setAdding(false);
          return;
        }

        if (updatedProfile.role !== "tournament_director") {
          console.error("Role did not change:", updatedProfile.role);
          Alert.alert("Error", "Role update did not take effect. Please contact support.");
          setAdding(false);
          return;
        }
      }

      const { data: archivedRecord } = await supabase
        .from("venue_directors")
        .select("id")
        .eq("venue_id", selectedVenue)
        .eq("director_id", selectedUser.id_auto)
        .not("archived_at", "is", null)
        .single();

      if (archivedRecord) {
        const { error: reactivateError } = await supabase
          .from("venue_directors")
          .update({ archived_at: null, archived_by: null, assigned_by: profile!.id_auto, assigned_at: new Date().toISOString() })
          .eq("id", archivedRecord.id);
        if (reactivateError) throw reactivateError;
      } else {
        const { error: insertError } = await supabase
          .from("venue_directors")
          .insert({ venue_id: selectedVenue, director_id: selectedUser.id_auto, assigned_by: profile!.id_auto, assigned_at: new Date().toISOString() });
        if (insertError) throw insertError;
      }

      const msg = selectedUser.role === "basic_user"
        ? `${selectedUser.name} has been promoted to Tournament Director and assigned to the venue!`
        : `${selectedUser.name} has been assigned as a director at the venue!`;

      Alert.alert("Success", msg, [{ text: "OK", onPress: () => router.back() }]);
    } catch (error) {
      console.error("Error adding director:", error);
      Alert.alert("Error", "Failed to add director. Please try again.");
    } finally {
      setAdding(false);
    }
  };

  const handleCancel = () => {
    if (selectedUser || selectedVenue) {
      Alert.alert("Discard Changes?", "You have unsaved selections.", [
        { text: "Keep Editing", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: () => router.back() },
      ]);
    } else {
      router.back();
    }
  };

  const handleClearDirector = () => {
    setSelectedUser(null);
    setSelectedVenue(null);
  };

  const renderSearchResult = ({ item }: { item: SearchUser }) => {
    const roleInfo = getRoleLabel(item.role);
    const selectable = canBeDirector(item);
    return (
      <TouchableOpacity
        style={[styles.userCard, !selectable && styles.userCardDisabled]}
        onPress={() => handleSelectDirector(item)}
        activeOpacity={0.7}
      >
        <View style={styles.avatar}>
          <Text allowFontScaling={false} style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.userInfo}>
          <Text allowFontScaling={false} style={styles.userName}>{item.name}</Text>
          <Text allowFontScaling={false} style={styles.userEmail}>{item.email}</Text>
          <Text allowFontScaling={false} style={styles.userUsername}>@{item.user_name} {"\u00B7"} ID: {item.id_auto}</Text>
          <Text allowFontScaling={false} style={[styles.roleLabel, { color: roleInfo.color }]}>{roleInfo.text}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, isWeb && styles.headerWeb]}>
        <TouchableOpacity style={styles.backButton} onPress={handleCancel}>
          <Text allowFontScaling={false} style={styles.backText}>{"\u2190"} Cancel</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text allowFontScaling={false} style={styles.headerTitle}>ADD DIRECTOR</Text>
          <Text allowFontScaling={false} style={styles.headerSubtitle}>Search & Assign</Text>
        </View>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.section}>
          <Text allowFontScaling={false} style={styles.stepLabel}>STEP 1</Text>
          <Text allowFontScaling={false} style={styles.sectionTitle}>Select Director</Text>

          {selectedUser ? (
            <View style={styles.selectedCard}>
              <View style={styles.selectedInfo}>
                <View style={styles.avatar}>
                  <Text allowFontScaling={false} style={styles.avatarText}>{selectedUser.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.selectedDetails}>
                  <Text allowFontScaling={false} style={styles.selectedName}>{selectedUser.name}</Text>
                  <Text allowFontScaling={false} style={styles.selectedEmail}>{selectedUser.email}</Text>
                  <Text allowFontScaling={false} style={styles.selectedUsername}>@{selectedUser.user_name} {"\u00B7"} ID: {selectedUser.id_auto}</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.changeButton} onPress={handleClearDirector}>
                <Text allowFontScaling={false} style={styles.changeButtonText}>Change</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <TextInput
                style={styles.searchInput}
                placeholder="Start typing a name or email..."
                placeholderTextColor={COLORS.textSecondary}
                value={searchQuery}
                onChangeText={handleSearchChange}
                autoCorrect={false}
                autoCapitalize="none"
                autoComplete="off"
                spellCheck={false}
                textContentType="none"
                importantForAutofill="no"
              />
              {searching && <Text allowFontScaling={false} style={styles.searchingText}>Searching...</Text>}

              {searchResults.length > 0 && (
                <View style={styles.resultsContainer}>
                  <Text allowFontScaling={false} style={styles.resultsCount}>
                    {searchResults.length} result{searchResults.length !== 1 ? "s" : ""} found
                  </Text>
                  <ScrollView style={styles.resultsList} showsVerticalScrollIndicator nestedScrollEnabled keyboardShouldPersistTaps="handled">
                    {searchResults.map((item) => (
                      <View key={item.id_auto}>{renderSearchResult({ item })}</View>
                    ))}
                  </ScrollView>
                </View>
              )}

              {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
                <Text allowFontScaling={false} style={styles.noResultsText}>No users found matching {'"'}{searchQuery}{'"'}</Text>
              )}
            </>
          )}
        </View>

        {selectedUser && (
          <View style={styles.section}>
            <Text allowFontScaling={false} style={styles.stepLabel}>STEP 2</Text>
            <Text allowFontScaling={false} style={styles.sectionTitle}>Select Venue</Text>

            {venues.length === 0 ? (
              <Text allowFontScaling={false} style={styles.noVenuesText}>No venues found. Make sure you have venues assigned to your account.</Text>
            ) : (
              <View style={styles.venueList}>
                {venues.map((venue) => {
                  const isSelected = selectedVenue === venue.id;
                  return (
                    <TouchableOpacity
                      key={venue.id}
                      style={[styles.venueCard, isSelected && styles.venueCardSelected]}
                      onPress={() => setSelectedVenue(venue.id)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.venueInfo}>
                        <Text allowFontScaling={false} style={[styles.venueName, isSelected && styles.venueNameSelected]}>{venue.venue}</Text>
                        <Text allowFontScaling={false} style={styles.venueLocation}>{venue.city}, {venue.state}</Text>
                      </View>
                      <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                        {isSelected && <Text allowFontScaling={false} style={styles.checkboxText}>{"\u2713"}</Text>}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {selectedUser && selectedUser.role === "basic_user" && selectedVenue && (
          <View style={styles.section}>
            <View style={styles.roleWarningBox}>
              <Text allowFontScaling={false} style={styles.roleWarningTitle}>{"\u26A0\uFE0F"} Role Change</Text>
              <Text allowFontScaling={false} style={styles.roleWarningText}>
                {selectedUser.name} will be promoted to Tournament Director. This changes their account role.
              </Text>
            </View>
          </View>
        )}

        {selectedUser && (
          <View style={styles.actionSection}>
            <TouchableOpacity
              style={[styles.saveButton, (!selectedVenue || adding) && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={!selectedVenue || adding}
            >
              <Text allowFontScaling={false} style={styles.saveButtonText}>
                {adding ? "Saving..." : selectedUser.role === "basic_user" ? "Promote & Add Director" : "Add Director"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelActionButton} onPress={handleCancel} disabled={adding}>
              <Text allowFontScaling={false} style={styles.cancelActionText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        {!selectedUser && (
          <View style={styles.section}>
            <Text allowFontScaling={false} style={styles.instructionsTitle}>How it works:</Text>
            <Text allowFontScaling={false} style={styles.instructionsText}>
              {"1. Start typing a name or email to find users\n2. Tap a user to select them as director\n3. Choose which venue to assign them to\n4. Basic users will be promoted to Tournament Director\n5. Tap Save to confirm the assignment"}
            </Text>
          </View>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContentWeb: { alignItems: "center", paddingBottom: scale(SPACING.xl) },
  container: {
    ...Platform.select({ web: { maxWidth: 860, width: "100%" as any, alignSelf: "center" as any } }),
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: scale(SPACING.md),
    paddingTop: scale(SPACING.xl + SPACING.sm),
    paddingBottom: scale(SPACING.md),
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerWeb: { paddingTop: scale(SPACING.lg) },
  backButton: { padding: scale(SPACING.xs) },
  backText: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.primary, fontWeight: "500" },
  headerCenter: { alignItems: "center", flex: 1 },
  headerTitle: { fontSize: moderateScale(FONT_SIZES.lg), fontWeight: "600", color: COLORS.text, letterSpacing: 0.5 },
  headerSubtitle: { fontSize: moderateScale(FONT_SIZES.xs), color: COLORS.textSecondary, marginTop: scale(2) },
  placeholder: { width: scale(50) },
  scrollView: { flex: 1 },
  section: { padding: scale(SPACING.md), borderBottomWidth: 1, borderBottomColor: COLORS.border },
  stepLabel: { fontSize: moderateScale(FONT_SIZES.xs), fontWeight: "700", color: COLORS.primary, letterSpacing: 1, marginBottom: scale(4) },
  sectionTitle: { fontSize: moderateScale(FONT_SIZES.md), fontWeight: "700", color: COLORS.text, marginBottom: scale(SPACING.md) },
  searchInput: {
    backgroundColor: COLORS.surface,
    borderRadius: scale(8),
    paddingHorizontal: scale(SPACING.md),
    paddingVertical: scale(SPACING.sm),
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchingText: { fontSize: moderateScale(FONT_SIZES.xs), color: COLORS.textSecondary, marginTop: scale(SPACING.xs), fontStyle: "italic" },
  resultsContainer: { marginTop: scale(SPACING.sm) },
  resultsCount: { fontSize: moderateScale(FONT_SIZES.xs), color: COLORS.textSecondary, marginBottom: scale(SPACING.sm) },
  resultsList: { maxHeight: scale(400) },
  noResultsText: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textSecondary, marginTop: scale(SPACING.md), textAlign: "center", fontStyle: "italic" },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderRadius: scale(12),
    padding: scale(SPACING.md),
    marginBottom: scale(SPACING.sm),
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  userCardDisabled: { opacity: 0.5 },
  avatar: { width: scale(40), height: scale(40), borderRadius: scale(20), backgroundColor: COLORS.primary, justifyContent: "center", alignItems: "center", marginRight: scale(SPACING.md) },
  avatarText: { fontSize: moderateScale(FONT_SIZES.md), fontWeight: "700", color: COLORS.surface },
  userInfo: { flex: 1 },
  userName: { fontSize: moderateScale(FONT_SIZES.md), fontWeight: "600", color: COLORS.text },
  userEmail: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textSecondary, marginTop: scale(2) },
  userUsername: { fontSize: moderateScale(FONT_SIZES.xs), color: COLORS.textSecondary, marginTop: scale(2), fontStyle: "italic" },
  roleLabel: { fontSize: moderateScale(FONT_SIZES.xs), fontWeight: "600", marginTop: scale(2) },
  selectedCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.primary + "15",
    borderRadius: scale(12),
    padding: scale(SPACING.md),
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  selectedInfo: { flexDirection: "row", alignItems: "center", flex: 1 },
  selectedDetails: { flex: 1 },
  selectedName: { fontSize: moderateScale(FONT_SIZES.md), fontWeight: "700", color: COLORS.text },
  selectedEmail: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textSecondary, marginTop: scale(2) },
  selectedUsername: { fontSize: moderateScale(FONT_SIZES.xs), color: COLORS.textSecondary, marginTop: scale(2), fontStyle: "italic" },
  changeButton: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: scale(SPACING.md),
    paddingVertical: scale(SPACING.sm),
    borderRadius: scale(8),
    borderWidth: 1,
    borderColor: COLORS.border,
    marginLeft: scale(SPACING.sm),
  },
  changeButtonText: { fontSize: moderateScale(FONT_SIZES.xs), fontWeight: "600", color: COLORS.text },
  venueList: { gap: scale(SPACING.sm) },
  venueCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.surface,
    borderRadius: scale(10),
    padding: scale(SPACING.md),
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  venueCardSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + "15" },
  venueInfo: { flex: 1 },
  venueName: { fontSize: moderateScale(FONT_SIZES.md), fontWeight: "600", color: COLORS.text },
  venueNameSelected: { color: COLORS.primary },
  venueLocation: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textSecondary, marginTop: scale(2) },
  checkbox: { width: scale(24), height: scale(24), borderRadius: scale(12), borderWidth: 2, borderColor: COLORS.border, justifyContent: "center", alignItems: "center", marginLeft: scale(SPACING.md) },
  checkboxSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.primary },
  checkboxText: { color: "#ffffff", fontSize: moderateScale(14), fontWeight: "700" },
  noVenuesText: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textSecondary, textAlign: "center", padding: scale(SPACING.lg), fontStyle: "italic" },
  roleWarningBox: { backgroundColor: "#fef3c7", borderRadius: scale(8), padding: scale(SPACING.md), borderLeftWidth: 3, borderLeftColor: "#f59e0b" },
  roleWarningTitle: { fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "700", color: "#92400e", marginBottom: scale(4) },
  roleWarningText: { fontSize: moderateScale(FONT_SIZES.xs), color: "#92400e", lineHeight: moderateScale(18) },
  actionSection: { padding: scale(SPACING.md), gap: scale(SPACING.sm) },
  saveButton: { backgroundColor: COLORS.primary, borderRadius: scale(8), paddingVertical: scale(SPACING.md), alignItems: "center" },
  saveButtonDisabled: { opacity: 0.4 },
  saveButtonText: { color: "#ffffff", fontSize: moderateScale(FONT_SIZES.md), fontWeight: "700" },
  cancelActionButton: { borderRadius: scale(8), paddingVertical: scale(SPACING.md), alignItems: "center", borderWidth: 1, borderColor: COLORS.border },
  cancelActionText: { color: COLORS.textSecondary, fontSize: moderateScale(FONT_SIZES.md), fontWeight: "600" },
  instructionsTitle: { fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "700", color: COLORS.text, marginBottom: scale(SPACING.xs) },
  instructionsText: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textSecondary, lineHeight: moderateScale(20) },
  bottomSpacer: { height: scale(SPACING.xl * 2) },
});
