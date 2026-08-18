// supabase/functions/_shared/idempotency.test.ts
// Run: deno test supabase/functions/_shared/idempotency.test.ts
import { assertEquals, assertNotEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { bracketMatchReadyKey, chipMatchReadyKey, isSafeMatchId } from "./idempotency.ts";

Deno.test("isSafeMatchId: accepts bracket + chip tokens", () => {
  assertEquals(isSafeMatchId("W1M1"), true);
  assertEquals(isSafeMatchId("GF2"), true);
  assertEquals(isSafeMatchId("1"), true);
  assertEquals(isSafeMatchId("m_ab-12CD"), true);
});
Deno.test("isSafeMatchId: rejects empty / too long / unsafe chars", () => {
  assertEquals(isSafeMatchId(""), false);
  assertEquals(isSafeMatchId("a".repeat(65)), false);
  assertEquals(isSafeMatchId("a b"), false);
  assertEquals(isSafeMatchId("a'b"), false);
  assertEquals(isSafeMatchId("a;b"), false);
  assertEquals(isSafeMatchId("../x"), false);
});

Deno.test("keys are deterministic for the same trusted inputs", () => {
  const a = bracketMatchReadyKey({ tournamentId: 5, matchId: "W1M1", recipientIdAuto: 42, drawNumber: 1, startedAt: "2026-07-30T10:00:00Z" });
  const b = bracketMatchReadyKey({ tournamentId: 5, matchId: "W1M1", recipientIdAuto: 42, drawNumber: 1, startedAt: "2026-07-30T10:00:00Z" });
  assertEquals(a, b);
});

// ── Case 7: reset / redraw / chip-recreate change the key ────────────────────
Deno.test("bracket restart (startedAt changes) → new key", () => {
  // Reset Match clears startedAt to null; the restart writes a fresh timestamp.
  const before = bracketMatchReadyKey({ tournamentId: 5, matchId: "W1M1", recipientIdAuto: 42, drawNumber: 1, startedAt: "2026-07-30T10:00:00Z" });
  const after = bracketMatchReadyKey({ tournamentId: 5, matchId: "W1M1", recipientIdAuto: 42, drawNumber: 1, startedAt: "2026-07-30T12:30:00Z" });
  assertNotEquals(before, after);
});
Deno.test("redraw (drawNumber bumps) → new key", () => {
  const d1 = bracketMatchReadyKey({ tournamentId: 5, matchId: "W1M1", recipientIdAuto: 42, drawNumber: 1, startedAt: "2026-07-30T10:00:00Z" });
  const d2 = bracketMatchReadyKey({ tournamentId: 5, matchId: "W1M1", recipientIdAuto: 42, drawNumber: 2, startedAt: "2026-07-30T10:00:00Z" });
  assertNotEquals(d1, d2);
});
Deno.test("chip re-seat (new match id + started_at) → new key", () => {
  const m1 = chipMatchReadyKey({ tournamentId: 5, matchId: "m_aaa", recipientIdAuto: 42, startedAt: "2026-07-30T10:00:00Z" });
  const m2 = chipMatchReadyKey({ tournamentId: 5, matchId: "m_bbb", recipientIdAuto: 42, startedAt: "2026-07-30T11:00:00Z" });
  assertNotEquals(m1, m2);
});
Deno.test("chip same instance (same id + started_at) → same key (dedup)", () => {
  const a = chipMatchReadyKey({ tournamentId: 5, matchId: "m_aaa", recipientIdAuto: 42, startedAt: "2026-07-30T10:00:00Z" });
  const b = chipMatchReadyKey({ tournamentId: 5, matchId: "m_aaa", recipientIdAuto: 42, startedAt: "2026-07-30T10:00:00Z" });
  assertEquals(a, b);
});
