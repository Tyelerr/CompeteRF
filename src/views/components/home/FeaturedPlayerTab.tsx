import { Text, View } from "react-native";
import { FeaturedPlayer } from "../../../models/types/home.types";
import { styles } from "../../screens/home/home.styles";
import { Loading } from "../common/loading";
import { CircularFeaturedImage } from "./CircularFeaturedImage";

interface FeaturedPlayerTabProps {
  player: FeaturedPlayer | null;
}

export function FeaturedPlayerTab({ player }: FeaturedPlayerTabProps) {
  if (!player) {
    return (
      <View style={styles.loadingContainer}>
        <Loading message="Loading featured player..." />
      </View>
    );
  }

  return (
    <View style={styles.featuredContainer}>
      <View style={styles.imageOverlapSpacer} />
      <View style={styles.featuredHeader}>
        <CircularFeaturedImage imageUrl={player.profile_image_url || player.avatar_url} fallbackEmoji="👤" size={180} overlapAmount={0} />
        <Text allowFontScaling={false} style={styles.playerName}>{player.name || player.user_name}</Text>
        <Text allowFontScaling={false} style={styles.playerTitle}>{player.label_about_the_person || "Pool Enthusiast"}</Text>
        <Text allowFontScaling={false} style={styles.playerLocation}>{player.home_city}, {player.home_state}</Text>
      </View>
      <View style={styles.descriptionContainer}>
        <Text allowFontScaling={false} style={styles.sectionLabel}>PLAYER OF THE MONTH</Text>
        <Text allowFontScaling={false} style={styles.description}>{player.description || "No description available."}</Text>
      </View>
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text allowFontScaling={false} style={styles.statNumber}>8</Text>
          <Text allowFontScaling={false} style={styles.statLabel}>Years Playing</Text>
        </View>
        <View style={styles.statCard}>
          <Text allowFontScaling={false} style={styles.statNumber}>{player.preferred_game || "N/A"}</Text>
          <Text allowFontScaling={false} style={styles.statLabel}>Favorite Game</Text>
        </View>
        <View style={styles.statCard}>
          <Text allowFontScaling={false} style={styles.statNumber}>{player.fargo_rating || "N/A"}</Text>
          <Text allowFontScaling={false} style={styles.statLabel}>Fargo Rating</Text>
        </View>
      </View>
      {player.achievements && player.achievements.length > 0 && (
        <View style={styles.highlightsContainer}>
          <Text allowFontScaling={false} style={styles.highlightsTitle}>Recent Highlights</Text>
          {player.achievements.map((achievement, index) => (
            <View key={index} style={styles.highlightItem}>
              <Text allowFontScaling={false} style={styles.highlightIcon}>🏆</Text>
              <Text allowFontScaling={false} style={styles.highlightText}>{achievement}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
