// src/viewmodels/hooks/use.google.place.photo.ts
// Lazily resolves a venue's Google Places photo (fallback only) and caches the result
// in memory for the JS session, so switching tabs/pages never re-requests the same
// venue. Each distinct place_id triggers at most ONE Edge Function call per session
// (concurrent callers share the in-flight promise). Used by both the venue card and the
// detail hero — the detail reuses the card's already-resolved photo via this cache.

import { useEffect, useState } from "react";
import { venueService } from "../../models/services/venue.service";

export interface ResolvedPlacePhoto {
  url: string | null;
  attribution: string | null;
}

// Session-scoped caches (module-level → shared across every card/modal this session).
const photoCache = new Map<string, ResolvedPlacePhoto>();
const inflight = new Map<string, Promise<ResolvedPlacePhoto>>();

const resolve = (placeId: string): Promise<ResolvedPlacePhoto> => {
  const cached = photoCache.get(placeId);
  if (cached) return Promise.resolve(cached);
  const existing = inflight.get(placeId);
  if (existing) return existing;
  const p = venueService
    .getGooglePlacePhoto(placeId)
    .then((r): ResolvedPlacePhoto => {
      const val: ResolvedPlacePhoto = r
        ? { url: r.url, attribution: r.attribution }
        : { url: null, attribution: null };
      photoCache.set(placeId, val);
      inflight.delete(placeId);
      return val;
    })
    .catch((): ResolvedPlacePhoto => {
      const val: ResolvedPlacePhoto = { url: null, attribution: null };
      photoCache.set(placeId, val); // negative-cache so we don't retry all session
      inflight.delete(placeId);
      return val;
    });
  inflight.set(placeId, p);
  return p;
};

/**
 * @param placeId venue.google_place_id (or null)
 * @param enabled pass false when a Compete photo_url already exists (skip Google)
 */
export const useGooglePlacePhoto = (placeId?: string | null, enabled = true) => {
  const [resolved, setResolved] = useState<ResolvedPlacePhoto | null>(() =>
    placeId && photoCache.has(placeId) ? photoCache.get(placeId)! : null,
  );
  const [loading, setLoading] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect -- syncing resolved photo to the
     current placeId (cache hit / clear) and the async fetch are the intended effect. */
  useEffect(() => {
    if (!enabled || !placeId) {
      setResolved(null);
      return;
    }
    const cached = photoCache.get(placeId);
    if (cached) {
      setResolved(cached);
      return;
    }
    let active = true;
    setLoading(true);
    resolve(placeId).then((r) => {
      if (!active) return;
      setResolved(r);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [placeId, enabled]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return {
    url: resolved?.url ?? null,
    attribution: resolved?.attribution ?? null,
    loading,
  };
};
