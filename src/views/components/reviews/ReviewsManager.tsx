// src/views/components/reviews/ReviewsManager.tsx
// Management "Reviews" tab body (Message Center). Dynamic search + Filters (centered pop-out
// modal) + Sort (anchored popover) + active-filter chips + results count + review cards + a
// keyboard-aware detail/reply modal. Rows are RLS-scoped to the caller (Bar Owner → their
// venues; TD → tournaments they directed). Replies reuse the conversations system → player Inbox.
//
// UX: NO bottom sheets. Filters is a centered pop-out; the Game Type/Format/Venue/Director
// selectors and Sort use true floating popovers anchored to their trigger (measureInWindow),
// which never resize the Filters modal. Game Type/Format come from the canonical GAME_TYPES /
// TOURNAMENT_FORMATS; Venue/Director come from stable RLS-scoped facets (filter-independent).

import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { webMs, webSc } from "../../../utils/scaling";
import { normalizeGameType } from "../../../utils/game-type.utils";
import { GAME_TYPES, TOURNAMENT_FORMATS } from "../../../utils/tournament-form-data";
import { useReviews } from "../../../viewmodels/hooks/use.reviews";
import { conversationService, ConversationMessage } from "../../../models/services/conversation.service";
import {
  ReviewSort,
  REVIEW_SORT_LABELS,
  REVIEW_SORT_SHORT,
  TournamentReview,
} from "../../../models/types/review.types";

// Canonical option lists (drop the placeholder first entry). Reused, not re-declared.
const GAME_OPTS = GAME_TYPES.filter((g) => g.value);
const FORMAT_OPTS = TOURNAMENT_FORMATS.filter((f) => f.value);
const SORT_OPTS = (Object.keys(REVIEW_SORT_LABELS) as ReviewSort[]).map((k) => ({
  value: k as string,
  label: REVIEW_SORT_LABELS[k],
}));
const formatLabel = (v?: string | null): string =>
  v ? FORMAT_OPTS.find((f) => f.value === v)?.label ?? v : "";

const fmtDate = (d?: string | null) => {
  if (!d) return "";
  const dt = new Date(`${d}T00:00:00`);
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};
const fmtDateTime = (d?: string | null) => {
  if (!d) return "";
  const dt = new Date(d);
  return isNaN(dt.getTime())
    ? ""
    : dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) +
        " at " +
        dt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
};

const StarRow = ({ n, size = FONT_SIZES.sm }: { n: number | null; size?: number }) => (
  <Text allowFontScaling={false} style={[styles.stars, { fontSize: webMs(size) }]}>
    {"★".repeat(n ?? 0)}
    <Text style={styles.starsOff}>{"★".repeat(Math.max(0, 5 - (n ?? 0)))}</Text>
  </Text>
);

const DATE_PRESETS: { key: string; label: string; days: number | "year" | null }[] = [
  { key: "all", label: "All time", days: null },
  { key: "7", label: "Last 7 days", days: 7 },
  { key: "30", label: "Last 30 days", days: 30 },
  { key: "90", label: "Last 90 days", days: 90 },
  { key: "year", label: "This year", days: "year" },
];

