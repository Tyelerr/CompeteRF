import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  AdminGiveaway,
  GiveawayStatusFilter,
  useAdminGiveaways,
} from "../../../src/viewmodels/useAdminGiveaways";

const isWeb = Platform.OS === "web";

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens
// ─────────────────────────────────────────────────────────────────────────────
const C = {
  bg:          "#000000",
  card:        "#141416",
  cardBorder:  "#252528",
  cardRaised:  "#1C1C1F",
  blue:        "#007AFF",
  blueDim:     "#007AFF20",
  blueBorder:  "#007AFF50",
  green:       "#30D158",
  greenDim:    "#30D15820",
  greenBright: "#34FF63",
  greenBorder: "#30D15850",
  amber:       "#FF9F0A",
  amberDim:    "#FF9F0A20",
  amberBorder: "#FF9F0A50",
  red:         "#FF453A",
  redDim:      "#FF453A18",
  redBorder:   "#FF453A50",
  teal:        "#64D2FF",
  tealDim:     "#64D2FF18",
  gold:        "#F5A623",
  goldDim:     "#F5A62322",
  goldBorder:  "#F5A62355",
  white:       "#FFFFFF",
  offWhite:    "#F0F0F2",
  gray:        "#8E8E93",
  lightGray:   "#AEAEB2",
  darkGray:    "#3A3A3C",
  purple:      "#BF5AF2",
  purpleDim:   "#BF5AF218",
};

const SP = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 };
const FS = { xs: 11, sm: 13, md: 15, lg: 17, xl: 20, xxl: 24 };

const STATUS_FILTERS: { label: string; value: GiveawayStatusFilter }[] = [
  { label: "Active",   value: "active"   },
  { label: "Ended",    value: "ended"    },
  { label: "Awarded",  value: "awarded"  },
  { label: "Archived", value: "archived" },
  { label: "All",      value: "all"      },
];

