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

      {/* Header Card */}
      <View style={styles.featuredHeader}>
        <CircularFeaturedImage
          imageUrl={player.profile_image_url || player.avatar_url}
          fallbackEmoji="👤"
          size={180}
          overlapAmount={0}
        />
        <Text style={styles.playerName}>{player.name || player.user_name}</Text>
        <Text style={styles.playerTitle}>
          {player.label_about_the_person || "Pool Enthusiast"}
        </Text>
        <Text style={styles.playerLocation}>
          {player.home_city}, {player.home_state}
        </Text>
      </View>

      {/* Description */}
      <View style={styles.descriptionContainer}>
        <Text style={styles.sectionLabel}>PLAYER OF THE MONTH</Text>
        <Text style={styles.description}>
          {player.description || "No description available."}
        </Text>
      </View>

      {/* Quick Stats */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>8</Text>
          <Text style={styles.statLabel}>Years Playing</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>
            {player.preferred_game || "N/A"}
          </Text>
          <Text style={styles.statLabel}>Favorite Game</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{player.fargo_rating || "N/A"}</Text>
          <Text style={styles.statLabel}>Fargo Rating</Text>
        </View>
      </View>

      {/* Achievements */}
      {player.achievements && player.achievements.length > 0 && (
        <View style={styles.highlightsContainer}>
          <Text style={styles.highlightsTitle}>Recent Highlights</Text>
          {player.achievements.map((achievement, index) => (
            <View key={index} style={styles.highlightItem}>
              <Text style={styles.highlightIcon}>🏆</Text>
              <Text style={styles.highlightText}>{achievement}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
