// supabase/functions/_shared/bracket.test.ts
// Run: deno test supabase/functions/_shared/bracket.test.ts
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { resolveMatchSides } from "./bracket.ts";

// ── Fixtures ────────────────────────────────────────────────────────────────
// 4-player double-elim graph. Seeds 0..3 = Alice(101) Bob(102) Cara(103) Dan(104).
const seeds = [
  { registrationId: 101, name: "Alice" },
  { registrationId: 102, name: "Bob" },
  { registrationId: 103, name: "Cara" },
  { registrationId: 104, name: "Dan" },
];
const graph = [
  { id: "W1M1", slot1: { kind: "seed", seedIndex: 0 }, slot2: { kind: "seed", seedIndex: 1 } },
  { id: "W1M2", slot1: { kind: "seed", seedIndex: 2 }, slot2: { kind: "seed", seedIndex: 3 } },
  { id: "W2M1", slot1: { kind: "winner", matchId: "W1M1" }, slot2: { kind: "winner", matchId: "W1M2" } },
  { id: "L1M1", slot1: { kind: "loser", matchId: "W1M1" }, slot2: { kind: "loser", matchId: "W1M2" } },
  { id: "L2M1", slot1: { kind: "winner", matchId: "L1M1" }, slot2: { kind: "loser", matchId: "W2M1" } },
  { id: "GF", slot1: { kind: "winner", matchId: "W2M1" }, slot2: { kind: "winner", matchId: "L2M1" } },
  { id: "GF2", conditional: true, slot1: { kind: "winner", matchId: "GF" }, slot2: { kind: "loser", matchId: "GF" } },
];
// deno-lint-ignore no-explicit-any
const B = (over: any = {}) => ({ graph, seeds, ...over }) as any;
const done = (winner: 1 | 2) => ({ status: "completed", winner });

// 1. Round-one resolution (round1-only bracket, no graph)
const round1Bracket = {
  round1: [
    { matchNumber: 1, p1: { registrationId: 201, name: "Eve" }, p2: { registrationId: 202, name: "Foo" } },
  ],
};
Deno.test("round-one: resolves both registration IDs + opponent side", () => {
  const r = resolveMatchSides(round1Bracket as any, {}, "1");
  assertEquals(r?.p1?.registrationId, 201);
  assertEquals(r?.p2?.registrationId, 202);
  assertEquals(r?.p2?.name, "Foo");
});
Deno.test("round-one: rejects an unknown match", () => {
  assertEquals(resolveMatchSides(round1Bracket as any, {}, "99"), null);
});

// 2. Winner-reference resolution
Deno.test("winner-ref: resolves later side from completed prior winners", () => {
  const ms = { W1M1: done(1), W1M2: done(1) } as any; // Alice, Cara win
  const r = resolveMatchSides(B(), ms, "W2M1");
  assertEquals(r?.p1?.registrationId, 101);
  assertEquals(r?.p2?.registrationId, 103);
});
Deno.test("winner-ref: rejects when a prior winner is missing (pending)", () => {
  const ms = { W1M1: done(1) } as any; // W1M2 not decided → W2M1 pending
  assertEquals(resolveMatchSides(B(), ms, "W2M1"), null);
});
Deno.test("winner-ref: rejects a registration not present in trusted data", () => {
  // A slot pointing at an out-of-range seed → that side is empty → <2 sides.
  const bad = B({ graph: [{ id: "X", slot1: { kind: "seed", seedIndex: 99 }, slot2: { kind: "seed", seedIndex: 0 } }] });
  assertEquals(resolveMatchSides(bad, {}, "X"), null);
});

// 3. Loser-reference resolution
Deno.test("loser-ref: resolves losers-bracket flow", () => {
  const ms = { W1M1: done(1), W1M2: done(1) } as any; // losers = Bob(102), Dan(104)
  const r = resolveMatchSides(B(), ms, "L1M1");
  assertEquals(r?.p1?.registrationId, 102);
  assertEquals(r?.p2?.registrationId, 104);
});
Deno.test("loser-ref: rejects when the source match is unresolved", () => {
  assertEquals(resolveMatchSides(B(), {}, "L1M1"), null); // W1M1/W1M2 not completed
});

// 4. Seed resolution
Deno.test("seed: resolves valid seed references", () => {
  const r = resolveMatchSides(B(), {}, "W1M1");
  assertEquals(r?.p1?.registrationId, 101);
  assertEquals(r?.p2?.registrationId, 102);
});
Deno.test("seed: rejects unknown/malformed seed references", () => {
  const bad = B({ graph: [{ id: "X", slot1: { kind: "seed", seedIndex: 0 }, slot2: { kind: "seed", seedIndex: 50 } }] });
  assertEquals(resolveMatchSides(bad, {}, "X"), null);
  const nullSeed = B({ seeds: [null, seeds[1]], graph: [{ id: "Y", slot1: { kind: "seed", seedIndex: 0 }, slot2: { kind: "seed", seedIndex: 1 } }] });
  assertEquals(resolveMatchSides(nullSeed, {}, "Y"), null); // seed[0] null → <2 sides
});

// 5. Recipient membership (predicate the endpoint applies over resolved sides)
Deno.test("membership: side A and side B accepted; non-member rejected", () => {
  const r = resolveMatchSides(B(), {}, "W1M1")!;
  const isMember = (regId: number) => regId === r.p1?.registrationId || regId === r.p2?.registrationId;
  assertEquals(isMember(101), true); // side A
  assertEquals(isMember(102), true); // side B
  assertEquals(isMember(999), false); // registered elsewhere, not this match
});

// 6. Invalid states → null
Deno.test("invalid: malformed bracket JSON", () => {
  assertEquals(resolveMatchSides({ graph: "nope" } as any, {}, "W1M1"), null);
  assertEquals(resolveMatchSides(null as any, {}, "W1M1"), null);
});
Deno.test("invalid: malformed matchState JSON", () => {
  assertEquals(resolveMatchSides(B(), "nope" as any, "W2M1"), null);
});
Deno.test("invalid: cyclic graph references", () => {
  const cyc = B({ graph: [
    { id: "A", slot1: { kind: "winner", matchId: "B" }, slot2: { kind: "seed", seedIndex: 0 } },
    { id: "B", slot1: { kind: "winner", matchId: "A" }, slot2: { kind: "seed", seedIndex: 1 } },
  ] });
  assertEquals(resolveMatchSides(cyc, {}, "A"), null);
});
Deno.test("invalid: fewer than two resolved sides", () => {
  const one = B({ graph: [{ id: "X", slot1: { kind: "seed", seedIndex: 0 }, slot2: { kind: "empty" } }] });
  assertEquals(resolveMatchSides(one, {}, "X"), null);
});
Deno.test("invalid: bye / pending / empty sides rejected", () => {
  // bye: one seed + one empty (present === 1)
  const bye = B({ graph: [{ id: "X", slot1: { kind: "seed", seedIndex: 0 }, slot2: { kind: "empty" } }] });
  assertEquals(resolveMatchSides(bye, {}, "X"), null);
  // pending: W2M1 with no winners decided
  assertEquals(resolveMatchSides(B(), {}, "W2M1"), null);
});
Deno.test("invalid: unknown match id", () => {
  assertEquals(resolveMatchSides(B(), {}, "NOPE"), null);
});
