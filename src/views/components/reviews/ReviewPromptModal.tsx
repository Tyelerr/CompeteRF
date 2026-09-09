// src/views/components/reviews/ReviewPromptModal.tsx
// The player's one-time tournament review. STAR-FIRST: the modal opens showing the tournament
// context + "How was your experience?" + 5 stars + Dismiss. Only after a star is tapped do the
// (multi-select) reason chips + "Tell us more" comment + Submit reveal underneath — so the first
// interaction feels like a quick rating, not a survey. Dismiss (button OR the X) is a true
// dismissal (parent persists it; never re-prompts). On a successful submit the parent closes
// this modal immediately and plays a brief screen-level confetti (shared ConfettiBurst) — this modal
// shows no internal success/thank-you state. Only the star rating is required.

import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  View,
} from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { webMs, webSc } from "../../../utils/scaling";
import { normalizeGameType } from "../../../utils/game-type.utils";
import { ReviewContext, ReviewRating, REVIEW_QUESTIONS } from "../../../models/types/review.types";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface ReviewPromptModalProps {
  visible: boolean;
  context: ReviewContext;
  onSubmit: (rating: number, reasons: string[], comment: string | null) => Promise<void>;
  onDismiss: () => void;
}

const FORMAT_LABELS: Record<string, string> = {
  "single-elimination": "Single Elimination",
  "double-elimination": "Double Elimination",
  "chip-tournament": "Chip Tournament",
  "round-robin": "Round Robin",
};
const formatLabel = (f?: string | null): string => (f ? FORMAT_LABELS[f] ?? f : "");

