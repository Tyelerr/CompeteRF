import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../src/theme/colors";
import { SPACING } from "../../src/theme/spacing";
import { FONT_SIZES } from "../../src/theme/typography";
import { useCreateVenue } from "../../src/viewmodels/useCreateVenue";
import { Dropdown } from "../../src/views/components/common/dropdown";

export default function CreateVenueScreen() {
  const router = useRouter();
  const vm = useCreateVenue();

  const handleCreate = async () => {
    const success = await vm.createVenue();
    if (success) {
      router.back();
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add Venue</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
      >
        {/* Google Places Search */}
        {!vm.venueSelected && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Search for venue</Text>
            <TextInput
              style={styles.input}
              value={vm.searchQuery}
              onChangeText={vm.searchPlaces}
              placeholder="Type venue name..."
              placeholderTextColor={COLORS.textSecondary}
            />

            {vm.searching && (
              <ActivityIndicator
                color={COLORS.primary}
                style={{ marginTop: SPACING.sm }}
              />
            )}

            {vm.predictions.length > 0 && (
              <View style={styles.predictions}>
                {vm.predictions.map((prediction) => (
                  <TouchableOpacity
                    key={prediction.place_id}
                    style={styles.prediction}
                    onPress={() => vm.selectPlace(prediction.place_id)}
                  >
                    <Text style={styles.predictionMain}>
                      {prediction.structured_formatting.main_text}
                    </Text>
                    <Text style={styles.predictionSecondary}>
                      {prediction.structured_formatting.secondary_text}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity
              style={styles.manualButton}
              onPress={() => vm.clearSelection() || vm.selectPlace("")}
            >
              <Text style={styles.manualButtonText}>
                Enter address manually
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Venue Form (after selection or manual) */}
        {vm.venueSelected && (
          <>
            {/* Selected Venue Banner */}
            <View style={styles.selectedBanner}>
              <View style={styles.selectedInfo}>
                <Text style={styles.selectedName}>
                  {vm.form.venue || "New Venue"}
                </Text>
                {vm.form.address && (
                  <Text style={styles.selectedAddress}>
                    {vm.form.address}, {vm.form.city}, {vm.form.state}{" "}
                    {vm.form.zip_code}
                  </Text>
                )}
              </View>
              <TouchableOpacity onPress={vm.clearSelection}>
                <Text style={styles.changeText}>Change</Text>
              </TouchableOpacity>
            </View>

            {/* Editable Fields */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Venue Details</Text>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Venue Name</Text>
                <TextInput
                  style={styles.input}
                  value={vm.form.venue}
                  onChangeText={(text) => vm.updateForm("venue", text)}
                  placeholder="Venue name"
                  placeholderTextColor={COLORS.textSecondary}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Address</Text>
                <TextInput
                  style={styles.input}
                  value={vm.form.address}
                  onChangeText={(text) => vm.updateForm("address", text)}
                  placeholder="Street address"
                  placeholderTextColor={COLORS.textSecondary}
                />
              </View>

              <View style={styles.row}>
                <View style={[styles.formGroup, { flex: 2 }]}>
                  <Text style={styles.label}>City</Text>
                  <TextInput
                    style={styles.input}
                    value={vm.form.city}
                    onChangeText={(text) => vm.updateForm("city", text)}
                    placeholder="City"
                    placeholderTextColor={COLORS.textSecondary}
                  />
                </View>
                <View
                  style={[
                    styles.formGroup,
                    { flex: 1, marginLeft: SPACING.sm },
                  ]}
                >
                  <Text style={styles.label}>State</Text>
                  <TextInput
                    style={styles.input}
                    value={vm.form.state}
                    onChangeText={(text) => vm.updateForm("state", text)}
                    placeholder="ST"
                    placeholderTextColor={COLORS.textSecondary}
                    maxLength={2}
                    autoCapitalize="characters"
                  />
                </View>
              </View>

              <View style={styles.row}>
                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={styles.label}>ZIP Code</Text>
                  <TextInput
                    style={styles.input}
                    value={vm.form.zip_code}
                    onChangeText={(text) => vm.updateForm("zip_code", text)}
                    placeholder="12345"
                    placeholderTextColor={COLORS.textSecondary}
                    keyboardType="numeric"
                    maxLength={10}
                  />
                </View>
                <View
                  style={[
                    styles.formGroup,
                    { flex: 1, marginLeft: SPACING.sm },
                  ]}
                >
                  <Text style={styles.label}>Phone</Text>
                  <TextInput
                    style={styles.input}
                    value={vm.form.phone}
                    onChangeText={(text) => vm.updateForm("phone", text)}
                    placeholder="(555) 555-5555"
                    placeholderTextColor={COLORS.textSecondary}
                    keyboardType="phone-pad"
                  />
                </View>
              </View>
            </View>

            {/* Tables Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Tables</Text>

              {/* Add Table Form */}
              <View style={styles.addTableCard}>
                <View style={styles.row}>
                  <View style={[styles.formGroup, { flex: 1, marginTop: 0 }]}>
                    <Text style={styles.label}>Size</Text>
                    <Dropdown
                      options={vm.tableSizeOptions}
                      value={vm.newTable.table_size}
                      onSelect={(value) =>
                        vm.updateNewTable("table_size", value)
                      }
                      placeholder="Size"
                    />
                  </View>
                  <View
                    style={[
                      styles.formGroup,
                      { flex: 1, marginLeft: SPACING.sm, marginTop: 0 },
                    ]}
                  >
                    <Text style={styles.label}>Brand</Text>
                    <Dropdown
                      options={vm.brandOptions}
                      value={vm.newTable.brand}
                      onSelect={(value) => vm.updateNewTable("brand", value)}
                      placeholder="Brand"
                    />
                  </View>
                </View>

                <View style={styles.tableBottomRow}>
                  <View style={styles.quantitySection}>
                    <Text style={styles.label}>Qty</Text>
                    <View style={styles.stepper}>
                      <TouchableOpacity
                        style={styles.stepperButton}
                        onPress={() =>
                          vm.updateNewTable(
                            "quantity",
                            Math.max(1, vm.newTable.quantity - 1),
                          )
                        }
                      >
                        <Text style={styles.stepperText}>−</Text>
                      </TouchableOpacity>
                      <Text style={styles.quantityText}>
                        {vm.newTable.quantity}
                      </Text>
                      <TouchableOpacity
                        style={styles.stepperButton}
                        onPress={() =>
                          vm.updateNewTable(
                            "quantity",
                            vm.newTable.quantity + 1,
                          )
                        }
                      >
                        <Text style={styles.stepperText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.addTableButton}
                    onPress={vm.addTable}
                  >
                    <Text style={styles.addTableButtonText}>+ Add Table</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Added Tables */}
              {vm.tables.map((table, index) => (
                <View key={index} style={styles.tableItem}>
                  <View style={styles.tableInfo}>
                    <Text style={styles.tableText}>
                      {table.quantity}x {table.table_size} {table.brand}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => vm.removeTable(index)}>
                    <Text style={styles.removeText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              ))}

              {vm.tables.length === 0 && (
                <Text style={styles.emptyText}>No tables added yet</Text>
              )}
            </View>

            {/* Directors Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Directors</Text>

              <TextInput
                style={styles.input}
                value={vm.directorSearchQuery}
                onChangeText={vm.searchDirectors}
                placeholder="Search by name or email..."
                placeholderTextColor={COLORS.textSecondary}
              />

              {vm.searchingDirectors && (
                <ActivityIndicator
                  color={COLORS.primary}
                  style={{ marginTop: SPACING.sm }}
                />
              )}

              {vm.directorSearchResults.length > 0 && (
                <View style={styles.searchResults}>
                  {vm.directorSearchResults.map((result) => (
                    <TouchableOpacity
                      key={result.id_auto}
                      style={styles.searchResult}
                      onPress={() => vm.confirmAddDirector(result)}
                    >
                      <View>
                        <Text style={styles.resultName}>{result.name}</Text>
                        <Text style={styles.resultEmail}>{result.email}</Text>
                        {result.role === "basic_user" && (
                          <Text style={styles.roleWarning}>
                            Will be upgraded to TD
                          </Text>
                        )}
                      </View>
                      <Text style={styles.addText}>+ Add</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Added Directors */}
              {vm.directors.map((director) => (
                <View key={director.id_auto} style={styles.directorItem}>
                  <View style={styles.directorInfo}>
                    <Text style={styles.directorName}>{director.name}</Text>
                    <Text style={styles.directorEmail}>{director.email}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => vm.removeDirector(director.id_auto)}
                  >
                    <Text style={styles.removeText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              ))}

              {vm.directors.length === 0 && (
                <Text style={styles.emptyText}>No directors added yet</Text>
              )}
            </View>

            {/* Create Button */}
            <TouchableOpacity
              style={[
                styles.createButton,
                vm.loading && styles.createButtonDisabled,
              ]}
              onPress={handleCreate}
              disabled={vm.loading}
            >
              {vm.loading ? (
                <ActivityIndicator color={COLORS.surface} />
              ) : (
                <Text style={styles.createButtonText}>Create Venue</Text>
              )}
            </TouchableOpacity>
          </>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </KeyboardAvoidingView>
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
    paddingTop: SPACING.xl + SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    padding: SPACING.xs,
  },
  backText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.primary,
    fontWeight: "600",
  },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "700",
    color: COLORS.text,
  },
  placeholder: {
    width: 50,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: SPACING.md,
  },
  section: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  formGroup: {
    marginTop: SPACING.md,
  },
  label: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: 6,
    fontWeight: "600",
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
  row: {
    flexDirection: "row",
  },
  predictions: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    marginTop: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  prediction: {
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  predictionMain: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.text,
  },
  predictionSecondary: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: SPACING.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  dividerText: {
    marginHorizontal: SPACING.md,
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  manualButton: {
    alignItems: "center",
    padding: SPACING.md,
  },
  manualButtonText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.primary,
    fontWeight: "600",
  },
  selectedBanner: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  selectedInfo: {
    flex: 1,
  },
  selectedName: {
    fontSize: FONT_SIZES.md,
    fontWeight: "700",
    color: COLORS.text,
  },
  selectedAddress: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  changeText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    fontWeight: "600",
  },
  addTableCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tableBottomRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: SPACING.md,
  },
  quantitySection: {},
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  stepperButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  stepperText: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.primary,
    fontWeight: "600",
  },
  quantityText: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.text,
    paddingHorizontal: SPACING.sm,
    minWidth: 30,
    textAlign: "center",
  },
  addTableButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
  },
  addTableButtonText: {
    color: COLORS.surface,
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
  },
  tableItem: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    padding: SPACING.md,
    marginTop: SPACING.sm,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tableInfo: {
    flex: 1,
  },
  tableText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
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
  roleWarning: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.warning,
    marginTop: 2,
  },
  addText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    fontWeight: "600",
  },
  directorItem: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    padding: SPACING.md,
    marginTop: SPACING.sm,
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
  emptyText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    fontStyle: "italic",
    marginTop: SPACING.sm,
  },
  createButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: SPACING.md,
    alignItems: "center",
    marginTop: SPACING.lg,
  },
  createButtonDisabled: {
    opacity: 0.6,
  },
  createButtonText: {
    color: COLORS.surface,
    fontSize: FONT_SIZES.md,
    fontWeight: "700",
  },
  bottomSpacer: {
    height: SPACING.xl * 2,
  },
});
