// supabase/functions/_shared/telnyx.test.ts
// Run: deno test --allow-net supabase/functions/_shared/telnyx.test.ts
// No LIVE Telnyx calls — globalThis.fetch is stubbed.
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { isE164, sendTelnyxSms } from "./telnyx.ts";

Deno.test("isE164: validates E.164 defensively", () => {
  assertEquals(isE164("+15551234567"), true);
  assertEquals(isE164("+447911123456"), true);
  assertEquals(isE164("5551234567"), false);
  assertEquals(isE164("+1"), false);
  assertEquals(isE164(""), false);
  assertEquals(isE164(null), false);
});

const OK = { apiKey: "k", from: "+18005551212", to: "+15551234567", text: "hi" };

async function withFetch(stub: typeof fetch, fn: () => Promise<void>) {
  const orig = globalThis.fetch;
  globalThis.fetch = stub;
  try { await fn(); } finally { globalThis.fetch = orig; }
}

Deno.test("send: accepted → ok + providerMessageId", async () => {
  await withFetch(
    (() => Promise.resolve(new Response(JSON.stringify({ data: { id: "msg_1" } }), { status: 200 }))) as typeof fetch,
    async () => {
      const r = await sendTelnyxSms(OK);
      assertEquals(r.ok, true);
      assertEquals(r.providerMessageId, "msg_1");
    },
  );
});

Deno.test("send: non-2xx → provider_rejected (no raw body)", async () => {
  await withFetch(
    (() => Promise.resolve(new Response("boom +15551234567", { status: 422 }))) as typeof fetch,
    async () => {
      const r = await sendTelnyxSms(OK);
      assertEquals(r.ok, false);
      assertEquals(r.errorCode, "provider_rejected");
      assertEquals(r.providerMessageId, undefined);
    },
  );
});

Deno.test("send: fetch throws → network_error (ambiguous, not auto-retryable)", async () => {
  await withFetch(
    (() => Promise.reject(new Error("timeout"))) as typeof fetch,
    async () => {
      const r = await sendTelnyxSms(OK);
      assertEquals(r.ok, false);
      assertEquals(r.errorCode, "network_error");
    },
  );
});

Deno.test("send: invalid destination → invalid_number, no provider call", async () => {
  let called = false;
  await withFetch(
    (() => { called = true; return Promise.resolve(new Response("{}", { status: 200 })); }) as typeof fetch,
    async () => {
      const r = await sendTelnyxSms({ ...OK, to: "5551234567" });
      assertEquals(r.ok, false);
      assertEquals(r.errorCode, "invalid_number");
      assertEquals(called, false);
    },
  );
});

Deno.test("send: missing creds → not_configured", async () => {
  const r = await sendTelnyxSms({ ...OK, apiKey: "", from: "" });
  assertEquals(r.ok, false);
  assertEquals(r.errorCode, "not_configured");
});
