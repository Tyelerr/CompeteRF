import { Platform, Text, TouchableOpacity, View } from "react-native";
import { RSSItem } from "../../../models/types/home.types";
import { styles } from "../../screens/home/home.styles";

const isWeb = Platform.OS === "web";

interface NewsCardProps {
  item: RSSItem;
  onPress: (url: string) => void;
}

export function NewsCard({ item, onPress }: NewsCardProps) {
  return (
    <TouchableOpacity
      style={styles.newsCard}
      onPress={() => onPress(item.link)}
      activeOpacity={0.75}
    >
      <View style={styles.newsAccentBar} />
      <View style={styles.newsCardInner}>
        <View style={styles.newsPill}>
          <Text style={styles.newsPillText}>AZ BILLIARDS</Text>
        </View>
        <Text style={styles.newsTitle} numberOfLines={isWeb ? 3 : 4}>
          {item.title}
        </Text>
        <Text style={styles.newsDescription} numberOfLines={isWeb ? 3 : 4}>
          {item.description}
        </Text>
        <View style={styles.newsFooter}>
          <Text style={styles.newsDate}>{item.pubDate}</Text>
          <View style={styles.newsReadMore}>
            <Text style={styles.newsReadMoreText}>Read more →</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}
