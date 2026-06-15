// src/views/components/tournament/SettingsTemplates.tsx
// Settings templates UI for the Manage Tournament Settings tab: a top bar showing
// saved templates (N/5) to apply + an Edit button, a "save these settings?" modal,
// and a manage modal to rename / delete. The settings blob is opaque here — the
// parent supplies the current settings and applies a chosen template.

import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
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
import {
  MAX_SETTINGS_TEMPLATES,
  SettingsTemplate,
} from "../../../models/services/settings-template.service";
import { Dropdown } from "../common/dropdown";

interface Props {
  templates: SettingsTemplate[];
  count: number;
  atLimit: boolean;
  saving: boolean;
  onApply: (settings: Record<string, unknown>) => void;
  onSave: (name: string) => Promise<unknown>;
  onDelete: (id: number) => Promise<void> | void;
  // The save modal is controlled so the parent can pop it right after a settings save.
  saveOpen: boolean;
  onSaveOpenChange: (open: boolean) => void;
  // The current (live) templatable settings, and a formatter for the "Using" line.
  currentSettings: Record<string, unknown>;
  summarize: (settings: Record<string, unknown>) => string[];
}

const SAVE_VALUE = "__save_current__";

// Deep, key-order-independent equality (JSONB returns keys in a different order).
const sortDeep = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === "object") {
    return Object.keys(v as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = sortDeep((v as Record<string, unknown>)[k]);
        return acc;
      }, {});
  }
  return v;
};
const sameSettings = (a: unknown, b: unknown) =>
  JSON.stringify(sortDeep(a)) === JSON.stringify(sortDeep(b));