function statusConfig(status: string) {
  switch (status) {
    case "active":   return { color: C.green,  dim: C.greenDim,  border: C.greenBorder,       label: "Active"   };
    case "ended":    return { color: C.amber,  dim: C.amberDim,  border: C.amberBorder,        label: "Ended"    };
    case "awarded":  return { color: C.purple, dim: C.purpleDim, border: C.purple + "50",      label: "Awarded"  };
    case "archived": return { color: C.gray,   dim: C.darkGray,  border: C.darkGray,            label: "Archived" };
    default:         return { color: C.gray,   dim: C.darkGray,  border: C.darkGray,            label: status     };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PulseDot — animated green dot for active cards
// ─────────────────────────────────────────────────────────────────────────────
function PulseDot() {
  const anim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.25, duration: 900, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 1,    duration: 900, useNativeDriver: true }),
      ]),
    ).start();
  }, [anim]);

  return (
    <Animated.View
      style={{
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: C.greenBright,
        opacity: anim,
        marginRight: SP.xs,
        shadowColor: C.greenBright,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 4,
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────────────────────
export default function GiveawayManagementScreen() {
  const router = useRouter();
  const vm = useAdminGiveaways();

  // ── Local End Early confirmation state ────────────────────────────────────
  const [endEarlyTarget, setEndEarlyTarget] = useState<AdminGiveaway | null>(null);
  const [endingEarly, setEndingEarly] = useState(false);

  const openEndEarlyModal = (item: AdminGiveaway) => setEndEarlyTarget(item);
  const closeEndEarlyModal = () => { if (!endingEarly) setEndEarlyTarget(null); };

  const confirmEndEarly = async () => {
    if (!endEarlyTarget) return;
    setEndingEarly(true);
    await vm.endGiveaway(endEarlyTarget.id);
    setEndingEarly(false);
    setEndEarlyTarget(null);
  };

  // ── Giveaway card ──────────────────────────────────────────────────────────
  const renderGiveawayCard = ({ item }: { item: AdminGiveaway }) => {
    const sc = statusConfig(item.status);
    const entryCount = item.entry_count || 0;
    const hasEntries = entryCount > 0;
    const isActive   = item.status === "active";
    const isProcessing = vm.processing === item.id;

    const cardBorderColor = isActive ? C.greenBorder : sc.border;
    const cardBg          = isActive ? "#0A120A" : C.card;

    return (
      <View
        style={[
          cS.card,
          { borderColor: cardBorderColor, backgroundColor: cardBg },
          isActive && cS.activeCardShadow,
        ]}
      >
        {/* Top row: status badge + name */}
        <View style={cS.topRow}>
          <View style={cS.nameRow}>
            {isActive && <PulseDot />}
            <Text style={cS.name} numberOfLines={1}>{item.name}</Text>
          </View>
          <View style={[cS.badge, { backgroundColor: sc.dim, borderColor: sc.border }]}>
            <Text style={[cS.badgeText, { color: sc.color }]}>{sc.label}</Text>
          </View>
        </View>

        {/* Stats chips */}
        <View style={cS.statsRow}>
          {/* Prize value — green tint */}
          <View style={[cS.chip, { backgroundColor: C.greenDim, borderColor: C.greenBorder }]}>
            <Text style={cS.chipIcon}>💰</Text>
            <Text style={[cS.chipText, { color: C.green }]}>
              ${item.prize_value?.toLocaleString() || "0"}
            </Text>
          </View>

          {/* Entries — blue tint, friendly zero state */}
          <View style={[cS.chip, {
            backgroundColor: hasEntries ? C.blueDim : C.cardRaised,
            borderColor: hasEntries ? C.blueBorder : C.cardBorder,
          }]}>
            <Text style={cS.chipIcon}>👥</Text>
            <Text style={[cS.chipText, { color: hasEntries ? C.blue : C.gray }]}>
              {hasEntries
                ? `${entryCount}${item.max_entries ? ` / ${item.max_entries}` : ""} entries`
                : "No entries yet"}
            </Text>
          </View>

          {/* Time — neutral */}
          {item.end_date && (
            <View style={[cS.chip, { backgroundColor: C.cardRaised, borderColor: C.cardBorder }]}>
              <Text style={cS.chipIcon}>📅</Text>
              <Text style={[cS.chipText, { color: C.lightGray }]}>
                {vm.getDaysRemaining(item.end_date)}
              </Text>
            </View>
          )}
        </View>

        {/* Winner row */}
        {item.status === "awarded" && item.winner_name && (
          <View style={cS.winnerRow}>
            <Text style={cS.winnerIcon}>🏆</Text>
            <Text style={cS.winnerName}>{item.winner_name}</Text>
          </View>
        )}

        <View style={cS.divider} />

        {/* ── Actions ────────────────────────────────────────────────────── */}

        {/* ACTIVE */}
        {item.status === "active" && (
          <View style={cS.actionRow}>
            <Pressable
              style={cS.secondaryBtn}
              onPress={() => router.push(`/(tabs)/admin/edit-giveaway/${item.id}` as any)}
            >
              <Text style={cS.secondaryBtnText}>Edit</Text>
            </Pressable>
            {/* End Early is destructive but slightly muted until tapped */}
            <Pressable
              style={[cS.secondaryBtn, cS.endEarlyBtn]}
              onPress={() => openEndEarlyModal(item)}
              disabled={isProcessing}
            >
              <Text style={[cS.secondaryBtnText, { color: C.red }]}>
                {isProcessing ? "Ending…" : "End Early"}
              </Text>
            </Pressable>
          </View>
        )}

        {/* ENDED */}
        {item.status === "ended" && (
          <View style={cS.actionCol}>
            {hasEntries ? (
              <Pressable
                style={[cS.primaryBtn, { backgroundColor: C.blue }]}
                onPress={() => vm.openDrawModal(item)}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <ActivityIndicator size="small" color={C.white} />
                ) : (
                  <>
                    <Text style={cS.primaryBtnIcon}>🎲</Text>
                    <Text style={cS.primaryBtnText}>Draw Winner</Text>
                  </>
                )}
              </Pressable>
            ) : (
              <View style={[cS.primaryBtn, { backgroundColor: C.darkGray, opacity: 0.55 }]}>
                <Text style={cS.primaryBtnIcon}>🚫</Text>
                <Text style={cS.primaryBtnText}>No Entries</Text>
              </View>
            )}
            <View style={cS.actionRow}>
              <Pressable
                style={cS.secondaryBtn}
                onPress={() => router.push(`/(tabs)/admin/edit-giveaway/${item.id}` as any)}
              >
                <Text style={cS.secondaryBtnText}>Edit</Text>
              </Pressable>
              <Pressable
                style={cS.iconBtn}
                onPress={() => vm.archiveGiveaway(item.id)}
                disabled={isProcessing}
              >
                <Text style={cS.iconBtnText}>🗄️  Archive</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* AWARDED */}
        {item.status === "awarded" && (
          <View style={cS.actionCol}>
            <Pressable
              style={[cS.primaryBtn, { backgroundColor: C.purple }]}
              onPress={() => vm.openWinnerDetailsModal(item)}
            >
              <Text style={cS.primaryBtnIcon}>🏆</Text>
              <Text style={cS.primaryBtnText}>View Winner</Text>
            </Pressable>
            <View style={cS.actionRow}>
              <Pressable
                style={cS.secondaryBtn}
                onPress={() => router.push(`/(tabs)/admin/edit-giveaway/${item.id}` as any)}
              >
                <Text style={cS.secondaryBtnText}>Edit</Text>
              </Pressable>
              <Pressable
                style={cS.iconBtn}
                onPress={() => vm.archiveGiveaway(item.id)}
                disabled={isProcessing}
              >
                <Text style={cS.iconBtnText}>🗄️  Archive</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* ARCHIVED */}
        {item.status === "archived" && (
          <View style={cS.actionRow}>
            <Pressable
              style={[cS.secondaryBtn, { flex: 1, borderColor: C.teal + "55", backgroundColor: C.tealDim }]}
              onPress={() => vm.restoreGiveaway(item.id)}
              disabled={isProcessing}
            >
              <Text style={[cS.secondaryBtnText, { color: C.teal }]}>
                {isProcessing ? "Restoring…" : "↩  Restore"}
              </Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  };

  // ── Giveaways tab ──────────────────────────────────────────────────────────
  const renderGiveawaysTab = () => (
    <>
      <View style={s.searchBox}>
        <Ionicons name="search" size={16} color={C.gray} />
        <TextInput
          style={s.searchInput}
          placeholder="Search giveaways..."
          placeholderTextColor={C.gray}
          value={vm.searchQuery}
          onChangeText={vm.setSearchQuery}
        />
        {vm.searchQuery.length > 0 && (
          <Pressable onPress={() => vm.setSearchQuery("")}>
            <Ionicons name="close-circle" size={18} color={C.gray} />
          </Pressable>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={s.filterRow}
      >
        {STATUS_FILTERS.map((f) => {
          const active = vm.statusFilter === f.value;
          const sc = f.value !== "all" ? statusConfig(f.value) : null;
          return (
            <Pressable
              key={f.value}
              style={[
                s.filterChip,
                active && sc
                  ? { backgroundColor: sc.dim, borderColor: sc.border }
                  : active
                  ? { backgroundColor: C.blueDim, borderColor: C.blueBorder }
                  : {},
              ]}
              onPress={() => vm.setStatusFilter(f.value)}
            >
              <Text
                style={[
                  s.filterText,
                  active && sc
                    ? { color: sc.color, fontWeight: "700" }
                    : active
                    ? { color: C.blue, fontWeight: "700" }
                    : {},
                ]}
              >
                {f.label}
                {vm.statusCounts[f.value] > 0 ? ` (${vm.statusCounts[f.value]})` : ""}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {vm.loading ? (
        <View style={s.loadingBox}>
          <ActivityIndicator size="large" color={C.blue} />
        </View>
      ) : vm.giveaways.length === 0 ? (
        <View style={s.emptyState}>
          <Ionicons name="gift-outline" size={52} color={C.darkGray} />
          <Text style={s.emptyTitle}>No Giveaways</Text>
          <Text style={s.emptySubtitle}>
            {vm.statusFilter === "all"
              ? "Create your first giveaway to get started"
              : `No ${vm.statusFilter} giveaways`}
          </Text>
        </View>
      ) : (
        <FlatList
          data={vm.giveaways}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderGiveawayCard}
          contentContainerStyle={[s.listContent, isWeb && s.listContentWeb]}
          refreshControl={
            isWeb ? undefined : (
              <RefreshControl refreshing={vm.refreshing} onRefresh={vm.onRefresh} tintColor={C.blue} />
            )
          }
        />
      )}
    </>
  );

  // ── Manage tab ─────────────────────────────────────────────────────────────
  const renderManageTab = () => (
    <ScrollView
      contentContainerStyle={s.manageContent}
      refreshControl={
        isWeb ? undefined : (
          <RefreshControl refreshing={vm.refreshing} onRefresh={vm.onRefresh} tintColor={C.blue} />
        )
      }
    >
      <Text style={s.sectionTitle}>Quick Actions</Text>
      {[
        { icon: "➕", label: "Create New Giveaway",   route: "/(tabs)/admin/create-giveaway"      },
        { icon: "👥", label: "View All Participants", route: "/(tabs)/admin/giveaway-participants" },
        { icon: "🏆", label: "Past Winners",          route: "/(tabs)/admin/giveaway-past-winners" },
      ].map((item) => (
        <Pressable key={item.label} style={s.quickBtn} onPress={() => router.push(item.route as any)}>
          <Text style={s.quickBtnIcon}>{item.icon}</Text>
          <Text style={s.quickBtnText}>{item.label}</Text>
          <Ionicons name="chevron-forward" size={18} color={C.gray} />
        </Pressable>
      ))}

      <Text style={[s.sectionTitle, { marginTop: SP.xxl }]}>Overview</Text>
      <View style={s.statsGrid}>
        {[
          { value: vm.stats.activeCount,                                   label: "Active\nGiveaways",  color: C.green  },
          { value: vm.stats.totalEntries,                                  label: "Total\nEntries",     color: C.white  },
          { value: `$${vm.stats.totalPrizeValue?.toLocaleString() || "0"}`, label: "Active Prize\nValue", color: C.amber },
        ].map((stat) => (
          <View key={stat.label} style={s.statCard}>
            <Text style={[s.statValue, { color: stat.color }]}>{stat.value}</Text>
            <Text style={s.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>
      <View style={s.statsGrid}>
        {[
          { value: vm.stats.totalGiveaways,                                label: "Total\nGiveaways",   color: C.white  },
          { value: `$${vm.stats.totalAwarded?.toLocaleString() || "0"}`,   label: "Total\nAwarded",     color: C.green  },
          { value: vm.stats.activeCount,                                   label: "Currently\nActive",  color: C.teal   },
        ].map((stat) => (
          <View key={stat.label} style={s.statCard}>
            <Text style={[s.statValue, { color: stat.color }]}>{stat.value}</Text>
            <Text style={s.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Pressable style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={C.blue} />
          <Text style={s.backText}>Back</Text>
        </Pressable>
        <Text style={s.headerTitle}>GIVEAWAY MANAGEMENT</Text>
        <View style={{ width: 70 }} />
      </View>

      <View style={s.tabBar}>
        {(["giveaways", "manage"] as const).map((tab) => (
          <Pressable
            key={tab}
            style={[s.tab, vm.activeTab === tab && s.tabActive]}
            onPress={() => vm.setActiveTab(tab)}
          >
            <Text style={[s.tabText, vm.activeTab === tab && s.tabTextActive]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      {vm.activeTab === "giveaways" ? renderGiveawaysTab() : renderManageTab()}

      {/* ════════════════════════════════════════════════════════════════════
          MODAL 0 — End Early confirmation (NEW)
      ════════════════════════════════════════════════════════════════════ */}
      <Modal visible={!!endEarlyTarget} transparent animationType="fade" onRequestClose={closeEndEarlyModal}>
        <Pressable style={m.overlay} onPress={closeEndEarlyModal}>
          <Pressable style={m.card} onPress={(e) => e.stopPropagation()}>
            <View style={[m.iconCircle, { backgroundColor: C.redDim, borderColor: C.redBorder }]}>
              <Text style={{ fontSize: 32 }}>⏹️</Text>
            </View>
            <Text style={[m.title, { color: C.red }]}>End Giveaway Early?</Text>
            <Text style={m.giveawayName}>{endEarlyTarget?.name}</Text>
            <Text style={m.bodyNote}>
              This will immediately close the giveaway and prevent any further entries.
              {"\n\n"}
              <Text style={{ color: C.red, fontWeight: "700" }}>
                This action cannot be undone.
              </Text>
            </Text>
            <View style={m.btnRow}>
              <Pressable style={m.cancelBtn} onPress={closeEndEarlyModal} disabled={endingEarly}>
                <Text style={m.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[m.confirmBtn, { backgroundColor: C.red }, endingEarly && m.btnDisabled]}
                onPress={confirmEndEarly}
                disabled={endingEarly}
              >
                {endingEarly ? (
                  <ActivityIndicator size="small" color={C.white} />
                ) : (
                  <Text style={m.confirmBtnText}>End Giveaway</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ════════════════════════════════════════════════════════════════════
          MODAL 1 — Draw Winner confirmation
      ════════════════════════════════════════════════════════════════════ */}
      <Modal visible={vm.drawModalVisible} transparent animationType="fade" onRequestClose={vm.closeDrawModal}>
        <Pressable style={m.overlay} onPress={vm.closeDrawModal}>
          <Pressable style={m.card} onPress={(e) => e.stopPropagation()}>
            <View style={[m.iconCircle, { backgroundColor: C.blueDim, borderColor: C.blueBorder }]}>
              <Text style={{ fontSize: 32 }}>🎲</Text>
            </View>
            <Text style={m.title}>Draw Winner?</Text>
            <Text style={m.giveawayName}>{vm.selectedGiveaway?.name}</Text>

            <View style={[m.infoCard, { borderColor: C.blueBorder, backgroundColor: C.blueDim }]}>
              <Text style={m.infoCardLabel}>Eligible entries</Text>
              <Text style={[m.infoCardValue, { color: C.blue }]}>
                {vm.selectedGiveaway?.entry_count || 0}
              </Text>
            </View>

            {(vm.selectedGiveaway?.entry_count || 0) === 0 && (
              <View style={[m.warnBox, { borderColor: C.redBorder, backgroundColor: C.redDim }]}>
                <Text style={[m.warnText, { color: C.red }]}>
                  ⚠️  No entries — cannot draw a winner.
                </Text>
              </View>
            )}

            {/* Error feedback — shown when drawWinner fails */}
            {vm.drawError ? (
              <View style={[m.warnBox, { borderColor: C.redBorder, backgroundColor: C.redDim, marginBottom: SP.md }]}>
                <Text style={[m.warnText, { color: C.red }]}>
                  ❌  {vm.drawError}
                </Text>
              </View>
            ) : null}

            <Text style={m.bodyNote}>
              A winner will be randomly selected from all eligible entries and notified instantly.{"\n\n"}
              <Text style={{ color: C.red, fontWeight: "700" }}>
                This action cannot be undone.
              </Text>
            </Text>

            <View style={m.btnRow}>
              <Pressable style={m.cancelBtn} onPress={vm.closeDrawModal}>
                <Text style={m.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  m.confirmBtn,
                  { backgroundColor: C.blue },
                  (vm.processing !== null || (vm.selectedGiveaway?.entry_count || 0) === 0) && m.btnDisabled,
                ]}
                onPress={() => vm.selectedGiveaway && vm.drawWinner(vm.selectedGiveaway.id)}
                disabled={vm.processing !== null || (vm.selectedGiveaway?.entry_count || 0) === 0}
              >
                {vm.processing !== null ? (
                  <ActivityIndicator size="small" color={C.white} />
                ) : (
                  <Text style={m.confirmBtnText}>Draw Winner 🎲</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ════════════════════════════════════════════════════════════════════
          MODAL 2 — Winner reveal
      ════════════════════════════════════════════════════════════════════ */}
      <Modal visible={vm.winnerModalVisible} transparent animationType="fade" onRequestClose={vm.closeWinnerModal}>
        <View style={m.overlay}>
          <View style={[m.card, { borderColor: C.goldBorder }]}>
            <View style={[m.iconCircle, { backgroundColor: C.goldDim, borderColor: C.goldBorder }]}>
              <Text style={{ fontSize: 36 }}>🏆</Text>
            </View>
            <Text style={[m.title, { color: C.gold }]}>Winner Selected!</Text>
            <Text style={m.giveawayName}>{vm.selectedGiveaway?.name}</Text>

            {vm.drawnWinner && (
              <View style={[m.winnerCard, { borderColor: C.goldBorder, backgroundColor: C.goldDim }]}>
                <Text style={m.winnerCardName}>{vm.drawnWinner.name}</Text>
                <View style={m.winnerCardDivider} />
                {[
                  { icon: "🪪", label: "Profile ID", value: `#${vm.drawnWinner.user_id}`, color: C.gold },
                  { icon: "✉️", label: "Email",      value: vm.drawnWinner.email,          color: C.lightGray },
                  { icon: "📞", label: "Phone",      value: vm.drawnWinner.phone,          color: C.lightGray },
                ].map((row) => (
                  <View key={row.label} style={m.winnerDetailRow}>
                    <Text style={m.winnerDetailIcon}>{row.icon}</Text>
                    <Text style={m.winnerDetailLabel}>{row.label}</Text>
                    <Text style={[m.winnerDetailValue, { color: row.color }]}>{row.value}</Text>
                  </View>
                ))}
              </View>
            )}

            <Text style={m.bodyNote}>
              The winner has been notified via push notification.
            </Text>
            <Pressable
              style={[m.confirmBtn, { backgroundColor: C.green, width: "100%" }]}
              onPress={vm.closeWinnerModal}
            >
              <Text style={[m.confirmBtnText, { color: "#000000" }]}>Done ✓</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ════════════════════════════════════════════════════════════════════
          MODAL 3 — Winner details (awarded giveaways)
      ════════════════════════════════════════════════════════════════════ */}
      <Modal visible={vm.winnerDetailsModalVisible} transparent animationType="fade" onRequestClose={vm.closeWinnerDetailsModal}>
        <Pressable style={m.overlay} onPress={vm.closeWinnerDetailsModal}>
          <Pressable style={[m.card, { maxHeight: "80%" as any }]} onPress={(e) => e.stopPropagation()}>
            <Text style={m.title}>🏆  Winner Details</Text>
            <Text style={m.giveawayName}>{vm.selectedGiveaway?.name}</Text>

            {vm.loadingWinnerDetails ? (
              <ActivityIndicator size="large" color={C.blue} style={{ marginVertical: SP.xl }} />
            ) : vm.currentWinner ? (
              <ScrollView style={{ width: "100%" }} showsVerticalScrollIndicator={false}>
                <View style={[m.winnerCard, { borderColor: C.purple + "50", backgroundColor: C.purpleDim }]}>
                  <Text style={m.winnerCardName}>{vm.currentWinner.name}</Text>
                  <View style={m.winnerCardDivider} />
                  {[
                    { icon: "🪪", label: "Profile ID", value: `#${vm.currentWinner.user_id}`, color: C.purple },
                    { icon: "✉️", label: "Email",      value: vm.currentWinner.email,          color: C.lightGray },
                    { icon: "📞", label: "Phone",      value: vm.currentWinner.phone,          color: C.lightGray },
                    { icon: "🕐", label: "Drawn",      value: new Date(vm.currentWinner.drawn_at).toLocaleDateString(), color: C.lightGray },
                  ].map((row) => (
                    <View key={row.label} style={m.winnerDetailRow}>
                      <Text style={m.winnerDetailIcon}>{row.icon}</Text>
                      <Text style={m.winnerDetailLabel}>{row.label}</Text>
                      <Text style={[m.winnerDetailValue, { color: row.color }]}>{row.value}</Text>
                    </View>
                  ))}
                </View>

                <View style={[m.infoCard, { borderColor: C.blueBorder, backgroundColor: C.blueDim, marginBottom: SP.md }]}>
                  <Text style={m.infoCardLabel}>Eligible for redraw</Text>
                  <Text style={[m.infoCardValue, { color: C.blue }]}>{vm.eligibleCount}</Text>
                </View>

                {vm.winnerHistory.length > 1 && (
                  <View style={m.historyBox}>
                    <Text style={m.historyTitle}>Draw History</Text>
                    {vm.winnerHistory.map((r) => (
                      <Text key={r.id} style={m.historyItem}>
                        {r.status === "disqualified" ? "❌" : "✅"}{" "}
                        {r.user_name} — {new Date(r.drawn_at).toLocaleDateString()}
                        {r.status === "disqualified" && r.disqualified_reason
                          ? `\n   ↳ ${r.disqualified_reason}` : ""}
                      </Text>
                    ))}
                  </View>
                )}
              </ScrollView>
            ) : (
              <Text style={m.bodyNote}>No winner on record.</Text>
            )}

            <View style={[m.btnRow, { marginTop: SP.md }]}>
              <Pressable style={m.cancelBtn} onPress={vm.closeWinnerDetailsModal}>
                <Text style={m.cancelBtnText}>Close</Text>
              </Pressable>
              {vm.currentWinner && vm.eligibleCount > 0 && (
                <Pressable
                  style={[m.confirmBtn, { backgroundColor: C.amber }]}
                  onPress={vm.openRedrawModal}
                >
                  <Text style={m.confirmBtnText}>Redraw</Text>
                </Pressable>
              )}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ════════════════════════════════════════════════════════════════════
          MODAL 4 — Redraw confirm
      ════════════════════════════════════════════════════════════════════ */}
      <Modal visible={vm.redrawModalVisible} transparent animationType="fade" onRequestClose={vm.closeRedrawModal}>
        <Pressable style={m.overlay} onPress={vm.closeRedrawModal}>
          <Pressable style={m.card} onPress={(e) => e.stopPropagation()}>
            <View style={[m.iconCircle, { backgroundColor: C.amberDim, borderColor: C.amberBorder }]}>
              <Text style={{ fontSize: 32 }}>🔄</Text>
            </View>
            <Text style={[m.title, { color: C.amber }]}>Redraw Winner</Text>
            <Text style={m.bodyNote}>
              The current winner will be disqualified and a new winner drawn from the remaining{" "}
              <Text style={{ color: C.white, fontWeight: "700" }}>{vm.eligibleCount}</Text>{" "}
              eligible {vm.eligibleCount === 1 ? "entry" : "entries"}.
            </Text>

            <Text style={m.fieldLabel}>
              Reason for disqualification <Text style={{ color: C.red }}>*</Text>
            </Text>
            <TextInput
              style={m.reasonInput}
              value={vm.redrawReason}
              onChangeText={vm.setRedrawReason}
              placeholder="e.g. Winner did not respond within 7 days"
              placeholderTextColor={C.gray}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              editable={!vm.redrawing}
            />

            {vm.redrawError ? (
              <View style={[m.warnBox, { borderColor: C.redBorder, backgroundColor: C.redDim, marginBottom: SP.md }]}>
                <Text style={[m.warnText, { color: C.red }]}>
                  ❌  {vm.redrawError}
                </Text>
              </View>
            ) : null}

            <View style={m.btnRow}>
              <Pressable style={m.cancelBtn} onPress={vm.closeRedrawModal} disabled={vm.redrawing}>
                <Text style={m.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  m.confirmBtn,
                  { backgroundColor: C.amber },
                  (!vm.redrawReason.trim() || vm.redrawing) && m.btnDisabled,
                ]}
                onPress={vm.handleRedrawWinner}
                disabled={!vm.redrawReason.trim() || vm.redrawing}
              >
                {vm.redrawing ? (
                  <ActivityIndicator size="small" color={C.white} />
                ) : (
                  <Text style={m.confirmBtnText}>Confirm Redraw</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Card styles
// ─────────────────────────────────────────────────────────────────────────────
const cS = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: SP.lg,
    marginBottom: SP.md,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  activeCardShadow: {
    shadowColor: C.green,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SP.md,
  },
  nameRow: { flexDirection: "row", alignItems: "center", flex: 1, marginRight: SP.sm },
  name: { color: C.offWhite, fontSize: FS.lg, fontWeight: "700", flex: 1 },
  badge: {
    borderRadius: 8,
    paddingHorizontal: SP.sm,
    paddingVertical: SP.xs + 1,
    borderWidth: 1,
  },
  badgeText: { fontSize: FS.xs, fontWeight: "700", letterSpacing: 0.3 },

  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: SP.sm, marginBottom: SP.md },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 8,
    paddingVertical: SP.xs + 2,
    paddingHorizontal: SP.sm + 2,
    gap: SP.xs,
    borderWidth: 1,
  },
  chipIcon: { fontSize: 13 },
  chipText: { fontSize: FS.sm, fontWeight: "600" },

  winnerRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.goldDim,
    borderRadius: 8,
    padding: SP.sm,
    marginBottom: SP.sm,
    gap: SP.xs,
    borderWidth: 1,
    borderColor: C.goldBorder,
  },
  winnerIcon: { fontSize: 14 },
  winnerName: { color: C.gold, fontSize: FS.sm, fontWeight: "700", flex: 1 },

  divider: { height: 1, backgroundColor: C.cardBorder, marginVertical: SP.sm },

  actionRow: { flexDirection: "row", gap: SP.sm },
  actionCol: { gap: SP.sm },

  primaryBtn: {
    flexDirection: "row",
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
    gap: SP.sm,
  },
  primaryBtnIcon: { fontSize: FS.lg },
  primaryBtnText: { color: C.white, fontSize: FS.md, fontWeight: "700" },

  secondaryBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: SP.md - 1,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.cardBorder,
    backgroundColor: C.cardRaised,
  },
  secondaryBtnText: { color: C.lightGray, fontSize: FS.sm, fontWeight: "600" },

  // End Early: slightly muted border, no fill
  endEarlyBtn: {
    borderColor: C.red + "40",
    backgroundColor: C.redDim,
  },

  iconBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: SP.md - 1,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.cardBorder,
    backgroundColor: C.cardRaised,
  },
  iconBtnText: { color: C.gray, fontSize: FS.sm, fontWeight: "500" },
});

// ─────────────────────────────────────────────────────────────────────────────
// Screen styles
// ─────────────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: {
    ...Platform.select({ web: { maxWidth: 860, width: "100%" as any, alignSelf: "center" as any } }),
    flex: 1,
    backgroundColor: C.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 60,
    paddingHorizontal: SP.lg,
    paddingBottom: SP.md,
  },
  backBtn: { flexDirection: "row", alignItems: "center", width: 70 },
  backText: { color: C.blue, fontSize: FS.md },
  headerTitle: { color: C.white, fontSize: FS.lg, fontWeight: "700", textAlign: "center" },

  tabBar: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.cardBorder },
  tab: { flex: 1, alignItems: "center", paddingVertical: SP.md, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabActive: { borderBottomColor: C.blue },
  tabText: { color: C.gray, fontSize: FS.md, fontWeight: "600" },
  tabTextActive: { color: C.blue },

  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.card,
    borderRadius: 10,
    marginHorizontal: SP.lg,
    marginTop: SP.lg,
    paddingHorizontal: SP.md,
    height: 40,
    borderWidth: 1,
    borderColor: C.cardBorder,
    gap: SP.sm,
  },
  searchInput: { flex: 1, color: C.white, fontSize: FS.sm },

  filterRow: { paddingHorizontal: SP.lg, paddingVertical: SP.md, gap: SP.sm, alignItems: "center" },
  filterChip: {
    backgroundColor: C.card,
    borderRadius: 20,
    paddingHorizontal: SP.lg,
    paddingVertical: SP.sm,
    borderWidth: 1,
    borderColor: C.cardBorder,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  filterText: { color: C.gray, fontSize: FS.sm },

  listContent: { paddingHorizontal: SP.lg, paddingBottom: 100 },
  listContentWeb: { alignItems: "center", paddingBottom: SP.xl },

  loadingBox: { flex: 1, justifyContent: "center", alignItems: "center", paddingTop: 80 },
  emptyState: { alignItems: "center", justifyContent: "center", paddingTop: 80, gap: SP.sm },
  emptyTitle: { color: C.white, fontSize: FS.lg, fontWeight: "600", marginTop: SP.md },
  emptySubtitle: { color: C.gray, fontSize: FS.sm, textAlign: "center" },

  manageContent: { padding: SP.lg, paddingBottom: 100 },
  sectionTitle: { color: C.white, fontSize: FS.lg, fontWeight: "700", marginBottom: SP.md },

  quickBtn: {
    backgroundColor: C.card,
    borderRadius: 14,
    padding: SP.lg,
    marginBottom: SP.md,
    flexDirection: "row",
    alignItems: "center",
    gap: SP.md,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  quickBtnIcon: { fontSize: FS.xl, width: 30, textAlign: "center" },
  quickBtnText: { color: C.white, fontSize: FS.md, fontWeight: "600", flex: 1 },

  statsGrid: { flexDirection: "row", gap: SP.md, marginBottom: SP.md },
  statCard: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: 12,
    padding: SP.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.cardBorder,
    gap: SP.xs,
  },
  statValue: { fontSize: FS.xl, fontWeight: "700" },
  statLabel: { color: C.gray, fontSize: FS.xs, textAlign: "center" },
});

// ─────────────────────────────────────────────────────────────────────────────
// Modal styles
// ─────────────────────────────────────────────────────────────────────────────
const m = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
    padding: SP.lg,
  },
  card: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: "#0D0D10",
    borderRadius: 20,
    padding: SP.xl,
    borderWidth: 1,
    borderColor: C.cardBorder,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.7,
    shadowRadius: 24,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SP.md,
    borderWidth: 1,
  },
  title: { fontSize: FS.xl, fontWeight: "700", color: C.white, marginBottom: SP.xs, textAlign: "center" },
  giveawayName: { fontSize: FS.md, color: C.lightGray, textAlign: "center", marginBottom: SP.lg, fontWeight: "500" },

  infoCard: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderRadius: 12,
    padding: SP.md,
    marginBottom: SP.md,
    borderWidth: 1,
  },
  infoCardLabel: { color: C.gray, fontSize: FS.sm },
  infoCardValue: { fontSize: FS.xl, fontWeight: "700" },

  warnBox: { width: "100%", borderRadius: 10, padding: SP.md, marginBottom: SP.md, borderWidth: 1 },
  warnText: { fontSize: FS.sm, fontWeight: "600", textAlign: "center" },

  bodyNote: {
    color: C.gray,
    fontSize: FS.sm,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: SP.lg,
    width: "100%",
  },

  winnerCard: {
    width: "100%",
    borderRadius: 14,
    padding: SP.lg,
    marginBottom: SP.md,
    borderWidth: 1,
    gap: SP.sm,
  },
  winnerCardName: { color: C.white, fontSize: FS.xl, fontWeight: "700", textAlign: "center" },
  winnerCardDivider: { height: 1, backgroundColor: C.cardBorder },
  winnerDetailRow: { flexDirection: "row", alignItems: "center", gap: SP.sm },
  winnerDetailIcon: { fontSize: 15, width: 22, textAlign: "center" },
  winnerDetailLabel: { color: C.gray, fontSize: FS.sm, width: 70 },
  winnerDetailValue: { fontSize: FS.sm, fontWeight: "600", flex: 1 },

  historyBox: {
    width: "100%",
    backgroundColor: C.card,
    borderRadius: 10,
    padding: SP.md,
    marginBottom: SP.md,
    borderWidth: 1,
    borderColor: C.cardBorder,
    gap: SP.xs,
  },
  historyTitle: { color: C.gray, fontSize: FS.xs, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: SP.xs },
  historyItem: { color: C.lightGray, fontSize: FS.sm, lineHeight: 20 },

  fieldLabel: { color: C.lightGray, fontSize: FS.sm, fontWeight: "500", marginBottom: SP.sm, alignSelf: "flex-start" },
  reasonInput: {
    width: "100%",
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.cardBorder,
    borderRadius: 10,
    paddingVertical: SP.md,
    paddingHorizontal: SP.md,
    color: C.white,
    fontSize: FS.md,
    minHeight: 80,
    textAlignVertical: "top",
    marginBottom: SP.lg,
  },

  btnRow: { flexDirection: "row", gap: SP.md, width: "100%" },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: { color: C.lightGray, fontSize: FS.md, fontWeight: "600" },
  confirmBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmBtnText: { color: C.white, fontSize: FS.md, fontWeight: "700" },
  btnDisabled: { opacity: 0.35 },
});