// A true floating popover single-select anchored to its trigger (measured in window space, so it
// works even when the trigger sits inside the Filters modal, and it never resizes that modal).
const PopoverSelect = ({
  value,
  options,
  onSelect,
  allowClear = true,
  allLabel = "All",
  anchorStyle,
  fieldLabel,
  renderTrigger,
}: {
  value: string | null;
  options: { label: string; value: string }[];
  onSelect: (v: string | null) => void;
  allowClear?: boolean;
  allLabel?: string;
  anchorStyle?: object;
  // Standard filter field trigger (label above, "value ▾" box). When omitted, renderTrigger is used.
  fieldLabel?: string;
  renderTrigger?: (current: string, open: () => void, hasValue: boolean) => React.ReactNode;
}) => {
  const ref = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const current = value ? options.find((o) => o.value === value)?.label ?? value : allLabel;

  const openMenu = () => {
    ref.current?.measureInWindow((x, y, w, h) => {
      const screenH = Dimensions.get("window").height;
      const count = options.length + (allowClear ? 1 : 0);
      const menuH = Math.min(webSc(280), count * webSc(46) + webSc(8));
      const below = y + h + webSc(4);
      // Flip above the trigger if there isn't room below.
      const top = below + menuH > screenH - webSc(24) ? Math.max(webSc(24), y - menuH - webSc(4)) : below;
      setPos({ top, left: x, width: w });
      setOpen(true);
    });
  };
  const pick = (v: string | null) => { onSelect(v); setOpen(false); };

  return (
    <>
      {fieldLabel ? (
        <View style={styles.fGroup}>
          <Text allowFontScaling={false} style={styles.fGroupLabel}>{fieldLabel}</Text>
          <View ref={ref} collapsable={false}>
            <TouchableOpacity style={styles.select} onPress={openMenu} activeOpacity={0.8}>
              <Text allowFontScaling={false} style={[styles.selectValue, value && styles.selectValueOn]} numberOfLines={1}>
                {current}
              </Text>
              <Text allowFontScaling={false} style={styles.selectChevron}>▾</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View ref={ref} collapsable={false} style={anchorStyle}>
          {renderTrigger?.(current, openMenu, !!value)}
        </View>
      )}
      <Modal transparent visible={open} animationType="fade" statusBarTranslucent onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.popoverBackdrop} onPress={() => setOpen(false)}>
          {pos && (
            <View style={[styles.popoverMenu, { top: pos.top, left: pos.left, width: pos.width }]}>
              <ScrollView style={{ maxHeight: webSc(280) }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                {allowClear && (
                  <TouchableOpacity style={styles.popoverOption} onPress={() => pick(null)}>
                    <Text allowFontScaling={false} style={[styles.popoverOptionText, !value && styles.popoverOptionTextOn]}>
                      {!value ? "✓ " : "   "}{allLabel}
                    </Text>
                  </TouchableOpacity>
                )}
                {options.map((o) => (
                  <TouchableOpacity key={o.value} style={styles.popoverOption} onPress={() => pick(o.value)}>
                    <Text allowFontScaling={false} style={[styles.popoverOptionText, value === o.value && styles.popoverOptionTextOn]}>
                      {value === o.value ? "✓ " : "   "}{o.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </Pressable>
      </Modal>
    </>
  );
};

export const ReviewsManager = ({ senderAuthUuid }: { senderAuthUuid?: string }) => {
  const {
    reviews,
    total,
    isLoading,
    hasMore,
    loadMore,
    isLoadingMore,
    filters,
    setFilters,
    clearFilters,
    activeFilterCount,
    sort,
    setSort,
    markRead,
    reply,
    refetch,
    venueOptions,
    directorOptions,
    view,
    setView,
    archiveReview,
  } = useReviews();

  const [searchText, setSearchText] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [datePreset, setDatePreset] = useState("all");
  const [selected, setSelected] = useState<TournamentReview | null>(null);

  useEffect(() => {
    const h = setTimeout(() => setFilters((f) => ({ ...f, search: searchText || undefined })), 250);
    return () => clearTimeout(h);
  }, [searchText, setFilters]);

  const applyDatePreset = (key: string) => {
    setDatePreset(key);
    const p = DATE_PRESETS.find((x) => x.key === key);
    if (!p || p.days == null) {
      setFilters((f) => ({ ...f, dateFrom: undefined, dateTo: undefined }));
      return;
    }
    const now = new Date();
    const from = p.days === "year" ? new Date(now.getFullYear(), 0, 1) : new Date(now.getTime() - p.days * 864e5);
    setFilters((f) => ({ ...f, dateFrom: from.toISOString().slice(0, 10), dateTo: undefined }));
  };

  const toggleRating = (n: number) =>
    setFilters((f) => {
      const cur = f.ratings ?? [];
      const next = cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n];
      return { ...f, ratings: next.length ? next : undefined };
    });

  const hasFilters = activeFilterCount > 0 || !!filters.search;

  // Compact active-filter chips.
  const chips: { label: string; clear: () => void }[] = [];
  for (const r of (filters.ratings ?? []).slice().sort((a, b) => b - a)) {
    chips.push({ label: `${r}★`, clear: () => toggleRating(r) });
  }
  if (filters.gameType) chips.push({ label: normalizeGameType(filters.gameType), clear: () => setFilters((f) => ({ ...f, gameType: undefined })) });
  if (filters.format) chips.push({ label: formatLabel(filters.format), clear: () => setFilters((f) => ({ ...f, format: undefined })) });
  if (filters.venueId != null) {
    const v = venueOptions.find((x) => x.value === String(filters.venueId));
    chips.push({ label: v?.label ?? "Venue", clear: () => setFilters((f) => ({ ...f, venueId: undefined })) });
  }
  if (filters.directorId != null) {
    const d = directorOptions.find((x) => x.value === String(filters.directorId));
    chips.push({ label: d?.label ?? "Director", clear: () => setFilters((f) => ({ ...f, directorId: undefined })) });
  }
  if (filters.dateFrom) {
    const p = DATE_PRESETS.find((x) => x.key === datePreset);
    chips.push({ label: p?.label ?? "Date", clear: () => { setDatePreset("all"); setFilters((f) => ({ ...f, dateFrom: undefined, dateTo: undefined })); } });
  }

  const resetAll = () => { clearFilters(); setSearchText(""); setDatePreset("all"); };

  const openDetail = (r: TournamentReview) => {
    setSelected(r);
    if (!r.readByMe) markRead(r.id).catch(() => {});
  };

  return (
    <View style={styles.wrap}>
      <Text allowFontScaling={false} style={styles.title}>REVIEWS</Text>

      {/* Active | Archived */}
      <View style={styles.segment}>
        {(["active", "archived"] as const).map((v) => (
          <TouchableOpacity
            key={v}
            style={[styles.segmentBtn, view === v && styles.segmentBtnOn]}
            onPress={() => setView(v)}
            activeOpacity={0.8}
          >
            <Text allowFontScaling={false} style={[styles.segmentText, view === v && styles.segmentTextOn]}>
              {v === "active" ? "Active" : "Archived"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Search */}
      <View style={styles.searchBox}>
        <Text allowFontScaling={false} style={styles.searchIcon}>🔍</Text>
        <TextInput
          allowFontScaling={false}
          style={styles.searchInput}
          placeholder="Search reviews..."
          placeholderTextColor={COLORS.textMuted}
          value={searchText}
          onChangeText={setSearchText}
        />
        {searchText.length > 0 && (
          <TouchableOpacity onPress={() => setSearchText("")}>
            <Text allowFontScaling={false} style={styles.searchClear}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Filters + Sort (Sort is an anchored popover) */}
      <View style={styles.controlsRow}>
        <TouchableOpacity style={styles.ctrlBtn} onPress={() => setFiltersOpen(true)} activeOpacity={0.8}>
          <Text allowFontScaling={false} style={styles.ctrlText} numberOfLines={1}>
            Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </Text>
        </TouchableOpacity>
        <PopoverSelect
          value={sort}
          options={SORT_OPTS}
          allowClear={false}
          onSelect={(v) => v && setSort(v as ReviewSort)}
          anchorStyle={styles.ctrlAnchor}
          renderTrigger={(_current, open) => (
            <TouchableOpacity style={styles.ctrlBtn} onPress={open} activeOpacity={0.8}>
              <Text allowFontScaling={false} style={styles.ctrlText} numberOfLines={1}>Sort: {REVIEW_SORT_SHORT[sort]}</Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* Active chips */}
      {chips.length > 0 && (
        <View style={styles.chipsRow}>
          {chips.map((c, i) => (
            <TouchableOpacity key={i} style={styles.chip} onPress={c.clear}>
              <Text allowFontScaling={false} style={styles.chipText}>{c.label} ✕</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity onPress={resetAll}>
            <Text allowFontScaling={false} style={styles.clearAll}>Clear All</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Count */}
      <Text allowFontScaling={false} style={styles.count}>
        {isLoading ? "Loading…" : hasFilters ? `${reviews.length} of ${total} reviews` : `${total} ${total === 1 ? "review" : "reviews"}`}
      </Text>

      {/* List */}
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {!isLoading && reviews.length === 0 && (
          <View style={styles.empty}>
            <Text allowFontScaling={false} style={styles.emptyIcon}>⭐</Text>
            <Text allowFontScaling={false} style={styles.emptyTitle}>
              {view === "archived" ? "No archived reviews" : "No reviews yet"}
            </Text>
            <Text allowFontScaling={false} style={styles.emptySub}>
              {view === "archived"
                ? "Reviews you archive will appear here."
                : "Reviews players submit after your tournaments will appear here."}
            </Text>
          </View>
        )}
        {reviews.map((r) => (
          <TouchableOpacity key={r.id} style={styles.card} onPress={() => openDetail(r)} activeOpacity={0.85}>
            <View style={styles.cardTopRow}>
              <StarRow n={r.rating} size={FONT_SIZES.md} />
              {!r.readByMe && <View style={styles.unreadDot} />}
            </View>
            <Text allowFontScaling={false} style={styles.cardName}>{r.tournamentName ?? "Tournament"}</Text>
            <Text allowFontScaling={false} style={styles.cardMeta}>
              {[fmtDate(r.tournamentDate), `ID: ${r.tournamentId}`].filter(Boolean).join(" · ")}
            </Text>
            {!!r.venueName && <Text allowFontScaling={false} style={styles.cardMeta}>{r.venueName}</Text>}
            <Text allowFontScaling={false} style={styles.cardMeta}>
              {[normalizeGameType(r.gameType), formatLabel(r.tournamentFormat)].filter(Boolean).join(" · ")}
            </Text>
            {!!r.directorName && <Text allowFontScaling={false} style={styles.cardMeta}>TD: {r.directorName}</Text>}
            {r.selectedReasons.length > 0 && (
              <View style={styles.reasonTags}>
                {r.selectedReasons.map((rs) => (
                  <View key={rs} style={styles.reasonTag}>
                    <Text allowFontScaling={false} style={styles.reasonTagText}>{rs}</Text>
                  </View>
                ))}
              </View>
            )}
            {!!r.comment && (
              <Text allowFontScaling={false} style={styles.cardComment} numberOfLines={2}>
                “{r.comment}”
              </Text>
            )}
            <View style={styles.cardBottom}>
              <Text allowFontScaling={false} style={styles.cardWho}>
                — @{r.reviewerUsername ?? r.reviewerName ?? "player"}
              </Text>
              {r.replyCount > 0 && <Text allowFontScaling={false} style={styles.repliedTag}>Replied</Text>}
            </View>
            <Text allowFontScaling={false} style={styles.cardSubmitted}>Submitted {fmtDateTime(r.submittedAt)}</Text>
          </TouchableOpacity>
        ))}
        {hasMore && (
          <TouchableOpacity style={styles.loadMore} onPress={() => loadMore()} disabled={isLoadingMore} activeOpacity={0.8}>
            <Text allowFontScaling={false} style={styles.loadMoreText}>{isLoadingMore ? "Loading…" : "Load More"}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Filters — centered pop-out modal */}
      <Modal visible={filtersOpen} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setFiltersOpen(false)}>
        <View style={styles.centerBackdrop}>
          <View style={styles.popCard}>
            <View style={styles.popHead}>
              <Text allowFontScaling={false} style={styles.popTitle}>Filters</Text>
              <TouchableOpacity onPress={() => setFiltersOpen(false)}><Text allowFontScaling={false} style={styles.closeText}>✕</Text></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.fGroup}>
                <Text allowFontScaling={false} style={styles.fGroupLabel}>Star Rating</Text>
                <View style={styles.fGroupPills}>
                  {[5, 4, 3, 2, 1].map((n) => {
                    const on = (filters.ratings ?? []).includes(n);
                    return (
                      <TouchableOpacity key={n} style={[styles.pill, on && styles.pillOn]} onPress={() => toggleRating(n)}>
                        <Text allowFontScaling={false} style={[styles.pillText, on && styles.pillTextOn]}>{n}★</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <PopoverSelect
                value={filters.gameType ?? null}
                options={GAME_OPTS}
                allLabel="All Game Types"
                onSelect={(v) => setFilters((f) => ({ ...f, gameType: v ?? undefined }))}
                fieldLabel="Game Type"
              />
              <PopoverSelect
                value={filters.format ?? null}
                options={FORMAT_OPTS}
                allLabel="All Formats"
                onSelect={(v) => setFilters((f) => ({ ...f, format: v ?? undefined }))}
                fieldLabel="Format"
              />
              {venueOptions.length > 1 && (
                <PopoverSelect
                  value={filters.venueId != null ? String(filters.venueId) : null}
                  options={venueOptions}
                  allLabel="All Venues"
                  onSelect={(v) => setFilters((f) => ({ ...f, venueId: v ? Number(v) : undefined }))}
                  fieldLabel="Venue"
                />
              )}
              {directorOptions.length > 1 && (
                <PopoverSelect
                  value={filters.directorId != null ? String(filters.directorId) : null}
                  options={directorOptions}
                  allLabel="All Directors"
                  onSelect={(v) => setFilters((f) => ({ ...f, directorId: v ? Number(v) : undefined }))}
                  fieldLabel="Tournament Director"
                />
              )}

              <View style={styles.fGroup}>
                <Text allowFontScaling={false} style={styles.fGroupLabel}>Tournament Date</Text>
                <View style={styles.fGroupPills}>
                  {DATE_PRESETS.map((p) => (
                    <TouchableOpacity key={p.key} style={[styles.pill, datePreset === p.key && styles.pillOn]} onPress={() => applyDatePreset(p.key)}>
                      <Text allowFontScaling={false} style={[styles.pillText, datePreset === p.key && styles.pillTextOn]}>{p.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </ScrollView>
            <View style={styles.filterActions}>
              <TouchableOpacity style={styles.clearBtn} onPress={() => { clearFilters(); setDatePreset("all"); }}>
                <Text allowFontScaling={false} style={styles.clearBtnText}>Clear All</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.applyBtn} onPress={() => setFiltersOpen(false)}>
                <Text allowFontScaling={false} style={styles.applyBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Detail + reply */}
      {selected && (
        <ReviewDetail
          review={selected}
          senderAuthUuid={senderAuthUuid}
          onReplied={() => refetch()}
          onClose={() => setSelected(null)}
          reply={reply}
          archived={view === "archived"}
          onArchiveToggle={async () => {
            await archiveReview(selected.id, view === "active");
            setSelected(null);
          }}
        />
      )}
    </View>
  );
};

// ── Detail / conversation (keyboard-aware centered modal) ──────────────────────────────
const ReviewDetail = ({
  review,
  senderAuthUuid,
  reply,
  onReplied,
  onClose,
  archived,
  onArchiveToggle,
}: {
  review: TournamentReview;
  senderAuthUuid?: string;
  reply: (r: TournamentReview, sender: string, body: string) => Promise<string>;
  onReplied: () => void;
  onClose: () => void;
  archived: boolean;
  onArchiveToggle: () => Promise<void>;
}) => {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [convId, setConvId] = useState<string | null>(review.conversationId);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);

  const loadMessages = async (id: string | null) => {
    if (!id) return;
    setLoadingMsgs(true);
    try {
      setMessages(await conversationService.getMessages(id));
    } finally {
      setLoadingMsgs(false);
    }
  };
  useEffect(() => { loadMessages(review.conversationId); }, [review.conversationId]);

  const send = async () => {
    const body = draft.trim();
    if (!body || !senderAuthUuid || sending) return;
    setSending(true);
    try {
      const id = await reply(review, senderAuthUuid, body);
      setConvId(id);
      setDraft(""); // clear only on success
      await loadMessages(id);
      onReplied();
    } catch (e: any) {
      const msg = String(e?.message || "");
      // The recipient here (for a management reply) is the player.
      const blocked = review.reviewerName
        ? `${review.reviewerName} has archived this conversation. Replies are currently unavailable.`
        : "This player has archived this conversation. Replies are currently unavailable.";
      Alert.alert(
        "Couldn't send reply",
        msg.includes("recipient_archived") ? blocked : msg || "Please try again.",
      );
    } finally {
      setSending(false);
    }
  };

  const toggleArchive = () => {
    Alert.alert(
      archived ? "Unarchive review thread?" : "Archive review thread?",
      archived
        ? "This moves the review back to your Active list."
        : "This moves the review to your Archived list and pauses the player's replies until you unarchive. The review itself is kept.",
      [
        { text: "Cancel", style: "cancel" },
        { text: archived ? "Unarchive" : "Archive", onPress: () => { onArchiveToggle().catch(() => {}); } },
      ],
    );
  };

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.centerBackdrop}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.detailCard}>
          <View style={styles.popHead}>
            <Text allowFontScaling={false} style={styles.popTitle}>Review</Text>
            <View style={styles.headActions}>
              <TouchableOpacity onPress={toggleArchive} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text allowFontScaling={false} style={styles.headDots}>•••</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose}><Text allowFontScaling={false} style={styles.closeText}>✕</Text></TouchableOpacity>
            </View>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            <StarRow n={review.rating} size={FONT_SIZES.lg} />
            <Text allowFontScaling={false} style={styles.detailName}>{review.tournamentName ?? "Tournament"}</Text>
            <Text allowFontScaling={false} style={styles.cardMeta}>{fmtDate(review.tournamentDate)} · ID: {review.tournamentId}</Text>
            {!!review.venueName && <Text allowFontScaling={false} style={styles.cardMeta}>{review.venueName}</Text>}
            <Text allowFontScaling={false} style={styles.cardMeta}>
              {[normalizeGameType(review.gameType), formatLabel(review.tournamentFormat)].filter(Boolean).join(" · ")}
            </Text>
            {!!review.directorName && <Text allowFontScaling={false} style={styles.cardMeta}>TD: {review.directorName}</Text>}
            {review.selectedReasons.length > 0 && (
              <View style={styles.reasonTags}>
                {review.selectedReasons.map((rs) => (
                  <View key={rs} style={styles.reasonTag}>
                    <Text allowFontScaling={false} style={styles.reasonTagText}>{rs}</Text>
                  </View>
                ))}
              </View>
            )}
            {!!review.comment && <Text allowFontScaling={false} style={styles.detailComment}>“{review.comment}”</Text>}
            <Text allowFontScaling={false} style={styles.cardWho}>— @{review.reviewerUsername ?? review.reviewerName ?? "player"}</Text>
            <Text allowFontScaling={false} style={styles.cardSubmitted}>Submitted {fmtDateTime(review.submittedAt)}</Text>

            <View style={styles.convoDivider} />
            <View style={styles.convo}>
              {loadingMsgs && <ActivityIndicator color={COLORS.primary} />}
              {messages.map((m) => {
                const mine = m.sender_id === senderAuthUuid;
                return (
                  <View key={m.id} style={[styles.msgBubble, mine ? styles.msgMine : styles.msgTheirs]}>
                    {!mine && <Text allowFontScaling={false} style={styles.msgSender}>{m.sender_name ?? "Player"}</Text>}
                    <Text allowFontScaling={false} style={styles.msgBody}>{m.body}</Text>
                  </View>
                );
              })}
              {!loadingMsgs && !convId && (
                <Text allowFontScaling={false} style={styles.convoHint}>
                  Reply to start a conversation — it will appear in the player’s Inbox.
                </Text>
              )}
            </View>
          </ScrollView>

          <View style={styles.replyBar}>
            <TextInput
              allowFontScaling={false}
              style={styles.replyInput}
              placeholder="Write a reply..."
              placeholderTextColor={COLORS.textMuted}
              value={draft}
              onChangeText={setDraft}
              multiline
            />
            <TouchableOpacity style={[styles.replySend, (!draft.trim() || sending) && styles.replySendOff]} onPress={send} disabled={!draft.trim() || sending}>
              <Text allowFontScaling={false} style={styles.replySendText}>{sending ? "…" : "Send"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: webSc(SPACING.md) },
  title: { fontSize: webMs(FONT_SIZES.lg), fontWeight: "800", color: COLORS.text, marginTop: webSc(SPACING.sm), marginBottom: webSc(SPACING.sm), letterSpacing: 1 },
  segment: { flexDirection: "row", backgroundColor: COLORS.surface, borderRadius: webSc(RADIUS.md), borderWidth: 1, borderColor: COLORS.border, padding: webSc(3), marginBottom: webSc(SPACING.sm) },
  segmentBtn: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: webSc(SPACING.xs), borderRadius: webSc(RADIUS.md - 2), minHeight: webSc(34) },
  segmentBtnOn: { backgroundColor: COLORS.primary },
  segmentText: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.textSecondary, fontWeight: "700" },
  segmentTextOn: { color: "#fff" },
  headActions: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.md) },
  headDots: { fontSize: webMs(FONT_SIZES.md), color: COLORS.textSecondary, fontWeight: "800" },
  searchBox: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.surface, borderRadius: webSc(RADIUS.md), borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: webSc(SPACING.sm) },
  searchIcon: { fontSize: webMs(FONT_SIZES.sm), marginRight: webSc(SPACING.xs) },
  searchInput: { flex: 1, color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), paddingVertical: webSc(SPACING.sm) },
  searchClear: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.md), paddingHorizontal: webSc(SPACING.xs) },
  controlsRow: { flexDirection: "row", gap: webSc(SPACING.sm), marginTop: webSc(SPACING.sm) },
  ctrlAnchor: { flex: 1 },
  ctrlBtn: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: webSc(SPACING.sm),
    paddingHorizontal: webSc(SPACING.sm),
    minHeight: webSc(44),
    alignItems: "center",
    justifyContent: "center",
  },
  ctrlText: { color: COLORS.text, fontSize: webMs(FONT_SIZES.xs), fontWeight: "600", textAlign: "center" },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: webSc(SPACING.xs), alignItems: "center", marginTop: webSc(SPACING.sm) },
  chip: { backgroundColor: COLORS.primary + "22", borderRadius: webSc(RADIUS.sm), paddingHorizontal: webSc(SPACING.sm), paddingVertical: webSc(4) },
  chipText: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.xs), fontWeight: "600" },
  clearAll: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700", textDecorationLine: "underline", marginLeft: webSc(SPACING.xs) },
  count: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs), marginTop: webSc(SPACING.sm) },
  list: { flex: 1, marginTop: webSc(SPACING.xs) },
  listContent: { paddingBottom: webSc(SPACING.xl) },
  empty: { alignItems: "center", paddingVertical: webSc(SPACING.xl) },
  emptyIcon: { fontSize: webMs(40), marginBottom: webSc(SPACING.sm) },
  emptyTitle: { fontSize: webMs(FONT_SIZES.md), fontWeight: "700", color: COLORS.text },
  emptySub: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.textSecondary, textAlign: "center", marginTop: webSc(SPACING.xs), paddingHorizontal: webSc(SPACING.lg) },
  card: { backgroundColor: COLORS.surface, borderRadius: webSc(RADIUS.md), borderWidth: 1, borderColor: COLORS.border, padding: webSc(SPACING.md), marginTop: webSc(SPACING.sm) },
  cardTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  stars: { color: "#F5A623", fontWeight: "700" },
  starsOff: { color: COLORS.border },
  unreadDot: { width: webSc(10), height: webSc(10), borderRadius: webSc(5), backgroundColor: COLORS.primary },
  cardName: { fontSize: webMs(FONT_SIZES.md), fontWeight: "800", color: COLORS.text, marginTop: webSc(4) },
  cardMeta: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textSecondary, marginTop: webSc(1) },
  reasonTags: { flexDirection: "row", flexWrap: "wrap", gap: webSc(SPACING.xs), marginTop: webSc(SPACING.xs) },
  reasonTag: { backgroundColor: COLORS.primary + "14", borderWidth: 1, borderColor: COLORS.primary + "55", borderRadius: webSc(RADIUS.sm), paddingHorizontal: webSc(SPACING.sm), paddingVertical: webSc(2) },
  reasonTagText: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.primary, fontWeight: "700" },
  cardComment: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.textSecondary, fontStyle: "italic", marginTop: webSc(SPACING.xs) },
  cardBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: webSc(SPACING.xs) },
  cardWho: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.text, fontWeight: "600" },
  repliedTag: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.success, fontWeight: "700" },
  cardSubmitted: { fontSize: webMs(10), color: COLORS.textMuted, marginTop: webSc(2) },
  loadMore: { alignItems: "center", paddingVertical: webSc(SPACING.md), marginTop: webSc(SPACING.sm) },
  loadMoreText: { color: COLORS.primary, fontWeight: "700", fontSize: webMs(FONT_SIZES.sm) },

  // Centered pop-out modals (no bottom sheets)
  centerBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "center", paddingHorizontal: webSc(SPACING.lg) },
  popCard: { backgroundColor: COLORS.surface, borderRadius: webSc(RADIUS.lg), borderWidth: 1, borderColor: COLORS.border, padding: webSc(SPACING.lg), maxHeight: "82%" },
  popHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: webSc(SPACING.sm) },
  popTitle: { fontSize: webMs(FONT_SIZES.md), fontWeight: "800", color: COLORS.text },
  closeText: { fontSize: webMs(FONT_SIZES.lg), color: COLORS.textMuted, fontWeight: "700" },

  fGroup: { marginBottom: webSc(SPACING.md) },
  fGroupLabel: { fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", color: COLORS.text, marginBottom: webSc(SPACING.xs) },
  fGroupPills: { flexDirection: "row", flexWrap: "wrap", gap: webSc(SPACING.xs) },
  pill: { backgroundColor: COLORS.background, borderRadius: webSc(RADIUS.sm), borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: webSc(SPACING.md), paddingVertical: webSc(SPACING.xs) },
  pillOn: { backgroundColor: COLORS.primary + "22", borderColor: COLORS.primary },
  pillText: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textSecondary, fontWeight: "600" },
  pillTextOn: { color: COLORS.primary, fontWeight: "700" },

  // Select field trigger + floating popover menu
  select: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: COLORS.background, borderRadius: webSc(RADIUS.md), borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: webSc(SPACING.md), paddingVertical: webSc(SPACING.sm) },
  selectValue: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.textSecondary, fontWeight: "600", flex: 1 },
  selectValueOn: { color: COLORS.primary, fontWeight: "700" },
  selectChevron: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.textSecondary, marginLeft: webSc(SPACING.xs) },
  popoverBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  popoverMenu: { position: "absolute", backgroundColor: COLORS.surface, borderRadius: webSc(RADIUS.md), borderWidth: 1, borderColor: COLORS.border, paddingVertical: webSc(SPACING.xs), shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  popoverOption: { paddingVertical: webSc(SPACING.sm), paddingHorizontal: webSc(SPACING.md) },
  popoverOptionText: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.textSecondary },
  popoverOptionTextOn: { color: COLORS.primary, fontWeight: "700" },

  // Clear All / Done — equal 50/50 (Done is primary via color, not size)
  filterActions: { flexDirection: "row", gap: webSc(SPACING.sm), marginTop: webSc(SPACING.sm) },
  clearBtn: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: webSc(SPACING.md), paddingHorizontal: webSc(SPACING.md), minHeight: webSc(48), borderRadius: webSc(RADIUS.md), borderWidth: 1, borderColor: COLORS.border },
  clearBtnText: { color: COLORS.textSecondary, fontWeight: "700", fontSize: webMs(FONT_SIZES.sm) },
  applyBtn: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: webSc(SPACING.md), paddingHorizontal: webSc(SPACING.md), minHeight: webSc(48), borderRadius: webSc(RADIUS.md), backgroundColor: COLORS.primary },
  applyBtnText: { color: "#fff", fontWeight: "800", fontSize: webMs(FONT_SIZES.sm) },

  detailCard: { backgroundColor: COLORS.surface, borderRadius: webSc(RADIUS.lg), borderWidth: 1, borderColor: COLORS.border, padding: webSc(SPACING.lg), maxHeight: "88%" },
  detailName: { fontSize: webMs(FONT_SIZES.lg), fontWeight: "800", color: COLORS.text, marginTop: webSc(SPACING.xs) },
  detailComment: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.textSecondary, fontStyle: "italic", marginTop: webSc(SPACING.xs) },
  convoDivider: { height: 1, backgroundColor: COLORS.border, marginTop: webSc(SPACING.md) },
  convo: { marginTop: webSc(SPACING.md), gap: webSc(SPACING.xs) },
  convoHint: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textMuted, fontStyle: "italic", marginTop: webSc(SPACING.sm) },
  msgBubble: { maxWidth: "85%", borderRadius: webSc(RADIUS.md), padding: webSc(SPACING.sm) },
  msgMine: { alignSelf: "flex-end", backgroundColor: COLORS.primary + "22" },
  msgTheirs: { alignSelf: "flex-start", backgroundColor: COLORS.background },
  msgSender: { fontSize: webMs(10), color: COLORS.textMuted, marginBottom: webSc(2), fontWeight: "700" },
  msgBody: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.text },
  replyBar: { flexDirection: "row", alignItems: "flex-end", gap: webSc(SPACING.sm), marginTop: webSc(SPACING.sm), borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: webSc(SPACING.sm) },
  replyInput: { flex: 1, backgroundColor: COLORS.background, borderRadius: webSc(RADIUS.md), borderWidth: 1, borderColor: COLORS.border, color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), paddingHorizontal: webSc(SPACING.sm), paddingVertical: webSc(SPACING.sm), maxHeight: webSc(100) },
  replySend: { backgroundColor: COLORS.primary, borderRadius: webSc(RADIUS.md), paddingHorizontal: webSc(SPACING.md), paddingVertical: webSc(SPACING.sm) },
  replySendOff: { opacity: 0.5 },
  replySendText: { color: "#fff", fontWeight: "800", fontSize: webMs(FONT_SIZES.sm) },
});
