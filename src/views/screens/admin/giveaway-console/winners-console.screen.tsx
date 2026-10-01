// src/views/screens/admin/giveaway-console/winners-console.screen.tsx
// WEB desktop Giveaway Management → Winners. Winner history = every giveaway with a current winner
// (giveaways.winner_id), whatever its status now — so giveaways archived after their draw are
// included (native still lists status 'awarded' only). Data comes from the giveaway list
// useAdminGiveaways already loads (winner name/email via the profiles join); no new reads.
// Each row opens the shared Winner Details modal (current winner + full draw history incl.
// disqualifications); Redraw stays on the existing flow and is offered for Awarded giveaways only,
// matching the Giveaway Management ⋯ menu.
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { COLORS } from "../../../../theme/colors";
import { formatConsoleDate, formatMoney } from "../../../../utils/giveaway-console";
import { drawOddsLabel } from "../../../../utils/giveaway-rules";
import { useAuthStore } from "../../../../viewmodels/stores/auth.store";
import { useAdminGiveaways } from "../../../../viewmodels/useAdminGiveaways";
import { GiveawayAdminModals } from "../../../components/giveaway/GiveawayAdminModals";
import { GiveawayAdminHeader, GiveawayAdminPage, useGiveawayAdminNav } from "./giveaway-admin-shell";
import { ContactModal } from "./ContactModal";
import { ConsoleButton, StatusPill } from "./giveaway-console.parts";
import { consoleSt } from "./giveaway-console.styles";
import { WinnerDetailModal } from "./WinnerDetailModal";

const WCOLS = { giveaway: 260, status: 100, prize: 80, drawn: 164, entries: 72, odds: 132, actions: 108 };

const fmtDateTime = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
    : "—";
const noop = () => {};

