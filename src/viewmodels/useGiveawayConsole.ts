// src/viewmodels/useGiveawayConsole.ts
// WEB desktop Giveaway Management console. Wraps useAdminGiveaways — every write (publish, end,
// draw, redraw, archive, restore, cancel & refund) still goes through it unchanged — and adds
// only console concerns: its own filter / search / sort, corrected stats, unique-entrant counts,
// Archive / Restore confirmations, the ⋯ menu and the detail drawer. Native does not use this.

import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { giveawayService } from "../models/services/giveaway.service";
import {
  ConsoleSort,
  ConsoleStatusFilter,
  MenuActionKind,
  PrimaryActionKind,
  computeConsoleStats,
  countByStatus,
  filterAndSortGiveaways,
  getRestoreTarget,
} from "../utils/giveaway-console";
import { useAuthStore } from "./stores/auth.store";
import { AdminGiveaway, useAdminGiveaways } from "./useAdminGiveaways";

export type ConsoleConfirm =
  | { kind: "archive"; giveaway: AdminGiveaway }
  | { kind: "restore"; giveaway: AdminGiveaway; target: "awarded" | "active" | "draft" };

export interface ConsoleMenuState {
  giveaway: AdminGiveaway;
  /** Viewport coordinates of the ⋯ button press. */
  x: number;
  y: number;
}

export const participantsRoute = (giveawayId?: number) =>
  giveawayId != null
    ? `/(tabs)/admin/giveaway-participants?giveaway=${giveawayId}`
    : "/(tabs)/admin/giveaway-participants";

