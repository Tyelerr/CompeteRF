import { useState } from "react";
import { Platform, Text, TouchableOpacity, View } from "react-native";
import { RSSItem } from "../../../models/types/home.types";
import { COLORS } from "../../../theme/colors";
import { styles } from "../../screens/home/home.styles";

const isWeb = Platform.OS === "web";

interface NewsCardProps {
  item: RSSItem;
  onPress: (url: string) => void;
}

export function NewsCard({ item, onPress }: NewsCardProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <TouchableOpacity
      style={[
        styles.newsCard,
        isWeb && hovered && { borderColor: COLORS.primary, transform: [{ scale: 1.02 }], boxShadow: `0 8px 32px 0 ${COLORS.primary}55` } as any,
        isWeb && { transition: "transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease", cursor: "pointer" } as any,
      ]}
      onPress={() => onPress(item.link)}
      activeOpacity={0.75}
      // @ts-ignore — web only
      onMouseEnter={() => isWeb && setHovered(true)}
      onMouseLeave={() => isWeb && setHovered(false)}
    >
      <View style={[styles.newsAccentBar, isWeb && hovered && { backgroundColor: COLORS.primary }]} />
      <View style={styles.newsCardInner}>
        <View style={styles.newsPill}>
          <Text allowFontScaling={false} style={styles.newsPillText}>AZ BILLIARDS</Text>
        </View>
        <Text
          allowFontScaling={false}
          style={[styles.newsTitle, isWeb && hovered && { color: COLORS.primary }, isWeb && { transition: "color 0.18s ease" } as any]}
          numberOfLines={isWeb ? 3 : 4}
        >
          {item.title}
        </Text>
        <Text allowFontScaling={false} style={styles.newsDescription} numberOfLines={isWeb ? 3 : 4}>
          {item.description}
        </Text>
        <View style={styles.newsFooter}>
          <Text allowFontScaling={false} style={styles.newsDate}>{item.pubDate}</Text>
          <View style={[styles.newsReadMore, isWeb && hovered && { backgroundColor: COLORS.primary + "30" }, isWeb && { transition: "background-color 0.18s ease" } as any]}>
            <Text allowFontScaling={false} style={[styles.newsReadMoreText, isWeb && hovered && { color: COLORS.primary }]}>
              Read more →
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}
