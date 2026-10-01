// src/views/components/giveaway/GiveawayAdminModals.tsx
// The Super Admin giveaway action modals — End Early, Publish, Cancel & Refund, Draw Winner,
// Winner reveal (with fraud review), Winner details, Redraw. Extracted VERBATIM from
// app/(tabs)/admin/giveaway-management.tsx (identifiers renamed only — the Hermes minifier
// forbids 1–2 character module-level names) so the native screen and the web desktop console
// run the exact same flows. All behaviour comes from useAdminGiveaways; this is presentation.
import React from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  AdminGiveaway,
  useAdminGiveaways,
  WALLET_PUBLISH_HOLD_MESSAGE,
} from "../../../viewmodels/useAdminGiveaways";
import { moderateScale, scale } from "../../../utils/scaling";

// Design tokens (same values as the native screen)
const PAL = {
  bg:          "#000000",
  card:        "#141416",
  cardBorder:  "#252528",
  cardRaised:  "#1C1C1F",
  blue:        "#007AFF",
  blueDim:     "#007AFF20",
  blueBorder:  "#007AFF50",
  green:       "#30D158",
  greenDim:    "#30D15820",
  greenBright: "#34FF63",
  greenBorder: "#30D15850",
  amber:       "#FF9F0A",
  amberDim:    "#FF9F0A20",
  amberBorder: "#FF9F0A50",
  red:         "#FF453A",
  redDim:      "#FF453A18",
  redBorder:   "#FF453A50",
  teal:        "#64D2FF",
  tealDim:     "#64D2FF18",
  gold:        "#F5A623",
  goldDim:     "#F5A62322",
  goldBorder:  "#F5A62355",
  white:       "#FFFFFF",
  offWhite:    "#F0F0F2",
  gray:        "#8E8E93",
  lightGray:   "#AEAEB2",
  darkGray:    "#3A3A3C",
  purple:      "#BF5AF2",
  purpleDim:   "#BF5AF218",
};

const GAP = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 };
const TXT = { xs: 11, sm: 13, md: 15, lg: 17, xl: 20, xxl: 24 };

export interface GiveawayAdminModalsProps {
  vm: ReturnType<typeof useAdminGiveaways>;
  /** End Early confirmation is owned by the screen (local state), as before. */
  endEarlyTarget: AdminGiveaway | null;
  endingEarly: boolean;
  closeEndEarlyModal: () => void;
  confirmEndEarly: () => void;
  /**
   * Render the built-in Winner Details modal (default). The web desktop console passes false and
   * shows its own centered Winner Details modal bound to the same vm state (same Redraw flow).
   */
  renderWinnerDetails?: boolean;
}

