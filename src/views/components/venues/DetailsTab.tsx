import type { ComponentProps } from "react";
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
  // "desktop" (web Venue workspace): grouped fields at sensible widths + a compact
  // right-aligned Save. Same fields / onChange / onSave. Default "stacked" = unchanged.
  layout?: "stacked" | "desktop";
}

export const DetailsTab = (props: DetailsTabProps) =>
  props.layout === "desktop" ? <DesktopDetails {...props} /> : <StackedDetails {...props} />;

const DesktopDetails = ({ venue, onChange, onSave, saving }: DetailsTabProps) => {
  const field = (
    label: string,
    value: string,
    set: (v: string) => void,
    extra?: Partial<ComponentProps<typeof TextInput>>,
  ) => (
    <View style={d.group}>
      <Text style={d.label}>{label}</Text>
      <TextInput
        style={d.input}
        value={value}
        onChangeText={set}
        placeholderTextColor={COLORS.textMuted}
        {...extra}
      />
    </View>
  );
  return (
    <View style={d.container}>
      <View style={d.form}>
        {field("Venue Name", venue.venue, (v) => onChange({ ...venue, venue: v }), { placeholder: "Venue name" })}
        {field("Address", venue.address, (v) => onChange({ ...venue, address: v }), { placeholder: "Street address" })}
        <View style={d.row}>
          <View style={d.city}>
            {field("City", venue.city, (v) => onChange({ ...venue, city: v }), { placeholder: "City" })}
          </View>
          <View style={d.state}>
            {field("State", venue.state, (v) => onChange({ ...venue, state: v }), { placeholder: "ST", maxLength: 2, autoCapitalize: "characters" })}
          </View>
          <View style={d.zip}>
            {field("ZIP Code", venue.zip_code, (v) => onChange({ ...venue, zip_code: v }), { placeholder: "12345", keyboardType: "numeric", maxLength: 10 })}
          </View>
        </View>
        <View style={d.phone}>
          {field("Phone", venue.phone || "", (v) => onChange({ ...venue, phone: v }), { placeholder: "(555) 555-5555", keyboardType: "phone-pad" })}
        </View>
      </View>
      <View style={d.footer}>
        <TouchableOpacity style={[d.save, saving && styles.saveButtonDisabled]} onPress={onSave} disabled={saving} activeOpacity={0.85}>
          <Text style={d.saveText}>{saving ? "Saving..." : "Save Changes"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const StackedDetails = ({
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

const d = StyleSheet.create({
  container: { paddingHorizontal: SPACING.sm, paddingTop: SPACING.sm },
  form: { maxWidth: 680 },
  group: { marginBottom: SPACING.md },
  label: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary, marginBottom: 5, fontWeight: "600" },
  input: {
    backgroundColor: COLORS.background,
    borderRadius: 8,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  row: { flexDirection: "row", gap: SPACING.sm },
  city: { flex: 1 },
  state: { width: 90 },
  zip: { width: 140 },
  phone: { width: 260 },
  footer: { flexDirection: "row", justifyContent: "flex-end", borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: SPACING.md, marginTop: SPACING.xs },
  save: { backgroundColor: COLORS.primary, borderRadius: 8, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.lg, alignItems: "center" },
  saveText: { color: COLORS.white, fontSize: FONT_SIZES.sm, fontWeight: "700" },
});

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
