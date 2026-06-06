// src/views/components/tournament/live/BracketCanvas.tsx
// Pinch-zoom + drag-pan canvas that lays out the single-elimination skeleton.
// Round 1 nodes are real (live) matches; later rounds render as muted TBD nodes
// so the bracket reads as a whole. Connectors are drawn with thin Views (no SVG).

import { useRef } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  GestureHandlerRootView,
  PanGestureHandler,
  PinchGestureHandler,
  PanGestureHandlerStateChangeEvent,
  PinchGestureHandlerStateChangeEvent,
  State,
} from "react-native-gesture-handler";
import { COLORS } from "../../../../theme/colors";
import { RADIUS, SPACING } from "../../../../theme/spacing";
import { FONT_SIZES } from "../../../../theme/typography";
import { webMs, webSc } from "../../../../utils/scaling";
import { LiveMatch } from "../../../../utils/match.utils";
import { MatchNode, NODE_HEIGHT, NODE_WIDTH } from "./MatchNode";

const GAP_X = 52;
const GAP_Y = 18;
const VIEWPORT_HEIGHT = 460;
const MIN_SCALE = 0.4;
const MAX_SCALE = 2.5;

interface NodePos {
  x: number;
  y: number;
  round: number;
  index: number;
  match: LiveMatch | null;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const buildLayout = (
  round1: LiveMatch[],
  bracketSize: number,
): { nodes: NodePos[]; width: number; height: number } => {
  const round0Count = Math.max(1, Math.round(bracketSize / 2));
  const totalRounds = Math.max(1, Math.round(Math.log2(bracketSize)) || 1);
  const rowStride = NODE_HEIGHT + GAP_Y;
  const colStride = NODE_WIDTH + GAP_X;

  // positions[r][i] -> NodePos
  const positions: NodePos[][] = [];
  for (let r = 0; r < totalRounds; r++) {
    const count = Math.max(1, Math.round(round0Count / Math.pow(2, r)));
    const row: NodePos[] = [];
    for (let i = 0; i < count; i++) {
      let y: number;
      if (r === 0) {
        y = i * rowStride;
      } else {
        const c1 = positions[r - 1][i * 2];
        const c2 = positions[r - 1][i * 2 + 1] ?? c1;
        y = (c1.y + c2.y) / 2;
      }
      row.push({
        x: r * colStride,
        y,
        round: r,
        index: i,
        match: r === 0 ? (round1[i] ?? null) : null,
      });
    }
    positions.push(row);
  }

  const nodes = positions.flat();
  const width = totalRounds * colStride;
  const height = round0Count * rowStride;
  return { nodes, width, height };
};

const Connectors = ({ nodes }: { nodes: NodePos[] }) => {
  const byRound: Record<number, NodePos[]> = {};
  nodes.forEach((n) => {
    byRound[n.round] = byRound[n.round] || [];
    byRound[n.round].push(n);
  });
  const rounds = Object.keys(byRound).map(Number).sort((a, b) => a - b);
  const lines: { left: number; top: number; w: number; h: number }[] = [];

  rounds.forEach((r) => {
    if (r === 0) return;
    byRound[r].forEach((parent) => {
      const c1 = byRound[r - 1][parent.index * 2];
      const c2 = byRound[r - 1][parent.index * 2 + 1];
      if (!c1) return;
      const childRight = c1.x + NODE_WIDTH;
      const parentLeft = parent.x;
      const midX = (childRight + parentLeft) / 2;
      const cy1 = c1.y + NODE_HEIGHT / 2;
      const cy2 = (c2 ?? c1).y + NODE_HEIGHT / 2;
      const py = parent.y + NODE_HEIGHT / 2;
      // child stubs
      lines.push({ left: childRight, top: cy1, w: midX - childRight, h: 1 });
      if (c2) lines.push({ left: childRight, top: cy2, w: midX - childRight, h: 1 });
      // vertical bus
      lines.push({
        left: midX,
        top: Math.min(cy1, cy2),
        w: 1,
        h: Math.abs(cy2 - cy1) || 1,
      });
      // into parent
      lines.push({ left: midX, top: py, w: parentLeft - midX, h: 1 });
    });
  });

  return (
    <>
      {lines.map((l, i) => (
        <View
          key={i}
          style={{
            position: "absolute",
            left: l.left,
            top: l.top,
            width: l.w,
            height: l.h,
            backgroundColor: COLORS.border,
          }}
        />
      ))}
    </>
  );
};

export const BracketCanvas = ({
  round1,
  bracketSize,
  onNodePress,
}: {
  round1: LiveMatch[];
  bracketSize: number;
  onNodePress: (m: LiveMatch) => void;
}) => {
  const { nodes, width, height } = buildLayout(round1, bracketSize);

  const scale = useRef(new Animated.Value(0.7)).current;
  const savedScale = useRef(0.7);
  const translateX = useRef(new Animated.Value(SPACING.md)).current;
  const translateY = useRef(new Animated.Value(SPACING.md)).current;
  const savedX = useRef(SPACING.md);
  const savedY = useRef(SPACING.md);

  const pinchRef = useRef(null);
  const panRef = useRef(null);

  // All transforms are JS-driven (setValue) so pinch (scale) and pan (translate)
  // can share one transform without the native/JS driver conflict.
  const onPinch = (e: { nativeEvent: { scale: number } }) => {
    scale.setValue(
      clamp(savedScale.current * e.nativeEvent.scale, MIN_SCALE, MAX_SCALE),
    );
  };
  const onPinchEnd = (e: PinchGestureHandlerStateChangeEvent) => {
    if (e.nativeEvent.state === State.END) {
      const next = clamp(savedScale.current * e.nativeEvent.scale, MIN_SCALE, MAX_SCALE);
      savedScale.current = next;
      scale.setValue(next);
    }
  };

  const onPan = (e: { nativeEvent: { translationX: number; translationY: number } }) => {
    translateX.setValue(savedX.current + e.nativeEvent.translationX);
    translateY.setValue(savedY.current + e.nativeEvent.translationY);
  };
  const onPanEnd = (e: PanGestureHandlerStateChangeEvent) => {
    if (e.nativeEvent.state === State.END) {
      savedX.current += e.nativeEvent.translationX;
      savedY.current += e.nativeEvent.translationY;
    }
  };

  const zoomBy = (factor: number) => {
    const next = clamp(savedScale.current * factor, MIN_SCALE, MAX_SCALE);
    savedScale.current = next;
    Animated.timing(scale, { toValue: next, duration: 140, useNativeDriver: false }).start();
  };
  const reset = () => {
    savedScale.current = 0.7;
    savedX.current = SPACING.md;
    savedY.current = SPACING.md;
    Animated.parallel([
      Animated.timing(scale, { toValue: 0.7, duration: 160, useNativeDriver: false }),
      Animated.timing(translateX, { toValue: SPACING.md, duration: 160, useNativeDriver: false }),
      Animated.timing(translateY, { toValue: SPACING.md, duration: 160, useNativeDriver: false }),
    ]).start();
  };

  return (
    <View>
      <View style={styles.controls}>
        <Text allowFontScaling={false} style={styles.hint}>
          Pinch to zoom · drag to pan
        </Text>
        <View style={styles.zoomBtns}>
          <TouchableOpacity style={styles.zoomBtn} onPress={() => zoomBy(0.8)}>
            <Text allowFontScaling={false} style={styles.zoomBtnText}>
              −
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.zoomBtn} onPress={() => zoomBy(1.25)}>
            <Text allowFontScaling={false} style={styles.zoomBtnText}>
              +
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.zoomBtn} onPress={reset}>
            <Text allowFontScaling={false} style={styles.zoomResetText}>
              Reset
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <GestureHandlerRootView style={styles.viewport}>
        <PanGestureHandler
          ref={panRef}
          simultaneousHandlers={pinchRef}
          minPointers={1}
          maxPointers={2}
          onGestureEvent={onPan}
          onHandlerStateChange={onPanEnd}
        >
          <Animated.View style={styles.fill}>
            <PinchGestureHandler
              ref={pinchRef}
              simultaneousHandlers={panRef}
              onGestureEvent={onPinch}
              onHandlerStateChange={onPinchEnd}
            >
              <Animated.View style={styles.fill}>
                <Animated.View
                  style={{
                    width,
                    height,
                    transform: [{ translateX }, { translateY }, { scale }],
                  }}
                >
                  <Connectors nodes={nodes} />
                  {nodes.map((n) =>
                    n.match ? (
                      <View
                        key={`r${n.round}-${n.index}`}
                        style={{ position: "absolute", left: n.x, top: n.y }}
                      >
                        <MatchNode match={n.match} onPress={onNodePress} />
                      </View>
                    ) : (
                      <View
                        key={`r${n.round}-${n.index}`}
                        style={[styles.tbd, { left: n.x, top: n.y }]}
                      >
                        <Text allowFontScaling={false} style={styles.tbdText}>
                          TBD
                        </Text>
                      </View>
                    ),
                  )}
                </Animated.View>
              </Animated.View>
            </PinchGestureHandler>
          </Animated.View>
        </PanGestureHandler>
      </GestureHandlerRootView>
    </View>
  );
};

const styles = StyleSheet.create({
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: webSc(SPACING.sm),
  },
  hint: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textMuted },
  zoomBtns: { flexDirection: "row", gap: webSc(SPACING.xs) },
  zoomBtn: {
    minWidth: webSc(38),
    paddingHorizontal: webSc(SPACING.sm),
    paddingVertical: webSc(SPACING.xs),
    borderRadius: webSc(RADIUS.sm),
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: "center",
  },
  zoomBtnText: { color: COLORS.text, fontSize: webMs(FONT_SIZES.lg), fontWeight: "800" },
  zoomResetText: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  viewport: {
    height: VIEWPORT_HEIGHT,
    borderRadius: webSc(RADIUS.lg),
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    overflow: "hidden",
  },
  fill: { flex: 1 },
  tbd: {
    position: "absolute",
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.backgroundLight,
  },
  tbdText: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
});
