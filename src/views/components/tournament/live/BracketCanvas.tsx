// src/views/components/tournament/live/BracketCanvas.tsx
// Pinch/pan/double-tap canvas that lays out the full bracket from the resolved
// match list: Winners bracket on top (a tree with connectors), a divider, then
// the Losers bracket beneath, and the Grand Final (+ reset) to the right. Player
// search centers + highlights a player's current match with a quick summary, and
// session favorites allow fast jumps. Nodes are the card-styled MatchNode.

import { useMemo, useRef, useState } from "react";
import {
  Animated,
  Keyboard,
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
const LABEL_H = 30;
const DIVIDER_GAP = 64;
const MIN_SCALE = 0.3;
const MAX_SCALE = 2.5;
const START_SCALE = 0.7;
const PAD = SPACING.md;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const idxOf = (m: LiveMatch) => {
  const mm = m.id.match(/M(\d+)/);
  return mm ? parseInt(mm[1], 10) : 1;
};

interface Pos {
  x: number;
  y: number;
  match: LiveMatch;
}
interface Label {
  x: number;
  y: number;
  text: string;
}

const winnersRoundName = (r: number, maxR: number, prefix: boolean): string => {
  const fromEnd = maxR - r;
  const base =
    fromEnd === 0 ? "Final" : fromEnd === 1 ? "Semifinal" : fromEnd === 2 ? "Quarterfinal" : `Round ${r}`;
  return prefix ? `Winners ${base}` : base;
};

const layout = (matches: LiveMatch[]) => {
  const colStride = NODE_WIDTH + GAP_X;
  const rowStride = NODE_HEIGHT + GAP_Y;
  const win = matches.filter((m) => m.side === "winners");
  const los = matches.filter((m) => m.side === "losers");
  const grand = matches.filter((m) => m.side === "grand").sort((a, b) => a.round - b.round);
  const hasLosers = los.length > 0;

  const byRound = (arr: LiveMatch[]) => {
    const map = new Map<number, LiveMatch[]>();
    arr.forEach((m) => {
      if (!map.has(m.round)) map.set(m.round, []);
      map.get(m.round)!.push(m);
    });
    for (const a of map.values()) a.sort((x, y) => idxOf(x) - idxOf(y));
    return map;
  };
  const winRounds = byRound(win);
  const losRounds = byRound(los);
  const winMaxR = win.reduce((a, m) => Math.max(a, m.round), 0);
  const losMaxR = los.reduce((a, m) => Math.max(a, m.round), 0);
  const winR1Count = (winRounds.get(1) || []).length;

  const positioned: Pos[] = [];
  const labels: Label[] = [];

  // Winners — tree centering.
  let prevY = new Map<number, number>();
  for (let r = 1; r <= winMaxR; r++) {
    const arr = winRounds.get(r) || [];
    const curY = new Map<number, number>();
    const x = (r - 1) * colStride;
    labels.push({ x, y: 4, text: winnersRoundName(r, winMaxR, hasLosers) });
    arr.forEach((m, j) => {
      let y: number;
      if (r === 1) y = LABEL_H + j * rowStride;
      else {
        const i = idxOf(m);
        const y1 = prevY.get(i * 2 - 1) ?? prevY.get(i * 2) ?? LABEL_H;
        const y2 = prevY.get(i * 2) ?? y1;
        y = (y1 + y2) / 2;
      }
      positioned.push({ x, y, match: m });
      curY.set(idxOf(m), y);
    });
    prevY = curY;
  }

  const winHeight = LABEL_H + Math.max(1, winR1Count) * rowStride;
  const winWidth = Math.max(1, winMaxR) * colStride;

  // Grand final column, to the right of the winners final.
  grand.forEach((m, j) => {
    positioned.push({
      x: winWidth,
      y: LABEL_H + (Math.max(1, winR1Count) / 2 - 0.5) * rowStride + j * rowStride,
      match: m,
    });
  });
  if (grand.length) labels.push({ x: winWidth, y: 4, text: "Grand Final" });

  // Losers — stacked columns beneath the winners bracket.
  const losBaseY = hasLosers ? winHeight + DIVIDER_GAP : winHeight;
  let losHeight = 0;
  for (let r = 1; r <= losMaxR; r++) {
    const arr = losRounds.get(r) || [];
    const x = (r - 1) * colStride;
    const last = r === losMaxR;
    labels.push({ x, y: losBaseY + 4, text: last ? "Losers Final" : `Losers Round ${r}` });
    arr.forEach((m, j) => {
      positioned.push({ x, y: losBaseY + LABEL_H + j * rowStride, match: m });
    });
    losHeight = Math.max(losHeight, LABEL_H + arr.length * rowStride);
  }

  // Winners-bracket connectors (tree).
  const lines: { left: number; top: number; w: number; h: number }[] = [];
  const winPos = new Map<string, Pos>();
  positioned.forEach((p) => {
    if (p.match.side === "winners") winPos.set(p.match.id, p);
  });
  for (let r = 2; r <= winMaxR; r++) {
    for (const m of winRounds.get(r) || []) {
      const parent = winPos.get(m.id);
      const i = idxOf(m);
      const c1 = (winRounds.get(r - 1) || []).find((x) => idxOf(x) === i * 2 - 1);
      const c2 = (winRounds.get(r - 1) || []).find((x) => idxOf(x) === i * 2);
      if (!parent || !c1) continue;
      const p1 = winPos.get(c1.id)!;
      const p2 = c2 ? winPos.get(c2.id)! : p1;
      const childRight = p1.x + NODE_WIDTH;
      const midX = (childRight + parent.x) / 2;
      const cy1 = p1.y + NODE_HEIGHT / 2;
      const cy2 = p2.y + NODE_HEIGHT / 2;
      const py = parent.y + NODE_HEIGHT / 2;
      lines.push({ left: childRight, top: cy1, w: midX - childRight, h: 1 });
      if (c2) lines.push({ left: childRight, top: cy2, w: midX - childRight, h: 1 });
      lines.push({ left: midX, top: Math.min(cy1, cy2), w: 1, h: Math.abs(cy2 - cy1) || 1 });
      lines.push({ left: midX, top: py, w: parent.x - midX, h: 1 });
    }
  }

  const width = Math.max(winWidth + colStride, losMaxR * colStride) + GAP_X;
  const height = hasLosers ? losBaseY + losHeight : winHeight;
  const dividerY = hasLosers ? winHeight + DIVIDER_GAP / 2 : 0;
  return { positioned, labels, lines, width, height, hasLosers, dividerY, winWidth };
};

const statusText = (m: LiveMatch) =>
  m.bye
    ? "Bye"
    : m.pending
      ? "TBD"
      : m.isLiveActive
        ? "Live"
        : m.status === "in_progress"
          ? "In progress"
          : m.status === "completed"
            ? "Completed"
            : "Not started";

export const BracketCanvas = ({
  matches,
  onNodePress,
}: {
  matches: LiveMatch[];
  onNodePress: (m: LiveMatch) => void;
}) => {
  const built = useMemo(() => layout(matches), [matches]);
  const { positioned, labels, lines, width, height, hasLosers, dividerY } = built;

  const scaleA = useRef(new Animated.Value(START_SCALE)).current;
  const txA = useRef(new Animated.Value(PAD)).current;
  const tyA = useRef(new Animated.Value(PAD)).current;
  const scale = useRef(START_SCALE);
  const tx = useRef(PAD);
  const ty = useRef(PAD);
  const lastGScale = useRef(1);
  const panStart = useRef({ x: PAD, y: PAD });
  const pinchRef = useRef(null);
  const panRef = useRef(null);
  const tapRef = useRef(null);

  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const [query, setQuery] = useState("");
  const [showFavs, setShowFavs] = useState(false);
  const [favs, setFavs] = useState<string[]>([]);
  const [summary, setSummary] = useState<{ name: string; match: LiveMatch } | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const set = (s: number, x: number, y: number) => {
    scale.current = s;
    tx.current = x;
    ty.current = y;
    scaleA.setValue(s);
    txA.setValue(x);
    tyA.setValue(y);
  };

  const onPinchEvent = (e: { nativeEvent: { scale: number; focalX: number; focalY: number } }) => {
    const { scale: g, focalX, focalY } = e.nativeEvent;
    const factor = g / (lastGScale.current || 1);
    lastGScale.current = g;
    const ns = clamp(scale.current * factor, MIN_SCALE, MAX_SCALE);
    const actual = ns / scale.current;
    set(ns, focalX - (focalX - tx.current) * actual, focalY - (focalY - ty.current) * actual);
  };
  const onPinchState = (e: { nativeEvent: { state: number } }) => {
    if (e.nativeEvent.state === State.BEGAN) {
      Keyboard.dismiss();
      lastGScale.current = 1;
    }
  };
  const onPanEvent = (e: { nativeEvent: { translationX: number; translationY: number } }) =>
    set(scale.current, panStart.current.x + e.nativeEvent.translationX, panStart.current.y + e.nativeEvent.translationY);
  const onPanState = (e: { nativeEvent: { state: number } }) => {
    if (e.nativeEvent.state === State.BEGAN) {
      Keyboard.dismiss();
      panStart.current = { x: tx.current, y: ty.current };
    }
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
  const onDoubleTap = (e: { nativeEvent: { state: number; x: number; y: number } }) => {
    if (e.nativeEvent.state !== State.ACTIVE) return;
    Keyboard.dismiss();
    const target = scale.current < 1 ? 1.5 : START_SCALE;
    animateTo(
      target,
      e.nativeEvent.x - ((e.nativeEvent.x - tx.current) / scale.current) * target,
      e.nativeEvent.y - ((e.nativeEvent.y - ty.current) / scale.current) * target,
    );
  };
  const onViewport = (e: LayoutChangeEvent) =>
    setViewport({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });

  // ---- player search / locate ----
  const stageRank = (m: LiveMatch) =>
    (m.side === "grand" ? 200 : m.side === "losers" ? 100 : 0) + m.round;
  const playerIndex = useMemo(() => {
    const names = new Set<string>();
    matches.forEach((m) => {
      if (m.p1Name) names.add(m.p1Name);
      if (m.p2Name) names.add(m.p2Name);
    });
    return [...names].sort();
  }, [matches]);
  const currentMatchFor = (name: string): LiveMatch | null => {
    const inMatches = matches.filter((m) => m.p1Name === name || m.p2Name === name);
    if (inMatches.length === 0) return null;
    const active = inMatches.filter((m) => m.status !== "completed" && !m.bye);
    const pool = active.length ? active : inMatches;
    return pool.reduce((best, m) => (stageRank(m) > stageRank(best) ? m : best), pool[0]);
  };
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return playerIndex.filter((n) => n.toLowerCase().includes(q)).slice(0, 6);
  }, [query, playerIndex]);

  const focusOnMatch = (name: string, match: LiveMatch) => {
    const node = positioned.find((p) => p.match.id === match.id);
    if (node && viewport.w > 0) {
      const target = 1;
      animateTo(
        target,
        viewport.w / 2 - (node.x + NODE_WIDTH / 2) * target,
        viewport.h / 2 - (node.y + NODE_HEIGHT / 2) * target,
      );
    }
    setHighlight(match.id);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlight(null), 2600);
    setSummary({ name, match });
    setQuery("");
    setShowFavs(false);
    Keyboard.dismiss();
  };
  const locate = (name: string) => {
    const m = currentMatchFor(name);
    if (m) focusOnMatch(name, m);
  };
  const toggleFav = (name: string) =>
    setFavs((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));

  return (
    <View style={styles.root}>
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

      {results.length > 0 && (
        <View style={styles.dropdown}>
          {results.map((name) => {
            const m = currentMatchFor(name);
            return (
              <TouchableOpacity key={name} style={styles.dropRow} onPress={() => locate(name)}>
                <Text allowFontScaling={false} style={styles.dropName} numberOfLines={1}>
                  {name}
                </Text>
                {m && (
                  <Text allowFontScaling={false} style={styles.dropMeta}>
                    {m.label} · {statusText(m)}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {showFavs && (
        <View style={styles.dropdown}>
          {favs.length === 0 ? (
            <Text allowFontScaling={false} style={styles.favEmpty}>
              No favorites yet. Search a player and tap the star in their summary.
            </Text>
          ) : (
            favs.map((name) => {
              const m = currentMatchFor(name);
              return (
                <TouchableOpacity key={name} style={styles.dropRow} onPress={() => locate(name)}>
                  <Text allowFontScaling={false} style={styles.dropName} numberOfLines={1}>
                    ★ {name}
                  </Text>
                  {m && (
                    <Text allowFontScaling={false} style={styles.dropMeta}>
                      {m.label} · {statusText(m)}
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
                        transformOrigin: "left top",
                        transform: [{ translateX: txA }, { translateY: tyA }, { scale: scaleA }],
                      }}
                    >
                      {lines.map((l, i) => (
                        <View
                          key={`ln-${i}`}
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
                      {hasLosers && (
                        <View
                          style={{
                            position: "absolute",
                            left: 0,
                            top: dividerY,
                            width,
                            height: 2,
                            backgroundColor: COLORS.borderLight,
                          }}
                        />
                      )}
                      {labels.map((lb, i) => (
                        <Text
                          key={`lb-${i}`}
                          allowFontScaling={false}
                          style={[styles.roundLabel, { left: lb.x, top: lb.y }]}
                          numberOfLines={1}
                        >
                          {lb.text}
                        </Text>
                      ))}
                      {positioned.map((p) => (
                        <View
                          key={p.match.id}
                          style={{ position: "absolute", left: p.x, top: p.y }}
                        >
                          <MatchNode
                            match={p.match}
                            highlighted={highlight === p.match.id}
                            onPress={(mm) => {
                              Keyboard.dismiss();
                              onNodePress(mm);
                            }}
                          />
                        </View>
                      ))}
                    </Animated.View>
                  </Animated.View>
                </PanGestureHandler>
              </Animated.View>
            </PinchGestureHandler>
          </Animated.View>
        </TapGestureHandler>

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
              Current Match: {summary.match.label}
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
    height: webSc(44),
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.text,
    paddingHorizontal: webSc(SPACING.md),
    fontSize: webMs(FONT_SIZES.sm),
  },
  starBtn: {
    width: webSc(44),
    height: webSc(44),
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
  favEmpty: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textMuted, padding: webSc(SPACING.md) },
  viewport: { flex: 1, overflow: "hidden", backgroundColor: COLORS.background },
  fill: { flex: 1 },
  roundLabel: {
    position: "absolute",
    width: NODE_WIDTH,
    textAlign: "center",
    fontSize: webMs(FONT_SIZES.xs),
    fontWeight: "800",
    color: COLORS.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
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
