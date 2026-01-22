import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../../theme/colors";
import { SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { VenueDetails } from "../../../viewmodels/useEditVenue";

interface DetailsTabProps {
  venue: VenueDetails;
  onChange: (venue: VenueDetails) => void;
  onSave: () => void;
  saving: boolean;
}

export const DetailsTab = ({
  venue,
  onChange,
  onSave,
  saving,
}: DetailsTabProps) => (
  <View style={styles.container}>
    <View style={styles.formGroup}>
      <Text style={styles.label}>Venue Name</Text>
      <TextInput
        style={styles.input}
        value={venue.venue}
        onChangeText={(text) => onChange({ ...venue, venue: text })}
        placeholder="Venue name"
        placeholderTextColor={COLORS.textSecondary}
      />
    </View>

    <View style={styles.formGroup}>
      <Text style={styles.label}>Address</Text>
      <TextInput
        style={styles.input}
        value={venue.address}
        onChangeText={(text) => onChange({ ...venue, address: text })}
        placeholder="Street address"
        placeholderTextColor={COLORS.textSecondary}
      />
    </View>

    <View style={styles.row}>
      <View style={[styles.formGroup, { flex: 2 }]}>
        <Text style={styles.label}>City</Text>
        <TextInput
          style={styles.input}
          value={venue.city}
          onChangeText={(text) => onChange({ ...venue, city: text })}
          placeholder="City"
          placeholderTextColor={COLORS.textSecondary}
        />
      </View>
      <View style={[styles.formGroup, { flex: 1, marginLeft: SPACING.sm }]}>
        <Text style={styles.label}>State</Text>
        <TextInput
          style={styles.input}
          value={venue.state}
          onChangeText={(text) => onChange({ ...venue, state: text })}
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
          value={venue.zip_code}
          onChangeText={(text) => onChange({ ...venue, zip_code: text })}
          placeholder="12345"
          placeholderTextColor={COLORS.textSecondary}
          keyboardType="numeric"
          maxLength={10}
        />
      </View>
      <View style={[styles.formGroup, { flex: 1, marginLeft: SPACING.sm }]}>
        <Text style={styles.label}>Phone</Text>
        <TextInput
          style={styles.input}
          value={venue.phone || ""}
          onChangeText={(text) => onChange({ ...venue, phone: text })}
          placeholder="(555) 555-5555"
          placeholderTextColor={COLORS.textSecondary}
          keyboardType="phone-pad"
        />
      </View>
    </View>

    <TouchableOpacity
      style={[styles.saveButton, saving && styles.saveButtonDisabled]}
      onPress={onSave}
      disabled={saving}
    >
      <Text style={styles.saveButtonText}>
        {saving ? "Saving..." : "Save Changes"}
      </Text>
    </TouchableOpacity>
  </View>
);

const styles = StyleSheet.create({
  container: {
    padding: SPACING.md,
  },
  formGroup: {
    marginBottom: SPACING.md,
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
  saveButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: SPACING.md,
    alignItems: "center",
    marginTop: SPACING.md,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: COLORS.surface,
    fontSize: FONT_SIZES.md,
    fontWeight: "700",
  },
});
