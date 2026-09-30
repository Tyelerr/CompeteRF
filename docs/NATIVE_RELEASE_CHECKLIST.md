# Compete — Native Release Checklist (Android + iOS)

One checklist per native release. Copy the **Build Record** at the bottom into a new section for
each release and fill it in as you go. Every gate must be fully checked before moving to the next.

> **Why this is strict:** Compete has **no OTA / expo-updates**. Every store binary carries the JS
> from the exact tree it was built from, forever, until users update. A bad build cannot be hot-fixed;
> a database/RLS change can break already-installed builds. The only kill switch is the
> build-number minimum in `app_config` (`min_supported`).

---

## Architecture facts this checklist assumes

| Item | Value |
|---|---|
| App / slug | Compete (`competerf`), Expo SDK 57, RN 0.86, New Architecture on, expo-router |
| Android package / iOS bundle | `com.thecompeteapp.competerf` (both) |
| URL scheme | `competerf://` |
| Universal / App Links | Android intent filters: `https://(www.)thecompeteapp.com/join…` and `/r/…` (autoVerify). iOS `associatedDomains`: `applinks:www.thecompeteapp.com`, `applinks:thecompeteapp.com` |
| Native deep-link entry | `app/+native-intent.tsx` → `redirectSystemPath` runs for **every** native link (cold + warm); only password-recovery links are rewritten, everything else passes through |
| Push deep links | `src/viewmodels/hooks/use.notifications.ts` → `router.push(data.deep_link)` |
| Backend | Supabase project **`fnbzfgmsamegbkeyhngn`** (us-east-2). EAS `production` environment injects `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` |
| Client Supabase URL | Must stay `https://fnbzfgmsamegbkeyhngn.supabase.co`. **Never** switch it to the custom domain in a native build: the auth storage key is derived from the URL host (`sb-<first label>-auth-token`), so changing it signs every user out. |
| Versioning | `eas.json` `appVersionSource: "remote"`: EAS owns Android versionCode and iOS build number (`autoIncrement`). `app.json` `version` is the marketing version (`ios.buildNumber` in app.json is ignored). |
| Version gate | `app_config.min_supported` → `android_min_build`, `ios_min_build` (build numbers, not marketing versions). `VersionGate` blocks older builds. |
| Feature flags | `CHIP_APPLY_ENABLED` (`src/models/services/chip.service.ts`), `GOOGLE_SIGN_IN_NATIVE_ENABLED` / `GOOGLE_SIGN_IN_WEB_ENABLED` (`src/utils/google-auth.ts`) |
| Store accounts | Play: developer **"Tyelerr Hill"** (NOT "Compete Dev", which Google closed on 2026-09-07). iOS: App Store Connect app id `6759150538`. |
| `eas submit` default | Android `track: internal` (`releaseStatus: completed`), iOS `ascAppId 6759150538` |

---

## GATE 0 — Release Scope

- [ ] Write the release scope in one paragraph: what ships, and what is deliberately excluded.
- [ ] `git status` reviewed file-by-file. Every changed file is classified as:
  1. ships on native + web
  2. web-only, harmless to native
  3. native-specific
  4. **excluded** (parked, experimental, scratch, tooling)
  5. version metadata
- [ ] Excluded files are **not imported** by anything that ships (grep for imports).
- [ ] Server-only changes (migrations, Edge Functions, `supabase/config.toml`) are in their **own commit**, never mixed into the app release commit.
- [ ] Any required DB migration is **already applied to production** and **backward-compatible** with the store builds users currently run (check the public versions via `itunes.apple.com/lookup?id=6759150538`, the Play listing, and `eas build:list`).
- [ ] Release notes drafted from the actual included changes (see GATE 5).

**STOP / DO NOT SHIP if:**
- a file in the build is unclassified or "not sure";
- parked work (e.g. Stripe Phase B) or scratch files would be included;
- the app depends on a migration that is not applied in production;
- a migration would break the currently-installed store builds.

## GATE 1 — Code / Config / Backend