const fmtDate = (d?: string | null): string => {
  if (!d) return "";
  const dt = new Date(`${d}T00:00:00`);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

const Stars = ({
  value,
  onChange,
  size,
}: {
  value: number;
  onChange: (v: number) => void;
  size: number;
}) => (
  <View style={styles.starsRow}>
    {[1, 2, 3, 4, 5].map((n) => (
      <TouchableOpacity key={n} onPress={() => onChange(n)} activeOpacity={0.7} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
        <Text allowFontScaling={false} style={[{ fontSize: size }, styles.star, n <= value ? styles.starOn : styles.starOff]}>
          {n <= value ? "★" : "☆"}
        </Text>
      </TouchableOpacity>
    ))}
  </View>
);

export const ReviewPromptModal = ({ visible, context, onSubmit, onDismiss }: ReviewPromptModalProps) => {
  const [rating, setRating] = useState(0);
  const [reasons, setReasons] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Reset when reopened for a different tournament.
  useEffect(() => {
    if (visible) {
      setRating(0);
      setReasons([]);
      setComment("");
      setSubmitting(false);
    }
  }, [visible, context.tournamentId]);

  // Choosing / changing the rating animates the reveal and CLEARS reasons (they differ per
  // rating) while PRESERVING the typed comment.
  const pickRating = (n: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setRating(n);
    setReasons([]);
  };

  const toggleReason = (opt: string) =>
    setReasons((cur) => (cur.includes(opt) ? cur.filter((r) => r !== opt) : [...cur, opt]));

  const handleSubmit = async () => {
    if (rating < 1 || submitting) return;
    setSubmitting(true);
    try {
      // On success the parent closes this modal immediately (optimistic) and plays the
      // screen-level confetti; on failure we stay open so the player can retry.
      await onSubmit(rating, reasons, comment.trim() || null);
    } catch {
      setSubmitting(false);
    }
  };

  const q = rating >= 1 && rating <= 5 ? REVIEW_QUESTIONS[rating as ReviewRating] : null;
  const meta = [normalizeGameType(context.gameType), formatLabel(context.tournamentFormat)]
    .filter(Boolean)
    .join(" · ");
  // Tournament date + ID share a line (ID disambiguates recurring / similarly-named events).
  const dateIdLine = [fmtDate(context.tournamentDate), `ID: ${context.tournamentId}`]
    .filter(Boolean)
    .join(" · ");

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onDismiss}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.card}>
          <TouchableOpacity style={styles.close} onPress={onDismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text allowFontScaling={false} style={styles.closeText}>
              {"✕"}
            </Text>
          </TouchableOpacity>

          <ScrollView
            ref={scrollRef}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
              {/* Context header (always visible) */}
              <Text allowFontScaling={false} style={styles.hName}>
                {context.tournamentName ?? "Tournament"}
              </Text>
              {!!dateIdLine && (
                <Text allowFontScaling={false} style={styles.hLine}>
                  {dateIdLine}
                </Text>
              )}
              {!!context.venueName && (
                <Text allowFontScaling={false} style={styles.hLine}>
                  {context.venueName}
                </Text>
              )}
              {!!meta && (
                <Text allowFontScaling={false} style={styles.hLine}>
                  {meta}
                </Text>
              )}
              {!!context.directorName && (
                <Text allowFontScaling={false} style={styles.hLine}>
                  TD: {context.directorName}
                </Text>
              )}

              {/* Prompt + stars */}
              <Text allowFontScaling={false} style={styles.prompt}>
                How was your experience?
              </Text>
              <View style={styles.starsWrap}>
                <Stars value={rating} onChange={pickRating} size={webMs(38)} />
              </View>

              {/* Revealed only after a star is chosen */}
              {rating >= 1 && q && (
                <>
                  <Text allowFontScaling={false} style={styles.qPrompt}>
                    {q.prompt}
                  </Text>
                  <View style={styles.chips}>
                    {q.options.map((opt) => {
                      const on = reasons.includes(opt);
                      return (
                        <TouchableOpacity
                          key={opt}
                          style={[styles.chip, on && styles.chipOn]}
                          onPress={() => toggleReason(opt)}
                          activeOpacity={0.8}
                        >
                          <Text allowFontScaling={false} style={[styles.chipText, on && styles.chipTextOn]}>
                            {on ? "✓ " : ""}{opt}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <Text allowFontScaling={false} style={styles.commentLabel}>
                    Tell us more
                  </Text>
                  <TextInput
                    allowFontScaling={false}
                    style={styles.commentInput}
                    placeholder="Write a comment about your experience..."
                    placeholderTextColor={COLORS.textMuted}
                    value={comment}
                    onChangeText={setComment}
                    onFocus={() =>
                      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120)
                    }
                    multiline
                    maxLength={1000}
                  />
                </>
              )}

              {/* Actions: Dismiss always; Submit appears (primary) once a rating is chosen */}
              <View style={styles.btnRow}>
                <TouchableOpacity
                  style={[styles.dismissBtn, rating >= 1 && styles.dismissBtnSplit]}
                  onPress={onDismiss}
                  activeOpacity={0.8}
                >
                  <Text allowFontScaling={false} style={styles.dismissText}>
                    Dismiss
                  </Text>
                </TouchableOpacity>
                {rating >= 1 && (
                  <TouchableOpacity
                    style={[styles.submit, styles.submitSplit, submitting && styles.submitOff]}
                    onPress={handleSubmit}
                    disabled={submitting}
                    activeOpacity={0.85}
                  >
                    <Text allowFontScaling={false} style={styles.submitText}>
                      {submitting ? "Sending…" : "Submit Review"}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "center",
    paddingHorizontal: webSc(SPACING.lg),
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.lg),
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: webSc(SPACING.lg),
    maxHeight: "82%",
    overflow: "hidden",
  },
  // Extra bottom room so the comment input + action buttons sit comfortably above the keyboard
  // once the ScrollView scrolls to the end on focus (not a hard-coded screen height).
  scrollContent: { paddingBottom: webSc(SPACING.xl) },
  close: { position: "absolute", top: webSc(SPACING.sm), right: webSc(SPACING.sm), zIndex: 5, padding: webSc(SPACING.xs) },
  closeText: { fontSize: webMs(FONT_SIZES.lg), color: COLORS.textMuted, fontWeight: "700" },

  hName: { fontSize: webMs(FONT_SIZES.lg), fontWeight: "800", color: COLORS.text, paddingRight: webSc(SPACING.lg) },
  hLine: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.textSecondary, marginTop: webSc(2) },

  prompt: {
    fontSize: webMs(FONT_SIZES.md),
    fontWeight: "700",
    color: COLORS.text,
    textAlign: "center",
    marginTop: webSc(SPACING.lg),
  },
  starsWrap: { alignItems: "center", marginTop: webSc(SPACING.sm), marginBottom: webSc(SPACING.xs) },
  starsRow: { flexDirection: "row", justifyContent: "center", gap: webSc(SPACING.xs) },
  star: { marginHorizontal: webSc(2) },
  starOn: { color: "#F5A623" },
  starOff: { color: COLORS.textMuted },

  qPrompt: {
    fontSize: webMs(FONT_SIZES.md),
    fontWeight: "700",
    color: COLORS.text,
    marginTop: webSc(SPACING.md),
    marginBottom: webSc(SPACING.sm),
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: webSc(SPACING.xs) },
  chip: {
    paddingHorizontal: webSc(SPACING.md),
    paddingVertical: webSc(SPACING.sm),
    borderRadius: webSc(RADIUS.md),
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  // Understated selected state: subtle tint + stronger (primary) border + check in the label.
  chipOn: { backgroundColor: COLORS.primary + "14", borderColor: COLORS.primary },
  chipText: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.textSecondary, fontWeight: "600" },
  chipTextOn: { color: COLORS.primary, fontWeight: "700" },

  commentLabel: {
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "700",
    color: COLORS.text,
    marginTop: webSc(SPACING.md),
    marginBottom: webSc(SPACING.xs),
  },
  commentInput: {
    backgroundColor: COLORS.background,
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.text,
    fontSize: webMs(FONT_SIZES.sm),
    padding: webSc(SPACING.sm),
    minHeight: webSc(84),
    textAlignVertical: "top",
  },

  // Both buttons: same height (paddingVertical md), same radius (RADIUS.md). When both show,
  // a 40/60 split (dismiss flex 2, submit flex 3) keeps Submit dominant without dwarfing Dismiss.
  btnRow: { flexDirection: "row", gap: webSc(SPACING.sm), marginTop: webSc(SPACING.lg), alignItems: "stretch" },
  dismissBtn: {
    flex: 1,
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: webSc(SPACING.md),
    alignItems: "center",
    justifyContent: "center",
  },
  dismissBtnSplit: { flex: 2 },
  dismissText: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.md), fontWeight: "700" },
  submit: {
    flex: 1,
    backgroundColor: COLORS.primary,
    borderRadius: webSc(RADIUS.md),
    paddingVertical: webSc(SPACING.md),
    alignItems: "center",
    justifyContent: "center",
  },
  submitSplit: { flex: 3 },
  submitOff: { opacity: 0.5 },
  submitText: { color: "#fff", fontSize: webMs(FONT_SIZES.md), fontWeight: "800" },
});
