import {
  ActivityIndicator,
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

interface DirectorsTabProps {
  directors: Director[];
  searchQuery: string;
  searchResults: any[];
  searching: boolean;
  onSearch: (query: string) => void;
  onAddDirector: (id: number) => void;
  onRemoveDirector: (id: number) => void;
}

export const DirectorsTab = ({
  directors,
  searchQuery,
  searchResults,
  searching,
  onSearch,
  onAddDirector,
  onRemoveDirector,
}: DirectorsTabProps) => (
  <View style={styles.container}>
    {/* Search to Add */}
    <View style={styles.searchSection}>
      <Text style={styles.sectionTitle}>Add Director</Text>
      <TextInput
        style={styles.input}
        value={searchQuery}
        onChangeText={onSearch}
        placeholder="Search by name or email..."
        placeholderTextColor={COLORS.textSecondary}
      />

      {searching && (
        <ActivityIndicator
          color={COLORS.primary}
          style={{ marginTop: SPACING.sm }}
        />
      )}

      {searchResults.length > 0 && (
        <View style={styles.searchResults}>
          {searchResults.map((result) => (
            <TouchableOpacity
              key={result.id_auto}
              style={styles.searchResult}
              onPress={() => onAddDirector(result.id_auto)}
            >
              <View>
                <Text style={styles.resultName}>{result.name}</Text>
                <Text style={styles.resultEmail}>{result.email}</Text>
              </View>
              <Text style={styles.addText}>+ Add</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>

    {/* Current Directors */}
    <Text style={styles.sectionTitle}>
      Assigned Directors ({directors.length})
    </Text>

    {directors.map((director) => (
      <View key={director.id} style={styles.directorCard}>
        <View style={styles.directorInfo}>
          <Text style={styles.directorName}>{director.profile.name}</Text>
          <Text style={styles.directorEmail}>{director.profile.email}</Text>
        </View>
        <TouchableOpacity onPress={() => onRemoveDirector(director.id)}>
          <Text style={styles.removeText}>Remove</Text>
        </TouchableOpacity>
      </View>
    ))}

    {directors.length === 0 && (
      <View style={styles.emptyState}>
        <Text style={styles.emptyIcon}>👤</Text>
        <Text style={styles.emptyText}>No directors assigned</Text>
        <Text style={styles.emptySubtext}>
          Search above to add tournament directors to this venue
        </Text>
      </View>
    )}
  </View>
);

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
  searchResults: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    marginTop: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchResult: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  resultName: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.text,
  },
  resultEmail: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  addText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    fontWeight: "600",
  },
  directorCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
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
  removeText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.error,
    fontWeight: "600",
  },
  emptyState: {
    alignItems: "center",
    padding: SPACING.xl,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: SPACING.sm,
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
