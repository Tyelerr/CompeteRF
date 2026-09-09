// app/(tabs)/conversation-detail.tsx
// Thin route wrapper around the shared ConversationThread component. Non-Inbox navigation paths
// (deep links, notifications, etc.) still push this route; the Player Inbox now renders the SAME
// ConversationThread inline instead. One implementation, no drift.

import { useLocalSearchParams, useRouter } from "expo-router";
import { View, StyleSheet } from "react-native";
import { ConversationThread } from "../../src/views/components/notifications/ConversationThread";
import { COLORS } from "../../src/theme/colors";

export default function ConversationDetailScreen() {
  const router = useRouter();
  const { id, title, category, tid, manager } = useLocalSearchParams<{
    id: string; title?: string; category?: string; tid?: string; manager?: string;
  }>();

  return (
    <View style={styles.container}>
      <ConversationThread
        conversationId={id}
        title={title}
        isReview={category === "review"}
        tournamentId={tid ? Number(tid) : null}
        manager={manager}
        onBack={() => router.back()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
});
