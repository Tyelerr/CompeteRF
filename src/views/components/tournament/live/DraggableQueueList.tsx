// src/views/components/tournament/live/DraggableQueueList.tsx
// Press-and-hold drag-to-reorder for the chip "Manage Queue" (pop-out modal AND the full
// Live → Queue page). Built on React Native CORE only — PanResponder + Animated — so it needs
// NO gesture-handler, NO reanimated, NO worklets, and NO root provider. This is deliberate:
// the earlier gesture-handler/reanimated version never activated on device (New Arch), so this
// uses the responder system that always works, including inside ScrollViews and Modals.
//
// Interaction: touch a row and hold ~longPressMs WITHOUT moving → the row arms (haptic + lift),
// then dragging moves it and the other rows slide out of the way; release commits the index via
// onReorder. A quick vertical swipe never arms (movement cancels the hold) so the parent
// ScrollView scrolls normally; once armed the row refuses to yield the touch back to the parent.
// Rows are a FIXED height (rowHeight) so the reorder math is exact.

/* eslint-disable react-hooks/refs -- this component is intentionally imperative: it uses
   PanResponder + Animated with refs for the drag lifecycle (a stable PanResponder, lazily
   created per-row Animated.Values, and "latest value" refs read inside gesture callbacks that
   run long after render). The React Compiler refs rule does not model this pattern and
   false-positives on every such access; all ref use here is the standard, safe RN idiom. */
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  PanResponder,
  type PanResponderInstance,
  ScrollView,
  StyleSheet,
} from "react-native";
import { COLORS } from "../../../../theme/colors";
import { RADIUS } from "../../../../theme/spacing";

// Movement (px) during the hold that reclassifies the touch as a scroll and cancels arming.
const SCROLL_CANCEL_PX = 12;

interface RowHandlers {
  onLongActivate: (id: string) => void;
  onMove: (id: string, dy: number) => void;
  onRelease: (id: string) => void;
}

interface DragRowProps {
  id: string;
  index: number;
  rowHeight: number;
  disabled: boolean;
  longPressMs: number;
  isActive: boolean;
  offset: Animated.Value; // vertical displacement from the row's base slot
  handlers: RowHandlers;
  children: React.ReactNode;
}

const DragRow = ({
  id,
  index,
  rowHeight,
  disabled,
  longPressMs,
  isActive,
  offset,
  handlers,
  children,
}: DragRowProps) => {
  // The PanResponder is created ONCE; these refs let its long-lived closures read the latest
  // props/callbacks without recreating it (which would drop an in-flight gesture).
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const longPressRef = useRef(longPressMs);
  longPressRef.current = longPressMs;

  const armed = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimer = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const responder = useRef<PanResponderInstance | null>(null);
  if (responder.current == null) {
    responder.current = PanResponder.create({
      // Do NOT claim the touch on start (so a swipe can still scroll the parent) — but start
      // the long-press arming timer as a side effect.
      onStartShouldSetPanResponder: () => {
        if (disabledRef.current) return false;
        armed.current = false;
        clearTimer();
        timer.current = setTimeout(() => {
          armed.current = true;
          handlersRef.current.onLongActivate(id);
        }, longPressRef.current);
        return false;
      },
      // Claim the touch ONLY once armed. Before arming, any real movement means the user is
      // scrolling → cancel the hold and let the parent ScrollView have it.
      onMoveShouldSetPanResponder: (_e, g) => {
        if (disabledRef.current) return false;
        if (!armed.current) {
          if (Math.abs(g.dy) > SCROLL_CANCEL_PX || Math.abs(g.dx) > SCROLL_CANCEL_PX) clearTimer();
          return false;
        }
        return true;
      },
      onPanResponderMove: (_e, g) => {
        if (armed.current) handlersRef.current.onMove(id, g.dy);
      },
      onPanResponderRelease: () => {
        clearTimer();
        if (armed.current) {
          armed.current = false;
          handlersRef.current.onRelease(id);
        }
      },
      onPanResponderTerminate: () => {
        clearTimer();
        if (armed.current) {
          armed.current = false;
          handlersRef.current.onRelease(id);
        }
      },
      // Once armed/dragging, don't let the parent ScrollView steal the gesture back.
      onPanResponderTerminationRequest: () => !armed.current,
    });
  }

  useEffect(() => clearTimer, []);

  return (
    <Animated.View
      {...responder.current.panHandlers}
      style={[
        styles.row,
        {
          top: index * rowHeight,
          height: rowHeight,
          transform: [{ translateY: offset }, { scale: isActive ? 1.03 : 1 }],
          zIndex: isActive ? 20 : 1,
        },
        isActive && styles.rowActive,
      ]}
    >
      {children}
    </Animated.View>
  );
};

