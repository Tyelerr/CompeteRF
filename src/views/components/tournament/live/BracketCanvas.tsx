// src/views/components/tournament/live/BracketCanvas.tsx
// Pinch-zoom (around the finger focal point), drag-pan, and double-tap canvas for
// the bracket. Round-1 nodes are live matches (MatchNode); later rounds are muted
// TBD nodes. Includes a player search that centers + highlights a player's match
// and shows a quick summary, plus session favorites for fast jumps.
//
// Transforms are JS-driven (Animated.Value.setValue) with plain-number mirrors so
// pinch focal math + pan share one transform. Single finger = pan, two = pinch.

import { useMemo, useRef, useState } from "react";
import {
  Animated,
  LayoutChangeEvent,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
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

const GAP_X = 56;
const GAP_Y = 22;
const LABEL_H = 34;
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

const roundName = (r: number, total: number, double: boolean): string => {
  const fromEnd = total - 1 - r;
  const base =
    fromEnd === 0
      ? "Final"
      : fromEnd === 1
        ? "Semifinal"
        : fromEnd === 2
          ? "Quarterfinal"
          : `Round ${r + 1}`;
  return double ? `Winners ${base}` : base;
};

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
      if (r === 0) y = LABEL_H + i * rowStride;
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
  return {
    nodes: positions.flat(),
    totalRounds,
    width: totalRounds * colStride,
    height: LABEL_H + round0Count * rowStride,
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
  format,
  onNodePress,
}: {
  round1: LiveMatch[];
  bracketSize: number;
  format?: string;
  onNodePress: (m: LiveMatch) => void;
}) => {
  const { nodes, totalRounds, width, height } = buildLayout(round1, bracketSize);
  const isDouble = (format ?? "").toLowerCase().includes("double");

  const scaleA = useRef(new Animated.Value(START_SCALE)).current;
  const txA = useRef(new Animated.Value(PAD)).current;
  const tyA = useRef(new Animated.Value(PAD)).current;
  const scale = useRef(START_SCALE);
  const tx = useRef(PAD);
  const ty = useRef(PAD);

  const pinchStartScale = useRef(START_SCALE);
  const cp = useRef({ x: 0, y: 0 });
  const pinchPrimed = useRef(false);
  const panStart = useRef({ x: PAD, y: PAD });

  const pinchRef = useRef(null);
  const panRef = useRef(null);
  const tapRef = useRef(null);

  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const [query, setQuery] = useState("");
  const [showFavs, setShowFavs] = useState(false);
  const [favs, setFavs] = useState<string[]>([]);
  const [summary, setSummary] = useState<{ name: string; match: LiveMatch } | null>(null);
  const [highlight, setHighlight] = useState<number | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const set = (s: number, x: number, y: number) => {
    scale.current = s;
    tx.current = x;
    ty.current = y;
    scaleA.setValue(s);
    txA.setValue(x);
    tyA.setValue(y);
  };

  // ---- Pinch (focal-point zoom). cp is captured on the first active frame so the
  // focal coordinate is valid (avoids the "drifts to a corner" bug). ----
  const onPinchEvent = (e: {
    nativeEvent: { scale: number; focalX: number; focalY: number };
  }) => {
    const { scale: gScale, focalX, focalY } = e.nativeEvent;
    if (pinchPrimed.current) {
      pinchStartScale.current = scale.current;
      cp.current = {
        x: (focalX - tx.current) / scale.current,
        y: (focalY - ty.current) / scale.current,
      };
      pinchPrimed.current = false;
    }
    const ns = clamp(pinchStartScale.current * gScale, MIN_SCALE, MAX_SCALE);
    set(ns, focalX - cp.current.x * ns, focalY - cp.current.y * ns);
  };
  const onPinchState = (e: { nativeEvent: { state: number } }) => {
    if (e.nativeEvent.state === State.BEGAN) pinchPrimed.current = true;
  };

  // ---- Pan (single finger) ----
  const onPanEvent = (e: {
    nativeEvent: { translationX: number; translationY: number };
  }) =>
    set(
      scale.current,
      panStart.current.x + e.nativeEvent.translationX,
      panStart.current.y + e.nativeEvent.translationY,
    );
  const onPanState = (e: { nativeEvent: { state: number } }) => {
    if (e.nativeEvent.state === State.BEGAN)
      panStart.current = { x: tx.current, y: ty.current };
  };

  // ---- Double-tap zoom toward the tapped point ----
  const onDoubleTap = (e: { nativeEvent: { state: number; x: number; y: number } }) => {
    if (e.nativeEvent.state !== State.ACTIVE) return;
    const target = scale.current < 1 ? 1.6 : START_SCALE;
    animateTo(
      target,
      e.nativeEvent.x - ((e.nativeEvent.x - tx.current) / scale.current) * target,
      e.nativeEvent.y - ((e.nativeEvent.y - ty.current) / scale.current) * target,
    );
  };

  const animateTo = (s: number, x: number, y: number) => {
    scale.current = s;
    tx.current = x;
    ty.current = y;
    Animated.parallel([
      Animated.timing(scaleA, { toValue: s, duration: 220, useNativeDriver: false }),
      Animated.timing(txA, { toValue: x, duration: 220, useNativeDriver: false }),
      Animated.timing(tyA, { toValue: y, duration: 220, useNativeDriver: false }),
    ]).start();
  };

  // ---- Player search / locate ----
  const playerIndex = useMemo(() => {
    const out: { name: string; match: LiveMatch }[] = [];
    round1.forEach((m) => {
      if (m.p1Name) out.push({ name: m.p1Name, match: m });
      if (m.p2Name) out.push({ name: m.p2Name, match: m });
    });
    return out;
  }, [round1]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return playerIndex.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 6);
  }, [query, playerIndex]);

  const focusOnMatch = (name: string, match: LiveMatch) => {
    const node = nodes.find((n) => n.match?.matchNumber === match.matchNumber);
    if (node && viewport.w > 0) {
      const target = 1;
      const cx = node.x + NODE_WIDTH / 2;
      const cy = node.y + NODE_HEIGHT / 2;
      animateTo(target, viewport.w / 2 - cx * target, viewport.h / 2 - cy * target);
    }
    setHighlight(match.matchNumber);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlight(null), 2600);
    setSummary({ name, match });
    setQuery("");
    setShowFavs(false);
  };

  const toggleFav = (name: string) =>
    setFavs((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));

  const statusText = (m: LiveMatch) =>
    m.bye
      ? "Bye"
      : m.isLiveActive
        ? "Live"
        : m.status === "in_progress"
          ? "In progress"
          : m.status === "completed"
            ? "Completed"
            : "Not started";

  const onViewport = (e: LayoutChangeEvent) =>
    setViewport({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });

  return (
    <View style={styles.root}>
      {/* Search + favorites */}
      <View style={styles.searchRow}>
        <TextInput
          allowFontScaling={false}
          style={styles.search}
          placeholder="Find a player…"
          placeholderTextColor={COLORS.textMuted}
          value={query}
          onChangeText={(v) => {
            setQuery(v);
            setShowFavs(false);
          }}
        />
        <TouchableOpacity
          style={[styles.starBtn, showFavs && styles.starBtnOn]}
          onPress={() => {
            setShowFavs((s) => !s);
            setQuery("");
          }}
          hitSlop={8}
        >
          <Text allowFontScaling={false} style={styles.star}>
            {favs.length ? "★" : "☆"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search results */}
      {results.length > 0 && (
        <View style={styles.dropdown}>
          {results.map((p) => (
            <TouchableOpacity
              key={`${p.name}-${p.match.matchNumber}`}
              style={styles.dropRow}
              onPress={() => focusOnMatch(p.name, p.match)}
            >
              <Text allowFontScaling={false} style={styles.dropName} numberOfLines={1}>
                {p.name}
              </Text>
              <Text allowFontScaling={false} style={styles.dropMeta}>
                M{p.match.matchNumber} · {statusText(p.match)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Favorites list */}
      {showFavs && (
        <View style={styles.dropdown}>
          {favs.length === 0 ? (
            <Text allowFontScaling={false} style={styles.favEmpty}>
              No favorites yet. Search a player and tap the star in their summary.
            </Text>
          ) : (
            favs.map((name) => {
              const hit = playerIndex.find((p) => p.name === name);
              return (
                <TouchableOpacity
                  key={name}
                  style={styles.dropRow}
                  onPress={() => hit && focusOnMatch(name, hit.match)}
                >
                  <Text allowFontScaling={false} style={styles.dropName} numberOfLines={1}>
                    ★ {name}
                  </Text>
                  {hit && (
                    <Text allowFontScaling={false} style={styles.dropMeta}>
                      M{hit.match.matchNumber} · {statusText(hit.match)}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </View>
      )}

      <GestureHandlerRootView style={styles.viewport} onLayout={onViewport}>
        <TapGestureHandler ref={tapRef} numberOfTaps={2} onHandlerStateChange={onDoubleTap}>
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
                        // Anchor scaling at the top-left so the bracket starts in
                        // the top-left corner and focal-point zoom math is exact
                        // (screen = translate + point * scale).
                        transformOrigin: "left top",
                        transform: [
                          { translateX: txA },
                          { translateY: tyA },
                          { scale: scaleA },
                        ],
                      }}
                    >
                      <Connectors nodes={nodes} />
                      {/* Round labels */}
                      {Array.from({ length: totalRounds }).map((_, r) => (
                        <Text
                          key={`label-${r}`}
                          allowFontScaling={false}
                          style={[styles.roundLabel, { left: r * (NODE_WIDTH + GAP_X) }]}
                          numberOfLines={1}
                        >
                          {roundName(r, totalRounds, isDouble)}
                        </Text>
                      ))}
                      {nodes.map((n) =>
                        n.match ? (
                          <View
                            key={`r${n.round}-${n.index}`}
                            style={{ position: "absolute", left: n.x, top: n.y }}
                          >
                            <MatchNode
                              match={n.match}
                              highlighted={highlight === n.match.matchNumber}
                              onPress={onNodePress}
                            />
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

        {/* Player summary popover */}
        {summary && (
          <View style={styles.summary}>
            <View style={styles.summaryHead}>
              <Text allowFontScaling={false} style={styles.summaryName} numberOfLines={1}>
                {summary.name}
              </Text>
              <TouchableOpacity onPress={() => toggleFav(summary.name)} hitSlop={8}>
                <Text allowFontScaling={false} style={styles.summaryStar}>
                  {favs.includes(summary.name) ? "★" : "☆"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setSummary(null)} hitSlop={8}>
                <Text allowFontScaling={false} style={styles.summaryClose}>
                  ✕
                </Text>
              </TouchableOpacity>
            </View>
            <Text allowFontScaling={false} style={styles.summaryLine}>
              Current Match: M{summary.match.matchNumber}
            </Text>
            <Text allowFontScaling={false} style={styles.summaryLine}>
              {summary.match.tableLabel ?? "No table"} · {statusText(summary.match)}
            </Text>
            <TouchableOpacity
              style={styles.viewBtn}
              onPress={() => {
                const m = summary.match;
                setSummary(null);
                onNodePress(m);
              }}
            >
              <Text allowFontScaling={false} style={styles.viewBtnText}>
                View Match
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </GestureHandlerRootView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: webSc(SPACING.sm),
    marginBottom: webSc(SPACING.xs),
  },
  search: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.text,
    paddingHorizontal: webSc(SPACING.md),
    paddingVertical: webSc(SPACING.sm),
    fontSize: webMs(FONT_SIZES.sm),
  },
  starBtn: {
    width: webSc(44),
    height: webSc(40),
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  starBtnOn: { borderColor: COLORS.warning },
  star: { fontSize: webMs(FONT_SIZES.lg), color: COLORS.warning },
  dropdown: {
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: webSc(SPACING.xs),
    overflow: "hidden",
  },
  dropRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: webSc(SPACING.md),
    paddingVertical: webSc(SPACING.sm),
    borderBottomWidth: 1,
    borderColor: COLORS.border,
    gap: webSc(SPACING.sm),
  },
  dropName: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.text, fontWeight: "700", flex: 1 },
  dropMeta: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textSecondary },
  favEmpty: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.textMuted,
    padding: webSc(SPACING.md),
  },
  viewport: { flex: 1, overflow: "hidden", backgroundColor: COLORS.background },
  fill: { flex: 1 },
  roundLabel: {
    position: "absolute",
    top: 4,
    width: NODE_WIDTH,
    textAlign: "center",
    fontSize: webMs(FONT_SIZES.xs),
    fontWeight: "800",
    color: COLORS.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tbd: {
    position: "absolute",
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    borderRadius: webSc(RADIUS.lg),
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.backgroundLight,
  },
  tbdText: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  summary: {
    position: "absolute",
    left: webSc(SPACING.sm),
    right: webSc(SPACING.sm),
    bottom: webSc(SPACING.sm),
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.lg),
    borderWidth: 1,
    borderColor: COLORS.primary,
    padding: webSc(SPACING.md),
  },
  summaryHead: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm) },
  summaryName: { flex: 1, fontSize: webMs(FONT_SIZES.lg), fontWeight: "800", color: COLORS.text },
  summaryStar: { fontSize: webMs(FONT_SIZES.lg), color: COLORS.warning },
  summaryClose: { fontSize: webMs(FONT_SIZES.lg), color: COLORS.textSecondary, fontWeight: "700" },
  summaryLine: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    marginTop: webSc(SPACING.xs),
  },
  viewBtn: {
    marginTop: webSc(SPACING.sm),
    backgroundColor: COLORS.primary,
    borderRadius: webSc(RADIUS.md),
    paddingVertical: webSc(SPACING.sm),
    alignItems: "center",
  },
  viewBtnText: { color: "#fff", fontWeight: "800", fontSize: webMs(FONT_SIZES.sm) },
});
