// app/legal/privacy.tsx
import { PRIVACY_POLICY } from "@/src/models/constants/legal-text";
import { Stack, useRouter } from "expo-router";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type LegalSection = { heading: string; body: string };

export default function PrivacyScreen() {
  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ title: "Privacy Policy" }} />

      <View style={styles.wrapper}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
        >
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
        </ScrollView>

        <View style={styles.buttonBar}>
          <TouchableOpacity
            style={styles.acceptButton}
            onPress={() => router.back()}
          >
            <Text style={styles.acceptButtonText}>Accept & Close</Text>
          </TouchableOpacity>
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
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 20,
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