export interface DraggableQueueListProps {
  ids: string[];
  rowHeight: number;
  maxHeight?: number;
  renderRow: (id: string, index: number) => React.ReactNode;
  onReorder: (id: string, toIndex: number) => void;
  onPickup?: () => void; // fired when a row arms (haptic lives here)
  disabled?: boolean;
  longPressMs?: number;
}

export const DraggableQueueList = ({
  ids,
  rowHeight,
  maxHeight,
  renderRow,
  onReorder,
  onPickup,
  disabled = false,
  longPressMs = 400,
}: DraggableQueueListProps) => {
  const [order, setOrder] = useState<string[]>(ids);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [scrollEnabled, setScrollEnabled] = useState(true);

  const orderRef = useRef<string[]>(ids);
  orderRef.current = order;
  const draggingRef = useRef<{ id: string; startIndex: number; hoverIndex: number } | null>(null);

  // Per-id vertical displacement from its base slot (Animated so moves don't re-render React).
  const offsets = useRef<Record<string, Animated.Value>>({});
  const getOffset = (id: string) => {
    if (!offsets.current[id]) offsets.current[id] = new Animated.Value(0);
    return offsets.current[id];
  };
  const resetOffsets = () => {
    for (const key in offsets.current) {
      offsets.current[key].stopAnimation();
      offsets.current[key].setValue(0);
    }
  };

  // Latest callbacks/props read by the stable handlers object (which is created once).
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;
  const onPickupRef = useRef(onPickup);
  onPickupRef.current = onPickup;
  const rowHeightRef = useRef(rowHeight);
  rowHeightRef.current = rowHeight;

  // Re-sync when the authoritative id order changes externally (a committed reorder, a poll /
  // reload, a seat / removal) — but never mid-drag, so a live hold is not clobbered.
  useEffect(() => {
    if (!draggingRef.current) {
      setOrder(ids);
      resetOffsets();
    }
  }, [ids]);

  const handlers = useRef<RowHandlers>({
    onLongActivate: (id) => {
      const startIndex = orderRef.current.indexOf(id);
      if (startIndex < 0) return;
      draggingRef.current = { id, startIndex, hoverIndex: startIndex };
      setActiveId(id);
      setScrollEnabled(false);
      onPickupRef.current?.();
    },
    onMove: (id, dy) => {
      const d = draggingRef.current;
      if (!d || d.id !== id) return;
      const rh = rowHeightRef.current;
      getOffset(id).setValue(dy); // active row follows the finger
      const n = orderRef.current.length;
      const newHover = Math.max(0, Math.min(n - 1, Math.round(d.startIndex + dy / rh)));
      if (newHover === d.hoverIndex) return;
      d.hoverIndex = newHover;
      // Slide every other row to the slot it would occupy if the active row dropped at newHover.
      orderRef.current.forEach((oid, i) => {
        if (oid === id) return;
        let shift = 0;
        if (d.startIndex < newHover && i > d.startIndex && i <= newHover) shift = -rh;
        else if (d.startIndex > newHover && i >= newHover && i < d.startIndex) shift = rh;
        Animated.timing(getOffset(oid), { toValue: shift, duration: 140, useNativeDriver: true }).start();
      });
    },
    onRelease: (id) => {
      const d = draggingRef.current;
      draggingRef.current = null;
      setActiveId(null);
      setScrollEnabled(true);
      resetOffsets();
      if (!d || d.id !== id) return;
      if (d.hoverIndex !== d.startIndex) onReorderRef.current(id, d.hoverIndex);
    },
  }).current;

  return (
    <ScrollView
      style={maxHeight != null ? { flex: 1, maxHeight } : { flex: 1 }}
      scrollEnabled={scrollEnabled}
      showsVerticalScrollIndicator
      contentContainerStyle={{ height: order.length * rowHeight }}
    >
      {order.map((id, i) => (
        <DragRow
          key={id}
          id={id}
          index={i}
          rowHeight={rowHeight}
          disabled={disabled}
          longPressMs={longPressMs}
          isActive={activeId === id}
          offset={getOffset(id)}
          handlers={handlers}
        >
          {renderRow(id, i)}
        </DragRow>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  row: { position: "absolute", left: 0, right: 0 },
  // Obvious lifted state (the user asked for a very visible pickup): tinted background, a
  // primary border, and an Android shadow.
  rowActive: {
    backgroundColor: COLORS.backgroundCard,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: RADIUS.sm,
    elevation: 10,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
});