- [ ] **Clean tree.** The release is built from a **committed** SHA with `git status` clean. An EAS build of a dirty tree records the HEAD SHA but ships the uncommitted files, so it cannot be reproduced. Never do that.
- [ ] Production Supabase: `EXPO_PUBLIC_SUPABASE_URL` = `https://fnbzfgmsamegbkeyhngn.supabase.co` in the EAS **production** environment (`npx eas-cli env:list production`). No staging, dev, localhost or custom-domain URL.
- [ ] Package and bundle IDs are `com.thecompeteapp.competerf`, unchanged.
- [ ] **Flags:**
  - `CHIP_APPLY_ENABLED = false`, unless explicitly approved for this release;
  - `GOOGLE_SIGN_IN_NATIVE_ENABLED = false`, unless explicitly approved (it also needs the native library, which isn't installed);
  - web Google flag noted.
- [ ] **Confirm Email:** expected production state recorded (currently **OFF**), and the app handles that state.
- [ ] **Migrations:** `npx supabase db push --dry-run` shows nothing unexpected, and the ledger matches `supabase/migrations/`.
- [ ] **Push:** EAS credentials present (FCM V1 for Android, APNs key for iOS: `npx eas-cli credentials`); `expo-notifications` plugin present.
- [ ] **Version:** marketing version chosen (see "Version rules" below); EAS remote versionCode/build will auto-increment.
- [ ] `app_config.min_supported` is **not** raised by this release (raise it only after the new build is live and adopted).
- [ ] **Checks:**
  - `npx tsx --test src/utils/__tests__/*.test.ts` (excluding Deno-only billing/stripe tests): all pass;
  - relevant `supabase/tests/*.test.ts` (PGlite): all pass;
  - `npx tsc --noEmit -p .`: no NEW errors vs the recorded baseline;
  - `npm run lint`: no new errors;
  - `npx expo-doctor`: only known or accepted findings.
- [ ] Android permissions: `blockedPermissions` still blocks CAMERA / RECORD_AUDIO / SYSTEM_ALERT_WINDOW.

**Version rules:**
- **iOS:** the marketing version must be **greater than the last approved App Store version**. Verify it in App Store Connect, not only the public listing.
- **Android:** versionCode must be greater than every code uploaded to **any** track. versionName is informational.
- Use **one** marketing version for both platforms per release.

**STOP / DO NOT SHIP if:**
- the tree is dirty;
- a flag is in an unapproved state;
- the Supabase URL isn't the production project URL;
- tests fail or tsc shows new errors;
- the iOS version is not above the last approved version.

## GATE 2 — Release Candidate Build

- [ ] Build **both** platforms from the **same** committed SHA:
  - `npx eas-cli build --platform android --profile production`
  - `npx eas-cli build --platform ios --profile production`
- [ ] Record the EAS build IDs, versionCode / build number and SHA in the Build Record.
- [ ] Install the RC on physical devices:
  - **Android:** Play **internal testing** track (a real Play-signed install), or the AAB via internal app sharing;
  - **iOS:** TestFlight.
- [ ] Confirm the installed build shows the expected version/build (Profile/Settings, or the store page for the internal track).

**STOP / DO NOT SHIP if:** the build came from an uncommitted tree, the platforms use different SHAs, or the build logs show config warnings you haven't explained.

## GATE 3 — Physical Device Smoke Test

Run on **at least one Android phone and one iPhone**, on the **store-processed RC** (internal track / TestFlight). Expo Go is **not** sufficient: it cannot test `competerf://`, App Links, push, `+native-intent`, or Apple sign-in on the production bundle.

### Auth
- [ ] Existing email + password login
- [ ] `@username` + password login (login-with-username Edge Function)
- [ ] New email account signup → lands in the app with a profile (Confirm Email OFF path)
- [ ] Log out → log back in
- [ ] **Cold-start session restore:** force-close, reopen → still signed in
- [ ] **Forgot password** in the app → production email arrives (Resend, `no-reply@thecompeteapp.com`) → the web reset link works → the new password logs in on the app
- [ ] **Recovery deep links:** an old-format `competerf://reset-password…` link opens the reset screen (cold start and while running)
- [ ] **Complete Profile:** a session with no profile is routed there (never an existing account)
- [ ] **Apple Sign-In (iOS):** an existing Apple user goes straight to the app
- [ ] **New Apple signup:** Complete Profile → **create Compete password** → profile created → sign out → `@username` + that password logs in
- [ ] **Disabled account:** signs in and is ejected with a message. Deleted/tombstoned account: can't sign in.
- [ ] **Disabled/deleted account stays blocked after relaunch and re-auth:** while signed in on the device, have an admin disable the account (or delete it via Account → Delete Account on a test user). Then force-close and relaunch: the app must not restore a usable session. Re-auth attempts (email, `@username`, Apple) must also fail, with no route to Home or Complete Profile.
- [ ] Native Google Sign-In is **not visible** (unless explicitly approved for this release)

### Startup / routing
- [ ] Signed-in cold launch → Home, with no flash of the login screens
- [ ] Signed-out cold launch → Welcome / Profile signed-out view
- [ ] **Offline/error startup:** airplane mode during launch → error state with **Retry**; Retry recovers once online (never routed to Complete Profile)
- [ ] Warm resume from background (after at least 5 minutes) → session and data refresh
- [ ] Recovery link cold start, and recovery link while the app is running
- [ ] **Referral deep link:** `https://www.thecompeteapp.com/r/<code>` opens the app / referral flow
- [ ] `/join…` link (team invite) opens the app correctly
- [ ] **Notification deep link:** tapping a push opens its `deep_link` target (cold and warm)
- [ ] No routing loops, e.g. Welcome ↔ Complete Profile ↔ Home

### Core Compete
- [ ] Home tabs (Latest News / Featured Player / Featured Bar)
- [ ] Profile (own stats, history, Chip history, settings, notification preferences)
- [ ] Tournament discovery, filters, search, tournament details
- [ ] Registration / preregistration (player self-register; team invite)
- [ ] **TD access:** Admin tab visible; My Tournaments; Manage Players
- [ ] **Admin access:** global actions work **without** becoming a venue owner
- [ ] **Bar owner:** only their own venues editable; can't edit others'
- [ ] **Live Manager (elimination):** start, Queue, table assignment (manual + Auto Assign), record winner/result, audit/activity feed
- [ ] Giveaways page: active giveaways show entries; entering works (test user)
- [ ] **Push:** token registered on login; receives a test notification
- [ ] **Push token ownership after an account switch:** sign in as user A on the device, sign out, sign in as user B on the same device.
  - A notification sent to **B** arrives.
  - A notification sent to **A** does **not** arrive on this device. There's one active owner per device token (DB trigger and unique index); sign-out deactivates only this device's token.

### Chip (use a small throwaway test tournament)
- [ ] Setup → players marked **Ready**
- [ ] Shuffle / queue
- [ ] Table assignment
- [ ] Record a result → winner stays / chips update
- [ ] Chip counts correct; 0 chips → eliminated
- [ ] Audit/activity entries written
- [ ] Undo / restore of the last action
- [ ] Clean up the test tournament afterwards

**STOP / DO NOT SHIP if:**
- any auth test fails;
- any startup path loops or dead-ends;
- a deep link opens the wrong screen;
- a TD/admin/bar-owner permission is wrong;
- a Live Manager or Chip action corrupts state.

## GATE 4 — Store-Processed Validation

- [ ] **Play Console:** the build is processed, with no pre-launch report crashes and no policy warnings (permissions, Data safety, account deletion link).
- [ ] **App Store Connect:** the build is processed (not "Invalid Binary"); export compliance answered; TestFlight builds install.
- [ ] Store listing: screenshots, privacy, data safety and account deletion URL still accurate for this release.
- [ ] Review / test accounts in the store notes are still valid (see the Google review environment).
- [ ] Crash-free: the RC used for at least one full test session with no crash.

**STOP / DO NOT SHIP if:** the pre-launch report shows crashes, the store flags a policy issue, or processing fails.

## GATE 5 — Production Release

- [ ] "What's new" text written only from what is actually in this SHA.
- [ ] Android: Production release created from the tested versionCode.
  - Staged rollout (e.g. 20%) is recommended.
  - The final **"Send for review" / "Start rollout to Production"** click is done by the owner.
- [ ] iOS: submit the tested TestFlight build for review; choose manual or automatic release.
- [ ] After go-live:
  - watch Supabase logs and auth errors for 24–48 hours;
  - check the Play vitals / App Store crash reports.
- [ ] Only after adoption: consider raising `app_config.min_supported` (build numbers).
- [ ] Update the Build Record (store status) and tag the release SHA.

**STOP / DO NOT SHIP if:** any previous gate is unchecked, or the tested build number differs from the one being released.

---

## Build Record (copy per release)

```
Release: ______________________        Date: __________
Marketing version (both platforms): ________
Android versionCode: ________          iOS build number: ________
Commit SHA (clean): ______________________
EAS build ID — Android: ______________________   iOS: ______________________
Server/authz commit(s) shipped with it: ______________________
Flags: CHIP_APPLY_ENABLED=____  GOOGLE_NATIVE=____  GOOGLE_WEB=____  Confirm Email=____
Supabase URL in EAS production env: ______________________
Tester devices (model / OS): Android ____________  iOS ____________
GATE 3 results (pass/fail + notes): ______________________
Known issues accepted for this release: ______________________
Release notes (What's new): ______________________
Approval (name / date): ______________________
Store status — Play: __________  App Store: __________
min_supported change (if any, after adoption): __________
```
