// src/views/components/tournament/live/QueueDragList.tsx
// Handle-only drag-to-reorder for the Chip queue (native + web). Presentation + gesture only:
// the drop is handed to `onMove(id, toIndex)`, which the screen routes to the VM's
// moveQueueTo → engine moveQueueEntry (the same primitive + update() path as Move
// Up/Down/Top/Bottom). No queue order lives here beyond the in-flight drag.
//
// Why the earlier queue-drag attempts never activated on device, and what this does instead:
//   • They armed on a press-and-hold of the WHOLE row and only claimed the touch once it
//     moved. On iOS (Fabric) a UIScrollView only defers to a JS responder that is an
//     ANCESTOR of the scroll view (RCTScrollViewComponentView _shouldDisableScrollInteraction),
//     so a responder INSIDE the list is simply cancelled the moment the ScrollView starts
//     panning — the drag never received a move.
//   • Here the ☰ handle is the only drag start. It claims the touch immediately on
//     touch-down (and refuses to hand it back), and `onDragActiveChange(true)` fires in the
//     same grant so the host ScrollView flips scrollEnabled=false before the finger has
//     travelled far enough for the scroll pan to begin. Everywhere else in the row (⋮, the
//     name, empty space) the ScrollView scrolls exactly as before.
//   • Core PanResponder + Animated only — no gesture-handler / reanimated / worklets, no
//     GestureHandlerRootView (RN Modals need their own), works the same in Expo Go.
// Rows stay in normal layout flow (variable heights are measured), keyed by entry id; the
// list does not own a ScrollView (the host keeps its own).
//
// WEB uses the same component: react-native-web's responder system tracks the pointer at
// document level once the handle owns it, so mouse / trackpad / touch drags all flow through
// the same PanResponder and the same onMove(id, toIndex). Web-only interaction polish (never
// applied on native): grab/grabbing cursor, touch-action none on the handle, page text
// selection suppressed for the drag, no haptics, JS-driven Animated, and a drag is cancelled
// (not committed) if the window loses focus mid-drag.
//
// MOTION (Spotify-like): the held row is a floating layer glued to the pointer — its
// translateY is exactly the gesture's dy on every move, never quantized to a slot. The target
// slot is tracked separately; when the row's centre crosses a neighbour's midpoint only the
// NEIGHBOUR eases (ease-out) into the gap. On release the floating row eases into its final
// slot and lands (lift → 0), the drop is committed, and only after the settle does the list
// swap to the authoritative order. Geometry + lifecycle rules live in utils/queue-drag-model
// (unit-tested). Everything motion-related is a transform — the lift never changes layout.
//
// DROP HANDOFF (fix for "row disappears after drop" on device): at the swap, every row gets a
// BRAND-NEW Animated.Value(0) in the same render as the new order. The previous version kept
// the same values and zeroed them with setValue(0) in a layout effect AFTER the reordered
// render; with the native driver that reset races the Fabric commit carrying the stale
// landing offset, so the moved row was laid out in its new slot AND still displaced by its
// landing offset (drawn on top of another row, its own slot empty: ranks 1, 2, _, 4, 5).
// Fresh values mean no offset can survive the swap on any platform. The transform shape is
// also constant ([translateY, scale]) so activating/clearing a row never re-shapes the node.

import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, PanResponder, type PanResponderInstance, Platform, StyleSheet, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../../../../theme/colors";
import { RADIUS, SPACING } from "../../../../theme/spacing";
import { moderateScale, scale } from "../../../../utils/scaling";
import {
  displayIndex as dragDisplayIndex,
  dragTargetIndex,
  landingOffset,
  neighborShift,
} from "../../../../utils/queue-drag-model";

const IS_WEB = Platform.OS === "web";
const NATIVE_DRIVER = !IS_WEB;
const SHIFT_MS = 190; // neighbours easing into / out of the gap
const SETTLE_MS = 170; // the floating row landing in its slot on release
const LIFT_SCALE = 1.015;
const EASE_OUT = Easing.out(Easing.cubic);

const haptic = () => {
  if (IS_WEB) return;
  void Haptics.selectionAsync().catch(() => {});
};

