// src/viewmodels/hooks/use.hydrated.ts
// WEB static export (app.json web.output "static"): every route's HTML is pre-rendered at
// build time, and a DYNAMIC route ([id]) is pre-rendered once from its placeholder template —
// with no real param and no data. React then hydrates that HTML, so the browser's FIRST render
// must produce the same markup. Screens whose first render depends on the route param or on
// loaded data use this to render their neutral placeholder (e.g. the Loading state) until
// hydration is done; after that they render normally.
//
// useSyncExternalStore is React's hydration-safe primitive for this: the SERVER snapshot
// (false) is used for the build-time render AND while hydrating, then React re-renders with the
// client snapshot (true). Native has no hydration → true from the very first render.

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

export const useHydrated = (): boolean =>
  useSyncExternalStore(
    noopSubscribe,
    () => true, // client
    () => false, // server render + hydration
  );
