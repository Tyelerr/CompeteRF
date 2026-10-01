import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
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
import { moderateScale, scale } from "../../../src/utils/scaling";
import { GiveawayAdminModals } from "../../../src/views/components/giveaway/GiveawayAdminModals";
import { GiveawayConsoleScreen } from "../../../src/views/screens/admin/giveaway-console/giveaway-console.screen";

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
  { label: "Draft",    value: "draft"    },
  { label: "Active",   value: "active"   },
  { label: "Ended",    value: "ended"    },
  { label: "Awarded",  value: "awarded"  },
  { label: "Archived", value: "archived" },
  { label: "Cancelled", value: "cancelled" },
  { label: "All",      value: "all"      },
];

function statusConfig(status: string) {
  switch (status) {
    case "draft":    return { color: C.blue,   dim: C.blueDim,   border: C.blueBorder,   label: "Draft"    };
    case "active":   return { color: C.green,  dim: C.greenDim,  border: C.greenBorder,  label: "Active"   };
    case "ended":    return { color: C.amber,  dim: C.amberDim,  border: C.amberBorder,  label: "Ended"    };
    case "awarded":  return { color: C.purple, dim: C.purpleDim, border: C.purple + "50", label: "Awarded"  };
    case "archived": return { color: C.gray,   dim: C.darkGray,  border: C.darkGray,      label: "Archived" };
    case "cancelled": return { color: C.red,   dim: C.redDim,    border: C.redBorder,     label: "Cancelled" };
    default:         return { color: C.gray,   dim: C.darkGray,  border: C.darkGray,      label: status     };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PulseDot – animated green dot for active cards
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
        width: scale(8),
        height: scale(8),
        borderRadius: scale(4),
        backgroundColor: C.greenBright,
        opacity: anim,
        marginRight: scale(SP.xs),
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
// Web/desktop gets the admin console (table + stat strip + detail drawer); native keeps this
// screen exactly as it was. Platform.OS is fixed per bundle, so the branch never flips.
export default function GiveawayManagementScreen() {
  return isWeb ? <GiveawayConsoleScreen /> : <NativeGiveawayManagementScreen />;
}

function NativeGiveawayManagementScreen() {
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
    const isWallet   = item.entry_mode === "wallet";
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
            <Text allowFontScaling={false} style={cS.name} numberOfLines={1}>{item.name}</Text>
          </View>
          <View style={[cS.badge, { backgroundColor: sc.dim, borderColor: sc.border }]}>
            <Text allowFontScaling={false} style={[cS.badgeText, { color: sc.color }]}>{sc.label}</Text>
          </View>
        </View>

        {/* Stats chips */}
        <View style={cS.statsRow}>
          {/* Prize value – green tint */}
          <View style={[cS.chip, { backgroundColor: C.greenDim, borderColor: C.greenBorder }]}>
            <Text allowFontScaling={false} style={cS.chipIcon}>💰</Text>
            <Text allowFontScaling={false} style={[cS.chipText, { color: C.green }]}>
              ${item.prize_value?.toLocaleString() || "0"}
            </Text>
          </View>

          {/* Entries – blue tint, friendly zero state */}
          <View style={[cS.chip, {
            backgroundColor: hasEntries ? C.blueDim : C.cardRaised,
            borderColor: hasEntries ? C.blueBorder : C.cardBorder,
          }]}>
            <Text allowFontScaling={false} style={cS.chipIcon}>👥</Text>
            <Text allowFontScaling={false} style={[cS.chipText, { color: hasEntries ? C.blue : C.gray }]}>
              {hasEntries
                ? `${entryCount}${item.max_entries ? ` / ${item.max_entries}` : ""} entries`
                : "No entries yet"}
            </Text>
          </View>

          {/* Entry method – wallet giveaways only (legacy cards unchanged) */}
          {isWallet && (
            <View style={[cS.chip, { backgroundColor: C.purpleDim, borderColor: C.purple + "50" }]}>
              <Text allowFontScaling={false} style={cS.chipIcon}>🎟</Text>
              <Text allowFontScaling={false} style={[cS.chipText, { color: C.purple }]}>
                Giveaway Entries · max {item.per_user_max}/user
              </Text>
            </View>
          )}

          {/* Time – neutral */}
          {item.end_date && (
            <View style={[cS.chip, { backgroundColor: C.cardRaised, borderColor: C.cardBorder }]}>
              <Text allowFontScaling={false} style={cS.chipIcon}>📅</Text>
              <Text allowFontScaling={false} style={[cS.chipText, { color: C.lightGray }]}>
                {vm.getDaysRemaining(item.end_date)}
              </Text>
            </View>
          )}
        </View>

        {/* Winner row */}
        {item.status === "awarded" && item.winner_name && (
          <View style={cS.winnerRow}>
            <Text allowFontScaling={false} style={cS.winnerIcon}>🏆</Text>
            <Text allowFontScaling={false} style={cS.winnerName}>{item.winner_name}</Text>
          </View>
        )}

        <View style={cS.divider} />

        {/* ── Actions ──────────────────────────────────────────────────────── */}

        {/* DRAFT — not public, no entries, no notifications until Publish */}
        {item.status === "draft" && (
          <View style={cS.actionCol}>
            <Pressable
              style={[cS.primaryBtn, { backgroundColor: C.blue }]}
              onPress={() => vm.openPublishModal(item)}
              disabled={isProcessing}
            >
              <Text allowFontScaling={false} style={cS.primaryBtnIcon}>📣</Text>
              <Text allowFontScaling={false} style={cS.primaryBtnText}>Publish Giveaway</Text>
            </Pressable>
            <View style={cS.actionRow}>
              <Pressable
                style={cS.secondaryBtn}
                onPress={() => router.push(`/(tabs)/admin/edit-giveaway/${item.id}` as any)}
              >
                <Text allowFontScaling={false} style={cS.secondaryBtnText}>Edit</Text>
              </Pressable>
              <Pressable style={cS.iconBtn} onPress={() => vm.archiveGiveaway(item.id)} disabled={isProcessing}>
                <Text allowFontScaling={false} style={cS.iconBtnText}>🗄️  Archive</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* ACTIVE */}
        {item.status === "active" && (
          <View style={cS.actionRow}>
            <Pressable
              style={cS.secondaryBtn}
              onPress={() => router.push(`/(tabs)/admin/edit-giveaway/${item.id}` as any)}
            >
              <Text allowFontScaling={false} style={cS.secondaryBtnText}>Edit</Text>
            </Pressable>
            {/* End Early / End Giveaway – destructive, muted styling */}
            <Pressable
              style={[cS.secondaryBtn, cS.endEarlyBtn]}
              onPress={() => openEndEarlyModal(item)}
              disabled={isProcessing}
            >
              <Text allowFontScaling={false} style={[cS.secondaryBtnText, { color: C.red }]}>
                {isProcessing
                  ? "Ending…"
                  : item.max_entries && entryCount >= item.max_entries
                  ? "End Giveaway"
                  : "End Early"}
              </Text>
            </Pressable>
          </View>
        )}
        {item.status === "active" && isWallet && (
          <View style={[cS.actionRow, { marginTop: scale(SP.sm) }]}>
            <Pressable style={[cS.secondaryBtn, cS.endEarlyBtn, { flex: 1 }]} onPress={() => vm.openCancelModal(item)} disabled={isProcessing}>
              <Text allowFontScaling={false} style={[cS.secondaryBtnText, { color: C.red }]}>Cancel & Refund</Text>
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
                    <Text allowFontScaling={false} style={cS.primaryBtnIcon}>🎲</Text>
                    <Text allowFontScaling={false} style={cS.primaryBtnText}>Draw Winner</Text>
                  </>
                )}
              </Pressable>
            ) : (
              <View style={[cS.primaryBtn, { backgroundColor: C.darkGray, opacity: 0.55 }]}>
                <Text allowFontScaling={false} style={cS.primaryBtnIcon}>🚫</Text>
                <Text allowFontScaling={false} style={cS.primaryBtnText}>No Entries</Text>
              </View>
            )}
            <View style={cS.actionRow}>
              <Pressable
                style={cS.secondaryBtn}
                onPress={() => router.push(`/(tabs)/admin/edit-giveaway/${item.id}` as any)}
              >
                <Text allowFontScaling={false} style={cS.secondaryBtnText}>Edit</Text>
              </Pressable>
              {isWallet && hasEntries ? (
                // Spent entries must be drawn or refunded — never archived away.
                <Pressable style={[cS.secondaryBtn, cS.endEarlyBtn]} onPress={() => vm.openCancelModal(item)} disabled={isProcessing}>
                  <Text allowFontScaling={false} style={[cS.secondaryBtnText, { color: C.red }]}>Cancel & Refund</Text>
                </Pressable>
              ) : (
                <Pressable
                  style={cS.iconBtn}
                  onPress={() => vm.archiveGiveaway(item.id)}
                  disabled={isProcessing}
                >
                  <Text allowFontScaling={false} style={cS.iconBtnText}>🗄️  Archive</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}

        {/* CANCELLED (wallet) — final; entries refunded, records kept */}
        {item.status === "cancelled" && (
          <View style={cS.winnerRow}>
            <Text allowFontScaling={false} style={cS.winnerIcon}>↩</Text>
            <Text allowFontScaling={false} style={[cS.winnerName, { color: C.lightGray }]} numberOfLines={2}>
              Cancelled — entries refunded{item.cancel_reason ? ` · ${item.cancel_reason}` : ""}
            </Text>
          </View>
        )}

        {/* AWARDED */}
        {item.status === "awarded" && (
          <View style={cS.actionCol}>
            <Pressable
              style={[cS.primaryBtn, { backgroundColor: C.purple }]}
              onPress={() => vm.openWinnerDetailsModal(item)}
            >
              <Text allowFontScaling={false} style={cS.primaryBtnIcon}>🏆</Text>
              <Text allowFontScaling={false} style={cS.primaryBtnText}>View Winner</Text>
            </Pressable>
            <View style={cS.actionRow}>
              <Pressable
                style={cS.secondaryBtn}
                onPress={() => router.push(`/(tabs)/admin/edit-giveaway/${item.id}` as any)}
              >
                <Text allowFontScaling={false} style={cS.secondaryBtnText}>Edit</Text>
              </Pressable>
              <Pressable
                style={cS.iconBtn}
                onPress={() => vm.archiveGiveaway(item.id)}
                disabled={isProcessing}
              >
                <Text allowFontScaling={false} style={cS.iconBtnText}>🗄️  Archive</Text>
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
              <Text allowFontScaling={false} style={[cS.secondaryBtnText, { color: C.teal }]}>
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
                allowFontScaling={false}
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
          <Text allowFontScaling={false} style={s.emptyTitle}>No Giveaways</Text>
          <Text allowFontScaling={false} style={s.emptySubtitle}>
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
      <Text allowFontScaling={false} style={s.sectionTitle}>Quick Actions</Text>
      {[
        { icon: "➕", label: "Create New Giveaway",   route: "/(tabs)/admin/create-giveaway"      },
        { icon: "👥", label: "View All Participants", route: "/(tabs)/admin/giveaway-participants" },
        { icon: "🏆", label: "Past Winners",          route: "/(tabs)/admin/giveaway-past-winners" },
        { icon: "🎟", label: "Grant Giveaway Entries", route: "/(tabs)/admin/giveaway-grant-entries" },
      ].map((item) => (
        <Pressable key={item.label} style={s.quickBtn} onPress={() => router.push(item.route as any)}>
          <Text allowFontScaling={false} style={s.quickBtnIcon}>{item.icon}</Text>
          <Text allowFontScaling={false} style={s.quickBtnText}>{item.label}</Text>
          <Ionicons name="chevron-forward" size={18} color={C.gray} />
        </Pressable>
      ))}

      <Text allowFontScaling={false} style={[s.sectionTitle, { marginTop: scale(SP.xxl) }]}>Overview</Text>
      <View style={s.statsGrid}>
        {[
          { value: vm.stats.activeCount,                                    label: "Active\nGiveaways",   color: C.green },
          { value: vm.stats.totalEntries,                                   label: "Total\nEntries",      color: C.white },
          { value: `$${vm.stats.totalPrizeValue?.toLocaleString() || "0"}`, label: "Active Prize\nValue", color: C.amber },
        ].map((stat) => (
          <View key={stat.label} style={s.statCard}>
            <Text allowFontScaling={false} style={[s.statValue, { color: stat.color }]}>{stat.value}</Text>
            <Text allowFontScaling={false} style={s.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>
      <View style={s.statsGrid}>
        {[
          { value: vm.stats.totalGiveaways,                              label: "Total\nGiveaways",  color: C.white },
          { value: `$${vm.stats.totalAwarded?.toLocaleString() || "0"}`, label: "Total\nAwarded",    color: C.green },
          { value: vm.stats.activeCount,                                 label: "Currently\nActive", color: C.teal  },
        ].map((stat) => (
          <View key={stat.label} style={s.statCard}>
            <Text allowFontScaling={false} style={[s.statValue, { color: stat.color }]}>{stat.value}</Text>
            <Text allowFontScaling={false} style={s.statLabel}>{stat.label}</Text>
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
          <Text allowFontScaling={false} style={s.backText}>Back</Text>
        </Pressable>
        <Text allowFontScaling={false} style={s.headerTitle}>GIVEAWAY MANAGEMENT</Text>
        <View style={{ width: scale(70) }} />
      </View>

      <View style={s.tabBar}>
        {(["giveaways", "manage"] as const).map((tab) => (
          <Pressable
            key={tab}
            style={[s.tab, vm.activeTab === tab && s.tabActive]}
            onPress={() => vm.setActiveTab(tab)}
          >
            <Text allowFontScaling={false} style={[s.tabText, vm.activeTab === tab && s.tabTextActive]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      {vm.activeTab === "giveaways" ? renderGiveawaysTab() : renderManageTab()}

      <GiveawayAdminModals
        vm={vm}
        endEarlyTarget={endEarlyTarget}
        endingEarly={endingEarly}
        closeEndEarlyModal={closeEndEarlyModal}
        confirmEndEarly={confirmEndEarly}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Card styles
// ─────────────────────────────────────────────────────────────────────────────
const cS = StyleSheet.create({
  card: {
    borderRadius: scale(16),
    padding: scale(SP.lg),
    marginBottom: scale(SP.md),
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
    marginBottom: scale(SP.md),
  },
  nameRow: { flexDirection: "row", alignItems: "center", flex: 1, marginRight: scale(SP.sm) },
  name: { color: C.offWhite, fontSize: moderateScale(FS.lg), fontWeight: "700", flex: 1 },
  badge: {
    borderRadius: scale(8),
    paddingHorizontal: scale(SP.sm),
    paddingVertical: scale(SP.xs + 1),
    borderWidth: 1,
  },
  badgeText: { fontSize: moderateScale(FS.xs), fontWeight: "700", letterSpacing: 0.3 },

  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: scale(SP.sm), marginBottom: scale(SP.md) },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: scale(8),
    paddingVertical: scale(SP.xs + 2),
    paddingHorizontal: scale(SP.sm + 2),
    gap: scale(SP.xs),
    borderWidth: 1,
  },
  chipIcon: { fontSize: moderateScale(13) },
  chipText: { fontSize: moderateScale(FS.sm), fontWeight: "600" },

  winnerRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.goldDim,
    borderRadius: scale(8),
    padding: scale(SP.sm),
    marginBottom: scale(SP.sm),
    gap: scale(SP.xs),
    borderWidth: 1,
    borderColor: C.goldBorder,
  },
  winnerIcon: { fontSize: moderateScale(14) },
  winnerName: { color: C.gold, fontSize: moderateScale(FS.sm), fontWeight: "700", flex: 1 },

  divider: { height: scale(1), backgroundColor: C.cardBorder, marginVertical: scale(SP.sm) },

  actionRow: { flexDirection: "row", gap: scale(SP.sm) },
  actionCol: { gap: scale(SP.sm) },

  primaryBtn: {
    flexDirection: "row",
    borderRadius: scale(12),
    paddingVertical: scale(13),
    alignItems: "center",
    justifyContent: "center",
    gap: scale(SP.sm),
  },
  primaryBtnIcon: { fontSize: moderateScale(FS.lg) },
  primaryBtnText: { color: C.white, fontSize: moderateScale(FS.md), fontWeight: "700" },

  secondaryBtn: {
    flex: 1,
    borderRadius: scale(10),
    paddingVertical: scale(SP.md - 1),
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.cardBorder,
    backgroundColor: C.cardRaised,
  },
  secondaryBtnText: { color: C.lightGray, fontSize: moderateScale(FS.sm), fontWeight: "600" },

  // End Early: slightly muted border, no fill
  endEarlyBtn: {
    borderColor: C.red + "40",
    backgroundColor: C.redDim,
  },

  iconBtn: {
    flex: 1,
    borderRadius: scale(10),
    paddingVertical: scale(SP.md - 1),
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.cardBorder,
    backgroundColor: C.cardRaised,
  },
  iconBtnText: { color: C.gray, fontSize: moderateScale(FS.sm), fontWeight: "500" },
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
    paddingTop: scale(60),
    paddingHorizontal: scale(SP.lg),
    paddingBottom: scale(SP.md),
  },
  backBtn: { flexDirection: "row", alignItems: "center", width: scale(70) },
  backText: { color: C.blue, fontSize: moderateScale(FS.md) },
  headerTitle: { color: C.white, fontSize: moderateScale(FS.lg), fontWeight: "700", textAlign: "center" },

  tabBar: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.cardBorder },
  tab: { flex: 1, alignItems: "center", paddingVertical: scale(SP.md), borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabActive: { borderBottomColor: C.blue },
  tabText: { color: C.gray, fontSize: moderateScale(FS.md), fontWeight: "600" },
  tabTextActive: { color: C.blue },

  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.card,
    borderRadius: scale(10),
    marginHorizontal: scale(SP.lg),
    marginTop: scale(SP.lg),
    paddingHorizontal: scale(SP.md),
    height: scale(40),
    borderWidth: 1,
    borderColor: C.cardBorder,
    gap: scale(SP.sm),
  },
  searchInput: { flex: 1, color: C.white, fontSize: moderateScale(FS.sm) },

  filterRow: { paddingHorizontal: scale(SP.lg), paddingVertical: scale(SP.md), gap: scale(SP.sm), alignItems: "center" },
  filterChip: {
    backgroundColor: C.card,
    borderRadius: scale(20),
    paddingHorizontal: scale(SP.lg),
    paddingVertical: scale(SP.sm),
    borderWidth: 1,
    borderColor: C.cardBorder,
    height: scale(36),
    justifyContent: "center",
    alignItems: "center",
  },
  filterText: { color: C.gray, fontSize: moderateScale(FS.sm) },

  listContent: { paddingHorizontal: scale(SP.lg), paddingBottom: scale(100) },
  listContentWeb: { alignItems: "center", paddingBottom: scale(SP.xl) },

  loadingBox: { flex: 1, justifyContent: "center", alignItems: "center", paddingTop: scale(80) },
  emptyState: { alignItems: "center", justifyContent: "center", paddingTop: scale(80), gap: scale(SP.sm) },
  emptyTitle: { color: C.white, fontSize: moderateScale(FS.lg), fontWeight: "600", marginTop: scale(SP.md) },
  emptySubtitle: { color: C.gray, fontSize: moderateScale(FS.sm), textAlign: "center" },

  manageContent: { padding: scale(SP.lg), paddingBottom: scale(100) },
  sectionTitle: { color: C.white, fontSize: moderateScale(FS.lg), fontWeight: "700", marginBottom: scale(SP.md) },

  quickBtn: {
    backgroundColor: C.card,
    borderRadius: scale(14),
    padding: scale(SP.lg),
    marginBottom: scale(SP.md),
    flexDirection: "row",
    alignItems: "center",
    gap: scale(SP.md),
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  quickBtnIcon: { fontSize: moderateScale(FS.xl), width: scale(30), textAlign: "center" },
  quickBtnText: { color: C.white, fontSize: moderateScale(FS.md), fontWeight: "600", flex: 1 },

  statsGrid: { flexDirection: "row", gap: scale(SP.md), marginBottom: scale(SP.md) },
  statCard: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: scale(12),
    padding: scale(SP.md),
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.cardBorder,
    gap: scale(SP.xs),
  },
  statValue: { fontSize: moderateScale(FS.xl), fontWeight: "700" },
  statLabel: { color: C.gray, fontSize: moderateScale(FS.xs), textAlign: "center" },
});
