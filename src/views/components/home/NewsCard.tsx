import { Text, TouchableOpacity, View } from "react-native";
import { RSSItem } from "../../../models/types/home.types";
import { styles } from "../../screens/home/home.styles";

interface NewsCardProps {
  item: RSSItem;
  onPress: (url: string) => void;
}

export function NewsCard({ item, onPress }: NewsCardProps) {
  return (
    <TouchableOpacity
      style={styles.newsCard}
      onPress={() => onPress(item.link)}
    >
      <View style={styles.newsHeader}>
        <Text style={styles.starIcon}>⭐</Text>
        <Text style={styles.newsTitle}>{item.title}</Text>
      </View>

      <Text style={styles.newsDescription}>{item.description}</Text>

      <View style={styles.newsFooter}>
        <View style={styles.newsInfo}>
          <Text style={styles.newsAuthor}>{item.author}</Text>
          <Text style={styles.newsDate}>📅 {item.pubDate}</Text>
        </View>
        <Text style={styles.externalIcon}>🔗</Text>
      </View>
    </TouchableOpacity>
  );
}
