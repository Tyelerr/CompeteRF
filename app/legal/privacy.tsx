// app/legal/privacy.tsx

import { PRIVACY_POLICY } from "@/src/models/constants/legal-text";
import { Stack, useRouter } from "expo-router";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const isWeb = Platform.OS === "web";
type LegalSection = { heading: string; body: string };

export default function PrivacyScreen() {
  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ title: "Privacy Policy" }} />

      <View style={styles.wrapper}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            isWeb && styles.scrollContentWeb,
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={isWeb ? styles.webInner : styles.mobileInner}>
            <Text style={styles.lastUpdated}>
              Effective Date: {PRIVACY_POLICY.lastUpdated}
            </Text>

            <Text style={styles.preamble}>{PRIVACY_POLICY.preamble}</Text>

            {PRIVACY_POLICY.sections.map(
              (section: LegalSection, index: number) => (
                <View key={index} style={styles.section}>
                  <Text style={styles.heading}>{section.heading}</Text>
                  <Text style={styles.body}>{section.body}</Text>
                </View>
              ),
            )}
          </View>
        </ScrollView>

        <View style={[styles.buttonBar, isWeb && styles.buttonBarWeb]}>
          <View style={isWeb ? styles.buttonBarInner : undefined}>
            <TouchableOpacity
              style={styles.acceptButton}
              onPress={() => router.back()}
            >
              <Text style={styles.acceptButtonText}>Accept & Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: "#0F1117",
  },
  scroll: { flex: 1 },
  scrollContent: {
    padding: 20,
    paddingBottom: 20,
  },
  scrollContentWeb: {
    alignItems: "center",
  },
  webInner: {
    width: "100%" as any,
    maxWidth: 860,
  },
  mobileInner: {
    flex: 1,
  },
  lastUpdated: {
    color: "#6B7280",
    fontSize: 13,
    marginBottom: 16,
  },
  preamble: {
    color: "#D1D5DB",
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 24,
  },
  section: {
    marginBottom: 24,
  },
  heading: {
    color: "#3B82F6",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
  },
  body: {
    color: "#D1D5DB",
    fontSize: 14,
    lineHeight: 22,
  },
  buttonBar: {
    padding: 16,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderTopColor: "#1F2937",
    backgroundColor: "#0F1117",
  },
  buttonBarWeb: {
    alignItems: "center",
  },
  buttonBarInner: {
    width: "100%" as any,
    maxWidth: 860,
  },
  acceptButton: {
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: "#3B82F6",
    alignItems: "center",
    justifyContent: "center",
  },
  acceptButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});
