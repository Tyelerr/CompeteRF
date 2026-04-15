// src/views/components/venues/VenueAuditModal.tsx

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Keyboard,
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
import { TABLE_BRANDS, TABLE_SIZES } from "../../../utils/constants";
import { moderateScale, scale } from "../../../utils/scaling";
import { VenueAuditData, VenueTableEntry } from "../../../viewmodels/useVenueAudit";
import { Dropdown } from "../common/dropdown";
import { ConfettiBurst, ConfettiBurstRef } from "../common/ConfettiBurst";

const isWeb = Platform.OS === "web";
const wxMs = (v: number) => (isWeb ? v : moderateScale(v));
const wxSc = (v: number) => (isWeb ? v : scale(v));

const EMPTY_NEW_TABLE = {
  table_size: "9ft",
  brand: "Diamond",
  custom_brand: "",
  quantity: 0,
  custom_size: "",
};

type NewTableForm = typeof EMPTY_NEW_TABLE;

interface Props {
  visible: boolean;
  venues: VenueAuditData[];
  onSubmit: (data: VenueAuditData[]) => Promise<boolean>;
  onDismiss: () => void;
  onComplete?: () => void;
}

export const VenueAuditModal = ({ visible, venues, onSubmit, onDismiss, onComplete }: Props) => {
  const [step, setStep] = useState(0);
  const [localData, setLocalData] = useState<VenueAuditData[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [newTables, setNewTables] = useState<Record<number, NewTableForm>>({});
  const confettiRef = useRef<ConfettiBurstRef>(null);
  const scrollRef = useRef<any>(null);
  const addTableCardY = useRef<number>(0);
  const wasVisible = useRef(false);
  const venueCount = useRef(venues.length);
  const initialData = useRef<VenueAuditData[]>([]);

  const isWelcome = step === 0;
  const isComplete = step === venueCount.current + 1;
  const isVenueStep = !isWelcome && !isComplete;
  const venueIndex = step - 1;
  const isLastVenueStep = step === venueCount.current;
  const hasChanges = JSON.stringify(localData) !== JSON.stringify(initialData.current);
  const currentVenue = isVenueStep ? localData[venueIndex] : null;
  const currentNewTable: NewTableForm = newTables[venueIndex] ?? { ...EMPTY_NEW_TABLE };

  useEffect(() => {
    if (visible && !wasVisible.current) {
      venueCount.current = venues.length;
      const fresh = venues.map((v) => ({ ...v, tables: (v.tables ?? []).map((t) => ({ ...t })) }));
      initialData.current = JSON.parse(JSON.stringify(fresh));
      setLocalData(fresh);
      setNewTables({});
      setStep(0);
      setSubmitting(false);
    }
    wasVisible.current = visible;
  }, [visible]);

  const updateVenue = useCallback((idx: number, updates: Partial<VenueAuditData>) => {
    setLocalData((prev) => prev.map((v, i) => (i === idx ? { ...v, ...updates } : v)));
  }, []);

  const updateNewTable = useCallback((idx: number, updates: Partial<NewTableForm>) => {
    setNewTables((prev) => ({ ...prev, [idx]: { ...(prev[idx] ?? { ...EMPTY_NEW_TABLE }), ...updates } }));
  }, []);

  const addTable = useCallback((idx: number) => {
    const nt = newTables[idx] ?? { ...EMPTY_NEW_TABLE };
    if (!nt.table_size) { Alert.alert("Required", "Please select a table size."); return; }
    if (nt.table_size === "custom" && !nt.custom_size.trim()) { Alert.alert("Required", "Please enter a custom size."); return; }
    if (!nt.quantity || nt.quantity < 1) { Alert.alert("Required", "Please enter a quantity of at least 1."); return; }
    const resolvedBrand = nt.brand === "Other" ? nt.custom_brand.trim() || "Other" : nt.brand;
    if (nt.brand === "Other" && !nt.custom_brand.trim()) { Alert.alert("Required", "Please enter the brand name."); return; }
    const entry: VenueTableEntry = {
      id: 0,
      table_size: nt.table_size,
      brand: resolvedBrand,
      quantity: nt.quantity,
      custom_size: nt.table_size === "custom" ? nt.custom_size : "",
    };
    setLocalData((prev) =>
      prev.map((v, i) => (i === idx ? { ...v, tables: [...v.tables, entry] } : v)),
    );
    setNewTables((prev) => ({ ...prev, [idx]: { ...EMPTY_NEW_TABLE } }));
  }, [newTables]);

  const removeTable = useCallback((venueIdx: number, tableIdx: number) => {
    setLocalData((prev) =>
      prev.map((v, i) =>
        i === venueIdx ? { ...v, tables: v.tables.filter((_, ti) => ti !== tableIdx) } : v,
      ),
    );
  }, []);

  const updateExistingTable = useCallback(
    (venueIdx: number, tableIdx: number, updates: Partial<VenueTableEntry>) => {
      setLocalData((prev) =>
        prev.map((v, i) =>
          i === venueIdx
            ? { ...v, tables: v.tables.map((t, ti) => (ti === tableIdx ? { ...t, ...updates } : t)) }
            : v,
        ),
      );
    },
    [],
  );

  const handleNext = async () => {
    if (isLastVenueStep) {
      setSubmitting(true);
      const success = await onSubmit(localData);
      setSubmitting(false);
      if (!success) {
        Alert.alert("Save Failed", "We couldn't save your venue info. Please check your connection and try again.");
        return;
      }
    }
    setStep((s) => {
      const next = s + 1;
      if (next === venueCount.current + 1) {
        setTimeout(() => {
          onDismiss();
          setTimeout(() => onComplete?.(), 50);
        }, 100);
      }
      return next;
    });
  };

  const renderProgressDots = () => {
    if (venueCount.current <= 1 || isWelcome || isComplete) return null;
    return (
      <View style={styles.dotsRow}>
        {Array.from({ length: venueCount.current }).map((_, i) => (
          <View key={i} style={[styles.dot, i === venueIndex && styles.dotActive]} />
        ))}
      </View>
    );
  };

  const renderWelcome = () => (
    <View style={styles.centered}>
      <Text allowFontScaling={false} style={styles.bigEmoji}>{"\uD83C\uDFE2"}</Text>
      <Text allowFontScaling={false} style={styles.welcomeTitle}>Time for Your 6-Month Check-In</Text>
      <Text allowFontScaling={false} style={styles.welcomeBody}>
        {"Help players find your events by keeping your venue details up to date. This takes less than 2 minutes."}
      </Text>
      <View style={styles.infoBadge}>
        <Text allowFontScaling={false} style={styles.infoBadgeText}>
          {venueCount.current === 1 ? "\uD83D\uDCCD  1 venue to verify" : `\uD83D\uDCCD  ${venueCount.current} venues to verify`}
        </Text>
      </View>
    </View>
  );

  const renderTableRow = (table: VenueTableEntry, tableIdx: number, venueIdx: number) => {
    const sizeLabel = TABLE_SIZES.find((s) => s.value === table.table_size)?.label || table.table_size;
    return (
      <View key={tableIdx} style={styles.tableRow}>
        <View style={styles.tableRowInfo}>
          <Text allowFontScaling={false} style={styles.tableRowMain}>
            {"\uD83C\uDFB1"} {table.custom_size || sizeLabel}{table.brand ? ` \u00B7 ${table.brand}` : ""}
          </Text>
          <Text allowFontScaling={false} style={styles.tableRowSub}>Qty: {table.quantity}</Text>
        </View>
        <View style={styles.tableRowActions}>
          <TouchableOpacity
            style={styles.tableQtyBtn}
            onPress={() => updateExistingTable(venueIdx, tableIdx, { quantity: Math.max(1, table.quantity - 1) })}
          >
            <Text allowFontScaling={false} style={styles.tableQtyBtnText}>{"\u2212"}</Text>
          </TouchableOpacity>
          <Text allowFontScaling={false} style={styles.tableQtyValue}>{table.quantity}</Text>
          <TouchableOpacity
            style={styles.tableQtyBtn}
            onPress={() => updateExistingTable(venueIdx, tableIdx, { quantity: table.quantity + 1 })}
          >
            <Text allowFontScaling={false} style={styles.tableQtyBtnText}>+</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tableDeleteBtn} onPress={() => removeTable(venueIdx, tableIdx)}>
            <Text allowFontScaling={false} style={styles.tableDeleteBtnText}>{"\u2715"}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderAddTableForm = (venueIdx: number) => {
    const nt = newTables[venueIdx] ?? { ...EMPTY_NEW_TABLE };
    return (
      <View
        style={styles.addTableCard}
        onLayout={(e) => { addTableCardY.current = e.nativeEvent.layout.y; }}
        onTouchStart={() => {
          setTimeout(() => scrollRef.current?.scrollTo({ y: addTableCardY.current - 20, animated: true }), 30);
        }}
      >
        <View style={styles.addTableRow}>
          <View style={styles.addTableDropWrap}>
            <Text allowFontScaling={false} style={styles.addTableLabel}>Size</Text>
            <Dropdown
              options={TABLE_SIZES}
              value={nt.table_size}
              onSelect={(v) => updateNewTable(venueIdx, { table_size: v })}
              placeholder="Size"
            />
          </View>
          <View style={styles.addTableDropWrap}>
            <Text allowFontScaling={false} style={styles.addTableLabel}>Brand</Text>
            <Dropdown
              options={TABLE_BRANDS}
              value={nt.brand}
              onSelect={(v) => updateNewTable(venueIdx, { brand: v, custom_brand: "" })}
              placeholder="Brand"
            />
          </View>
        </View>

        {nt.brand === "Other" && (
          <View style={styles.customInputWrap}>
            <Text allowFontScaling={false} style={styles.addTableLabel}>Brand Name *</Text>
            <TextInput
              allowFontScaling={false}
              style={styles.input}
              value={nt.custom_brand}
              onChangeText={(t) => updateNewTable(venueIdx, { custom_brand: t.replace(/\b\w/g, (c) => c.toUpperCase()) })}
              placeholder="e.g. AMF, Golden West..."
              placeholderTextColor={COLORS.textMuted}
              autoCapitalize="words"
            />
          </View>
        )}

        {nt.table_size === "custom" && (
          <View style={styles.customInputWrap}>
            <Text allowFontScaling={false} style={styles.addTableLabel}>Custom Size *</Text>
            <TextInput
              allowFontScaling={false}
              style={styles.input}
              value={nt.custom_size}
              onChangeText={(t) => updateNewTable(venueIdx, { custom_size: t })}
              placeholder="e.g. 10ft x 5ft"
              placeholderTextColor={COLORS.textMuted}
            />
          </View>
        )}

        <View style={styles.addTableBottom}>
          <View style={styles.addTableStepper}>
            <Text allowFontScaling={false} style={styles.addTableLabel}>Qty</Text>
            <TextInput
              allowFontScaling={false}
              style={styles.qtyInput}
              value={nt.quantity === 0 ? "" : String(nt.quantity)}
              placeholder="0"
              onChangeText={(t) => {
                if (t === "") { updateNewTable(venueIdx, { quantity: 0 }); return; }
                const n = parseInt(t, 10);
                updateNewTable(venueIdx, { quantity: isNaN(n) ? 0 : Math.max(0, n) });
              }}
              keyboardType="number-pad"
              maxLength={3}
              selectTextOnFocus
              placeholderTextColor={COLORS.textMuted}
              onFocus={() => {
                setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
              }}
            />
          </View>
          <TouchableOpacity style={styles.addTableBtn} onPress={() => addTable(venueIdx)}>
            <Text allowFontScaling={false} style={styles.addTableBtnText}>
              {nt.quantity > 1 ? `+ Add Tables (${nt.quantity})` : "+ Add Table"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderVenueStep = () => {
    if (!currentVenue) return null;
    return (
      <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          automaticallyAdjustKeyboardInsets={true}
        >
          <View style={styles.venueHeader}>
            {venueCount.current > 1 && (
              <Text allowFontScaling={false} style={styles.venueCount}>
                Venue {venueIndex + 1} of {venueCount.current}
              </Text>
            )}
            <Text allowFontScaling={false} style={styles.venueName}>{currentVenue.venueName}</Text>
            <Text allowFontScaling={false} style={styles.venueLocation}>{currentVenue.city}, {currentVenue.state}</Text>
          </View>

          <View style={styles.section}>
            <Text allowFontScaling={false} style={styles.sectionTitle}>{"\uD83D\uDCCD"} Venue Details</Text>
            <Text allowFontScaling={false} style={styles.sectionSub}>Confirm everything is accurate</Text>

            <Text allowFontScaling={false} style={styles.label}>Venue Name</Text>
            <TextInput
              allowFontScaling={false}
              style={styles.input}
              value={currentVenue.venueName}
              onChangeText={(t) => updateVenue(venueIndex, { venueName: t })}
              placeholder="Venue name"
              placeholderTextColor={COLORS.textMuted}
            />

            <Text allowFontScaling={false} style={styles.label}>Street Address</Text>
            <TextInput
              allowFontScaling={false}
              style={styles.input}
              value={currentVenue.address}
              onChangeText={(t) => updateVenue(venueIndex, { address: t })}
              placeholder="123 Main St"
              placeholderTextColor={COLORS.textMuted}
            />

            <View style={styles.rowFields}>
              <View style={{ flex: 2, marginRight: SPACING.sm }}>
                <Text allowFontScaling={false} style={styles.label}>City</Text>
                <TextInput
                  allowFontScaling={false}
                  style={styles.input}
                  value={currentVenue.city}
                  onChangeText={(t) => updateVenue(venueIndex, { city: t })}
                  placeholder="City"
                  placeholderTextColor={COLORS.textMuted}
                />
              </View>
              <View style={{ flex: 1, marginRight: SPACING.sm }}>
                <Text allowFontScaling={false} style={styles.label}>State</Text>
                <TextInput
                  allowFontScaling={false}
                  style={styles.input}
                  value={currentVenue.state}
                  onChangeText={(t) => updateVenue(venueIndex, { state: t.toUpperCase() })}
                  placeholder="AZ"
                  placeholderTextColor={COLORS.textMuted}
                  maxLength={2}
                  autoCapitalize="characters"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text allowFontScaling={false} style={styles.label}>ZIP</Text>
                <TextInput
                  allowFontScaling={false}
                  style={styles.input}
                  value={currentVenue.zipCode}
                  onChangeText={(t) => updateVenue(venueIndex, { zipCode: t })}
                  placeholder="85001"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="number-pad"
                  maxLength={10}
                />
              </View>
            </View>

            <Text allowFontScaling={false} style={styles.label}>Phone Number</Text>
            <TextInput
              allowFontScaling={false}
              style={styles.input}
              value={currentVenue.phone}
              onChangeText={(t) => updateVenue(venueIndex, { phone: t })}
              placeholder="(555) 555-5555"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="phone-pad"
            />

            <Text allowFontScaling={false} style={styles.label}>Website URL</Text>
            <TextInput
              allowFontScaling={false}
              style={[styles.input, { marginBottom: 0 }]}
              value={currentVenue.website}
              onChangeText={(t) => updateVenue(venueIndex, { website: t })}
              placeholder="https://yourvenue.com"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.section}>
            <Text allowFontScaling={false} style={styles.sectionTitle}>{"\uD83C\uDFB1"} Pool Tables</Text>
            <Text allowFontScaling={false} style={styles.sectionSub}>
              Keep your table list accurate — add each group (e.g. 3 x 7ft Diamond, 6 x 9ft Diamond)
            </Text>
            {renderAddTableForm(venueIndex)}
            {currentVenue.tables.length === 0 && (
              <View style={styles.emptyTables}>
                <Text allowFontScaling={false} style={styles.emptyTablesText}>
                  No tables added yet
                </Text>
              </View>
            )}
            {currentVenue.tables.length > 0 && (
              <View style={{ marginTop: SPACING.sm }}>
                {currentVenue.tables.map((table, ti) => renderTableRow(table, ti, venueIndex))}
              </View>
            )}
          </View>

          <View style={styles.section}>
            <Text allowFontScaling={false} style={styles.sectionTitle}>{"\uD83C\uDFC6"} Programs Offered</Text>
            <Text allowFontScaling={false} style={styles.sectionSub}>What competitive events do you host?</Text>
            <TouchableOpacity
              style={styles.checkRow}
              onPress={() => updateVenue(venueIndex, { hasLeagues: !currentVenue.hasLeagues })}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, currentVenue.hasLeagues && styles.checkboxOn]}>
                {currentVenue.hasLeagues && <Text allowFontScaling={false} style={styles.checkmark}>{"\u2713"}</Text>}
              </View>
              <View style={styles.checkLabelWrap}>
                <Text allowFontScaling={false} style={styles.checkLabelText}>We host leagues</Text>
                <Text allowFontScaling={false} style={styles.checkLabelHint}>Regular season league play</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.checkRow}
              onPress={() => updateVenue(venueIndex, { hasTournaments: !currentVenue.hasTournaments })}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, currentVenue.hasTournaments && styles.checkboxOn]}>
                {currentVenue.hasTournaments && <Text allowFontScaling={false} style={styles.checkmark}>{"\u2713"}</Text>}
              </View>
              <View style={styles.checkLabelWrap}>
                <Text allowFontScaling={false} style={styles.checkLabelText}>We host tournaments</Text>
                <Text allowFontScaling={false} style={styles.checkLabelHint}>Open or invitational tournaments</Text>
              </View>
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <Text allowFontScaling={false} style={styles.label}>Additional Notes (optional)</Text>
            <TextInput
              allowFontScaling={false}
              style={[styles.input, styles.textArea]}
              value={currentVenue.notes}
              onChangeText={(t) => updateVenue(venueIndex, { notes: t })}
              placeholder="Anything else players should know..."
              placeholderTextColor={COLORS.textMuted}
              multiline
              numberOfLines={3}
            />
          </View>
        </ScrollView>
    );
  };

  const nextLabel = () => {
    if (isWelcome) return "Get Started  \u2192";
    if (submitting) return "Saving...";
    if (isLastVenueStep) return hasChanges ? "Save Changes  \u2713" : "Looks Good  \u2713";
    return "Next  \u2192";
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} statusBarTranslucent>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text allowFontScaling={false} style={styles.headerTitle}>
            {isWelcome ? "Venue Verification" : currentVenue?.venueName || "Verify Venue"}
          </Text>
          {renderProgressDots()}
        </View>

        <View style={styles.body}>
          {isWelcome && renderWelcome()}
          {isVenueStep && renderVenueStep()}
        </View>

        <View style={styles.footer}>
          {!isComplete && (
            <View style={styles.footerRow}>
              {!isWelcome && (
                <TouchableOpacity style={styles.backBtn} onPress={() => setStep((s) => s - 1)} disabled={submitting}>
                  <Text allowFontScaling={false} style={styles.backBtnText}>{"\u2190"} Back</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.nextBtn, isWelcome && styles.btnFull, submitting && styles.btnDisabled]}
                onPress={() => { void handleNext(); }}
                disabled={submitting}
              >
                <Text allowFontScaling={false} style={styles.nextBtnText}>{nextLabel()}</Text>
              </TouchableOpacity>
            </View>
        )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    paddingTop: Platform.OS === "ios" ? wxSc(56) : wxSc(40),
    paddingBottom: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    alignItems: "center",
    gap: SPACING.sm,
  },
  headerTitle: { fontSize: wxMs(FONT_SIZES.lg), fontWeight: "700", color: COLORS.text, textAlign: "center" },
  dotsRow: { flexDirection: "row", gap: SPACING.xs, alignItems: "center" },
  dot: { width: wxSc(8), height: wxSc(8), borderRadius: wxSc(4), backgroundColor: COLORS.border },
  dotActive: { width: wxSc(24), backgroundColor: COLORS.primary },
  body: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: SPACING.xl, gap: SPACING.md },
  bigEmoji: { fontSize: wxMs(64), marginBottom: SPACING.sm },
  welcomeTitle: { fontSize: wxMs(FONT_SIZES.xl), fontWeight: "700", color: COLORS.text, textAlign: "center" },
  welcomeBody: { fontSize: wxMs(FONT_SIZES.md), color: COLORS.textSecondary, textAlign: "center", lineHeight: wxMs(FONT_SIZES.md) * 1.6 },
  infoBadge: { backgroundColor: COLORS.primary + "20", borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.primary + "50", paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, marginTop: SPACING.sm },
  infoBadgeText: { fontSize: wxMs(FONT_SIZES.md), color: COLORS.primary, fontWeight: "600" },
  hint: { fontSize: wxMs(FONT_SIZES.xs), color: COLORS.textMuted, fontStyle: "italic", textAlign: "center" },
  scroll: { flex: 1 },
  scrollContent: { padding: SPACING.md, paddingBottom: SPACING.xl * 4 },
  venueHeader: { alignItems: "center", paddingVertical: SPACING.md, marginBottom: SPACING.sm },
  venueCount: { fontSize: wxMs(FONT_SIZES.xs), color: COLORS.textMuted, fontWeight: "500", marginBottom: wxSc(2) },
  venueName: { fontSize: wxMs(FONT_SIZES.xl), fontWeight: "700", color: COLORS.text, textAlign: "center" },
  venueLocation: { fontSize: wxMs(FONT_SIZES.sm), color: COLORS.textSecondary, marginTop: wxSc(2) },
  section: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, marginBottom: SPACING.md },
  sectionTitle: { fontSize: wxMs(FONT_SIZES.md), fontWeight: "700", color: COLORS.text, marginBottom: wxSc(2) },
  sectionSub: { fontSize: wxMs(FONT_SIZES.xs), color: COLORS.textSecondary, marginBottom: SPACING.md },
  label: { fontSize: wxMs(FONT_SIZES.sm), color: COLORS.textSecondary, fontWeight: "600", marginBottom: wxSc(4) },
  input: { backgroundColor: COLORS.background, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, fontSize: wxMs(FONT_SIZES.md), color: COLORS.text, marginBottom: SPACING.md },
  textArea: { minHeight: wxSc(72), textAlignVertical: "top", marginBottom: 0 },
  rowFields: { flexDirection: "row", marginBottom: 0 },
  emptyTables: { paddingVertical: SPACING.md, alignItems: "center", marginBottom: SPACING.sm },
  emptyTablesText: { fontSize: wxMs(FONT_SIZES.sm), color: COLORS.textMuted, textAlign: "center", fontStyle: "italic" },
  tableRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: COLORS.background, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.sm, marginBottom: SPACING.sm },
  tableRowInfo: { flex: 1, marginRight: SPACING.sm },
  tableRowMain: { fontSize: wxMs(FONT_SIZES.sm), fontWeight: "600", color: COLORS.text },
  tableRowSub: { fontSize: wxMs(FONT_SIZES.xs), color: COLORS.textSecondary, marginTop: wxSc(2) },
  tableRowActions: { flexDirection: "row", alignItems: "center", gap: SPACING.xs },
  tableQtyBtn: { width: wxSc(28), height: wxSc(28), borderRadius: wxSc(6), backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, alignItems: "center", justifyContent: "center" },
  tableQtyBtnText: { fontSize: wxMs(FONT_SIZES.md), color: COLORS.primary, fontWeight: "700" },
  tableQtyValue: { fontSize: wxMs(FONT_SIZES.sm), fontWeight: "700", color: COLORS.text, minWidth: wxSc(20), textAlign: "center" },
  tableDeleteBtn: { width: wxSc(28), height: wxSc(28), borderRadius: wxSc(6), backgroundColor: COLORS.error + "20", borderWidth: 1, borderColor: COLORS.error, alignItems: "center", justifyContent: "center", marginLeft: wxSc(4) },
  tableDeleteBtnText: { fontSize: wxMs(FONT_SIZES.xs), color: COLORS.error, fontWeight: "700" },
  addTableCard: { backgroundColor: COLORS.background, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.border, borderStyle: "dashed", padding: SPACING.sm, marginTop: SPACING.sm },
  addTableRow: { flexDirection: "row", gap: SPACING.sm, marginBottom: SPACING.sm },
  addTableDropWrap: { flex: 1 },
  addTableLabel: { fontSize: wxMs(FONT_SIZES.xs), color: COLORS.textSecondary, fontWeight: "600", marginBottom: wxSc(3) },
  customInputWrap: { marginBottom: SPACING.sm },
  addTableBottom: { flexDirection: "row", alignItems: "flex-end", gap: SPACING.sm },
  addTableStepper: { flex: 1 },
  qtyInput: { backgroundColor: COLORS.background, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.sm, height: wxSc(40), width: wxSc(80), fontSize: wxMs(FONT_SIZES.md), fontWeight: "700", color: COLORS.text, textAlign: "center" },
  addTableBtn: { flex: 1, backgroundColor: COLORS.primary, borderRadius: RADIUS.sm, paddingVertical: SPACING.sm, alignItems: "center", justifyContent: "center", height: wxSc(40) },
  addTableBtnText: { fontSize: wxMs(FONT_SIZES.sm), color: COLORS.white, fontWeight: "700" },
  checkRow: { flexDirection: "row", alignItems: "center", paddingVertical: SPACING.sm, gap: SPACING.md },
  checkbox: { width: wxSc(24), height: wxSc(24), borderRadius: wxSc(6), borderWidth: 2, borderColor: COLORS.border, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.background },
  checkboxOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  checkmark: { fontSize: wxMs(FONT_SIZES.sm), color: COLORS.white, fontWeight: "700" },
  checkLabelWrap: { flex: 1 },
  checkLabelText: { fontSize: wxMs(FONT_SIZES.md), color: COLORS.text, fontWeight: "500" },
  checkLabelHint: { fontSize: wxMs(FONT_SIZES.xs), color: COLORS.textMuted, marginTop: wxSc(2) },
  footer: { padding: SPACING.md, paddingBottom: Platform.OS === "ios" ? SPACING.xl + SPACING.md : SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.background },
  footerRow: { flexDirection: "row", gap: SPACING.sm },
  backBtn: { flex: 1, paddingVertical: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, alignItems: "center", justifyContent: "center" },
  backBtnText: { fontSize: wxMs(FONT_SIZES.md), color: COLORS.text, fontWeight: "600" },
  nextBtn: { flex: 2, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: SPACING.md, alignItems: "center", justifyContent: "center" },
  btnFull: { flex: 1 },
  btnDisabled: { opacity: 0.5 },
  nextBtnText: { fontSize: wxMs(FONT_SIZES.md), color: "#FFFFFF", fontWeight: "700" },

});