# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Compete Tournaments** (Expo slug `competerf`, scheme `competerf`, bundle `com.compete.rf`, EAS project `8387f5f4-466c-444e-b562-0979b6ce001e`) — a React Native / Expo mobile + web app for discovering, organizing, and (in progress) running live pool/billiards tournaments. Backend is **Supabase** (auth, Postgres, storage, RPC). New Architecture is enabled (`newArchEnabled: true`).

## Commands

```bash
npm install
npx expo start              # Metro dev server (or: npm start)
npm start -- -c             # start with cleared Metro cache (use when imports/aliases act stale)
npm run ios                 # expo run:ios (native build)
npm run android             # expo run:android
npm run web                 # expo start --web
npm run start:tunnel        # expo start --tunnel
npm run lint                # expo lint (ESLint flat config, eslint-config-expo; ignores dist/)
.\bump-version.ps1          # bump app version for TestFlight builds
```

There is **no test runner** — `npm test` does not exist. Verify changes by running the app. Build for stores via EAS (`eas build`); `eas.json` holds profiles.

## Architecture — MVVM under `src/`

The `app/` directory holds **only thin expo-router route files** (file-based routing, typed routes enabled). Each route file is a small wrapper that renders a screen from `src/views/screens/`. **All real logic lives in `src/`**, organized as a strict layered MVVM stack:

```
*.types.ts  →  *.service.ts  →  use*.ts (viewmodel hook)  →  screen/component
```

- **`src/models/types/`** — domain TypeScript types (`tournament.types.ts`, `profile.types.ts`, …). Types mirror snake_case Supabase columns.
- **`src/models/services/`** — the **only** place that talks to Supabase. Each service is an object of async methods (e.g. `tournamentService.getTournaments(...)`). Screens/hooks must call services, never `supabase` directly.
- **`src/viewmodels/`** — React hooks that compose services into screen-ready state. `use*.ts` files at the top level are per-screen viewmodels (`useBilliards`, `useHome`, `useTournamentDetail`, the many `useAdmin*`/`useBarOwner*`/`useTD*` dashboards). `src/viewmodels/hooks/` holds shared cross-cutting hooks (`use.auth.ts`, `use.notifications.ts`, `use.permissions.ts`, `use.pagination.ts`). `src/viewmodels/stores/` holds **Zustand** stores (`auth.store.ts`, `filter.store.ts`, `ui.store.ts`).
- **`src/views/`** — `screens/` (one folder per feature, often with a `*.styles.ts`) and `components/` (grouped by feature + a large `common/` set of primitives: `button`, `input`, `modal`, `dropdown`, `card`, `date-picker`, `range-slider`, etc.).
- **`src/providers/`** — `AuthProvider` and `QueryProvider` (TanStack React Query). Both wrap the app in `app/_layout.tsx`.
- **`src/permissions/`** — RBAC: `roles.ts` (role constants + hierarchy), `permissions.ts` (`PERMISSIONS` map of action → allowed roles).
- **`src/theme/`** — design tokens: `COLORS`, `SPACING`, `FONT_SIZES`, `RADIUS`, `typography`. **Never hardcode hex colors or px values** — import from here.
- **`src/lib/supabase.ts`** — the Supabase client singleton. Reads `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` from `.env` and **throws at module load if missing**. Persists session via AsyncStorage; ties `startAutoRefresh`/`stopAutoRefresh` to AppState on native.
- **`src/features/billing/`** — Stripe billing feature module. **`src/services/email/`** — transactional email + templates.
- **`src/utils/`** — helpers, formatters, `scaling.ts`, `game-type.utils.ts`, etc.

> Note: `src/navigation/*` exists but the app routes through expo-router (`app/`), not these navigators.

## Auth & roles

`AuthProvider` (`src/providers/AuthProvider.tsx`) hydrates the session via a Supabase RPC and stores the `profile` in the Zustand `auth.store` (single source of truth). Consume auth via `useAuthContext()` / `useAuth()`, which exposes `session`, `user`, `profile`, `loading`, `isAuthenticated`, `canSubmitTournaments`, `isAdmin`, `pushToken`, plus `refreshSession`, `refreshProfile`, `signOut`, `createProfile`, `replayOnboarding`.

Roles (`src/permissions/roles.ts`), low→high: `basic_user`, `tournament_director`, `bar_owner`, `compete_admin`, `super_admin`.
- `canSubmitTournaments` = director/bar_owner/admin/super_admin.
- `isAdmin` = compete_admin/super_admin.

Gate UI and tabs on these flags (see `app/(tabs)/_layout.tsx`, which hides the Submit/Admin tabs via `href: null`). For finer checks, use the `PERMISSIONS` map.

## Conventions (enforced for new work — see `LIVE_TOURNAMENT_ENGINE.md`)

- Follow the layered stack for **all new data access**: `*.types.ts → *.service.ts → use*.ts → screen`. Do **not** put Supabase calls inline in screens. (The live `app/(tabs)/profile.tsx` does inline Supabase for favorites — it is a legacy exception, do not copy it.)
- Naming: hooks `use*.ts`, services `*.service.ts`, types `*.types.ts`.
- Use theme constants (`COLORS`, `SPACING`, `FONT_SIZES`, `RADIUS`) — never raw hex/px.
- Supabase: use `.maybeSingle()` for optional records; `.select().single()` after updates to surface silent failures.
- **Hermes minifier gotcha:** no 1–2 character module-level identifiers in RN/Expo files (they collide after minification). For responsive scaling import `webMs`/`webSc` from `src/utils/scaling.ts`; never redefine them locally.
- Handle web vs mobile styling separately where they diverge (`Platform.OS === 'web'`).
- `@/*` path alias maps to the repo root (tsconfig), though most `src/` code uses relative imports. TypeScript is `strict`.

## Active feature: live tournament engine

Branch `feature/live-tournament-engine`. The master plan, locked design decisions, and phase checklist live in **`LIVE_TOURNAMENT_ENGINE.md`** at the repo root — read it before working on registration, check-in, brackets, scoring, or the profile dashboard. Build order is data-first: Phase 0 (data model/types, done) → Phase 1 (TD registration & check-in) → Phase 2 (live bracket engine) → Phase 3 (results/placements) → Phase 4 (profile dashboard read side). Registration code is in `registration.service.ts` / `registration.types.ts` / `use.registrations.ts`.

Two profile screens exist: `app/(tabs)/profile.tsx` is the **live, in-use** one; `src/views/screens/profile/profile.screen.tsx` is an **older, unused** MVVM version with a different data shape — do not touch it unless consolidating.

## Environment / filesystem note

Secrets live in `.env` (`EXPO_PUBLIC_SUPABASE_*`); never commit it. Supabase edge functions / migrations are under `supabase/`. The working tree exhibits filesystem virtualization quirks (some paths show phantom entries or fail to read normally) — when file listing or reads behave oddly, prefer `git ls-files` and `git show HEAD:<path>` to inspect tracked content reliably.
