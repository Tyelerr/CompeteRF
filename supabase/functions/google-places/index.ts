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
    const { action, query, placeId } = await req.json();

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