export function GiveawayAdminModals({
  vm,
  endEarlyTarget,
  endingEarly,
  closeEndEarlyModal,
  confirmEndEarly,
  renderWinnerDetails = true,
}: GiveawayAdminModalsProps) {
  return (
    <>
      {/* ══════════════════════════════════════════════════════════════════════
          MODAL 0 – End Early confirmation (NEW)
      ══════════════════════════════════════════════════════════════════════ */}
      <Modal visible={!!endEarlyTarget} transparent animationType="fade" onRequestClose={closeEndEarlyModal}>
        <Pressable style={modalSt.overlay} onPress={closeEndEarlyModal}>
          <Pressable style={modalSt.card} onPress={(e) => e.stopPropagation()}>
            <View style={[modalSt.iconCircle, { backgroundColor: PAL.redDim, borderColor: PAL.redBorder }]}>
              <Text allowFontScaling={false} style={{ fontSize: moderateScale(32) }}>⏹️</Text>
            </View>
            <Text allowFontScaling={false} style={[modalSt.title, { color: PAL.red }]}>End Giveaway Early?</Text>
            <Text allowFontScaling={false} style={modalSt.giveawayName}>{endEarlyTarget?.name}</Text>
            <Text allowFontScaling={false} style={modalSt.bodyNote}>
              This will immediately close the giveaway and prevent any further entries.
              {"\n\n"}
              <Text allowFontScaling={false} style={{ color: PAL.red, fontWeight: "700" }}>
                This action cannot be undone.
              </Text>
            </Text>
            <View style={modalSt.btnRow}>
              <Pressable style={modalSt.cancelBtn} onPress={closeEndEarlyModal} disabled={endingEarly}>
                <Text allowFontScaling={false} style={modalSt.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[modalSt.confirmBtn, { backgroundColor: PAL.red }, endingEarly && modalSt.btnDisabled]}
                onPress={confirmEndEarly}
                disabled={endingEarly}
              >
                {endingEarly ? (
                  <ActivityIndicator size="small" color={PAL.white} />
                ) : (
                  <Text allowFontScaling={false} style={modalSt.confirmBtnText}>End Giveaway</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL 0a – Publish (Draft → Active; notifies all users once)
      ══════════════════════════════════════════════════════════════════════ */}
      <Modal visible={!!vm.publishTarget} transparent animationType="fade" onRequestClose={vm.closePublishModal}>
        <Pressable style={modalSt.overlay} onPress={vm.closePublishModal}>
          <Pressable style={modalSt.card} onPress={(e) => e.stopPropagation()}>
            <View style={[modalSt.iconCircle, { backgroundColor: PAL.blueDim, borderColor: PAL.blueBorder }]}>
              <Text allowFontScaling={false} style={{ fontSize: moderateScale(32) }}>📣</Text>
            </View>
            <Text allowFontScaling={false} style={[modalSt.title, { color: PAL.blue }]}>Publish Giveaway?</Text>
            <Text allowFontScaling={false} style={modalSt.giveawayName}>{vm.publishTarget?.name}</Text>
            {vm.publishTarget?.entry_mode === "wallet" ? (
              <View style={[modalSt.warnBox, { borderColor: PAL.amberBorder, backgroundColor: PAL.amberDim, marginBottom: scale(GAP.md) }]}>
                <Text allowFontScaling={false} style={[modalSt.warnText, { color: PAL.amber }]}>{WALLET_PUBLISH_HOLD_MESSAGE}</Text>
              </View>
            ) : (
              <Text allowFontScaling={false} style={modalSt.bodyNote}>
                It becomes visible on the Giveaways page, starts accepting entries, and every user
                gets the &quot;New Giveaway!&quot; notification.
              </Text>
            )}
            {vm.publishError ? (
              <View style={[modalSt.warnBox, { borderColor: PAL.redBorder, backgroundColor: PAL.redDim, marginBottom: scale(GAP.md) }]}>
                <Text allowFontScaling={false} style={[modalSt.warnText, { color: PAL.red }]}>❌  {vm.publishError}</Text>
              </View>
            ) : null}
            <View style={modalSt.btnRow}>
              <Pressable style={modalSt.cancelBtn} onPress={vm.closePublishModal} disabled={vm.publishing}>
                <Text allowFontScaling={false} style={modalSt.cancelBtnText}>Not Yet</Text>
              </Pressable>
              <Pressable
                style={[modalSt.confirmBtn, { backgroundColor: PAL.blue }, (vm.publishing || vm.publishTarget?.entry_mode === "wallet") && modalSt.btnDisabled]}
                onPress={vm.confirmPublish}
                disabled={vm.publishing || vm.publishTarget?.entry_mode === "wallet"}
              >
                {vm.publishing ? (
                  <ActivityIndicator size="small" color={PAL.white} />
                ) : (
                  <Text allowFontScaling={false} style={modalSt.confirmBtnText}>Publish</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL 0b – Cancel & Refund (wallet giveaways; NOT End Early)
      ══════════════════════════════════════════════════════════════════════ */}
      <Modal visible={!!vm.cancelTarget} transparent animationType="fade" onRequestClose={vm.closeCancelModal}>
        <Pressable style={modalSt.overlay} onPress={vm.closeCancelModal}>
          <Pressable style={modalSt.card} onPress={(e) => e.stopPropagation()}>
            <View style={[modalSt.iconCircle, { backgroundColor: PAL.redDim, borderColor: PAL.redBorder }]}>
              <Text allowFontScaling={false} style={{ fontSize: moderateScale(32) }}>↩️</Text>
            </View>
            <Text allowFontScaling={false} style={[modalSt.title, { color: PAL.red }]}>Cancel & Refund?</Text>
            <Text allowFontScaling={false} style={modalSt.giveawayName}>{vm.cancelTarget?.name}</Text>
            <Text allowFontScaling={false} style={modalSt.bodyNote}>
              The giveaway is cancelled with no winner and every entrant gets back exactly the
              Giveaway Entries they spent on it. Entry records are kept.
              {"\n\n"}
              <Text allowFontScaling={false} style={{ color: PAL.red, fontWeight: "700" }}>
                This is final and cannot be undone.
              </Text>
            </Text>
            <Text allowFontScaling={false} style={modalSt.fieldLabel}>
              Reason <Text allowFontScaling={false} style={{ color: PAL.red }}>*</Text>
            </Text>
            <TextInput
              style={modalSt.reasonInput}
              value={vm.cancelReason}
              onChangeText={vm.setCancelReason}
              placeholder="e.g. Prize no longer available"
              placeholderTextColor={PAL.gray}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              editable={!vm.cancelling}
            />
            {vm.cancelError ? (
              <View style={[modalSt.warnBox, { borderColor: PAL.redBorder, backgroundColor: PAL.redDim, marginBottom: scale(GAP.md) }]}>
                <Text allowFontScaling={false} style={[modalSt.warnText, { color: PAL.red }]}>❌  {vm.cancelError}</Text>
              </View>
            ) : null}
            <View style={modalSt.btnRow}>
              <Pressable style={modalSt.cancelBtn} onPress={vm.closeCancelModal} disabled={vm.cancelling}>
                <Text allowFontScaling={false} style={modalSt.cancelBtnText}>Keep Giveaway</Text>
              </Pressable>
              <Pressable
                style={[modalSt.confirmBtn, { backgroundColor: PAL.red }, (vm.cancelling || !vm.cancelReason.trim()) && modalSt.btnDisabled]}
                onPress={vm.confirmCancelAndRefund}
                disabled={vm.cancelling || !vm.cancelReason.trim()}
              >
                {vm.cancelling ? (
                  <ActivityIndicator size="small" color={PAL.white} />
                ) : (
                  <Text allowFontScaling={false} style={modalSt.confirmBtnText}>Cancel & Refund</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL 1 – Draw Winner confirmation
      ══════════════════════════════════════════════════════════════════════ */}
      <Modal visible={vm.drawModalVisible} transparent animationType="fade" onRequestClose={vm.closeDrawModal}>
        <Pressable style={modalSt.overlay} onPress={vm.closeDrawModal}>
          <Pressable style={modalSt.card} onPress={(e) => e.stopPropagation()}>
            <View style={[modalSt.iconCircle, { backgroundColor: PAL.blueDim, borderColor: PAL.blueBorder }]}>
              <Text allowFontScaling={false} style={{ fontSize: moderateScale(32) }}>🎲</Text>
            </View>
            <Text allowFontScaling={false} style={modalSt.title}>Draw Winner?</Text>
            <Text allowFontScaling={false} style={modalSt.giveawayName}>{vm.selectedGiveaway?.name}</Text>

            <View style={[modalSt.infoCard, { borderColor: PAL.blueBorder, backgroundColor: PAL.blueDim }]}>
              <Text allowFontScaling={false} style={modalSt.infoCardLabel}>Eligible entries</Text>
              <Text allowFontScaling={false} style={[modalSt.infoCardValue, { color: PAL.blue }]}>
                {vm.selectedGiveaway?.entry_count || 0}
              </Text>
            </View>

            {(vm.selectedGiveaway?.entry_count || 0) === 0 && (
              <View style={[modalSt.warnBox, { borderColor: PAL.redBorder, backgroundColor: PAL.redDim }]}>
                <Text allowFontScaling={false} style={[modalSt.warnText, { color: PAL.red }]}>
                  ⚠️  No entries – cannot draw a winner.
                </Text>
              </View>
            )}

            {/* Error feedback – shown when drawWinner fails */}
            {vm.drawError ? (
              <View style={[modalSt.warnBox, { borderColor: PAL.redBorder, backgroundColor: PAL.redDim, marginBottom: scale(GAP.md) }]}>
                <Text allowFontScaling={false} style={[modalSt.warnText, { color: PAL.red }]}>
                  ❌  {vm.drawError}
                </Text>
              </View>
            ) : null}

            <Text allowFontScaling={false} style={modalSt.bodyNote}>
              A winner will be randomly selected from all eligible entries and notified instantly.{"\n\n"}
              <Text allowFontScaling={false} style={{ color: PAL.red, fontWeight: "700" }}>
                This action cannot be undone.
              </Text>
            </Text>

            <View style={modalSt.btnRow}>
              <Pressable style={modalSt.cancelBtn} onPress={vm.closeDrawModal}>
                <Text allowFontScaling={false} style={modalSt.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  modalSt.confirmBtn,
                  { backgroundColor: PAL.blue },
                  (vm.processing !== null || (vm.selectedGiveaway?.entry_count || 0) === 0) && modalSt.btnDisabled,
                ]}
                onPress={() => vm.selectedGiveaway && vm.drawWinner(vm.selectedGiveaway.id)}
                disabled={vm.processing !== null || (vm.selectedGiveaway?.entry_count || 0) === 0}
              >
                {vm.processing !== null ? (
                  <ActivityIndicator size="small" color={PAL.white} />
                ) : (
                  <Text allowFontScaling={false} style={modalSt.confirmBtnText}>Draw Winner 🎲</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL 2 – Winner reveal
      ══════════════════════════════════════════════════════════════════════ */}
      <Modal visible={vm.winnerModalVisible} transparent animationType="fade" onRequestClose={vm.closeWinnerModal}>
        <View style={modalSt.overlay}>
          <View style={[modalSt.card, { borderColor: PAL.goldBorder }]}>
            <View style={[modalSt.iconCircle, { backgroundColor: PAL.goldDim, borderColor: PAL.goldBorder }]}>
              <Text allowFontScaling={false} style={{ fontSize: moderateScale(36) }}>🏆</Text>
            </View>
            <Text allowFontScaling={false} style={[modalSt.title, { color: PAL.gold }]}>Winner Selected!</Text>
            <Text allowFontScaling={false} style={modalSt.giveawayName}>{vm.selectedGiveaway?.name}</Text>

            {vm.drawnWinner && (
              <View style={[modalSt.winnerCard, { borderColor: PAL.goldBorder, backgroundColor: PAL.goldDim }]}>
                <Text allowFontScaling={false} style={modalSt.winnerCardName}>{vm.drawnWinner.name}</Text>
                <View style={modalSt.winnerCardDivider} />
                {[
                  { icon: "🪪", label: "Profile ID", value: `#${vm.drawnWinner.user_id}`, color: PAL.gold },
                  { icon: "✉️", label: "Email",      value: vm.drawnWinner.email,          color: PAL.lightGray },
                  { icon: "📞", label: "Phone",      value: vm.drawnWinner.phone,          color: PAL.lightGray },
                ].map((row) => (
                  <View key={row.label} style={modalSt.winnerDetailRow}>
                    <Text allowFontScaling={false} style={modalSt.winnerDetailIcon}>{row.icon}</Text>
                    <Text allowFontScaling={false} style={modalSt.winnerDetailLabel}>{row.label}</Text>
                    <Text allowFontScaling={false} style={[modalSt.winnerDetailValue, { color: row.color }]}>{row.value}</Text>
                  </View>
                ))}
              </View>
            )}

            <Text allowFontScaling={false} style={modalSt.bodyNote}>
              The winner has been notified via push notification.
            </Text>

            {/* ── Fraud report banner ───────────────────────────────────────── */}
            {vm.winnerFraudReport && vm.winnerFraudReport.riskLevel !== "clean" && (() => {
              const r = vm.winnerFraudReport!;
              const isHigh = r.riskLevel === "high";
              const isMed  = r.riskLevel === "medium";
              const bannerBg     = isHigh ? PAL.redDim    : isMed ? PAL.amberDim    : PAL.blueDim;
              const bannerBorder = isHigh ? PAL.redBorder : isMed ? PAL.amberBorder : PAL.blueBorder;
              const bannerColor  = isHigh ? PAL.red       : isMed ? PAL.amber       : PAL.blue;
              const icon = isHigh ? "🚨" : isMed ? "⚠️" : "ℹ️";
              return (
                <View style={[modalSt.warnBox, { backgroundColor: bannerBg, borderColor: bannerBorder, marginBottom: scale(GAP.md) }]}>
                  <Text allowFontScaling={false} style={[modalSt.warnText, { color: bannerColor, marginBottom: scale(GAP.xs) }]}>
                    {icon}  Fraud Review – {r.riskLevel.toUpperCase()} RISK
                  </Text>
                  {r.signals.map((sig, i) => (
                    <Text allowFontScaling={false} key={i} style={{ color: bannerColor, fontSize: moderateScale(TXT.xs), marginTop: scale(2), opacity: 0.85 }}>
                      • {sig.description}
                    </Text>
                  ))}
                  {r.requiresManualReview && (
                    <Text allowFontScaling={false} style={{ color: bannerColor, fontSize: moderateScale(TXT.xs), marginTop: scale(GAP.sm), fontWeight: "700" }}>
                      Manual review recommended before awarding prize.
                    </Text>
                  )}
                  {r.requiresVerification && (
                    <Text allowFontScaling={false} style={{ color: bannerColor, fontSize: moderateScale(TXT.xs), marginTop: scale(GAP.xs), fontWeight: "600" }}>
                      Require winner to verify identity with government-issued ID.
                    </Text>
                  )}
                </View>
              );
            })()}
            {vm.winnerFraudReport?.riskLevel === "clean" && (
              <View style={[modalSt.warnBox, { backgroundColor: PAL.greenDim, borderColor: PAL.greenBorder, marginBottom: scale(GAP.md) }]}>
                <Text allowFontScaling={false} style={{ color: PAL.green, fontSize: moderateScale(TXT.sm), fontWeight: "600", textAlign: "center" }}>
                  ✅  No fraud signals detected
                </Text>
              </View>
            )}
            <Pressable
              style={{
                width: "100%",
                backgroundColor: PAL.green,
                borderRadius: scale(12),
                paddingVertical: scale(16),
                alignItems: "center",
                justifyContent: "center",
                marginTop: scale(GAP.sm),
              }}
              onPress={vm.closeWinnerModal}
            >
              <Text allowFontScaling={false} style={{ color: "#000000", fontSize: moderateScale(TXT.lg), fontWeight: "800", letterSpacing: 0.5 }}>
                Done ✓
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL 3 – Winner details (awarded giveaways)
      ══════════════════════════════════════════════════════════════════════ */}
      {renderWinnerDetails ? (
      <Modal visible={vm.winnerDetailsModalVisible} transparent animationType="fade" onRequestClose={vm.closeWinnerDetailsModal}>
        <Pressable style={modalSt.overlay} onPress={vm.closeWinnerDetailsModal}>
          <Pressable style={[modalSt.card, { maxHeight: "80%" as any }]} onPress={(e) => e.stopPropagation()}>
            <Text allowFontScaling={false} style={modalSt.title}>🏆  Winner Details</Text>
            <Text allowFontScaling={false} style={modalSt.giveawayName}>{vm.selectedGiveaway?.name}</Text>

            {vm.loadingWinnerDetails ? (
              <ActivityIndicator size="large" color={PAL.blue} style={{ marginVertical: scale(GAP.xl) }} />
            ) : vm.currentWinner ? (
              <ScrollView style={{ width: "100%" }} showsVerticalScrollIndicator={false}>
                <View style={[modalSt.winnerCard, { borderColor: PAL.purple + "50", backgroundColor: PAL.purpleDim }]}>
                  <Text allowFontScaling={false} style={modalSt.winnerCardName}>{vm.currentWinner.name}</Text>
                  <View style={modalSt.winnerCardDivider} />
                  {[
                    { icon: "🪪", label: "Profile ID", value: `#${vm.currentWinner.user_id}`, color: PAL.purple },
                    { icon: "✉️", label: "Email",      value: vm.currentWinner.email,          color: PAL.lightGray },
                    { icon: "📞", label: "Phone",      value: vm.currentWinner.phone,          color: PAL.lightGray },
                    { icon: "🕐", label: "Drawn",      value: new Date(vm.currentWinner.drawn_at).toLocaleDateString(), color: PAL.lightGray },
                  ].map((row) => (
                    <View key={row.label} style={modalSt.winnerDetailRow}>
                      <Text allowFontScaling={false} style={modalSt.winnerDetailIcon}>{row.icon}</Text>
                      <Text allowFontScaling={false} style={modalSt.winnerDetailLabel}>{row.label}</Text>
                      <Text allowFontScaling={false} style={[modalSt.winnerDetailValue, { color: row.color }]}>{row.value}</Text>
                    </View>
                  ))}
                </View>

                <View style={[modalSt.infoCard, { borderColor: PAL.blueBorder, backgroundColor: PAL.blueDim, marginBottom: scale(GAP.md) }]}>
                  <Text allowFontScaling={false} style={modalSt.infoCardLabel}>Eligible for redraw</Text>
                  <Text allowFontScaling={false} style={[modalSt.infoCardValue, { color: PAL.blue }]}>{vm.eligibleCount}</Text>
                </View>

                {vm.winnerHistory.length > 1 && (
                  <View style={modalSt.historyBox}>
                    <Text allowFontScaling={false} style={modalSt.historyTitle}>Draw History</Text>
                    {vm.winnerHistory.map((r) => (
                      <Text allowFontScaling={false} key={r.id} style={modalSt.historyItem}>
                        {r.status === "disqualified" ? "❌" : "✅"}{" "}
                        {r.user_name} – {new Date(r.drawn_at).toLocaleDateString()}
                        {r.status === "disqualified" && r.disqualified_reason
                          ? `\n   ↳ ${r.disqualified_reason}` : ""}
                      </Text>
                    ))}
                  </View>
                )}
              </ScrollView>
            ) : (
              <Text allowFontScaling={false} style={modalSt.bodyNote}>No winner on record.</Text>
            )}

            <View style={[modalSt.btnRow, { marginTop: scale(GAP.md) }]}>
              <Pressable style={modalSt.cancelBtn} onPress={vm.closeWinnerDetailsModal}>
                <Text allowFontScaling={false} style={modalSt.cancelBtnText}>Close</Text>
              </Pressable>
              {vm.currentWinner && vm.eligibleCount > 0 && (
                <Pressable
                  style={[modalSt.confirmBtn, { backgroundColor: PAL.amber }]}
                  onPress={vm.openRedrawModal}
                >
                  <Text allowFontScaling={false} style={modalSt.confirmBtnText}>Redraw</Text>
                </Pressable>
              )}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      ) : null}

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL 4 – Redraw confirm
      ══════════════════════════════════════════════════════════════════════ */}
      <Modal visible={vm.redrawModalVisible} transparent animationType="fade" onRequestClose={vm.closeRedrawModal}>
        <Pressable style={modalSt.overlay} onPress={vm.closeRedrawModal}>
          <Pressable style={modalSt.card} onPress={(e) => e.stopPropagation()}>
            <View style={[modalSt.iconCircle, { backgroundColor: PAL.amberDim, borderColor: PAL.amberBorder }]}>
              <Text allowFontScaling={false} style={{ fontSize: moderateScale(32) }}>🔄</Text>
            </View>
            <Text allowFontScaling={false} style={[modalSt.title, { color: PAL.amber }]}>Redraw Winner</Text>
            <Text allowFontScaling={false} style={modalSt.bodyNote}>
              The current winner will be disqualified and a new winner drawn from the remaining{" "}
              <Text allowFontScaling={false} style={{ color: PAL.white, fontWeight: "700" }}>{vm.eligibleCount}</Text>{" "}
              eligible {vm.eligibleCount === 1 ? "entry" : "entries"}.
            </Text>

            <Text allowFontScaling={false} style={modalSt.fieldLabel}>
              Reason for disqualification <Text allowFontScaling={false} style={{ color: PAL.red }}>*</Text>
            </Text>
            <TextInput
              style={modalSt.reasonInput}
              value={vm.redrawReason}
              onChangeText={vm.setRedrawReason}
              placeholder="e.g. Winner did not respond within 7 days"
              placeholderTextColor={PAL.gray}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              editable={!vm.redrawing}
            />

            {vm.redrawError ? (
              <View style={[modalSt.warnBox, { borderColor: PAL.redBorder, backgroundColor: PAL.redDim, marginBottom: scale(GAP.md) }]}>
                <Text allowFontScaling={false} style={[modalSt.warnText, { color: PAL.red }]}>
                  ❌  {vm.redrawError}
                </Text>
              </View>
            ) : null}

            <View style={modalSt.btnRow}>
              <Pressable style={modalSt.cancelBtn} onPress={vm.closeRedrawModal} disabled={vm.redrawing}>
                <Text allowFontScaling={false} style={modalSt.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  modalSt.confirmBtn,
                  { backgroundColor: PAL.amber },
                  (!vm.redrawReason.trim() || vm.redrawing) && modalSt.btnDisabled,
                ]}
                onPress={vm.handleRedrawWinner}
                disabled={!vm.redrawReason.trim() || vm.redrawing}
              >
                {vm.redrawing ? (
                  <ActivityIndicator size="small" color={PAL.white} />
                ) : (
                  <Text allowFontScaling={false} style={modalSt.confirmBtnText}>Confirm Redraw</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal styles
// ─────────────────────────────────────────────────────────────────────────────
const modalSt = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
    padding: scale(GAP.lg),
  },
  card: {
    width: "100%",
    maxWidth: scale(440),
    backgroundColor: "#0D0D10",
    borderRadius: scale(20),
    padding: scale(GAP.xl),
    borderWidth: 1,
    borderColor: PAL.cardBorder,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.7,
    shadowRadius: 24,
  },
  iconCircle: {
    width: scale(72),
    height: scale(72),
    borderRadius: scale(36),
    alignItems: "center",
    justifyContent: "center",
    marginBottom: scale(GAP.md),
    borderWidth: 1,
  },
  title: { fontSize: moderateScale(TXT.xl), fontWeight: "700", color: PAL.white, marginBottom: scale(GAP.xs), textAlign: "center" },
  giveawayName: { fontSize: moderateScale(TXT.md), color: PAL.lightGray, textAlign: "center", marginBottom: scale(GAP.lg), fontWeight: "500" },

  infoCard: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderRadius: scale(12),
    padding: scale(GAP.md),
    marginBottom: scale(GAP.md),
    borderWidth: 1,
  },
  infoCardLabel: { color: PAL.gray, fontSize: moderateScale(TXT.sm) },
  infoCardValue: { fontSize: moderateScale(TXT.xl), fontWeight: "700" },

  warnBox: { width: "100%", borderRadius: scale(10), padding: scale(GAP.md), marginBottom: scale(GAP.md), borderWidth: 1 },
  warnText: { fontSize: moderateScale(TXT.sm), fontWeight: "600", textAlign: "center" },

  bodyNote: {
    color: PAL.gray,
    fontSize: moderateScale(TXT.sm),
    textAlign: "center",
    lineHeight: 20,
    marginBottom: scale(GAP.lg),
    width: "100%",
  },

  winnerCard: {
    width: "100%",
    borderRadius: scale(14),
    padding: scale(GAP.lg),
    marginBottom: scale(GAP.md),
    borderWidth: 1,
    gap: scale(GAP.sm),
  },
  winnerCardName: { color: PAL.white, fontSize: moderateScale(TXT.xl), fontWeight: "700", textAlign: "center" },
  winnerCardDivider: { height: scale(1), backgroundColor: PAL.cardBorder },
  winnerDetailRow: { flexDirection: "row", alignItems: "center", gap: scale(GAP.sm) },
  winnerDetailIcon: { fontSize: moderateScale(15), width: scale(22), textAlign: "center" },
  winnerDetailLabel: { color: PAL.gray, fontSize: moderateScale(TXT.sm), width: scale(70) },
  winnerDetailValue: { fontSize: moderateScale(TXT.sm), fontWeight: "600", flex: 1 },

  historyBox: {
    width: "100%",
    backgroundColor: PAL.card,
    borderRadius: scale(10),
    padding: scale(GAP.md),
    marginBottom: scale(GAP.md),
    borderWidth: 1,
    borderColor: PAL.cardBorder,
    gap: scale(GAP.xs),
  },
  historyTitle: { color: PAL.gray, fontSize: moderateScale(TXT.xs), fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: scale(GAP.xs) },
  historyItem: { color: PAL.lightGray, fontSize: moderateScale(TXT.sm), lineHeight: 20 },

  fieldLabel: { color: PAL.lightGray, fontSize: moderateScale(TXT.sm), fontWeight: "500", marginBottom: scale(GAP.sm), alignSelf: "flex-start" },
  reasonInput: {
    width: "100%",
    backgroundColor: PAL.card,
    borderWidth: 1,
    borderColor: PAL.cardBorder,
    borderRadius: scale(10),
    paddingVertical: scale(GAP.md),
    paddingHorizontal: scale(GAP.md),
    color: PAL.white,
    fontSize: moderateScale(TXT.md),
    minHeight: scale(80),
    textAlignVertical: "top",
    marginBottom: scale(GAP.lg),
  },

  btnRow: { flexDirection: "row", gap: scale(GAP.md), width: "100%" },
  cancelBtn: {
    flex: 1,
    paddingVertical: scale(14),
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: PAL.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: { color: PAL.lightGray, fontSize: moderateScale(TXT.md), fontWeight: "600" },
  confirmBtn: {
    flex: 1,
    paddingVertical: scale(14),
    borderRadius: scale(12),
    alignItems: "center",
    justifyContent: "center",
  },
  confirmBtnText: { color: PAL.white, fontSize: moderateScale(TXT.md), fontWeight: "700" },
  btnDisabled: { opacity: 0.35 },
});
