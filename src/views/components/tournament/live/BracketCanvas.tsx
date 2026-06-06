// src/views/components/tournament/live/BracketCanvas.tsx
// Pinch-zoom (around the finger focal point) + drag-pan canvas for the single-
// elimination skeleton. Round-1 nodes are real (live) matches; later rounds are
// muted TBD nodes. Double-tap to zoom toward a point. Connectors are thin Views.
//
// All transforms are JS-driven (Animated.Value.setValue) with plain-number
// mirrors so pinch focal math and pan share one transform without driver
// conflicts. Single-finger = pan, two-finger = pinch.

import { useRef } from "react";
import { Animated, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import {
  GestureHandlerRootView,
  PanGestureHandler,
  PinchGestureHandler,
  State,
  TapGestureHandler,
} from "react-native-gesture-handler";
import { COLORS } from "../../../../theme/colors";
import { RADIUS, SPACING } from "../../../../theme/spacing";
import { FONT_SIZES } from "../../../../theme/typography";
import { webMs, webSc } from "../../../../utils/scaling";
import { LiveMatch } from "../../../../utils/match.utils";
import { MatchNode, NODE_HEIGHT, NODE_WIDTH } from "./MatchNode";

const GAP_X = 52;
const GAP_Y = 18;
const MIN_SCALE = 0.35;
const MAX_SCALE = 2.5;
const START_SCALE = 0.7;
const PAD = SPACING.md;

interface NodePos {
  x: number;
  y: number;
  round: number;
  index: number;
  match: LiveMatch | null;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const buildLayout = (round1: LiveMatch[], bracketSize: number) => {
  const round0Count = Math.max(1, Math.round(bracketSize / 2));
  const totalRounds = Math.max(1, Math.round(Math.log2(bracketSize)) || 1);
  const rowStride = NODE_HEIGHT + GAP_Y;
  const colStride = NODE_WIDTH + GAP_X;

  const positions: NodePos[][] = [];
  for (let r = 0; r < totalRounds; r++) {
    const count = Math.max(1, Math.round(round0Count / Math.pow(2, r)));
    const row: NodePos[] = [];
    for (let i = 0; i < count; i++) {
      let y: number;
      if (r === 0) y = i * rowStride;
      else {
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
  return {
    nodes,
    width: totalRounds * colStride,
    height: round0Count * rowStride,
  };
};

const Connectors = ({ nodes }: { nodes: NodePos[] }) => {
  const byRound: Record<number, NodePos[]> = {};
  nodes.forEach((n) => {
    byRound[n.round] = byRound[n.round] || [];
    byRound[n.round].push(n);
  });
  const lines: { left: number; top: number; w: number; h: number }[] = [];
  Object.keys(byRound)
    .map(Number)
    .forEach((r) => {
      if (r === 0) return;
      byRound[r].forEach((parent) => {
        const c1 = byRound[r - 1][parent.index * 2];
        const c2 = byRound[r - 1][parent.index * 2 + 1];
        if (!c1) return;
        const childRight = c1.x + NODE_WIDTH;
        const midX = (childRight + parent.x) / 2;
        const cy1 = c1.y + NODE_HEIGHT / 2;
        const cy2 = (c2 ?? c1).y + NODE_HEIGHT / 2;
        const py = parent.y + NODE_HEIGHT / 2;
        lines.push({ left: childRight, top: cy1, w: midX - childRight, h: 1 });
        if (c2) lines.push({ left: childRight, top: cy2, w: midX - childRight, h: 1 });
        lines.push({ left: midX, top: Math.min(cy1, cy2), w: 1, h: Math.abs(cy2 - cy1) || 1 });
        lines.push({ left: midX, top: py, w: parent.x - midX, h: 1 });
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

  // Animated values + plain-number mirrors.
  const scaleA = useRef(new Animated.Value(START_SCALE)).current;
  const txA = useRef(new Animated.Value(PAD)).current;
  const tyA = useRef(new Animated.Value(PAD)).current;
  const scale = useRef(START_SCALE);
  const tx = useRef(PAD);
  const ty = useRef(PAD);

  // Pinch session state.
  const pinchStartScale = useRef(START_SCALE);
  const cp = useRef({ x: 0, y: 0 }); // content point under the focal at pinch start
  // Pan session state.
  const panStart = useRef({ x: PAD, y: PAD });

  const pinchRef = useRef(null);
  const panRef = useRef(null);
  const tapRef = useRef(null);

  const set = (s: number, x: number, y: number) => {
    scale.current = s;
    tx.current = x;
    ty.current = y;
    scaleA.setValue(s);
    txA.setValue(x);
    tyA.setValue(y);
  };

  // ---- Pinch (two fingers): zoom around the focal point ----
  const onPinchEvent = (e: {
    nativeEvent: { scale: number; focalX: number; focalY: number };
  }) => {
    const ns = clamp(pinchStartScale.current * e.nativeEvent.scale, MIN_SCALE, MAX_SCALE);
    const nx = e.nativeEvent.focalX - cp.current.x * ns;
    const ny = e.nativeEvent.focalY - cp.current.y * ns;
    set(ns, nx, ny);
  };
  const onPinchState = (e: {
    nativeEvent: { state: number; focalX: number; focalY: number };
  }) => {
    if (e.nativeEvent.state === State.BEGAN) {
      pinchStartScale.current = scale.current;
      cp.current = {
        x: (e.nativeEvent.focalX - tx.current) / scale.current,
        y: (e.nativeEvent.focalY - ty.current) / scale.current,
      };
    }
  };

  // ---- Pan (single finger) ----
  const onPanEvent = (e: {
    nativeEvent: { translationX: number; translationY: number };
  }) => {
    set(
      scale.current,
      panStart.current.x + e.nativeEvent.translationX,
      panStart.current.y + e.nativeEvent.translationY,
    );
  };
  const onPanState = (e: { nativeEvent: { state: number } }) => {
    if (e.nativeEvent.state === State.BEGAN) {
      panStart.current = { x: tx.current, y: ty.current };
    }
  };

  // ---- Double-tap zoom toward the tapped point ----
  const onDoubleTap = (e: { nativeEvent: { state: number; x: number; y: number } }) => {
    if (e.nativeEvent.state !== State.ACTIVE) return;
    const target = scale.current < 1 ? 1.6 : START_SCALE;
    const px = (e.nativeEvent.x - tx.current) / scale.current;
    const py = (e.nativeEvent.y - ty.current) / scale.current;
    const nx = e.nativeEvent.x - px * target;
    const ny = e.nativeEvent.y - py * target;
    scale.current = target;
    tx.current = nx;
    ty.current = ny;
    Animated.parallel([
      Animated.timing(scaleA, { toValue: target, duration: 180, useNativeDriver: false }),
      Animated.timing(txA, { toValue: nx, duration: 180, useNativeDriver: false }),
      Animated.timing(tyA, { toValue: ny, duration: 180, useNativeDriver: false }),
    ]).start();
  };

  const zoomBy = (factor: number) =>
    set(clamp(scale.current * factor, MIN_SCALE, MAX_SCALE), tx.current, ty.current);
  const reset = () => set(START_SCALE, PAD, PAD);

  return (
    <View style={styles.root}>
      <View style={styles.controls}>
        <Text allowFontScaling={false} style={styles.hint}>
          Pinch / double-tap to zoom · drag to pan
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
        <TapGestureHandler
          ref={tapRef}
          numberOfTaps={2}
          onHandlerStateChange={onDoubleTap}
        >
          <Animated.View style={styles.fill}>
            <PinchGestureHandler
              ref={pinchRef}
              simultaneousHandlers={panRef}
              onGestureEvent={onPinchEvent}
              onHandlerStateChange={onPinchState}
            >
              <Animated.View style={styles.fill}>
                <PanGestureHandler
                  ref={panRef}
                  simultaneousHandlers={pinchRef}
                  minPointers={1}
                  maxPointers={1}
                  onGestureEvent={onPanEvent}
                  onHandlerStateChange={onPanState}
                >
                  <Animated.View style={styles.fill}>
                    <Animated.View
                      style={{
                        width,
                        height,
                        transform: [
                          { translateX: txA },
                          { translateY: tyA },
                          { scale: scaleA },
                        ],
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
                </PanGestureHandler>
              </Animated.View>
            </PinchGestureHandler>
          </Animated.View>
        </TapGestureHandler>
      </GestureHandlerRootView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: webSc(SPACING.xs),
  },
  hint: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textMuted, flex: 1 },
  zoomBtns: { flexDirection: "row", gap: webSc(SPACING.xs) },
  zoomBtn: {
    minWidth: webSc(36),
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
  // No border: the bracket reads as an open, native canvas.
  viewport: { flex: 1, overflow: "hidden", backgroundColor: COLORS.background },
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