// Web: no text selection + a grabbing cursor across the whole page while a row is held.
const setWebDragging = (on: boolean) => {
  if (!IS_WEB || typeof document === "undefined") return;
  const st = document.body.style as CSSStyleDeclaration & { webkitUserSelect?: string };
  st.userSelect = on ? "none" : "";
  st.webkitUserSelect = on ? "none" : "";
  st.cursor = on ? "grabbing" : "";
};

// Web: a ☰ press (drag or plain click) is followed by the browser's native `click`, fired on
// the nearest element containing both mousedown and mouseup — the ROW, because the held row
// travels with the cursor. On a pressable row (the dashboard preview → Player Details)
// react-native-web turns that click into the row's onPress. The handle's responder owns the
// gesture but never sees that follow-up click, so: swallow the ONE click that belongs to this
// press (capture phase, before any row handler), and drop the guard on the next tick after
// release. A normal row click never touches ☰ → never armed → opens Player Details as usual.
let webClickGuardOff: (() => void) | null = null;
const armWebClickGuard = () => {
  if (!IS_WEB || typeof window === "undefined") return;
  webClickGuardOff?.();
  const swallow = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };
  window.addEventListener("click", swallow, true);
  const off = () => {
    window.removeEventListener("click", swallow, true);
    if (webClickGuardOff === off) webClickGuardOff = null;
  };
  webClickGuardOff = off;
};
const releaseWebClickGuard = () => {
  const off = webClickGuardOff;
  if (off) setTimeout(off, 0); // after the click that the browser dispatches for this mouseup
};

interface DragCallbacks {
  onStart: (id: string) => void;
  onMove: (id: string, dy: number) => void;
  onEnd: (id: string, commit: boolean) => void;
}

// The ☰ grip. It is the ONLY place a drag can start (the row itself has no gesture).
const DragHandle = ({ id, callbacks }: { id: string; callbacks: React.MutableRefObject<DragCallbacks> }) => {
  const [responder] = useState<PanResponderInstance>(() =>
    PanResponder.create({
      // Claim on touch-down (capture too, so no child/parent wins the race) and keep it.
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: () => {
        armWebClickGuard();
        callbacks.current.onStart(id);
      },
      onPanResponderMove: (_e, g) => callbacks.current.onMove(id, g.dy),
      onPanResponderRelease: () => {
        releaseWebClickGuard();
        callbacks.current.onEnd(id, true);
      },
      // The OS took the touch (call, notification, gesture lockout) → cancel, never commit.
      onPanResponderTerminate: () => {
        releaseWebClickGuard();
        callbacks.current.onEnd(id, false);
      },
    }),
  );
  return (
    <View
      {...responder.panHandlers}
      style={IS_WEB ? [styles.handleWeb, WEB_HANDLE_CURSOR] : styles.handle}
      accessibilityRole="adjustable"
      accessibilityLabel="Drag to reorder"
      hitSlop={IS_WEB ? undefined : { top: 6, bottom: 6, left: 4, right: 8 }}
    >
      <Ionicons name="reorder-three" size={IS_WEB ? 20 : moderateScale(24)} color={COLORS.textMuted} />
    </View>
  );
};

export interface QueueDragListProps {
  ids: string[];
  // Render one row; `handle` is the ☰ element to place at the far right (null when the
  // list is not reorderable, so no fake handle is ever shown).
  renderRow: (id: string, index: number, handle: React.ReactNode | null) => React.ReactNode;
  onMove: (id: string, toIndex: number) => void;
  // Host ScrollView toggles scrollEnabled with this (false for the whole drag + settle). The
  // host also pauses its own 1 Hz re-render while it's true, so the JS-driven follow never
  // stalls mid-drag.
  onDragActiveChange?: (active: boolean) => void;
  enabled: boolean;
}

type DragState = { id: string; from: number; to: number; ids: string[]; settling: boolean };

