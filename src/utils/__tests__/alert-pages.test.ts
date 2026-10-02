// src/utils/__tests__/alert-pages.test.ts
// Run: npx tsx --test src/utils/__tests__/alert-pages.test.ts
// Android shows at most 3 Alert buttons: every action must stay reachable (paged via "More…"),
// every page fits, and the last page can always be cancelled.
/// <reference types="node" />
import { test } from "node:test";
import assert from "node:assert/strict";
import { paginateAlertButtons } from "../alert-pages";

const a = (t: string, style?: "destructive") => ({ text: t, style, onPress: () => {} });
test("≤ 3 buttons: unchanged single dialog", () => {
  const b = [a("Mark No Show"), a("Remove Player"), { text: "Cancel", style: "cancel" as const }];
  assert.deepEqual(paginateAlertButtons(b), [b]);
});
test("elim player menu (4 actions + Cancel): every action reachable, ≤ 3 per page, Cancel last", () => {
  const b = [a("Edit"), a("Undo Ready"), a("Mark No Show", "destructive"), a("Remove Player", "destructive"), { text: "Cancel", style: "cancel" as const }];
  const pages = paginateAlertButtons(b);
  for (const p of pages) assert.ok(p.length <= 3);
  const shown = pages.flat().map((x) => x.text);
  for (const x of ["Edit", "Undo Ready", "Mark No Show", "Remove Player", "Cancel"]) assert.ok(shown.includes(x), x);
  assert.equal(pages[0][pages[0].length - 1].text, "More…");
  assert.equal(pages[pages.length - 1].at(-1)!.style, "cancel");
});
test("chip Invite Partner (3 actions + Cancel) and a long menu without an explicit Cancel", () => {
  const invite = paginateAlertButtons([a("Text Invite"), a("Share Invite"), a("Copy Link"), { text: "Cancel", style: "cancel" }]);
  assert.deepEqual(invite.map((p) => p.map((x) => x.text)), [["Text Invite", "Share Invite", "More…"], ["Copy Link", "Cancel"]]);
  const long = paginateAlertButtons(Array.from({ length: 7 }, (_, i) => a(`A${i}`)));
  assert.equal(long.flat().filter((x) => x.text.startsWith("A")).length, 7);
  assert.equal(long.at(-1)!.at(-1)!.text, "Cancel", "a Cancel is always added");
});
