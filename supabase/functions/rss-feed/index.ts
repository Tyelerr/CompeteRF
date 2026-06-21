import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

// ---------------------------------------------------------------------------
// rss-feed — server-side fetch of the news RSS feed so the web app doesn't have
// to rely on flaky public CORS proxies. Returns the raw XML; the client parses
// it (same parser as native). No secrets required.
// ---------------------------------------------------------------------------

const RSS_FEED_URL = "https://www.azbilliards.com/feed/";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const upstream = await fetch(RSS_FEED_URL, {
      headers: {
        // A browser-like UA avoids feeds that reject default fetch agents.
        "User-Agent":
          "Mozilla/5.0 (compatible; CompeteTournaments/1.0; +https://thecompeteapp.com)",
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
    });
    if (!upstream.ok) {
      return json({ error: `Feed responded ${upstream.status}` }, 502);
    }
    const xml = await upstream.text();
    return json({ xml }, 200);
  } catch (err) {
    console.error("[rss-feed] fetch failed:", err);
    return json({ error: "Failed to reach the news feed." }, 502);
  }
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