export const QueueDragList = ({ ids, renderRow, onMove, onDragActiveChange, enabled }: QueueDragListProps) => {
  const [order, setOrder] = useState<string[]>(ids);
  const [activeId, setActiveId] = useState<string | null>(null);
  // Live slot preview → the rank numbers re-flow while dragging (the held row shows the
  // position it will land in; displaced neighbours shift ±1). Updates only on slot changes.
  const [preview, setPreview] = useState<{ id: string; from: number; to: number } | null>(null);
  const orderRef = useRef(order);
  // Plain mutable maps / values (not refs) — read during render for the row transforms.
  const [heights] = useState(() => new Map<string, number>());
  const [offsets] = useState(() => new Map<string, Animated.Value>());
  const [lift] = useState(() => new Animated.Value(0)); // 0 resting → 1 floating
  const drag = useRef<DragState | null>(null);
  const latestIds = useRef(ids);
  const onMoveRef = useRef(onMove);
  const onActiveRef = useRef(onDragActiveChange);
  useEffect(() => {
    onMoveRef.current = onMove;
    onActiveRef.current = onDragActiveChange;
  }, [onMove, onDragActiveChange]);

  const offsetOf = (id: string) => {
    let v = offsets.get(id);
    if (!v) { v = new Animated.Value(0); offsets.set(id, v); }
    return v;
  };
  // Swap in a new rendered order. Every row gets a FRESH zero offset in this same render
  // (old values are stopped and dropped, never reset in place) — see DROP HANDOFF above.
  const applyOrder = (next: string[]) => {
    for (const v of offsets.values()) v.stopAnimation();
    offsets.clear();
    orderRef.current = next;
    setOrder(next);
  };

  const finishDrag = () => {
    drag.current = null;
    setActiveId(null);
    setPreview(null);
    setWebDragging(false);
    onActiveRef.current?.(false);
  };

  // Follow the authoritative queue. During a SETTLE the new ids are held until the landing
  // animation finishes (then applied in one commit). If the queue changes under an ACTIVE
  // drag (a match finished, a poll/reload landed) the drag is cancelled rather than dropped
  // onto a stale layout.
  useEffect(() => {
    latestIds.current = ids;
    const d = drag.current;
    if (d?.settling) return;
    if (d && d.ids.join("|") !== ids.join("|")) {
      lift.stopAnimation();
      lift.setValue(0);
      drag.current = null;
      setActiveId(null);
      setPreview(null);
      setWebDragging(false);
      onActiveRef.current?.(false);
    }
    if (!drag.current) applyOrder(ids);
    // applyOrder only touches stable state (offsets map, orderRef, setOrder).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, lift]);

  // Web: window blur mid-drag (alt-tab, release outside the browser) → cancel, never commit;
  // and never leave the page stuck with selection disabled if this list unmounts mid-drag.
  useEffect(() => {
    if (!IS_WEB || typeof window === "undefined") return;
    const onBlur = () => {
      releaseWebClickGuard(); // released outside the window → no click is coming
      const d = drag.current;
      if (d && !d.settling) callbacks.current.onEnd(d.id, false);
    };
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("blur", onBlur);
      setWebDragging(false);
      releaseWebClickGuard();
    };
  }, []);

  const callbacks = useRef<DragCallbacks>({
    onStart: (id) => {
      if (drag.current) return; // one row at a time (also ignores a grab mid-settle)
      const from = orderRef.current.indexOf(id);
      if (from < 0) return;
      drag.current = { id, from, to: from, ids: orderRef.current.slice(), settling: false };
      setActiveId(id);
      setPreview({ id, from, to: from });
      onActiveRef.current?.(true);
      setWebDragging(true);
      haptic();
      Animated.timing(lift, { toValue: 1, duration: 140, easing: EASE_OUT, useNativeDriver: NATIVE_DRIVER }).start();
    },
    onMove: (id, dy) => {
      const d = drag.current;
      if (!d || d.id !== id || d.settling) return;
      // The floating row is glued to the pointer: raw dy, never snapped to a slot.
      offsetOf(id).setValue(dy);
      const list = d.ids;
      const to = dragTargetIndex(list, heights, d.from, dy);
      if (to === d.to) return;
      const prevTo = d.to;
      d.to = to;
      setPreview({ id, from: d.from, to });
      haptic();
      // Only the neighbours whose gap position actually changed ease into place.
      const heldH = heights.get(id) ?? 0;
      list.forEach((k, i) => {
        if (k === id) return;
        const next = neighborShift(i, d.from, to, heldH);
        if (next === neighborShift(i, d.from, prevTo, heldH)) return;
        Animated.timing(offsetOf(k), { toValue: next, duration: SHIFT_MS, easing: EASE_OUT, useNativeDriver: NATIVE_DRIVER }).start();
      });
    },
    onEnd: (id, commit) => {
      const d = drag.current;
      if (!d || d.id !== id || d.settling) return;
      d.settling = true;
      const to = commit ? d.to : d.from;
      if (to !== d.to) setPreview({ id, from: d.from, to }); // cancel → numbers flow back
      // Where the floating row lands, relative to its original slot.
      const landing = landingOffset(d.ids, heights, d.from, to);
      const moved = to !== d.from;
      // 1) the target is final → 2) commit through the authoritative path right away (the VM
      // queue update is held by the ids effect until the landing finishes).
      if (moved) onMoveRef.current(id, to);
      const anims: Animated.CompositeAnimation[] = [
        Animated.timing(offsetOf(id), { toValue: landing, duration: SETTLE_MS, easing: EASE_OUT, useNativeDriver: NATIVE_DRIVER }),
        Animated.timing(lift, { toValue: 0, duration: SETTLE_MS, easing: EASE_OUT, useNativeDriver: NATIVE_DRIVER }),
      ];
      if (!moved) {
        // Cancel / drop in place: neighbours glide back out of the gap.
        for (const k of d.ids) {
          if (k !== id) anims.push(Animated.timing(offsetOf(k), { toValue: 0, duration: SETTLE_MS, easing: EASE_OUT, useNativeDriver: NATIVE_DRIVER }));
        }
      }
      // 3) land → 4) swap the real order in (one commit) and clear the drag.
      Animated.parallel(anims).start(() => {
        // Adopt the AUTHORITATIVE queue (the VM's synchronous update has landed during the
        // settle). If the VM refused the move (read-only / gate), this is the old order and
        // the row honestly returns — the list never shows an order that wasn't accepted.
        finishDrag();
        applyOrder(latestIds.current);
      });
    },
  });

  const liftScale = lift.interpolate({ inputRange: [0, 1], outputRange: [1, LIFT_SCALE] });
  return (
    <View>
      {order.map((id, i) => {
        const active = activeId === id;
        return (
          <Animated.View
            key={id}
            onLayout={(e) => { heights.set(id, e.nativeEvent.layout.height); }}
            style={[
              { transform: [{ translateY: offsetOf(id) }, { scale: active ? liftScale : 1 }] },
              active && styles.floating,
              active && IS_WEB && styles.floatingWeb,
            ]}
          >
            {renderRow(id, dragDisplayIndex(id, i, preview), enabled && order.length > 1 ? <DragHandle id={id} callbacks={callbacks} /> : null)}
          </Animated.View>
        );
      })}
    </View>
  );
};

// Web-only CSS (not valid RN style keys, so kept out of StyleSheet).
const WEB_HANDLE_CURSOR: any = IS_WEB ? { cursor: "grab", touchAction: "none", userSelect: "none" } : null;

const styles = StyleSheet.create({
  handle: {
    width: scale(40),
    minHeight: scale(44),
    alignItems: "center",
    justifyContent: "center",
    marginLeft: scale(SPACING.md),
  },
  handleWeb: {
    width: 32,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: SPACING.sm,
    borderRadius: RADIUS.sm,
  },
  // The held row: one shade lighter than the list with a soft shadow (Spotify-style). No
  // outline, no border — nothing that changes layout.
  floating: {
    zIndex: 20,
    elevation: 6,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: RADIUS.sm,
    shadowColor: COLORS.black,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  // WEB only, held row only: a small LEFT inset so the rank isn't flush against the lifted
  // card's edge (dashboard rows have no side padding). Horizontal only → the row's height (and
  // the drag geometry) never changes; chips / ⋮ / ☰ stay put (they're right-anchored).
  floatingWeb: {
    paddingLeft: SPACING.sm,
  },
});
