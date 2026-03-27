import { Text, TouchableOpacity, View } from "react-native";
import { FeaturedBar } from "../../../models/types/home.types";
import { styles } from "../../screens/home/home.styles";
import { Loading } from "../common/loading";
import { CircularFeaturedImage } from "./CircularFeaturedImage";

interface FeaturedBarTabProps {
  bar: FeaturedBar | null;
  onOpenAddress: (address: string) => void;
  onCallPhone: (phone: string) => void;
  onOpenWebsite: (url: string) => void;
}

export function FeaturedBarTab({ bar, onOpenAddress, onCallPhone, onOpenWebsite }: FeaturedBarTabProps) {
  if (!bar) {
    return (
      <View style={styles.loadingContainer}>
        <Loading message="Loading featured bar..." />
      </View>
    );
  }

  return (
    <View style={styles.featuredContainer}>
      <View style={styles.imageOverlapSpacer} />
      <View style={styles.featuredHeader}>
        <CircularFeaturedImage imageUrl={bar.photo_url} fallbackEmoji="🍺" size={180} overlapAmount={0} />
        <Text allowFontScaling={false} style={styles.barName}>{bar.name}</Text>
        <Text allowFontScaling={false} style={styles.barLocation}>{bar.city}, {bar.state}</Text>
      </View>
      <View style={styles.descriptionContainer}>
        <Text allowFontScaling={false} style={styles.sectionLabel}>FEATURED THIS MONTH</Text>
        <Text allowFontScaling={false} style={styles.description}>{bar.description || "No description available."}</Text>
      </View>
      {bar.highlights && bar.highlights.length > 0 && (
        <View style={styles.highlightsContainer}>
          <Text allowFontScaling={false} style={styles.highlightsTitle}>Why Visit Us</Text>
          {bar.highlights.map((highlight, index) => (
            <View key={index} style={styles.highlightItem}>
              <Text allowFontScaling={false} style={styles.highlightIcon}>⭐</Text>
              <Text allowFontScaling={false} style={styles.highlightText}>{highlight}</Text>
            </View>
          ))}
        </View>
      )}
      <View style={styles.barInfoContainer}>
        {bar.address && (
          <TouchableOpacity style={styles.infoRow} onPress={() => onOpenAddress(bar.address!)}>
            <Text allowFontScaling={false} style={styles.infoIcon}>📍</Text>
            <Text allowFontScaling={false} style={[styles.infoText, styles.infoLink]}>{bar.address}</Text>
          </TouchableOpacity>
        )}
        {bar.phone && (
          <TouchableOpacity style={styles.infoRow} onPress={() => onCallPhone(bar.phone!)}>
            <Text allowFontScaling={false} style={styles.infoIcon}>📞</Text>
            <Text allowFontScaling={false} style={[styles.infoText, styles.infoLink]}>{bar.phone}</Text>
          </TouchableOpacity>
        )}
        {bar.website && (
          <TouchableOpacity style={styles.infoRow} onPress={() => onOpenWebsite(bar.website!)}>
            <Text allowFontScaling={false} style={styles.infoIcon}>🌐</Text>
            <Text allowFontScaling={false} style={[styles.infoText, styles.infoLink]}>{bar.website}</Text>
          </TouchableOpacity>
        )}
        {bar.hours_of_operation && (
          <View style={styles.infoRow}>
            <Text allowFontScaling={false} style={styles.infoIcon}>🕒</Text>
            <Text allowFontScaling={false} style={styles.infoText}>{bar.hours_of_operation}</Text>
          </View>
        )}
      </View>
    </View>
  );
}
