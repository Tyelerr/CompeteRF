import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../../../src/lib/supabase";
import { useAuthContext } from "../../../src/providers/AuthProvider";
import { COLORS } from "../../../src/theme/colors";
import { SPACING } from "../../../src/theme/spacing";
import { FONT_SIZES } from "../../../src/theme/typography";
import { Dropdown } from "../../../src/views/components/common/dropdown";

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
}

export default function AddDirectorScreen() {
  const router = useRouter();
  const { profile } = useAuthContext();

  // State
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [venues, setVenues] = useState<UserVenue[]>([]);
  const [selectedVenue, setSelectedVenue] = useState("");
  const [selectedUser, setSelectedUser] = useState<SearchUser | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    loadVenues();
  }, []);

  const loadVenues = async () => {
    try {
      const { data } = await supabase
        .from("venues")
        .select("id, venue")
        .eq("owner_id", profile!.id_auto)
        .order("venue");

      setVenues(data || []);
    } catch (error) {
      console.error("Error loading venues:", error);
    }
  };

  const searchUsers = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id_auto, name, email, user_name, role")
        .or(
          `email.ilike.%${searchQuery}%,name.ilike.%${searchQuery}%,user_name.ilike.%${searchQuery}%`,
        )
        .neq("id_auto", profile!.id_auto) // Don't show themselves
        .eq("status", "active") // Only show active users
        .limit(20);

      if (error) {
        console.error("Search error:", error);
        throw error;
      }

      console.log("Search results:", data); // Debug log
      setSearchResults(data || []);
    } catch (error) {
      console.error("Error searching users:", error);
      Alert.alert("Error", "Failed to search users");
    } finally {
      setSearching(false);
    }
  };

  const handleAddDirector = async () => {
    if (!selectedUser || !selectedVenue) {
      Alert.alert("Error", "Please select a user and venue");
      return;
    }

    setAdding(true);
    try {
      // Check if already a director at this venue
      const { data: existing } = await supabase
        .from("venue_directors")
        .select("id")
        .eq("venue_id", selectedVenue)
        .eq("director_id", selectedUser.id_auto)
        .is("archived_at", null)
        .single();

      if (existing) {
        Alert.alert("Error", "This user is already a director at this venue");
        setAdding(false);
        return;
      }

      // Add as tournament director
      const { error: insertError } = await supabase
        .from("venue_directors")
        .insert({
          venue_id: parseInt(selectedVenue),
          director_id: selectedUser.id_auto,
          assigned_by: profile!.id_auto,
          assigned_at: new Date().toISOString(),
        });

      if (insertError) throw insertError;

      // Update user role to tournament_director if they're basic_user
      if (selectedUser.role === "basic_user") {
        const { error: roleError } = await supabase
          .from("profiles")
          .update({ role: "tournament_director" })
          .eq("id_auto", selectedUser.id_auto);

        if (roleError) {
          console.warn("Failed to update user role:", roleError);
        }
      }

      Alert.alert(
        "Success",
        `${selectedUser.name} has been added as a tournament director!`,
        [{ text: "OK", onPress: () => router.back() }],
      );
    } catch (error) {
      console.error("Error adding director:", error);
      Alert.alert("Error", "Failed to add director. Please try again.");
    } finally {
      setAdding(false);
    }
  };

  const venueOptions = venues.map((venue) => ({
    label: venue.venue,
    value: venue.id.toString(),
  }));

  // User Card Component
  const UserCard = ({
    user,
    onSelect,
  }: {
    user: SearchUser;
    onSelect: () => void;
  }) => (
    <TouchableOpacity
      style={[
        styles.userCard,
        selectedUser?.id_auto === user.id_auto && styles.userCardSelected,
      ]}
      onPress={onSelect}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {user.name.charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={styles.userInfo}>
        <Text style={styles.userName}>{user.name}</Text>
        <Text style={styles.userEmail}>{user.email}</Text>
        <Text style={styles.userUsername}>@{user.user_name}</Text>
        <Text style={styles.userRole}>Current role: {user.role}</Text>
      </View>
      {selectedUser?.id_auto === user.id_auto && (
        <View style={styles.checkmark}>
          <Text style={styles.checkmarkText}>✓</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backText}>← Cancel</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>ADD DIRECTOR</Text>
          <Text style={styles.headerSubtitle}>Search & Invite</Text>
        </View>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        {/* Search Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Search Users</Text>
          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search by name or email..."
              placeholderTextColor={COLORS.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={searchUsers}
            />
            <TouchableOpacity
              style={styles.searchButton}
              onPress={searchUsers}
              disabled={searching}
            >
              <Text style={styles.searchButtonText}>
                {searching ? "..." : "Search"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Search Results */}
        {searchResults.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Search Results ({searchResults.length})
            </Text>
            <View style={styles.resultsContainer}>
              {searchResults.map((user) => (
                <UserCard
                  key={user.id_auto}
                  user={user}
                  onSelect={() => setSelectedUser(user)}
                />
              ))}
            </View>
          </View>
        )}

        {/* Venue Selection */}
        {selectedUser && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Assign to Venue</Text>
            <Dropdown
              options={venueOptions}
              value={selectedVenue}
              onSelect={setSelectedVenue}
              placeholder="Select a venue"
            />
          </View>
        )}

        {/* Selected User & Action */}
        {selectedUser && selectedVenue && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Confirm Assignment</Text>
            <View style={styles.confirmationCard}>
              <Text style={styles.confirmText}>
                Add{" "}
                <Text style={styles.highlight}>@{selectedUser.user_name}</Text>{" "}
                as Tournament Director at{" "}
                <Text style={styles.highlight}>
                  {venues.find((v) => v.id.toString() === selectedVenue)?.venue}
                </Text>
                ?
              </Text>

              <TouchableOpacity
                style={[styles.addButton, adding && styles.addButtonDisabled]}
                onPress={handleAddDirector}
                disabled={adding}
              >
                <Text style={styles.addButtonText}>
                  {adding ? "Adding..." : "Add Director"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Instructions */}
        <View style={styles.section}>
          <Text style={styles.instructionsTitle}>How it works:</Text>
          <Text style={styles.instructionsText}>
            1. Search for users by name or email{"\n"}
            2. Select a user from the results{"\n"}
            3. Choose which venue to assign them to{"\n"}
            4. They'll become a Tournament Director at your venue
          </Text>
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.xl + SPACING.sm,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    padding: SPACING.xs,
  },
  backText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    fontWeight: "500",
  },
  headerCenter: {
    alignItems: "center",
    flex: 1,
  },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "600",
    color: COLORS.text,
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  placeholder: {
    width: 50,
  },
  scrollView: {
    flex: 1,
  },
  section: {
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  searchRow: {
    flexDirection: "row",
    gap: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    justifyContent: "center",
  },
  searchButtonText: {
    color: COLORS.surface,
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
  },
  resultsContainer: {
    gap: SPACING.sm,
  },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  userCardSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + "10",
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
    marginRight: SPACING.md,
  },
  avatarText: {
    fontSize: FONT_SIZES.md,
    fontWeight: "700",
    color: COLORS.surface,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.text,
  },
  userEmail: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  userUsername: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
    fontStyle: "italic",
  },
  userRole: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
    textTransform: "capitalize",
  },
  checkmark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  checkmarkText: {
    color: COLORS.surface,
    fontSize: FONT_SIZES.sm,
    fontWeight: "700",
  },
  confirmationCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  confirmText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    lineHeight: 20,
    marginBottom: SPACING.md,
    textAlign: "center",
  },
  highlight: {
    fontWeight: "700",
    color: COLORS.primary,
  },
  addButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: SPACING.md,
    alignItems: "center",
  },
  addButtonDisabled: {
    backgroundColor: COLORS.textSecondary,
  },
  addButtonText: {
    color: COLORS.surface,
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
  },
  instructionsTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  instructionsText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  bottomSpacer: {
    height: SPACING.xl,
  },
});
