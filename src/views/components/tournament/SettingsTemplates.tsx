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

interface Props {
  templates: SettingsTemplate[];
  count: number;
  atLimit: boolean;
  saving: boolean;
  onApply: (settings: Record<string, unknown>) => void;
  onSave: (name: string) => Promise<unknown>;
  onRename: (id: number, name: string) => Promise<void> | void;
  onDelete: (id: number) => Promise<void> | void;
  // The save modal is controlled so the parent can pop it right after a settings save.
  saveOpen: boolean;
  onSaveOpenChange: (open: boolean) => void;
}

export const SettingsTemplates = ({
  templates,
  count,
  atLimit,
  saving,
  onApply,
  onSave,
  onRename,
  onDelete,
  saveOpen,
  onSaveOpenChange,
}: Props) => {
  const [name, setName] = useState("");
  const [manageOpen, setManageOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameText, setRenameText] = useState("");

  const apply = (t: SettingsTemplate) =>
    Alert.alert(
      "Apply Template",
      `Load "${t.name}" into this tournament's settings? Current settings will be replaced.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Apply", onPress: () => onApply(t.settings) },
      ],
    );

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

  const commitRename = async (id: number) => {
    if (renameText.trim()) await onRename(id, renameText.trim());
    setRenamingId(null);
  };

  const confirmDelete = (t: SettingsTemplate) =>
    Alert.alert("Delete Template", `Delete "${t.name}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => onDelete(t.id) },
    ]);

  return (
    <>
      {/* Top bar */}
      <View style={styles.bar}>
        <View style={styles.barHead}>
          <Text allowFontScaling={false} style={styles.barTitle}>
            {`Templates ${count}/${MAX_SETTINGS_TEMPLATES}`}
          </Text>
          <View style={styles.barActions}>
            <TouchableOpacity
              style={styles.barBtn}
              onPress={() => onSaveOpenChange(true)}
            >
              <Text allowFontScaling={false} style={styles.barBtnText}>
                {"＋ Save"}
              </Text>
            </TouchableOpacity>
            {count > 0 && (
              <TouchableOpacity
                style={styles.barBtn}
                onPress={() => setManageOpen(true)}
              >
                <Text allowFontScaling={false} style={styles.barBtnText}>
                  Edit
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        {count === 0 ? (
          <Text allowFontScaling={false} style={styles.barEmpty}>
            Save these settings as a reusable template, then load them into your
            next tournament.
          </Text>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            {templates.map((t) => (
              <TouchableOpacity
                key={t.id}
                style={styles.chip}
                onPress={() => apply(t)}
              >
                <Text
                  allowFontScaling={false}
                  style={styles.chipText}
                  numberOfLines={1}
                >
                  {t.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
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
              {templates.map((t) => {
                const isRenaming = renamingId === t.id;
                return (
                  <View key={t.id} style={styles.tplCard}>
                    {isRenaming ? (
                      <>
                        <TextInput
                          allowFontScaling={false}
                          style={styles.renameInput}
                          value={renameText}
                          onChangeText={setRenameText}
                          maxLength={40}
                          autoFocus
                          onSubmitEditing={() => commitRename(t.id)}
                          placeholder="Template name"
                          placeholderTextColor={COLORS.textMuted}
                        />
                        <TouchableOpacity
                          style={[styles.iconBtn, styles.iconBtnPrimary]}
                          onPress={() => commitRename(t.id)}
                          hitSlop={6}
                        >
                          <Ionicons
                            name="checkmark"
                            size={webMs(18)}
                            color={COLORS.primary}
                          />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.iconBtn}
                          onPress={() => setRenamingId(null)}
                          hitSlop={6}
                        >
                          <Ionicons
                            name="close"
                            size={webMs(18)}
                            color={COLORS.textSecondary}
                          />
                        </TouchableOpacity>
                      </>
                    ) : (
                      <>
                        <View style={styles.tplInfo}>
                          <Text
                            allowFontScaling={false}
                            style={styles.tplName}
                            numberOfLines={1}
                          >
                            {t.name}
                          </Text>
                          <Text allowFontScaling={false} style={styles.tplMeta}>
                            Tournament setup preset
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={[styles.iconBtn, styles.iconBtnPrimary]}
                          onPress={() => {
                            setRenamingId(t.id);
                            setRenameText(t.name);
                          }}
                          hitSlop={6}
                        >
                          <Ionicons
                            name="pencil"
                            size={webMs(16)}
                            color={COLORS.primary}
                          />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.iconBtn, styles.iconBtnDanger]}
                          onPress={() => confirmDelete(t)}
                          hitSlop={6}
                        >
                          <Ionicons
                            name="trash-outline"
                            size={webMs(16)}
                            color={COLORS.error}
                          />
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                );
              })}
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
  },
  barTitle: { fontSize: webMs(FONT_SIZES.sm), fontWeight: "800", color: COLORS.text },
  barActions: { flexDirection: "row", gap: webSc(SPACING.sm) },
  barBtn: {
    paddingHorizontal: webSc(SPACING.sm),
    paddingVertical: webSc(4),
    borderRadius: webSc(RADIUS.sm),
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + "15",
  },
  barBtnText: { fontSize: webMs(FONT_SIZES.xs), fontWeight: "700", color: COLORS.primary },
  barEmpty: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.textSecondary,
    marginTop: webSc(SPACING.xs),
  },
  chips: { gap: webSc(SPACING.xs), paddingTop: webSc(SPACING.sm) },
  chip: {
    paddingHorizontal: webSc(SPACING.md),
    paddingVertical: webSc(SPACING.xs),
    borderRadius: webSc(RADIUS.full),
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    maxWidth: webSc(180),
  },
  chipText: { fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", color: COLORS.text },

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
  tplInfo: { flex: 1, gap: webSc(2) },
  tplName: { fontSize: webMs(FONT_SIZES.md), fontWeight: "800", color: COLORS.text },
  tplMeta: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textMuted, fontWeight: "600" },
  renameInput: {
    flex: 1,
    height: webSc(40),
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: webSc(RADIUS.sm),
    backgroundColor: COLORS.surface,
    color: COLORS.text,
    paddingHorizontal: webSc(SPACING.sm),
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "700",
  },
  iconBtn: {
    width: webSc(38),
    height: webSc(38),
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
