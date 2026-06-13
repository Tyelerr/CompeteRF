// src/views/components/tournament/live/BracketCanvas.tsx
// Pinch/pan/double-tap canvas that lays out the full bracket from the resolved
// match list: Winners bracket on top (a tree with connectors), a divider, then
// the Losers bracket beneath, and the Grand Final (+ reset) to the right. Player
// search centers + highlights a player's current match with a quick summary, and
// session favorites allow fast jumps. Nodes are the card-styled MatchNode.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const GAP_X = 140;
// Clear space reserved just left of each card for its route label (W6 / L3 / GF1).
// The incoming connector stops this far short of the card, so the label sits in
// open space between the line and the card rather than on top of the line.
const LABEL_ZONE = 64;
// Visible horizontal run from the connector's vertical bar up to the label zone,
// so the line clearly leads into the label instead of stopping right at the bar.
const PARENT_RUN = 40;
const GAP_Y = 34;
const LABEL_H = 30;
const DIVIDER_GAP = 150;
const LINE_W = 3; // connector thickness (plain View; stays visible to MIN_SCALE)
const MIN_SCALE = 0.22; // how far you can zoom out (lower = see more of the bracket)
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
  sub?: string; // placement subtitle, e.g. "13-16TH" (what losers here play for)
}

const ordSuffix = (n: number): string => {
  const t = n % 100;
  if (t >= 11 && t <= 13) return "th";
  switch (n % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
};
// "3rd" for a single place, "5-6th" / "13-16th" for a range (style upcases it).
const placeLabel = (lo: number, hi: number): string =>
  lo === hi ? `${lo}${ordSuffix(lo)}` : `${lo}-${hi}${ordSuffix(hi)}`;

const winnersRoundName = (r: number, maxR: number, prefix: boolean): string => {
  const fromEnd = maxR - r;
  // prefix = double elim: the winners final is the Hotseat round.
  if (fromEnd === 0) return prefix ? "Hotseat" : "Final";
  const base = fromEnd === 1 ? "Semifinal" : fromEnd === 2 ? "Quarterfinal" : `Round ${r}`;
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

  // What place each winners round plays for. Single elimination: the final is
  // 1st/2nd and each earlier round eliminates a block below it (3-4th, 5-8th …).
  // Double elimination: winners-side losses don't eliminate, so only the winners
  // final (Hotseat) carries a fixed placement — its winner is guaranteed a finals
  // berth (1st/2nd).
  const winPlace = new Map<number, string>();
  if (winMaxR > 0) {
    if (hasLosers) {
      winPlace.set(winMaxR, "1st / 2nd");
    } else {
      let place = 3;
      for (let r = winMaxR; r >= 1; r--) {
        const count = (winRounds.get(r) || []).length;
        if (count <= 0) continue;
        if (r === winMaxR) {
          winPlace.set(r, "1st / 2nd");
          continue;
        }
        const hi = place + count - 1;
        winPlace.set(r, placeLabel(place, hi));
        place = hi + 1;
      }
    }
  }

  // Winners — tree centering.
  let prevY = new Map<number, number>();
  for (let r = 1; r <= winMaxR; r++) {
    const arr = winRounds.get(r) || [];
    const curY = new Map<number, number>();
    const x = (r - 1) * colStride;
    labels.push({ x, y: 4, text: winnersRoundName(r, winMaxR, hasLosers), sub: winPlace.get(r) });
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
  // vert = the thin axis is width (a vertical line); else the thin axis is height.
  const lines: { left: number; top: number; w: number; h: number; vert: boolean }[] = [];
  const hLine = (left: number, top: number, w: number) =>
    lines.push({ left, top, w, h: LINE_W, vert: false });
  const vLine = (left: number, top: number, h: number) =>
    lines.push({ left, top, w: LINE_W, h, vert: true });

  // Tree connectors between a parent and its (1 or 2) children, both already
  // positioned. childIdx maps a parent index to its child indices in round r-1.
  const treeConnect = (
    posOf: Map<string, Pos>,
    rounds: Map<number, LiveMatch[]>,
    maxR: number,
    childIdx: (i: number) => number[],
  ) => {
    for (let r = 2; r <= maxR; r++) {
      for (const m of rounds.get(r) || []) {
        const parent = posOf.get(m.id);
        if (!parent) continue;
        const kids = childIdx(idxOf(m))
          .map((ci) => (rounds.get(r - 1) || []).find((x) => idxOf(x) === ci))
          .filter((c): c is LiveMatch => !!c)
          .map((c) => posOf.get(c.id))
          .filter((p): p is Pos => !!p);
        if (kids.length === 0) continue;
        const childRight = kids[0].x + NODE_WIDTH;
        // Vertical bar sits a fixed run left of the label zone, so the line into
        // the card stays clearly visible, then a gap, then the label, then the card.
        const barX = parent.x - LABEL_ZONE - PARENT_RUN;
        const cys = kids.map((k) => k.y + NODE_HEIGHT / 2);
        const py = parent.y + NODE_HEIGHT / 2;
        kids.forEach((k) =>
          hLine(childRight, k.y + NODE_HEIGHT / 2, Math.max(LINE_W, barX - childRight)),
        );
        vLine(barX, Math.min(...cys), Math.abs(cys[cys.length - 1] - cys[0]) || 1);
        hLine(barX, py, PARENT_RUN);
      }
    }
  };

  // Winners-bracket connectors (binary tree).
  const winPos = new Map<string, Pos>();
  positioned.forEach((p) => {
    if (p.match.side === "winners") winPos.set(p.match.id, p);
  });
  treeConnect(winPos, winRounds, winMaxR, (i) => [i * 2 - 1, i * 2]);

  // Losers — also a left-to-right tree. Major rounds (same count as the prior
  // round) align with their single LB child; minor rounds (half the count) center
  // between two. Round 1 is stacked.
  const losBaseY = hasLosers ? winHeight + DIVIDER_GAP : winHeight;
  // Placement each losers round plays for: the losers-final loser is 3rd, and each
  // earlier round eliminates a (bracket-position) block below that. Counting from
  // the final back assigns 3rd, 4th, 5-6th, 7-8th, 9-12th, … to the rounds.
  const losPlace = new Map<number, string>();
  {
    let place = 3;
    for (let r = losMaxR; r >= 1; r--) {
      const count = (losRounds.get(r) || []).length;
      if (count <= 0) continue;
      const hi = place + count - 1;
      losPlace.set(r, placeLabel(place, hi));
      place = hi + 1;
    }
  }
  let prevLY = new Map<number, number>();
  for (let r = 1; r <= losMaxR; r++) {
    const arr = losRounds.get(r) || [];
    const prevCount = (losRounds.get(r - 1) || []).length;
    const major = r > 1 && arr.length === prevCount;
    const x = (r - 1) * colStride;
    labels.push({
      x,
      y: losBaseY + 4,
      text: r === losMaxR ? "Losers Final" : `Losers Round ${r}`,
      sub: losPlace.get(r),
    });
    const curLY = new Map<number, number>();
    arr.forEach((m, j) => {
      const i = idxOf(m);
      let y: number;
      if (r === 1) y = losBaseY + LABEL_H + j * rowStride;
      else if (major) y = prevLY.get(i) ?? losBaseY + LABEL_H + j * rowStride;
      else {
        const y1 = prevLY.get(i * 2 - 1) ?? prevLY.get(i * 2) ?? losBaseY + LABEL_H;
        const y2 = prevLY.get(i * 2) ?? y1;
        y = (y1 + y2) / 2;
      }
      positioned.push({ x, y, match: m });
      curLY.set(i, y);
    });
    prevLY = curLY;
  }
  const losPos = new Map<string, Pos>();
  positioned.forEach((p) => {
    if (p.match.side === "losers") losPos.set(p.match.id, p);
  });
  // Losers connectors: major rounds feed L(r-1)M(i); minor rounds L(r-1)M(2i-1/2i).
  for (let r = 2; r <= losMaxR; r++) {
    const arr = losRounds.get(r) || [];
    const major = arr.length === (losRounds.get(r - 1) || []).length;
    treeConnect(
      losPos,
      new Map([
        [r - 1, losRounds.get(r - 1) || []],
        [r, arr],
      ]),
      r,
      (i) => (major ? [i] : [i * 2 - 1, i * 2]),
    );
  }

  // Grand final flows left-to-right: GF, then GF2 (reset) to its right.
  const losHeight = hasLosers ? LABEL_H + (losRounds.get(1) || []).length * rowStride : 0;
  const gfY = LABEL_H + (Math.max(1, winR1Count) / 2 - 0.5) * rowStride;
  let gfPrev: Pos | null = null;
  grand.forEach((m) => {
    const x = winWidth + (m.round - 1) * colStride;
    const pos = { x, y: gfY, match: m };
    positioned.push(pos);
    labels.push({
      x,
      y: 4,
      text: m.round === 1 ? "Finals" : "Finals (2nd Set)",
      sub: m.round === 1 ? "1st / 2nd" : undefined,
    });
    if (gfPrev)
      hLine(
        gfPrev.x + NODE_WIDTH,
        gfY + NODE_HEIGHT / 2,
        Math.max(LINE_W, x - gfPrev.x - NODE_WIDTH - LABEL_ZONE),
      );
    gfPrev = pos;
  });

  const grandCols = grand.length;
  const width = Math.max(winWidth + grandCols * colStride, losMaxR * colStride) + GAP_X;
  const height = hasLosers ? losBaseY + losHeight : winHeight;
  const dividerY = hasLosers ? winHeight + DIVIDER_GAP / 2 : 0;
  return { positioned, labels, lines, width, height, hasLosers, dividerY, winWidth };
};

// Routing line under a node: a winners match shows where its LOSER drops ("L to
// 25"); a losers/grand match shows where its WINNER advances ("W to 28"), and a
// losers match fed by a single dropped winner also shows its source ("L of 21").
const routingText = (m: LiveMatch): string => {
  if (m.empty) return "";
  const parts: string[] = [];
  if (!m.bye && m.side === "losers" && m.loserFromLabels.length === 1)
    parts.push(`L of ${m.loserFromLabels[0]}`);
  if (!m.bye && m.side === "winners") {
    if (m.loserToLabel) parts.push(`L to ${m.loserToLabel}`);
  } else if (m.winnerToLabel) {
    // Losers/grand matches — and byes on any side — show where the winner advances.
    parts.push(`W to ${m.winnerToLabel}`);
  }
  return parts.join("  ·  ");
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
  focusMatchId,
  focusKey,
  highlightRegId,
}: {
  matches: LiveMatch[];
  onNodePress: (m: LiveMatch) => void;
  // Registration id of the viewer — their matches get a green (win) / red (loss)
  // border so they can follow their path.
  highlightRegId?: number | null;
  // When set, the canvas opens centered on this match (e.g. the viewer's own match).
  focusMatchId?: string | null;
  // Changing this re-triggers the centering even to the same match (so a repeat
  // "View Bracket" re-centers instead of keeping the last pan/zoom).
  focusKey?: string | number;
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

  // Open centered on the requested match (the viewer's own match). Re-centers
  // whenever the target or the viewport changes, so each "View Bracket" resets here.
  useEffect(() => {
    if (!focusMatchId || viewport.w === 0) return;
    const node = positioned.find((p) => p.match.id === focusMatchId);
    if (!node) return;
    const target = 1;
    animateTo(
      target,
      viewport.w / 2 - (node.x + NODE_WIDTH / 2) * target,
      viewport.h / 2 - (node.y + NODE_HEIGHT / 2) * target,
    );
    setHighlight(focusMatchId);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlight(null), 2600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusMatchId, focusKey, viewport.w, viewport.h, positioned]);
  const toggleFav = (name: string) =>
    setFavs((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));

  // Stable so memoized nodes don't re-render on every parent render.
  // The viewer's relationship to a match: win / loss (completed) or "mine" (pending).
  const mineFor = (m: LiveMatch): "win" | "loss" | "mine" | null => {
    if (highlightRegId == null || m.empty || m.bye) return null;
    const isP1 = m.p1RegId === highlightRegId;
    const isP2 = m.p2RegId === highlightRegId;
    if (!isP1 && !isP2) return null;
    if (m.status === "completed" && m.winner) {
      return m.winner === (isP1 ? 1 : 2) ? "win" : "loss";
    }
    return "mine";
  };

  const handleNodePress = useCallback(
    (mm: LiveMatch) => {
      Keyboard.dismiss();
      onNodePress(mm);
    },
    [onNodePress],
  );

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
                        <View
                          key={`lb-${i}`}
                          style={[styles.roundLabelWrap, { left: lb.x, top: lb.y }]}
                          pointerEvents="none"
                        >
                          <Text allowFontScaling={false} style={styles.roundLabel} numberOfLines={1}>
                            {lb.text}
                          </Text>
                          {lb.sub ? (
                            <Text allowFontScaling={false} style={styles.roundSub} numberOfLines={1}>
                              {lb.sub}
                            </Text>
                          ) : null}
                        </View>
                      ))}
                      {positioned.map((p) => {
                        if (p.match.empty) {
                          return (
                            <View
                              key={p.match.id}
                              style={[styles.emptyNode, { left: p.x, top: p.y }]}
                              pointerEvents="none"
                            >
                              <Text allowFontScaling={false} style={styles.emptyNodeText}>
                                No Match
                              </Text>
                            </View>
                          );
                        }
                        const route = routingText(p.match);
                        return (
                          <View
                            key={p.match.id}
                            style={{ position: "absolute", left: p.x, top: p.y, width: NODE_WIDTH }}
                          >
                            {p.match.number > 0 && (
                              <View style={styles.matchNumWrap} pointerEvents="none">
                                <View style={styles.matchNumBadge}>
                                  <Text
                                    allowFontScaling={false}
                                    style={styles.matchNumText}
                                    numberOfLines={1}
                                  >
                                    {p.match.numberLabel}
                                  </Text>
                                </View>
                              </View>
                            )}
                            <MatchNode
                              match={p.match}
                              highlighted={highlight === p.match.id}
                              mine={mineFor(p.match)}
                              onPress={handleNodePress}
                            />
                            {route ? (
                              <Text
                                allowFontScaling={false}
                                style={styles.routeLabel}
                                numberOfLines={1}
                                pointerEvents="none"
                              >
                                {route}
                              </Text>
                            ) : null}
                          </View>
                        );
                      })}
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
  roundLabelWrap: { position: "absolute", width: NODE_WIDTH, alignItems: "center" },
  roundLabel: {
    textAlign: "center",
    fontSize: webMs(FONT_SIZES.xs),
    fontWeight: "800",
    color: COLORS.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  roundSub: {
    marginTop: 1,
    textAlign: "center",
    fontSize: webMs(FONT_SIZES.xs),
    fontWeight: "900",
    color: COLORS.primary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  // Per-side route label (W32 / L1 / GF1) — an annotation that sits in the cleared
  // LABEL_ZONE between where the connector stops and the card, vertically centered
  // on the connector. Centered in the zone so it clears both the line (to its left)
  // and the card (to its right) by ~10px.
  matchNumWrap: {
    position: "absolute",
    left: -LABEL_ZONE,
    top: 0,
    height: NODE_HEIGHT,
    width: LABEL_ZONE,
    alignItems: "center",
    justifyContent: "center",
  },
  matchNumBadge: {
    paddingHorizontal: webSc(6),
    height: webSc(22),
    borderRadius: webSc(RADIUS.sm),
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  matchNumText: {
    fontSize: webMs(FONT_SIZES.xs),
    fontWeight: "800",
    color: COLORS.textSecondary,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  // Routing line ("L to 25" / "W to 28") under the node.
  routeLabel: {
    marginTop: webSc(3),
    fontSize: webMs(FONT_SIZES.xs),
    fontWeight: "700",
    color: COLORS.textMuted,
    letterSpacing: 0.3,
  },
  emptyNode: {
    position: "absolute",
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    borderRadius: webSc(RADIUS.lg),
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.55,
  },
  emptyNodeText: {
    color: COLORS.textMuted,
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "700",
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
