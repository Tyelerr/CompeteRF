// src/viewmodels/nav-cache.ts
// Tiny in-memory cache so screens can show their last-loaded data INSTANTLY on
// revisit (stale-while-revalidate) instead of a blank spinner on every
// navigation. Keyed by a caller-chosen string (usually including the user id so
// data never leaks across accounts). Lives for the app session only (cleared on
// restart); each screen still refreshes in the background when it mounts, so the
// cache only affects perceived speed, never correctness.

const store = new Map<string, unknown>();

export const getNavCache = <T>(key: string): T | undefined =>
  store.get(key) as T | undefined;

export const setNavCache = <T>(key: string, value: T): void => {
  store.set(key, value);
};

export const clearNavCache = (key?: string): void => {
  if (key) store.delete(key);
  else store.clear();
};
