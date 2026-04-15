import { Stack } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View, Platform } from "react-native";
import { COLORS } from "../../../src/theme/colors";
import { RADIUS, SPACING } from "../../../src/theme/spacing";
import { FONT_SIZES } from "../../../src/theme/typography";
import { moderateScale, scale } from "../../../src/utils/scaling";
import { useAuthContext } from "../../../src/providers/AuthProvider";
import { useVenueAudit } from "../../../src/viewmodels/useVenueAudit";
import { VenueAuditModal } from "../../../src/views/components/venues/VenueAuditModal";
import { ConfettiBurst, ConfettiBurstRef } from "../../../src/views/components/common/ConfettiBurst";

const isWeb = Platform.OS === "web";
const wxMs = (v: number) => isWeb ? v : moderateScale(v);
const wxSc = (v: number) => isWeb ? v : scale(v);

function BarOwnerAuditGate() {
  const { profile } = useAuthContext();
  const audit = useVenueAudit();
  const [auditModalVisible, setAuditModalVisible] = useState(false);
  const [completeModalVisible, setCompleteModalVisible] = useState(false);
  const hasChecked = useRef(false);
  const hasShown = useRef(false);
  const confettiRef = useRef<ConfettiBurstRef>(null);

  useEffect(() => {
    if (!hasChecked.current && profile?.id_auto && profile?.role === "bar_owner") {
      hasChecked.current = true;
      audit.checkAuditNeeded();
    }
  }, [profile?.id_auto, profile?.role]);

  useEffect(() => {
    if (audit.needsAudit && !hasShown.current) {
      hasShown.current = true;
      setAuditModalVisible(true);
    }
  }, [audit.needsAudit]);

  const handleComplete = () => {
    setCompleteModalVisible(true);
    setTimeout(() => confettiRef.current?.fire(), 200);
  };

  return (
    <>
      <VenueAuditModal
        visible={auditModalVisible}
        venues={audit.auditVenues}
        onSubmit={audit.submitAudit}
        onDismiss={() => setAuditModalVisible(false)}
        onComplete={handleComplete}
      />

      <Modal
        visible={completeModalVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setCompleteModalVisible(false)}
      >
        <View style={cs.overlay}>
          <ConfettiBurst ref={confettiRef} />
          <View style={cs.card}>
            <Text allowFontScaling={false} style={cs.emoji}>{"\u2705"}</Text>
            <Text allowFontScaling={false} style={cs.title}>All Done!</Text>
            <Text allowFontScaling={false} style={cs.body}>
              {"Your venue information has been verified and saved. Players will see accurate details when browsing tournaments."}
            </Text>
            <Text allowFontScaling={false} style={cs.hint}>
              {"We\u2019ll check back in 6 months to keep things current."}
            </Text>
            <TouchableOpacity
              style={cs.btn}
              onPress={() => setCompleteModalVisible(false)}
            >
              <Text allowFontScaling={false} style={cs.btnText}>{"\u2713"} Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const cs = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.xl,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: wxSc(20),
    padding: SPACING.xl,
    alignItems: "center",
    width: "100%",
    maxWidth: wxSc(360),
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emoji: { fontSize: wxMs(64), marginBottom: SPACING.md },
  title: {
    fontSize: wxMs(FONT_SIZES.xl),
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  body: {
    fontSize: wxMs(FONT_SIZES.md),
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: wxMs(FONT_SIZES.md) * 1.6,
    marginBottom: SPACING.sm,
  },
  hint: {
    fontSize: wxMs(FONT_SIZES.xs),
    color: COLORS.textMuted,
    fontStyle: "italic",
    textAlign: "center",
    marginBottom: SPACING.xl,
  },
  btn: {
    backgroundColor: COLORS.primary,
    borderRadius: wxSc(12),
    paddingVertical: SPACING.md,
    alignItems: "center",
    width: "100%",
  },
  btnText: {
    fontSize: wxMs(FONT_SIZES.md),
    fontWeight: "700",
    color: "#FFFFFF",
  },
});

export default function AdminLayout() {
  return (
    <>
      <BarOwnerAuditGate />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: COLORS.background },
        }}
      />
    </>
  );
}