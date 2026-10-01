// src/views/screens/admin/giveaway-console/WinnerDetailModal.tsx
// WEB desktop Winner Details — centered modal shown by Giveaway Management (View Winner) and the
// Winners page. Purely presentational over useAdminGiveaways' existing winner state
// (openWinnerDetailsModal loads current winner, history and eligible count); Redraw hands off to
// the existing Redraw confirm modal (vm.openRedrawModal → vm.handleRedrawWinner). No new reads,
// no change to winner selection.
import React from "react";
import { ActivityIndicator, Linking, Text, View } from "react-native";
import { COLORS } from "../../../../theme/colors";
import { formatConsoleDate, formatMoney } from "../../../../utils/giveaway-console";
import { useAdminGiveaways } from "../../../../viewmodels/useAdminGiveaways";
import { AdminModal, DetailRow, DetailSection } from "./AdminModal";
import { ConsoleButton, StatusPill } from "./giveaway-console.parts";
import { consoleSt } from "./giveaway-console.styles";

type AdminVm = ReturnType<typeof useAdminGiveaways>;

const fmtDateTime = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
    : "—";

export function WinnerDetailModal({ vm, canManage }: { vm: AdminVm; canManage: boolean }) {
  if (!vm.winnerDetailsModalVisible) return null;
  const g = vm.selectedGiveaway;
  const w = vm.currentWinner;
  const entries = g?.entry_count ?? 0;
  // Same eligibility as the Giveaway Management ⋯ menu: redraw only while the giveaway is Awarded
  // (an archived giveaway's winner is history — restore it first). Native rules unchanged.
  const isAwarded = g?.status === "awarded";
  const canRedraw = canManage && !!w && vm.eligibleCount > 0 && isAwarded;

  const footer = (
    <>
      {canManage && w && !isAwarded ? (
        <Text allowFontScaling={false} style={consoleSt.formFooterNote}>
          Redraw is available for Awarded giveaways. Restore this giveaway first to redraw.
        </Text>
      ) : (
        <View style={{ flex: 1 }} />
      )}
      {w?.email ? <ConsoleButton label="Email winner" icon="mail-outline" onPress={() => Linking.openURL(`mailto:${w.email}`).catch(() => {})} /> : null}
      {canManage ? (
        <ConsoleButton label="Redraw winner…" icon="refresh" variant="danger" disabled={!canRedraw} onPress={vm.openRedrawModal} />
      ) : null}
      <ConsoleButton label="Close" onPress={vm.closeWinnerDetailsModal} />
    </>
  );

  return (
    <AdminModal
      title={w?.name || "Winner details"}
      subtitle={g ? `${g.name} · #${g.id}` : null}
      badge={g ? <StatusPill status={g.status} /> : null}
      onClose={vm.closeWinnerDetailsModal}
      footer={footer}
      width={880}
      accessibilityLabel="Winner details"
    >
      {vm.loadingWinnerDetails ? (
        <View style={{ paddingVertical: 48, alignItems: "center" }}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : !w ? (
        <Text allowFontScaling={false} style={consoleSt.emptySub}>No current winner found for this giveaway.</Text>
      ) : (
        <View style={consoleSt.modalColumns}>
          <View style={consoleSt.modalColRight}>
            <DetailSection title="Winner">
              <DetailRow k="Name" v={w.name} />
              <DetailRow k="Profile" v={`#${w.user_id}`} />
              <DetailRow k="Email" v={w.email || "—"} />
              <DetailRow k="Phone" v={w.phone || "—"} />
              <DetailRow k="Drawn" v={fmtDateTime(w.drawn_at)} />
            </DetailSection>
            <DetailSection title={`Draw history (${vm.winnerHistory.length})`}>
              {vm.winnerHistory.length === 0 ? (
                <Text allowFontScaling={false} style={consoleSt.prose}>No draw history recorded.</Text>
              ) : (
                vm.winnerHistory.map((r) => (
                  <View key={r.id} style={consoleSt.miniRow}>
                    <StatusPill status={r.status === "disqualified" ? "cancelled" : "awarded"} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text allowFontScaling={false} style={consoleSt.cellText} numberOfLines={1}>
                        {r.user_name || `Profile #${r.user_id}`}{" "}
                        <Text style={consoleSt.cellMuted}>· {r.status === "disqualified" ? "Disqualified" : "Winner"}</Text>
                      </Text>
                      {r.status === "disqualified" && r.disqualified_reason ? (
                        <Text allowFontScaling={false} style={consoleSt.cellSub}>Reason: {r.disqualified_reason}</Text>
                      ) : null}
                    </View>
                    <Text allowFontScaling={false} style={consoleSt.cellSub}>{formatConsoleDate(r.drawn_at)}</Text>
                  </View>
                ))
              )}
            </DetailSection>
          </View>
          <View style={consoleSt.modalColLeft}>
            <DetailSection title="Giveaway">
              <DetailRow k="Giveaway" v={g?.name ?? "—"} />
              <DetailRow k="Prize value" v={formatMoney(g?.prize_value)} />
              <DetailRow k="Entries" v={entries.toLocaleString()} />
              <DetailRow k="Odds" v={entries > 0 ? `1 in ${entries.toLocaleString()}` : "—"} />
              <DetailRow k="Eligible for redraw" v={vm.eligibleCount.toLocaleString()} />
            </DetailSection>
          </View>
        </View>
      )}
    </AdminModal>
  );
}
