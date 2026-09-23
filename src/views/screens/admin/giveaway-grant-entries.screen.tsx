// src/views/screens/admin/giveaway-grant-entries.screen.tsx
// Grant or remove a user's Giveaway Entries (Super Admin). Every change is ledgered server-side
// with who did it and why.

import { useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { webMs, webSc } from "../../../utils/scaling";
import { useGiveawayGrantEntries } from "../../../viewmodels/useGiveawayGrantEntries";
import { Button } from "../../components/common/button";
import { Input } from "../../components/common/input";
import { WebContainer } from "../../components/common/WebContainer";

export function GiveawayGrantEntriesScreen() {
  const router = useRouter();
  const vm = useGiveawayGrantEntries();

  return (
    <WebContainer>
      <ScrollView style={st.page} contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <View style={st.header}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Text allowFontScaling={false} style={st.back}>‹ Back</Text>
          </Pressable>
          <Text allowFontScaling={false} style={st.title}>GRANT GIVEAWAY ENTRIES</Text>
          <View style={st.headerSpacer} />
        </View>

        {!vm.selected ? (
          <View style={st.card}>
            <Input
              label="Find a user"
              value={vm.query}
              onChangeText={vm.setQuery}
              placeholder="Username or name"
              autoCapitalize="none"
            />
            {vm.searching && <ActivityIndicator color={COLORS.primary} style={st.spinner} />}
            {vm.results.map((p) => (
              <Pressable key={p.id_auto} style={st.resultRow} onPress={() => vm.selectUser(p)}>
                <Text allowFontScaling={false} style={st.resultName}>{p.name}</Text>
                <Text allowFontScaling={false} style={st.resultUser}>@{p.user_name}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={st.card}>
            <View style={st.userRow}>
              <View style={st.userInfo}>
                <Text allowFontScaling={false} style={st.resultName}>{vm.selected.name}</Text>
                <Text allowFontScaling={false} style={st.resultUser}>@{vm.selected.user_name}</Text>
              </View>
              <Pressable onPress={vm.clearUser} hitSlop={8}>
                <Text allowFontScaling={false} style={st.change}>Change</Text>
              </Pressable>
            </View>

            <View style={st.balanceBox}>
              <Text allowFontScaling={false} style={st.balanceLabel}>🎟 CURRENT BALANCE</Text>
              <Text allowFontScaling={false} style={st.balanceValue}>{vm.balance ?? "—"}</Text>
            </View>

            <View style={st.segment}>
              {(["grant", "remove"] as const).map((m) => (
                <Pressable key={m} style={[st.segmentBtn, vm.mode === m && (m === "grant" ? st.segmentGrant : st.segmentRemove)]} onPress={() => vm.setMode(m)}>
                  <Text allowFontScaling={false} style={[st.segmentText, vm.mode === m && st.segmentTextActive]}>
                    {m === "grant" ? "Grant" : "Remove"}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Input label="Amount" value={vm.amount} onChangeText={(t) => vm.setAmount(t.replace(/[^0-9]/g, ""))} placeholder="e.g. 10" keyboardType="numeric" />
            <Input
              label={vm.mode === "remove" ? "Reason (required)" : "Note (optional)"}
              value={vm.note}
              onChangeText={vm.setNote}
              placeholder={vm.mode === "remove" ? "Why are entries being removed?" : "e.g. Promo winner, testing"}
            />

            {vm.error && <Text allowFontScaling={false} style={st.error}>{vm.error}</Text>}
            {vm.message && <Text allowFontScaling={false} style={st.success}>{vm.message}</Text>}

            <Button
              title={vm.mode === "grant" ? "Grant Entries" : "Remove Entries"}
              onPress={vm.submit}
              disabled={!vm.canSubmit}
              loading={vm.submitting}
              fullWidth
            />
          </View>
        )}
      </ScrollView>
    </WebContainer>
  );
}

const st = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: webSc(SPACING.md), paddingBottom: webSc(SPACING.xxl), width: "100%", maxWidth: 560, alignSelf: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: webSc(SPACING.md), paddingTop: webSc(SPACING.md) },
  back: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.md) },
  title: { color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "800", letterSpacing: 0.6 },
  headerSpacer: { width: 48 },
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, padding: webSc(SPACING.md), gap: webSc(SPACING.sm) },
  spinner: { marginVertical: webSc(SPACING.sm) },
  resultRow: { paddingVertical: webSc(SPACING.sm), borderTopWidth: 1, borderTopColor: COLORS.border },
  resultName: { color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "600" },
  resultUser: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm) },
  userRow: { flexDirection: "row", alignItems: "center" },
  userInfo: { flex: 1 },
  change: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "600" },
  balanceBox: { alignItems: "center", backgroundColor: COLORS.surfaceLight, borderRadius: RADIUS.md, paddingVertical: webSc(SPACING.sm) },
  balanceLabel: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700", letterSpacing: 0.8 },
  balanceValue: { color: COLORS.text, fontSize: webMs(FONT_SIZES.xxl), fontWeight: "800" },
  segment: { flexDirection: "row", gap: webSc(SPACING.sm) },
  segmentBtn: { flex: 1, alignItems: "center", paddingVertical: webSc(SPACING.sm), borderRadius: RADIUS.md, backgroundColor: COLORS.surfaceLight },
  segmentGrant: { backgroundColor: COLORS.success },
  segmentRemove: { backgroundColor: COLORS.error },
  segmentText: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  segmentTextActive: { color: COLORS.white },
  error: { color: COLORS.error, fontSize: webMs(FONT_SIZES.sm) },
  success: { color: COLORS.success, fontSize: webMs(FONT_SIZES.sm) },
});
