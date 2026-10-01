// src/views/screens/admin/giveaway-console/entry-wallet-console.screen.tsx
// WEB desktop Giveaway Management → Entry Wallet (grant / remove a user's Giveaway Entries).
// Same viewmodel and server calls as the native screen (useGiveawayGrantEntries →
// admin_grant/revoke_giveaway_entries with an idempotency key); only the layout differs:
// user search on the left, the selected user's balance + adjustment form on the right.
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { COLORS } from "../../../../theme/colors";
import { useGiveawayGrantEntries } from "../../../../viewmodels/useGiveawayGrantEntries";
import { DetailSection } from "./AdminModal";
import { GiveawayAdminHeader, GiveawayAdminPage, useGiveawayAdminNav } from "./giveaway-admin-shell";
import { ConsoleButton } from "./giveaway-console.parts";
import { consoleSt, tint } from "./giveaway-console.styles";
import { walletSt } from "./entry-wallet-console.styles";

export function EntryWalletConsoleScreen() {
  const nav = useGiveawayAdminNav();
  const vm = useGiveawayGrantEntries();
  const isRemove = vm.mode === "remove";

  return (
    <GiveawayAdminPage>
      <GiveawayAdminHeader
        title="Entry Wallet"
        subtitle="Grant or remove a user's Giveaway Entries. Every change is recorded with who made it and why."
        section="wallet"
        backLabel="Giveaway Management"
        onBack={() => nav.back()}
      />

      <View style={[consoleSt.notice, { borderColor: COLORS.border, backgroundColor: COLORS.backgroundLight }]}>
        <Ionicons name="information-circle-outline" size={18} color={COLORS.textSecondary} />
        <Text allowFontScaling={false} style={[consoleSt.noticeText, { color: COLORS.textSecondary }]}>
          Administrative tool. Giveaway Entries can only be spent on Wallet-method giveaways; Single Entry
          giveaways don&apos;t use them.
        </Text>
      </View>

      <View style={consoleSt.formColumns}>
        {/* ── Find a user ─────────────────────────────────────────────────────────── */}
        <View style={consoleSt.formCol}>
          <DetailSection title="1 · Find a user">
            <View style={walletSt.pad}>
              <View style={[consoleSt.search, { width: "100%" }]}>
                <Ionicons name="search" size={15} color={COLORS.textMuted} />
                <TextInput
                  style={consoleSt.searchInput}
                  placeholder="Username or name (min. 2 characters)"
                  placeholderTextColor={COLORS.textMuted}
                  value={vm.selected ? "" : vm.query}
                  onChangeText={vm.setQuery}
                  editable={!vm.selected}
                  autoCapitalize="none"
                  accessibilityLabel="Find a user"
                />
                {vm.searching ? <ActivityIndicator size="small" color={COLORS.primary} /> : null}
              </View>
            </View>
            {vm.selected ? (
              <Text allowFontScaling={false} style={consoleSt.prose}>
                User selected. Use “Change user” to search again.
              </Text>
            ) : vm.results.length === 0 ? (
              <Text allowFontScaling={false} style={consoleSt.prose}>
                {vm.query.trim().length >= 2 && !vm.searching ? "No users found." : "Search by username or name."}
              </Text>
            ) : (
              vm.results.map((p) => (
                <Pressable
                  key={p.id_auto}
                  onPress={() => vm.selectUser(p)}
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${p.name}`}
                  style={({ hovered }: any) => [consoleSt.miniRow, { cursor: "pointer" } as any, hovered && consoleSt.miniRowHover]}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text allowFontScaling={false} style={consoleSt.nameText} numberOfLines={1}>{p.name}</Text>
                    <Text allowFontScaling={false} style={consoleSt.cellSub}>@{p.user_name} · Profile #{p.id_auto}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
                </Pressable>
              ))
            )}
          </DetailSection>
        </View>

        {/* ── Adjust balance ──────────────────────────────────────────────────────── */}
        <View style={consoleSt.formCol}>
          <DetailSection
            title="2 · Adjust balance"
            right={vm.selected ? <ConsoleButton label="Change user" icon="swap-horizontal" onPress={vm.clearUser} /> : null}
          >
            {!vm.selected ? (
              <Text allowFontScaling={false} style={consoleSt.prose}>Select a user to see their balance.</Text>
            ) : (
              <View style={[walletSt.pad, { gap: 14 }]}>
                <View style={walletSt.userRow}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text allowFontScaling={false} style={consoleSt.modalTitle} numberOfLines={1}>{vm.selected.name}</Text>
                    <Text allowFontScaling={false} style={consoleSt.cellSub}>@{vm.selected.user_name} · Profile #{vm.selected.id_auto}</Text>
                  </View>
                  <View style={walletSt.balance}>
                    <Text allowFontScaling={false} style={walletSt.balanceLabel}>CURRENT BALANCE</Text>
                    <Text allowFontScaling={false} style={walletSt.balanceValue}>{vm.balance ?? "—"}</Text>
                  </View>
                </View>

                <View style={[consoleSt.segment, { alignSelf: "flex-start" }]} accessibilityRole={"tablist" as any}>
                  {(["grant", "remove"] as const).map((m, i) => {
                    const active = vm.mode === m;
                    return (
                      <Pressable
                        key={m}
                        onPress={() => vm.setMode(m)}
                        accessibilityRole={"tab" as any}
                        accessibilityState={{ selected: active }}
                        style={({ hovered }: any) => [
                          consoleSt.segmentItem,
                          i === 0 && consoleSt.segmentItemFirst,
                          hovered && !active && consoleSt.segmentItemHover,
                          active && (m === "grant" ? consoleSt.segmentItemActive : { backgroundColor: COLORS.error }),
                        ]}
                      >
                        <Text allowFontScaling={false} style={[consoleSt.segmentText, active && consoleSt.segmentTextActive]}>
                          {m === "grant" ? "Grant entries" : "Remove entries"}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={walletSt.field}>
                  <Text allowFontScaling={false} style={walletSt.label}>Amount</Text>
                  <TextInput
                    style={walletSt.input}
                    value={vm.amount}
                    onChangeText={(t) => vm.setAmount(t.replace(/[^0-9]/g, ""))}
                    placeholder="e.g. 10"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="numeric"
                    accessibilityLabel="Amount"
                  />
                  <Text allowFontScaling={false} style={consoleSt.cellSub}>1 – 10,000</Text>
                </View>
                <View style={walletSt.field}>
                  <Text allowFontScaling={false} style={walletSt.label}>{isRemove ? "Reason (required)" : "Note (optional)"}</Text>
                  <TextInput
                    style={[walletSt.input, walletSt.textarea]}
                    value={vm.note}
                    onChangeText={vm.setNote}
                    placeholder={isRemove ? "Why are entries being removed?" : "e.g. Promo winner, testing"}
                    placeholderTextColor={COLORS.textMuted}
                    multiline
                    accessibilityLabel={isRemove ? "Reason" : "Note"}
                  />
                </View>

                {vm.error ? (
                  <View style={[consoleSt.notice, { borderColor: COLORS.error, backgroundColor: tint(COLORS.error), marginBottom: 0 }]}>
                    <Text allowFontScaling={false} style={[consoleSt.noticeText, { color: COLORS.error }]}>{vm.error}</Text>
                  </View>
                ) : null}
                {vm.message ? (
                  <View style={[consoleSt.notice, { borderColor: COLORS.success, backgroundColor: tint(COLORS.success), marginBottom: 0 }]}>
                    <Text allowFontScaling={false} style={[consoleSt.noticeText, { color: COLORS.success }]}>{vm.message}</Text>
                  </View>
                ) : null}

                <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
                  <ConsoleButton
                    label={isRemove ? "Remove entries" : "Grant entries"}
                    variant={isRemove ? "danger" : "primary"}
                    disabled={!vm.canSubmit}
                    busy={vm.submitting}
                    onPress={vm.submit}
                  />
                </View>
              </View>
            )}
          </DetailSection>
        </View>
      </View>
    </GiveawayAdminPage>
  );
}
