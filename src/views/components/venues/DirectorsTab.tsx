import { useCallback, useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../../theme/colors";
import { SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { Director } from "../../../viewmodels/useEditVenue";

// Roles that CANNOT be added as directors
const PROTECTED_ROLES = ["super_admin", "compete_admin", "bar_owner"];

interface DirectorsTabProps {
  directors: Director[];
  searchQuery: string;
  searchResults: any[];
  searching: boolean;
  onSearch: (query: string) => void;
  onAddDirector: (id: number) => void;
  onRemoveDirector: (id: number) => void;
}

const getRoleLabel = (role: string): { text: string; color: string } => {
  if (PROTECTED_ROLES.includes(role)) {
    return {
      text: "Unavailable — Has elevated account role",
      color: "#ef4444",
    };
  }
  if (role === "tournament_director") {
    return { text: "Already a Tournament Director", color: "#22c55e" };
  }
  if (role === "basic_user") {
    return {
      text: "Will be promoted to Tournament Director",
      color: "#f59e0b",
    };
  }
  return { text: "Unavailable", color: COLORS.textSecondary };
};

const canBeDirector = (role: string): boolean => {
  return role === "basic_user" || role === "tournament_director";
};

export const DirectorsTab = ({
  directors,
  searchQuery,
  searchResults,
  searching,
  onSearch,
  onAddDirector,
  onRemoveDirector,
}: DirectorsTabProps) => {
  // Debounced search
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback(
    (text: string) => {
      // Clear previous debounce
      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (text.length < 2) {
        onSearch(text);
        return;
      }

      // Update input immediately but debounce the actual search
      onSearch(text);
    },
    [onSearch],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleAddPress = (result: any) => {
    if (!canBeDirector(result.role)) {
      Alert.alert(
        "Cannot Add",
        `${result.name} has an elevated account role and cannot be added as a venue director.`,
      );
      return;
    }
    onAddDirector(result.id_auto);
  };

  return (
    <View style={styles.container}>
      {/* Search to Add */}
      <View style={styles.searchSection}>
        <Text style={styles.sectionTitle}>Add Director</Text>
        <TextInput
          style={styles.input}
          value={searchQuery}
          onChangeText={handleSearchChange}
          placeholder="Start typing a name or email..."
          placeholderTextColor={COLORS.textSecondary}
          autoCorrect={false}
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          textContentType="none"
          importantForAutofill="no"
        />

        {searching && (
          <ActivityIndicator
            color={COLORS.primary}
            style={{ marginTop: SPACING.sm }}
          />
        )}

        {searchResults.length > 0 && (
          <View style={styles.searchResults}>
            <Text style={styles.resultsCount}>
              {searchResults.length} result
              {searchResults.length !== 1 ? "s" : ""}
            </Text>
            {searchResults.map((result) => {
              const roleInfo = getRoleLabel(result.role);
              const selectable = canBeDirector(result.role);

              return (
                <TouchableOpacity
                  key={result.id_auto}
                  style={[
                    styles.searchResult,
                    !selectable && styles.searchResultDisabled,
                  ]}
                  onPress={() => handleAddPress(result)}
                  activeOpacity={0.7}
                >
                  <View style={styles.resultInfo}>
                    <Text style={styles.resultName}>{result.name}</Text>
                    <Text style={styles.resultEmail}>{result.email}</Text>
                    <Text style={styles.resultMeta}>
                      @{result.user_name || "—"} · ID: {result.id_auto}
                    </Text>
                    <Text style={[styles.roleLabel, { color: roleInfo.color }]}>
                      {roleInfo.text}
                    </Text>
                  </View>
                  {selectable && <Text style={styles.addText}>+ Add</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {searchQuery.length >= 2 &&
          !searching &&
          searchResults.length === 0 && (
            <Text style={styles.noResultsText}>
              No users found matching {'"'}
              {searchQuery}
              {'"'}
            </Text>
          )}
      </View>

      {/* Current Directors */}
      <Text style={styles.sectionTitle}>
        Assigned Directors ({directors.length})
      </Text>

      {directors.map((director) => (
        <View key={director.id} style={styles.directorCard}>
          <View style={styles.directorAvatar}>
            <Text style={styles.directorAvatarText}>
              {director.profile.name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.directorInfo}>
            <Text style={styles.directorName}>{director.profile.name}</Text>
            <Text style={styles.directorEmail}>{director.profile.email}</Text>
            <Text style={styles.directorId}>
              ID: {director.profile.id_auto}
            </Text>
          </View>
          <TouchableOpacity onPress={() => onRemoveDirector(director.id)}>
            <Text style={styles.removeText}>Remove</Text>
          </TouchableOpacity>
        </View>
      ))}

      {directors.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No directors assigned</Text>
          <Text style={styles.emptySubtext}>
            Search above to add tournament directors to this venue
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: SPACING.md,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.sm,
    marginTop: SPACING.md,
  },
  searchSection: {
    marginBottom: SPACING.md,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  // ===== SEARCH RESULTS =====
  searchResults: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    marginTop: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
  },
  resultsCount: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    padding: SPACING.sm,
    paddingBottom: 0,
  },
  searchResult: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  searchResultDisabled: {
    opacity: 0.45,
  },
  resultInfo: {
    flex: 1,
  },
  resultName: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.text,
  },
  resultEmail: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  resultMeta: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: 1,
    fontStyle: "italic",
  },
  roleLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: "600",
    marginTop: 2,
  },
  addText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    fontWeight: "600",
    marginLeft: SPACING.sm,
  },
  noResultsText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.md,
    textAlign: "center",
    fontStyle: "italic",
  },

  // ===== DIRECTOR CARDS =====
  directorCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  directorAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
    marginRight: SPACING.md,
  },
  directorAvatarText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "700",
    color: COLORS.surface,
  },
  directorInfo: {
    flex: 1,
  },
  directorName: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.text,
  },
  directorEmail: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  directorId: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  removeText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.error,
    fontWeight: "600",
  },

  // ===== EMPTY STATE =====
  emptyState: {
    alignItems: "center",
    padding: SPACING.xl,
  },
  emptyText: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.text,
  },
  emptySubtext: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginTop: SPACING.xs,
  },
});
