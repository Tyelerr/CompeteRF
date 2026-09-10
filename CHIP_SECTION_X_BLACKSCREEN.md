# Section X — Intermittent Black / Blank Screen (Tournament Setup & Admin)

> **Status: ROOT CAUSE IDENTIFIED (high confidence) — NOT yet reproduced/verified on
> device by me. No "fix" is marked applied.** A candidate fix + a device reproduction &
> verification plan are below. Do not consider this resolved until it is reproduced and the
> fix confirmed on device.

## Symptoms (device-observed)
- On Tournament Setup / Admin tournament pages the whole screen randomly goes black/blank,
  typically **after editing a field or changing setup values** (sometimes with no obvious
  trigger).
- Taking a screenshot and switching to another app (e.g. WhatsApp) and returning makes the
  screen **render correctly again** → the data is present; it is a **render / layout /
  composite** problem, not data loss.

## Root cause (high confidence)
The Admin tournament hub renders all pages inside ONE shared `KeyboardAwareScroll`
(`pageScrollRef`) in `app/(tabs)/admin/manage-tournament/[id].tsx` (~line 6475). On iOS it
sets:

```tsx
automaticallyAdjustKeyboardInsets={ Platform.OS === "ios" && selectedPhase === "setup" }
```

There is an **existing in-code comment right there** (~6479–6485) documenting this exact
failure for the LIVE/RESULTS phases:

> "iOS's automaticallyAdjustKeyboardInsets mishandles content-size changes there — after a
> queue reorder / recorded winner the scroll view could blank until a full remount (all
> chip live subpages share this one ScrollView instance, so they all went black). Scoping
> the flag to setup fixes that without touching the keyboard behavior forms rely on."

So the blanking was **already diagnosed and worked around for live/results** by turning the
flag OFF there — but it remains **ON for SETUP** (`selectedPhase === "setup"`). Setup is
exactly where the user still sees the black screen, and setup is content-size-volatile
(adding/removing players, toggling sections, expanding/collapsing, keyboard open/close all
change the scroll content size). iOS `automaticallyAdjustKeyboardInsets` mishandling a
content-size change leaves the UIScrollView's content effectively unpainted (blank/black)
until something forces a re-layout/re-composite.

### Why a screenshot / app-switch "fixes" it
Backgrounding and foregrounding the app (which a screenshot + switch to WhatsApp triggers)
forces iOS to re-run layout and **re-composite** the view hierarchy. That repaint resolves
the stuck/unpainted scroll content — consistent with "the data was there, it just wasn't
drawn." This is the signature of a compositor/layout-stuck bug, not a state bug.

## Candidate fixes (ranked; NOT applied — need device verification)
1. **Stop relying on `automaticallyAdjustKeyboardInsets` for setup.** Setup forms need
   keyboard avoidance, but this specific prop is the trigger. Replace it with a keyboard
   approach that doesn't blank on content-size changes:
   - wrap setup content in `KeyboardAvoidingView` (`behavior="padding"` on iOS) instead of
     the auto-inset, or
   - use the `react-native-keyboard-aware-scroll-view` library's own inset handling
     (`enableAutomaticScroll`/`extraScrollHeight`) rather than the native
     `automaticallyAdjustKeyboardInsets`.
   Verify form fields still scroll above the keyboard after the change.
2. **Force a re-layout on content-size change** while keeping the prop: an `onContentSizeChange`
   that nudges the scroll (`scrollTo({ y: currentY })`) or toggles a 1px layout to trigger a
   repaint. Lower-confidence / hacky; prefer (1).
3. **Last resort:** turn `automaticallyAdjustKeyboardInsets` off for setup too (matching
   live/results) and handle the keyboard with a manual inset/offset — simplest, but may
   regress the keyboard-avoidance the setup forms rely on; verify carefully.

## Secondary things to rule out during verification
- A full-screen absolute overlay/backdrop stuck visible (modal backdrops use
  `rgba(0,0,0,0.6/0.7)` — a stuck one would dim, not fully black, but confirm no modal
  `visible` state is stuck true after an edit).
- A stuck `Animated`/opacity value (none found driving a full-screen view in the host).
- Image containers with a black `contain` ground going full-bleed (scoped to image cards;
  unlikely to cover the screen).
These are lower-probability than the keyboard-inset mechanism, which is corroborated by the
existing code comment.

## Diagnostic logging plan (to confirm on device before/with the fix)
Add temporary `__DEV__` logging (remove after):
- `pageScrollRef` `onContentSizeChange(w,h)` and `onLayout` — log sizes around the moment
  it blanks (expect a content-size change immediately before).
- `AppState` change (active/background) + whether the screen looks correct after returning.
- `selectedPhase` + `activeTab` at blank time (confirm it's a setup page).
- Any modal `visible` booleans (rule out a stuck overlay).
- React Navigation focus/blur for the screen.
Optionally a tiny on-screen debug HUD (behind `__DEV__`) showing content height + phase so a
screenshot of the black state still shows the values.

## Device reproduction & verification plan
1. iOS device (the reported platform), Tournament **Setup** of a chip tournament.
2. Exercise content-size changes repeatedly: add/remove players, open/close the keyboard on
   a text field (name, Fargo, fees), expand/collapse setup sections, switch Setup subtabs.
   Watch for the screen going black/blank.
3. When it blanks: take a screenshot, switch to another app, return — confirm it repaints
   (confirms the mechanism).
4. Apply candidate fix #1; repeat step 2 extensively. The blank should no longer occur, and
   keyboard avoidance on setup forms must still work (focused field scrolls above the
   keyboard).
5. Regression-check the LIVE/RESULTS pages (already working) are unaffected.

## Status
Root cause is strongly supported by the existing in-code comment + symptom match. It is an
**iOS render/layout issue on the setup page's shared KeyboardAwareScroll**, NOT data loss.
**Not marked fixed** — apply candidate fix #1 and verify via the plan above on device.
