import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GOOGLE_PLACES_API_KEY = Deno.env.get("GOOGLE_PLACES_API_KEY") ?? "";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const { action, query, placeId, maxWidth } = await req.json();

    // Resolve a venue's first Google Places photo to a public image URL + attribution.
    // Server-side only (keeps the API key off the client). Returns { url, attribution };
    // url/attribution are null when the place has no usable photo. The client uses this
    // ONLY as a fallback for venues with no Compete photo_url — it is never persisted.
    if (action === "venuePhoto") {
      if (!placeId) throw new Error("Missing placeId");
      // ── TEMP DIAGNOSTICS (remove after root-cause) — do NOT swallow Google errors ──
      console.log("[venuePhoto] placeId=", placeId, "maxWidth=", maxWidth);
      const detailsUrl =
        "https://maps.googleapis.com/maps/api/place/details/json?place_id=" +
        encodeURIComponent(placeId) +
        "&fields=photos&key=" + GOOGLE_PLACES_API_KEY;
      const detResp = await fetch(detailsUrl);
      const det = await detResp.json();
      const gStatus = det?.status ?? null; // OK / REQUEST_DENIED / ZERO_RESULTS / ...
      const gError = det?.error_message ?? null;
      const photosCount = Array.isArray(det?.result?.photos) ? det.result.photos.length : 0;
      console.log("[venuePhoto] details http=", detResp.status, "google.status=", gStatus, "error=", gError, "photos=", photosCount);
      const photo = det?.result?.photos?.[0];
      if (!photo?.photo_reference) {
        return new Response(
          JSON.stringify({ url: null, attribution: null, debug: { detailsHttp: detResp.status, googleStatus: gStatus, googleError: gError, photosCount } }),
          { headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, status: 200 },
        );
      }
      const w = Math.min(Math.max(Number(maxWidth) || 800, 100), 1600);
      const photoUrl =
        "https://maps.googleapis.com/maps/api/place/photo?maxwidth=" + w +
        "&photo_reference=" + encodeURIComponent(photo.photo_reference) +
        "&key=" + GOOGLE_PLACES_API_KEY;
      // Follow the redirect to obtain the final public image URL, then cancel the body
      // so we don't download the image bytes server-side.
      const resolved = await fetch(photoUrl);
      const finalUrl = resolved.ok ? resolved.url : null;
      console.log("[venuePhoto] photo http=", resolved.status, "ok=", resolved.ok, "finalUrl=", finalUrl);
      try { await resolved.body?.cancel(); } catch { /* ignore */ }
      const attribution =
        Array.isArray(photo.html_attributions) && photo.html_attributions.length
          ? photo.html_attributions[0]
          : null;
      return new Response(
        JSON.stringify({ url: finalUrl, attribution, debug: { detailsHttp: detResp.status, googleStatus: gStatus, googleError: gError, photosCount, photoHttp: resolved.status } }),
        { headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, status: 200 },
      );
    }

    let url = "";

    if (action === "autocomplete") {
      if (!query) throw new Error("Missing query");
      url = "https://maps.googleapis.com/maps/api/place/autocomplete/json?input=" +
        encodeURIComponent(query) +
        "&types=establishment&key=" + GOOGLE_PLACES_API_KEY;
    } else if (action === "details") {
      if (!placeId) throw new Error("Missing placeId");
      url = "https://maps.googleapis.com/maps/api/place/details/json?place_id=" +
        placeId +
        "&fields=name,formatted_address,address_components,geometry,formatted_phone_number&key=" +
        GOOGLE_PLACES_API_KEY;
    } else {
      throw new Error("Invalid action: " + action);
    }

    const response = await fetch(url);
    const data = await response.json();

    return new Response(JSON.stringify(data), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      status: 400,
    });
  }
});