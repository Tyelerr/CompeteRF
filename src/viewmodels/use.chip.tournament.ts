// src/viewmodels/use.chip.tournament.ts
// Viewmodel for the Chip Tournament manage flow. Loads the tournament + chip blob,
// holds the working ChipState locally, auto-saves changes (debounced), and exposes
// Setup actions. Rules live in chip.engine.ts; persistence in chip.service.ts.

import { useCallback, useEffect, useRef, useState } from "react";
import { chipService } from "../models/services/chip.service";
import {
  addTable as engineAddTable,
  adjustChips as engineAdjustChips,
  newId,
  recordWinner as engineRecordWinner,
  removeTable as engineRemoveTable,
  reshuffle as engineReshuffle,
  startChipTournament,
} from "../models/services/chip.engine";
import {
  ChipEntry,
  ChipSettings,
  ChipState,
  ChipTable,
  ChipTier,
} from "../models/types/chip.types";
import { Tournament } from "../models/types/tournament.types";

const blankEntry = (): ChipEntry => ({
  id: newId("e"),
  p1Name: "",
  p1Fargo: null,
  p1Phone: "",
  p2Name: "",
  p2Fargo: null,
  teamFargo: null,
  startChips: 0,
  chips: 0,
  paid: false,
  checkedIn: false,
  status: "queued",
  wins: 0,
  losses: 0,
  streak: 0,
  bestStreak: 0,
  eliminations: 0,
  createdAt: new Date().toISOString(),
});

export const useChipTournament = (id: number) => {
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [chip, setChip] = useState<ChipState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const loadedRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const b = await chipService.load(id);
      setTournament(b.tournament);
      setChip(b.chip);
      loadedRef.current = true;
    } catch (e: any) {
      setError(e?.message ?? "Failed to load tournament.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadedRef.current = false;
    load();
  }, [load]);

  // Debounced auto-save whenever the chip blob changes (after the initial load).
  useEffect(() => {
    if (!loadedRef.current || !chip) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      chipService.save(id, chip).catch(() => {});
    }, 800);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [chip, id]);

  const update = useCallback((fn: (c: ChipState) => ChipState) => {
    setChip((c) => (c ? fn(c) : c));
  }, []);

  // ── Settings ────────────────────────────────────────────────────────────────
  const updateSettings = useCallback(
    (patch: Partial<ChipSettings>) =>
      update((c) => ({ ...c, settings: { ...c.settings, ...patch } })),
    [update],
  );

  const setName = useCallback(
    (name: string) => {
      setTournament((t) => (t ? { ...t, name } : t));
      chipService.setName(id, name).catch(() => {});
    },
    [id],
  );

  // ── Fargo chip table (tiers) ──────────────────────────────────────────────────
  const addTier = useCallback(
    () =>
      update((c) => ({
        ...c,
        settings: {
          ...c.settings,
          tiers: [
            ...c.settings.tiers,
            { id: newId("tier"), minFargo: 0, maxFargo: null, chips: 1 } as ChipTier,
          ],
        },
      })),
    [update],
  );
  const updateTier = useCallback(
    (tierId: string, patch: Partial<ChipTier>) =>
      update((c) => ({
        ...c,
        settings: {
          ...c.settings,
          tiers: c.settings.tiers.map((t) => (t.id === tierId ? { ...t, ...patch } : t)),
        },
      })),
    [update],
  );
  const removeTier = useCallback(
    (tierId: string) =>
      update((c) => ({
        ...c,
        settings: { ...c.settings, tiers: c.settings.tiers.filter((t) => t.id !== tierId) },
      })),
    [update],
  );

  // ── Registration (entries) ────────────────────────────────────────────────────
  const addEntry = useCallback(
    () => update((c) => ({ ...c, entries: [...c.entries, blankEntry()] })),
    [update],
  );
  const updateEntry = useCallback(
    (entryId: string, patch: Partial<ChipEntry>) =>
      update((c) => ({
        ...c,
        entries: c.entries.map((e) => (e.id === entryId ? { ...e, ...patch } : e)),
      })),
    [update],
  );
  const removeEntry = useCallback(
    (entryId: string) =>
      update((c) => ({ ...c, entries: c.entries.filter((e) => e.id !== entryId) })),
    [update],
  );

  // ── Tables (engine-backed: seats players automatically when live) ─────────────
  const addTable = useCallback(() => update((c) => engineAddTable(c)), [update]);
  const updateTable = useCallback(
    (tableId: string, patch: Partial<ChipTable>) =>
      update((c) => ({
        ...c,
        tables: c.tables.map((t) => (t.id === tableId ? { ...t, ...patch } : t)),
      })),
    [update],
  );
  const removeTable = useCallback(
    (tableId: string) => update((c) => engineRemoveTable(c, tableId)),
    [update],
  );

  // ── Live actions ──────────────────────────────────────────────────────────────
  const recordWinner = useCallback(
    (matchId: string, winnerId: string) =>
      update((c) => engineRecordWinner(c, matchId, winnerId)),
    [update],
  );
  const reshuffle = useCallback(() => update((c) => engineReshuffle(c)), [update]);
  const adjustChips = useCallback(
    (entryId: string, delta: number) =>
      update((c) => engineAdjustChips(c, entryId, delta)),
    [update],
  );
  const endTournament = useCallback(async () => {
    if (chip) await chipService.save(id, chip);
    await chipService.setLiveState(id, "finished");
    await load();
  }, [chip, id, load]);

  // ── Review & Start ────────────────────────────────────────────────────────────
  const start = useCallback(async () => {
    if (!chip) return;
    setStarting(true);
    try {
      const started = startChipTournament(chip);
      setChip(started);
      await chipService.start(id, started);
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Failed to start tournament.");
    } finally {
      setStarting(false);
    }
  }, [chip, id, load]);

  const liveState = tournament?.live_state ?? "not_started";
  const isLive = liveState === "in_progress";
  const isFinished = liveState === "finished" || tournament?.status === "completed";
  const phase: "setup" | "live" | "results" = isFinished
    ? "results"
    : isLive
      ? "live"
      : "setup";

  return {
    loading,
    error,
    starting,
    tournament,
    chip,
    phase,
    reload: load,
    setName,
    updateSettings,
    addTier,
    updateTier,
    removeTier,
    addEntry,
    updateEntry,
    removeEntry,
    addTable,
    updateTable,
    removeTable,
    start,
    recordWinner,
    reshuffle,
    adjustChips,
    endTournament,
  };
};