export function useGiveawayConsole() {
  const router = useRouter();
  const vm = useAdminGiveaways();
  const role = useAuthStore((st) => st.profile?.role ?? null);
  // Every giveaway write is super_admin-only in RLS (_giveaway_is_admin / policies). A
  // compete_admin can deep-link here; their writes would silently match 0 rows and look
  // successful, so the console is read-only for them.
  const canManage = role === "super_admin";

  const [statusFilter, setStatusFilter] = useState<ConsoleStatusFilter>("active");
  const [sort, setSort] = useState<ConsoleSort>("newest");
  const [search, setSearch] = useState("");

  // ── Unique entrants (one light id-only read; refreshed with the list) ─────────────────────
  const [entrants, setEntrants] = useState<{ perGiveaway: Map<number, number>; total: number } | null>(null);
  const [entrantsVersion, setEntrantsVersion] = useState(0);
  useEffect(() => {
    if (!canManage) return;
    let alive = true;
    giveawayService.getEntrantSummary().then((res) => {
      if (alive) setEntrants(res);
    });
    return () => {
      alive = false;
    };
  }, [canManage, entrantsVersion]);

  const refresh = useCallback(() => {
    vm.onRefresh();
    setEntrantsVersion((n) => n + 1);
  }, [vm]);

  const all = vm.allGiveaways;
  const rows = useMemo(() => filterAndSortGiveaways(all, statusFilter, search, sort), [all, statusFilter, search, sort]);
  const counts = useMemo(() => countByStatus(all), [all]);
  const stats = useMemo(() => computeConsoleStats(all, entrants ? entrants.total : null), [all, entrants]);
  const uniqueEntrantsOf = useCallback(
    (id: number): number | null => (entrants ? (entrants.perGiveaway.get(id) ?? 0) : null),
    [entrants],
  );

  // ── End Early (same local confirmation state the native screen owns) ─────────────────────
  const [endEarlyTarget, setEndEarlyTarget] = useState<AdminGiveaway | null>(null);
  const [endingEarly, setEndingEarly] = useState(false);
  const closeEndEarlyModal = useCallback(() => {
    if (!endingEarly) setEndEarlyTarget(null);
  }, [endingEarly]);
  const confirmEndEarly = useCallback(async () => {
    if (!endEarlyTarget) return;
    setEndingEarly(true);
    await vm.endGiveaway(endEarlyTarget.id);
    setEndingEarly(false);
    setEndEarlyTarget(null);
  }, [endEarlyTarget, vm]);

  // ── Archive / Restore confirmations (new safety step; same service calls as before) ──────
  const [confirm, setConfirm] = useState<ConsoleConfirm | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const askArchive = useCallback((g: AdminGiveaway) => {
    setConfirmError(null);
    setConfirm({ kind: "archive", giveaway: g });
  }, []);
  const askRestore = useCallback((g: AdminGiveaway) => {
    setConfirmError(null);
    setConfirm({ kind: "restore", giveaway: g, target: getRestoreTarget(g) });
  }, []);
  const closeConfirm = useCallback(() => {
    if (!confirming) setConfirm(null);
  }, [confirming]);
  const runConfirm = useCallback(async () => {
    if (!confirm) return;
    setConfirming(true);
    setConfirmError(null);
    const ok =
      confirm.kind === "archive"
        ? await vm.archiveGiveaway(confirm.giveaway.id)
        : await vm.restoreGiveaway(confirm.giveaway.id);
    setConfirming(false);
    if (ok) setConfirm(null);
    else setConfirmError(`Couldn't ${confirm.kind} this giveaway. Please try again.`);
  }, [confirm, vm]);

  // ── Detail drawer + ⋯ menu ───────────────────────────────────────────────────────────────
  const [detailId, setDetailId] = useState<number | null>(null);
  const detail = useMemo(() => (detailId == null ? null : (all.find((g) => g.id === detailId) ?? null)), [all, detailId]);
  const [menu, setMenu] = useState<ConsoleMenuState | null>(null);

  const runPrimary = useCallback(
    (kind: PrimaryActionKind, g: AdminGiveaway) => {
      if (!canManage && kind !== "view_winner") return;
      switch (kind) {
        case "publish":
          return vm.openPublishModal(g);
        case "end":
          return setEndEarlyTarget(g);
        case "draw":
          return vm.openDrawModal(g);
        case "view_winner":
          return vm.openWinnerDetailsModal(g);
        case "restore":
          return askRestore(g);
      }
    },
    [askRestore, canManage, vm],
  );

  const runMenu = useCallback(
    (kind: MenuActionKind, g: AdminGiveaway) => {
      setMenu(null);
      switch (kind) {
        case "edit":
          return router.push(`/(tabs)/admin/edit-giveaway/${g.id}` as any);
        case "participants":
          return router.push(participantsRoute(g.id) as any);
        case "archive":
          return askArchive(g);
        case "restore":
          return askRestore(g);
        case "cancel_refund":
          return vm.openCancelModal(g);
        case "redraw":
          // Redraw lives in the existing Winner Details flow (it loads the current winner and the
          // eligible count the redraw needs, and shows Redraw only when one is possible).
          return vm.openWinnerDetailsModal(g);
      }
    },
    [askArchive, askRestore, router, vm],
  );

  return {
    vm,
    canManage,
    loading: vm.loading,
    refreshing: vm.refreshing,
    refresh,
    // list
    rows,
    counts,
    stats,
    uniqueEntrantsOf,
    statusFilter,
    setStatusFilter,
    sort,
    setSort,
    search,
    setSearch,
    // actions
    runPrimary,
    runMenu,
    menu,
    openMenu: setMenu,
    closeMenu: () => setMenu(null),
    // detail
    detail,
    openDetail: (g: AdminGiveaway) => setDetailId(g.id),
    closeDetail: () => setDetailId(null),
    // confirmations
    confirm,
    confirming,
    confirmError,
    closeConfirm,
    runConfirm,
    endEarlyTarget,
    endingEarly,
    closeEndEarlyModal,
    confirmEndEarly,
    // nav
    goParticipants: (id?: number) => router.push(participantsRoute(id) as any),
    goWinners: () => router.push("/(tabs)/admin/giveaway-past-winners" as any),
    goEntryWallet: () => router.push("/(tabs)/admin/giveaway-grant-entries" as any),
    goCreate: () => router.push("/(tabs)/admin/create-giveaway" as any),
    goEdit: (id: number) => router.push(`/(tabs)/admin/edit-giveaway/${id}` as any),
    goBack: () => (router.canGoBack() ? router.back() : router.replace("/(tabs)/admin" as any)),
  };
}
