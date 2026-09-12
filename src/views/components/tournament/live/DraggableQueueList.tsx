// src/views/components/tournament/live/DraggableQueueList.tsx
// Press-and-hold drag-to-reorder list for the chip "Manage Queue" modal. Long-press a row
// to lift it (haptic), drag vertically, and the surrounding rows animate out of the way;
// release commits the new index via onReorder. Normal vertical scrolling works when NOT
// dragging (scroll is disabled only while a row is actively held). Built on the already-
// installed react-native-gesture-handler + react-native-reanimated (+ worklets) — no new
// dependency and no drag library.
//
// This component is presentation-only: it reports the drop index through onReorder and lets
// the caller persist authoritative order (chip.queue) through the engine. Rows are a FIXED
// height (the caller passes rowHeight) so the reorder math is exact; the caller must only
// enable dragging when every row is uniform height (the chip screen disables it during a
// shuffle round, where an extra status line makes rows variable-height).

/* eslint-disable react-hooks/immutability -- reanimated shared values (SharedValue.value) are
   designed to be written inside worklets and gesture callbacks; the React Compiler
   immutability rule does not model reanimated and false-positives on every .value write in
   this file. All such writes here are legitimate reanimated usage. */
import React, { useEffect } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";

const SPRING = { damping: 22, stiffness: 240, mass: 0.6 } as const;

// id -> index map from the current id order.
const positionsFromIds = (ids: string[]): Record<string, number> => {
  const map: Record<string, number> = {};
  ids.forEach((id, i) => {
    map[id] = i;
  });
  return map;
};

// Worklet: move `activeId` to `newIndex`, shifting the entries in between by one. Handles
// arbitrary jumps (fast drags), not just adjacent swaps, so the live gaps never desync.
const reindex = (
  positions: Record<string, number>,
  activeId: string,
  newIndex: number,
): Record<string, number> => {
  "worklet";
  const oldIndex = positions[activeId];
  if (oldIndex == null || newIndex === oldIndex) return positions;
  const next: Record<string, number> = {};
  for (const key in positions) {
    const p = positions[key];
    if (key === activeId) {
      next[key] = newIndex;
    } else if (oldIndex < newIndex) {
      next[key] = p > oldIndex && p <= newIndex ? p - 1 : p;
    } else {
      next[key] = p >= newIndex && p < oldIndex ? p + 1 : p;
    }
  }
  return next;
};

interface RowProps {
  id: string;
  index: number;
  count: number;
  rowHeight: number;
  disabled: boolean;
  positions: SharedValue<Record<string, number>>;
  activeId: SharedValue<string | null>;
  longPressMs: number;
  onPickup: () => void;
  onDrop: (id: string, toIndex: number) => void;
  setScrollEnabled: (v: boolean) => void;
  children: React.ReactNode;
}

const QueueDragRow = ({
  id,
  index,
  count,
  rowHeight,
  disabled,
  positions,
  activeId,
  longPressMs,
  onPickup,
  onDrop,
  setScrollEnabled,
  children,
}: RowProps) => {
  const top = useSharedValue(index * rowHeight);
  const startTop = useSharedValue(index * rowHeight);
  const isActive = useSharedValue(false);

  // Follow position changes (both live reorders from OTHER rows being dragged and external
  // queue updates) when this row is not the one being held.
  useAnimatedReaction(
    () => positions.value[id],
    (cur, prev) => {
      if (cur == null) return;
      if (!isActive.value && cur !== prev) {
        top.value = withSpring(cur * rowHeight, SPRING);
      }
    },
  );

  const pan = Gesture.Pan()
    .enabled(!disabled)
    .activateAfterLongPress(longPressMs)
    .onStart(() => {
      isActive.value = true;
      activeId.value = id;
      startTop.value = (positions.value[id] ?? index) * rowHeight;
      top.value = startTop.value;
      runOnJS(setScrollEnabled)(false);
      runOnJS(onPickup)();
    })
    .onUpdate((e) => {
      top.value = startTop.value + e.translationY;
      const newIndex = Math.max(
        0,
        Math.min(count - 1, Math.round(top.value / rowHeight)),
      );
      if (newIndex !== positions.value[id]) {
        positions.value = reindex(positions.value, id, newIndex);
      }
    })
    .onEnd(() => {
      const finalIndex = positions.value[id] ?? index;
      top.value = withSpring(finalIndex * rowHeight, SPRING);
      isActive.value = false;
      activeId.value = null;
      runOnJS(setScrollEnabled)(true);
      runOnJS(onDrop)(id, finalIndex);
    })
    .onFinalize(() => {
      // Safety net for a cancelled gesture (no onEnd): snap back, re-enable scroll, and do
      // NOT commit a reorder.
      if (isActive.value) {
        isActive.value = false;
        activeId.value = null;
        top.value = withSpring((positions.value[id] ?? index) * rowHeight, SPRING);
        runOnJS(setScrollEnabled)(true);
      }
    });

  const style = useAnimatedStyle(() => ({
    position: "absolute",
    left: 0,
    right: 0,
    height: rowHeight,
    top: top.value,
    zIndex: isActive.value ? 20 : 1,
    elevation: isActive.value ? 8 : 0,
    shadowColor: "#000",
    shadowOpacity: isActive.value ? 0.3 : 0,
    shadowRadius: isActive.value ? 8 : 0,
    shadowOffset: { width: 0, height: isActive.value ? 4 : 0 },
    transform: [{ scale: withTiming(isActive.value ? 1.03 : 1, { duration: 120 }) }],
  }));

  return (
    <Animated.View style={style}>
      <GestureDetector gesture={pan}>
        <View style={styles.rowInner}>{children}</View>
      </GestureDetector>
    </Animated.View>
  );
};

export interface DraggableQueueListProps {
  ids: string[];
  rowHeight: number;
  maxHeight?: number; // optional cap; by default the list flexes to fill its parent
  renderRow: (id: string, index: number) => React.ReactNode;
  onReorder: (id: string, toIndex: number) => void;
  onPickup?: () => void; // fired when a row is lifted (haptic lives here)
  disabled?: boolean;
  longPressMs?: number; // hold duration before drag activates (default 400ms)
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
  const positions = useSharedValue<Record<string, number>>(positionsFromIds(ids));
  const activeId = useSharedValue<string | null>(null);
  const [scrollEnabled, setScrollEnabled] = React.useState(true);

  // Re-sync when the authoritative id order changes externally (a committed reorder, a
  // poll/reload, a seat/removal) — but never mid-drag, so a live hold is not clobbered.
  useEffect(() => {
    if (activeId.value == null) {
      positions.value = positionsFromIds(ids);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  const pickup = () => onPickup?.();

  return (
    <ScrollView
      style={maxHeight != null ? { flex: 1, maxHeight } : { flex: 1 }}
      scrollEnabled={scrollEnabled}
      showsVerticalScrollIndicator
      contentContainerStyle={{ height: ids.length * rowHeight }}
    >
      {ids.map((id, i) => (
        <QueueDragRow
          key={id}
          id={id}
          index={i}
          count={ids.length}
          rowHeight={rowHeight}
          disabled={disabled}
          positions={positions}
          activeId={activeId}
          longPressMs={longPressMs}
          onPickup={pickup}
          onDrop={onReorder}
          setScrollEnabled={setScrollEnabled}
        >
          {renderRow(id, i)}
        </QueueDragRow>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  rowInner: { flex: 1 },
});