function HeadCell({ label, width, flex }: { label: string; width?: number; flex?: boolean }) {
  return (
    <View style={[consoleSt.cell, flex ? consoleSt.cellName : { width }]}>
      <Text allowFontScaling={false} style={consoleSt.headCell} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export function WinnersConsoleScreen() {
  const nav = useGiveawayAdminNav();
  const adminVm = useAdminGiveaways();
  const canManage = useAuthStore((st) => st.profile?.role === "super_admin");

  // Every giveaway that has a winner, newest draw first.
  const { allGiveaways } = adminVm;
  const winners = useMemo(
    () =>
      allGiveaways
        .filter((g) => g.winner_id != null)
        .sort((a, b) => new Date(b.winner_drawn_at ?? 0).getTime() - new Date(a.winner_drawn_at ?? 0).getTime()),
    [allGiveaways],
  );
  const totalAwarded = winners.reduce((sum, g) => sum + (Number(g.prize_value) || 0), 0);

  // After a redraw finishes (Redraw modal closes), reload so the new winner shows.
  const { redrawModalVisible, onRefresh } = adminVm;
  const wasRedrawOpen = useRef(false);
  useEffect(() => {
    if (wasRedrawOpen.current && !redrawModalVisible) onRefresh();
    wasRedrawOpen.current = redrawModalVisible;
  }, [redrawModalVisible, onRefresh]);

  const [contactFor, setContactFor] = useState<(typeof winners)[number] | null>(null);

  const openWinner = (giveawayId: number) => {
    const g = allGiveaways.find((x) => x.id === giveawayId);
    if (g) adminVm.openWinnerDetailsModal(g);
  };
  const ready = !adminVm.loading;

  const stats = [
    { label: "Winners", value: winners.length.toLocaleString() },
    { label: "Total awarded", value: formatMoney(totalAwarded) },
    { label: "Still awarded", value: winners.filter((g) => g.status === "awarded").length.toLocaleString() },
    { label: "Most recent draw", value: winners[0] ? formatConsoleDate(winners[0].winner_drawn_at) : "—" },
  ];

  return (
    <>
      <GiveawayAdminPage>
        <GiveawayAdminHeader
          title="Winners"
          subtitle="Every giveaway winner, including giveaways archived after the draw. Click a row for winner details and draw history."
          section="winners"
          backLabel="Giveaway Management"
          onBack={() => nav.back()}
        />

        <View style={consoleSt.statStrip}>
          {stats.map((it, i) => (
            <View key={it.label} style={[consoleSt.stat, i > 0 && consoleSt.statDivider]}>
              <Text allowFontScaling={false} style={consoleSt.statValue}>{it.value}</Text>
              <Text allowFontScaling={false} style={consoleSt.statLabel}>{it.label}</Text>
            </View>
          ))}
        </View>

        {!ready ? (
          <View style={consoleSt.empty}>
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : (
          <View style={consoleSt.tableWrap}>
            <View style={consoleSt.tableScroll}>
              <View style={consoleSt.table}>
                <View style={consoleSt.headRow}>
                  <HeadCell label="Winner" flex />
                  <HeadCell label="Giveaway" width={WCOLS.giveaway} />
                  <HeadCell label="Status" width={WCOLS.status} />
                  <HeadCell label="Prize" width={WCOLS.prize} />
                  <HeadCell label="Drawn" width={WCOLS.drawn} />
                  <HeadCell label="Entries" width={WCOLS.entries} />
                  <HeadCell label="Odds" width={WCOLS.odds} />
                  <HeadCell label="" width={WCOLS.actions} />
                </View>
                {winners.length === 0 ? (
                  <View style={consoleSt.empty}>
                    <Ionicons name="trophy-outline" size={36} color={COLORS.textMuted} />
                    <Text allowFontScaling={false} style={consoleSt.emptyTitle}>No winners yet</Text>
                  </View>
                ) : (
                  winners.map((g, i) => {
                    const entries = g.entry_count ?? 0;
                    const name = g.winner_name || `Profile #${g.winner_id}`;
                    return (
                      // Not role="button" (contains the email button); the name link opens details.
                      <Pressable
                        key={g.id}
                        onPress={() => openWinner(g.id)}
                        style={({ hovered }: any) => [consoleSt.row, i === winners.length - 1 && consoleSt.rowLast, hovered && consoleSt.rowHover]}
                      >
                        <View style={[consoleSt.cell, consoleSt.cellName]}>
                          <Text
                            allowFontScaling={false}
                            style={consoleSt.nameText}
                            numberOfLines={1}
                            accessibilityRole="link"
                            accessibilityLabel={`Open winner details for ${g.name}`}
                            onPress={() => openWinner(g.id)}
                          >
                            🏆 {name}
                          </Text>
                          <Text allowFontScaling={false} style={consoleSt.cellSub} numberOfLines={1}>{g.winner_email || "—"}</Text>
                        </View>
                        <View style={[consoleSt.cell, { width: WCOLS.giveaway }]}>
                          <Text allowFontScaling={false} style={consoleSt.cellText} numberOfLines={1}>{g.name}</Text>
                          <Text allowFontScaling={false} style={consoleSt.cellSub}>#{g.id}</Text>
                        </View>
                        <View style={[consoleSt.cell, { width: WCOLS.status }]}>
                          <StatusPill status={g.status} />
                        </View>
                        <View style={[consoleSt.cell, { width: WCOLS.prize }]}>
                          <Text allowFontScaling={false} style={consoleSt.cellText}>{formatMoney(g.prize_value)}</Text>
                        </View>
                        <View style={[consoleSt.cell, { width: WCOLS.drawn }]}>
                          <Text allowFontScaling={false} style={consoleSt.cellText} numberOfLines={1}>{fmtDateTime(g.winner_drawn_at)}</Text>
                        </View>
                        <View style={[consoleSt.cell, { width: WCOLS.entries }]}>
                          <Text allowFontScaling={false} style={consoleSt.cellText}>{entries.toLocaleString()}</Text>
                        </View>
                        <View style={[consoleSt.cell, { width: WCOLS.odds }]}>
                          <Text allowFontScaling={false} style={consoleSt.cellText}>{drawOddsLabel(g.entry_mode, entries)}</Text>
                        </View>
                        <View style={[consoleSt.cell, { width: WCOLS.actions, paddingRight: 0 }]}>
                          <ConsoleButton label="Contact" icon="person-circle-outline" onPress={() => setContactFor(g)} accessibilityLabel={`Contact ${name}`} />
                        </View>
                      </Pressable>
                    );
                  })
                )}
              </View>
            </View>
          </View>
        )}
      </GiveawayAdminPage>

      {contactFor ? (
        <ContactModal
          contact={{
            name: contactFor.winner_name || `Profile #${contactFor.winner_id}`,
            subtitle: `Winner · ${contactFor.name} (#${contactFor.id})`,
            email: contactFor.winner_email,
            phone: null,
          }}
          note="The phone number from the winning entry is in Winner details."
          viewLabel="Winner details"
          onView={() => {
            openWinner(contactFor.id);
            setContactFor(null);
          }}
          onClose={() => setContactFor(null)}
        />
      ) : null}

      <WinnerDetailModal vm={adminVm} canManage={canManage} />
      <GiveawayAdminModals
        vm={adminVm}
        endEarlyTarget={null}
        endingEarly={false}
        closeEndEarlyModal={noop}
        confirmEndEarly={noop}
        renderWinnerDetails={false}
      />
    </>
  );
}
