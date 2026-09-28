// src/views/components/tournament/live/NativeQueueReorderList.tsx
// NATIVE (iOS/Android) Chip queue list with handle-only drag, built on
// react-native-reorderable-list (JS-only; Reanimated 4 + gesture-handler 2 — both already in
// the SDK 57 / Expo Go runtime, so no native rebuild).
//
// The library owns ONLY the visual drag: the held row follows the finger, neighbours make room,
// and on release it lands the row and resets every cell's translation on the UI thread
// (Reanimated shared values) BEFORE reporting {from, to}. That is the property our custom
// PanResponder + Animated list lacked: its native-driver transforms lived outside React's view
// tree and could survive a reorder (stacked rows / empty gaps on device).
//
// Compete owns the ORDER. `ids` is always the authoritative queue (chip.queue); the drop is
// handed to `onMove(id, toIndex)` → vm.moveQueueTo → engine moveQueueEntry (same path as the ⋮
// Move Up/Down/Top/Bottom). The library's array is never persisted. If Compete refuses the
// move, `ids` doesn't change and the rows are already back in their original slots.
//
// Handle-only: the list's pan does nothing until drag() is called, and drag() is called only
// from the ☰ press-in. The row, ⋮ and the rest of the card never start a drag.
// The host must render this inside a GestureHandlerRootView (RN Modals need their own).
//
// `nested`: the rows live inside a page ScrollView (the mobile Live dashboard Queue card)
// instead of owning their own scroll. The host must then use the library's
// ScrollViewContainer as that page ScrollView — it shares the page scroll offset with the list
// and force-disables page scrolling for the duration of a drag. `ids` may be a PREFIX of the
// queue (the dashboard preview); a prefix starts at 0, so list indexes ARE queue indexes.

import React, { createContext, memo, useCallback, useContext, useRef } from "react";
import { Pressable, StyleSheet, View, type ListRenderItemInfo, type StyleProp, type ViewStyle } from "react-native";
import ReorderableList, {
  NestedReorderableList,
  type ReorderableListReorderEvent,
  useIsActive,
  useReorderableDrag,
} from "react-native-reorderable-list";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { COLORS } from "../../../../theme/colors";
import { RADIUS, SPACING } from "../../../../theme/spacing";
import { moderateScale, scale } from "../../../../utils/scaling";

// Understated lift (Spotify-like): keep the library's gentle scale, but no fade.
const CELL_ANIMATIONS = { opacity: 1 };
// Nested (dashboard card): NO scale. The list clips at its own bounds, and the library's
// default 1.025 scale pushed the lifted row ~1.25% past each edge (rank + ☰ were cut off).
// `transform: []` is the library's documented way to disable its default scale; the lighter
// background + shadow still mark the held row.
const CELL_ANIMATIONS_NESTED = { opacity: 1, transform: [] };

export interface NativeQueueReorderListProps {
  ids: string[];
  // Render one row; `handle` is the ☰ to place at the far right (null when not reorderable).
  // `lifted` is true for the row currently being dragged (lets the host drop its separator).
  renderRow: (id: string, index: number, handle: React.ReactNode | null, lifted: boolean) => React.ReactNode;
  onMove: (id: string, toIndex: number) => void;
  enabled: boolean;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  nested?: boolean;
}

// The id whose ☰ started the current drag — the drop acts on THIS player, never on whatever
// happens to sit at `from` if the queue changed underneath the drag.
const DraggedIdContext = createContext<{ current: string | null }>({ current: null });

const DragHandle = ({ id }: { id: string }) => {
  const drag = useReorderableDrag();
  const draggedRef = useContext(DraggedIdContext);
  return (
    <Pressable
      onPressIn={() => {
        draggedRef.current = id;
        void Haptics.selectionAsync().catch(() => {});
        drag();
      }}
      style={styles.handle}
      hitSlop={{ top: 6, bottom: 6, left: 4, right: 8 }}
      accessibilityRole="adjustable"
      accessibilityLabel="Drag to reorder"
    >
      <Ionicons name="reorder-three" size={moderateScale(24)} color={COLORS.textMuted} />
    </Pressable>
  );
};

const Cell = memo(function Cell({
  id,
  index,
  canDrag,
  nested,
  renderRow,
}: {
  id: string;
  index: number;
  canDrag: boolean;
  nested: boolean;
  renderRow: NativeQueueReorderListProps["renderRow"];
}) {
  const active = useIsActive();
  return (
    <View style={active ? (nested ? styles.activeCellNested : styles.activeCell) : null}>
      {renderRow(id, index, canDrag ? <DragHandle id={id} /> : null, active)}
    </View>
  );
});

export const NativeQueueReorderList = ({
  ids,
  renderRow,
  onMove,
  enabled,
  style,
  contentContainerStyle,
  nested = false,
}: NativeQueueReorderListProps) => {
  const canDrag = enabled && ids.length > 1;
  const draggedId = useRef<string | null>(null);
  const handleReorder = useCallback(
    ({ from, to }: ReorderableListReorderEvent) => {
      const id = draggedId.current;
      draggedId.current = null;
      // Only commit when the row at `from` is still the one that was picked up; otherwise the
      // queue changed mid-drag → do nothing (the authoritative ids re-render the list).
      if (id == null || ids[from] !== id || from === to) return;
      onMove(id, to);
    },
    [ids, onMove],
  );
  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<string>) => (
      <Cell id={item} index={index} canDrag={canDrag} nested={nested} renderRow={renderRow} />
    ),
    [canDrag, nested, renderRow],
  );
  return (
    <DraggedIdContext.Provider value={draggedId}>
      {nested ? (
        <NestedReorderableList
          data={ids}
          keyExtractor={(id) => id}
          renderItem={renderItem}
          onReorder={handleReorder}
          dragEnabled={canDrag}
          shouldUpdateActiveItem
          cellAnimations={CELL_ANIMATIONS_NESTED}
          // A small, fully-rendered preview that never scrolls on its own: scrollable={false}
          // (library) + scrollEnabled={false} (FlatList). The latter is what tells React Native
          // this is not a nested same-direction scroller (no VirtualizedList-in-ScrollView
          // error); the page's ScrollViewContainer does all the scrolling.
          scrollable={false}
          scrollEnabled={false}
          style={style}
          contentContainerStyle={contentContainerStyle}
        />
      ) : (
        <ReorderableList
          data={ids}
          keyExtractor={(id) => id}
          renderItem={renderItem}
          onReorder={handleReorder}
          dragEnabled={canDrag}
          shouldUpdateActiveItem
          cellAnimations={CELL_ANIMATIONS}
          style={style}
          contentContainerStyle={contentContainerStyle}
          showsVerticalScrollIndicator
        />
      )}
    </DraggedIdContext.Provider>
  );
};

const styles = StyleSheet.create({
  handle: {
    width: scale(40),
    minHeight: scale(44),
    alignItems: "center",
    justifyContent: "center",
    marginLeft: scale(SPACING.md),
  },
  // Held row: one shade lighter than the Queue card, soft shadow — no outline.
  activeCell: {
    backgroundColor: COLORS.surfaceLight,
    borderRadius: RADIUS.sm,
    shadowColor: COLORS.black,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  // Nested (dashboard card) held row: same lighter card, but the shadow falls only BELOW it
  // (offset == radius → zero spread above). The popup's 10-radius / 4-offset shadow spilled
  // ~6pt of dark haze above the card onto the row above — the "dark bar" on the dashboard.
  activeCellNested: {
    backgroundColor: COLORS.surfaceLight,
    borderRadius: RADIUS.sm,
    shadowColor: COLORS.black,
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
});
