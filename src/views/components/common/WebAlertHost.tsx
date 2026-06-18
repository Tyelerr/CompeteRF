// src/views/components/common/WebAlertHost.tsx
// Renders Alert.alert() dialogs on web as a styled modal that shows every button
// (native confirm() can only do OK/Cancel). Registers itself as the handler for
// the web-alert polyfill. Mount once near the app root; renders nothing on native.

import { useEffect, useState } from "react";
import {
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { webMs, webSc } from "../../../utils/scaling";
import {
  setWebAlertHandler,
  WebAlertButton,
  WebAlertPayload,
} from "../../../utils/web-alert";

export const WebAlertHost = () => {
  const [payload, setPayload] = useState<WebAlertPayload | null>(null);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    setWebAlertHandler((p) => setPayload(p));
    return () => setWebAlertHandler(null);
  }, []);

  if (Platform.OS !== "web" || !payload) return null;

  const buttons: WebAlertButton[] =
    payload.buttons && payload.buttons.length > 0
      ? payload.buttons
      : [{ text: "OK" }];

  const press = (b: WebAlertButton) => {
    setPayload(null);
    b.onPress?.();
  };

  return (
    <Modal transparent visible animationType="fade" onRequestClose={() => setPayload(null)}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {!!payload.title && (
            <Text allowFontScaling={false} style={styles.title}>
              {payload.title}
            </Text>
          )}
          {!!payload.message && (
            <Text allowFontScaling={false} style={styles.message}>
              {payload.message}
            </Text>
          )}
          <View style={styles.btns}>
            {buttons.map((b, i) => (
              <TouchableOpacity
                key={`${b.text ?? "btn"}-${i}`}
                style={styles.btn}
                onPress={() => press(b)}
              >
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.btnText,
                    b.style === "destructive" && styles.btnDestructive,
                    b.style === "cancel" && styles.btnCancel,
                  ]}
                >
                  {b.text ?? "OK"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: webSc(SPACING.lg),
  },
  card: {
    width: "100%" as any,
    maxWidth: 380,
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.lg),
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingTop: webSc(SPACING.lg),
    overflow: "hidden",
  },
  title: {
    fontSize: webMs(FONT_SIZES.lg),
    fontWeight: "800",
    color: COLORS.text,
    textAlign: "center",
    paddingHorizontal: webSc(SPACING.lg),
  },
  message: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    textAlign: "center",
    marginTop: webSc(SPACING.sm),
    paddingHorizontal: webSc(SPACING.lg),
    lineHeight: webMs(FONT_SIZES.sm) * 1.5,
  },
  btns: { marginTop: webSc(SPACING.lg) },
  btn: {
    paddingVertical: webSc(SPACING.md),
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  btnText: { fontSize: webMs(FONT_SIZES.md), fontWeight: "700", color: COLORS.primary },
  btnDestructive: { color: COLORS.error },
  btnCancel: { color: COLORS.textSecondary, fontWeight: "600" },
});