export const SettingsTemplates = ({
  templates,
  count,
  atLimit,
  saving,
  onApply,
  onSave,
  onDelete,
  saveOpen,
  onSaveOpenChange,
  currentSettings,
  summarize,
}: Props) => {
  const [name, setName] = useState("");
  const [manageOpen, setManageOpen] = useState(false);
  // The template the TD loaded (drives the Using line + Modified badge).
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = templates.find((t) => String(t.id) === selectedId) ?? null;
  const modified = !!selected && !sameSettings(currentSettings, selected.settings);

  // Load a template into the live settings form (replacing what's there).
  const loadTemplate = (t: SettingsTemplate, alsoClose?: boolean) =>
    Alert.alert(
      "Open & Edit Template",
      `Load "${t.name}"? This will clear your current tournament settings and replace them with this template.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Open & Edit",
          style: "destructive",
          onPress: () => {
            onApply(t.settings);
            setSelectedId(String(t.id));
            if (alsoClose) setManageOpen(false);
          },
        },
      ],
    );

  const onSelectTemplate = (value: string) => {
    if (value === SAVE_VALUE) {
      onSaveOpenChange(true);
      return;
    }
    const t = templates.find((x) => String(x.id) === value);
    if (t) loadTemplate(t);
  };

  const dropdownOptions = [
    ...templates.map((t) => ({ label: t.name, value: String(t.id) })),
    {
      label: atLimit ? "Saved templates full (5/5)" : "＋ Save current settings…",
      value: SAVE_VALUE,
    },
  ];

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert("Name required", "Give this template a name.");
      return;
    }
    try {
      await onSave(name.trim());
      setName("");
      onSaveOpenChange(false);
    } catch (e) {
      Alert.alert(
        "Couldn't save",
        e instanceof Error ? e.message : "Please try again.",
      );
    }
  };

  const confirmDelete = (t: SettingsTemplate) =>
    Alert.alert("Delete Template", `Delete "${t.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          onDelete(t.id);
          if (selectedId === String(t.id)) setSelectedId(null);
        },
      },
    ]);

  return (
    <>
      {/* Compact preset card */}
      <View style={styles.bar}>
        <View style={styles.barHead}>
          <View style={styles.barLabelGroup}>
            <Ionicons
              name="albums-outline"
              size={webMs(14)}
              color={COLORS.primary}
            />
            <Text allowFontScaling={false} style={styles.barTitle}>
              Template
            </Text>
          </View>
          <Text allowFontScaling={false} style={styles.barCount}>
            {`${count} of ${MAX_SETTINGS_TEMPLATES} saved`}
          </Text>
        </View>

        <View style={styles.selectorRow}>
          <View style={styles.dropdownWrap}>
            <Dropdown
              options={dropdownOptions}
              value={selectedId ?? ""}
              onSelect={onSelectTemplate}
              placeholder={
                count > 0 ? "Select a template" : "Save current settings…"
              }
            />
          </View>
          {count > 0 && (
            <TouchableOpacity
              style={styles.manageBtn}
              onPress={() => setManageOpen(true)}
            >
              <Text allowFontScaling={false} style={styles.manageBtnText}>
                Manage
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {selected && (
          <View style={styles.usingRow}>
            <Text allowFontScaling={false} style={styles.usingText} numberOfLines={1}>
              <Text style={styles.usingLabel}>Using: </Text>
              {summarize(selected.settings).join("  ·  ") || selected.name}
            </Text>
            {modified && (
              <View style={styles.modBadge}>
                <Text allowFontScaling={false} style={styles.modText}>
                  Modified
                </Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Save modal */}
      <Modal
        visible={saveOpen}
        transparent
        animationType="fade"
        onRequestClose={() => onSaveOpenChange(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => onSaveOpenChange(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text allowFontScaling={false} style={styles.sheetTitle}>
              Save these tournament settings?
            </Text>
            <Text allowFontScaling={false} style={styles.sheetSub}>
              {`${count}/${MAX_SETTINGS_TEMPLATES} templates used`}
            </Text>
            {atLimit ? (
              <Text allowFontScaling={false} style={styles.limitText}>
                You&apos;ve saved the max of {MAX_SETTINGS_TEMPLATES}. Delete one
                from Edit to save a new template.
              </Text>
            ) : (
              <TextInput
                allowFontScaling={false}
                style={styles.input}
                placeholder="Template name (e.g. Friday 9-Ball)"
                placeholderTextColor={COLORS.textMuted}
                value={name}
                onChangeText={setName}
                maxLength={40}
                autoFocus
              />
            )}
            <View style={styles.sheetActions}>
              <TouchableOpacity
                style={[styles.actBtn, styles.actGhost]}
                onPress={() => onSaveOpenChange(false)}
              >
                <Text allowFontScaling={false} style={styles.actGhostText}>
                  Not now
                </Text>
              </TouchableOpacity>
              {!atLimit && (
                <TouchableOpacity
                  style={[styles.actBtn, styles.actPrimary, saving && styles.actOff]}
                  onPress={handleSave}
                  disabled={saving}
                >
                  <Text allowFontScaling={false} style={styles.actPrimaryText}>
                    {saving ? "Saving…" : "Save Template"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Manage / edit modal */}
      <Modal
        visible={manageOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setManageOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setManageOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text allowFontScaling={false} style={styles.sheetTitle}>
              Saved Templates
            </Text>
            <Text allowFontScaling={false} style={styles.sheetSub}>
              Manage reusable tournament setup presets.
            </Text>
            <Text allowFontScaling={false} style={styles.countText}>
              {`${count} of ${MAX_SETTINGS_TEMPLATES} saved`}
            </Text>

            <ScrollView
              style={styles.manageList}
              contentContainerStyle={styles.manageListInner}
              bounces={false}
              showsVerticalScrollIndicator={false}
            >
              {templates.map((t) => (
                <View key={t.id} style={styles.tplCard}>
                  <TouchableOpacity
                    style={styles.tplMain}
                    activeOpacity={0.7}
                    onPress={() => loadTemplate(t, true)}
                  >
                    <Text
                      allowFontScaling={false}
                      style={styles.tplName}
                      numberOfLines={1}
                    >
                      {t.name}
                    </Text>
                  </TouchableOpacity>
                  {/* Pencil opens the template — loads all its settings to edit. */}
                  <TouchableOpacity
                    style={[styles.iconBtn, styles.iconBtnPrimary]}
                    onPress={() => loadTemplate(t, true)}
                    hitSlop={6}
                  >
                    <Ionicons name="pencil" size={webMs(13)} color={COLORS.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.iconBtn, styles.iconBtnDanger]}
                    onPress={() => confirmDelete(t)}
                    hitSlop={6}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={webMs(13)}
                      color={COLORS.error}
                    />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={styles.closeBtn}
              activeOpacity={0.8}
              onPress={() => setManageOpen(false)}
            >
              <Text allowFontScaling={false} style={styles.closeBtnText}>
                Close
              </Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  bar: {
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: webSc(SPACING.sm),
    marginBottom: webSc(SPACING.md),
  },
  barHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: webSc(SPACING.xs),
  },
  barLabelGroup: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.xs) },
  barTitle: { fontSize: webMs(FONT_SIZES.sm), fontWeight: "800", color: COLORS.text },
  barCount: { fontSize: webMs(FONT_SIZES.xs), fontWeight: "800", color: COLORS.primary },
  selectorRow: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm) },
  dropdownWrap: { flex: 1 },
  manageBtn: {
    paddingHorizontal: webSc(SPACING.md),
    height: webSc(44),
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
  },
  manageBtnText: { fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", color: COLORS.text },
  usingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: webSc(SPACING.sm),
    marginTop: webSc(SPACING.xs),
  },
  usingText: { flex: 1, fontSize: webMs(FONT_SIZES.xs), color: COLORS.textSecondary, fontWeight: "600" },
  usingLabel: { color: COLORS.textMuted, fontWeight: "800" },
  modBadge: {
    paddingHorizontal: webSc(SPACING.sm),
    paddingVertical: webSc(2),
    borderRadius: webSc(RADIUS.sm),
    backgroundColor: COLORS.warning + "22",
    borderWidth: 1,
    borderColor: COLORS.warning,
  },
  modText: { fontSize: webMs(9), fontWeight: "900", color: COLORS.warning, letterSpacing: 0.5 },

  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: webSc(SPACING.lg),
  },
  sheet: {
    width: "100%",
    maxWidth: webSc(420),
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.lg),
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: webSc(SPACING.lg),
    ...Platform.select({ web: { alignSelf: "center" as any } }),
  },
  sheetTitle: { fontSize: webMs(FONT_SIZES.lg), fontWeight: "800", color: COLORS.text },
  sheetSub: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.textSecondary,
    fontWeight: "700",
    marginTop: webSc(SPACING.xs),
  },
  limitText: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    marginTop: webSc(SPACING.md),
  },
  input: {
    marginTop: webSc(SPACING.md),
    height: webSc(44),
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: webSc(RADIUS.md),
    backgroundColor: COLORS.background,
    color: COLORS.text,
    paddingHorizontal: webSc(SPACING.md),
    fontSize: webMs(FONT_SIZES.sm),
  },
  sheetActions: {
    flexDirection: "row",
    gap: webSc(SPACING.sm),
    marginTop: webSc(SPACING.lg),
  },
  actBtn: {
    flex: 1,
    paddingVertical: webSc(SPACING.sm),
    borderRadius: webSc(RADIUS.md),
    alignItems: "center",
  },
  actGhost: { borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.background },
  actGhostText: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.text, fontWeight: "700" },
  actPrimary: { backgroundColor: COLORS.primary },
  actPrimaryText: { fontSize: webMs(FONT_SIZES.sm), color: "#fff", fontWeight: "800" },
  actOff: { opacity: 0.5 },

  // ── Manage modal ──────────────────────────────────────────────────────────
  countText: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.primary,
    fontWeight: "800",
    marginTop: webSc(SPACING.xs),
  },
  manageList: { maxHeight: webSc(320), marginTop: webSc(SPACING.md) },
  manageListInner: { gap: webSc(SPACING.sm), paddingBottom: webSc(2) },
  tplCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: webSc(SPACING.sm),
    backgroundColor: COLORS.background,
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: webSc(SPACING.sm),
    paddingHorizontal: webSc(SPACING.md),
  },
  tplMain: { flex: 1 },
  tplName: { fontSize: webMs(FONT_SIZES.md), fontWeight: "800", color: COLORS.text },
  iconBtn: {
    width: webSc(30),
    height: webSc(30),
    borderRadius: webSc(RADIUS.sm),
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnPrimary: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + "12" },
  iconBtnDanger: { borderColor: COLORS.error, backgroundColor: COLORS.error + "12" },
  closeBtn: {
    alignSelf: "stretch",
    marginTop: webSc(SPACING.lg),
    paddingVertical: webSc(SPACING.sm),
    borderRadius: webSc(RADIUS.md),
    alignItems: "center",
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  closeBtnText: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.text, fontWeight: "800" },
});
