import { useState } from "react";
import { Image, Text, View } from "react-native";
import { styles } from "../../screens/home/home.styles";
import { moderateScale } from "../../../utils/scaling";

interface CircularFeaturedImageProps {
  imageUrl?: string | null;
  fallbackEmoji: string;
  size?: number;
  overlapAmount?: number;
}

export function CircularFeaturedImage({ imageUrl, fallbackEmoji, size = 140, overlapAmount = 20 }: CircularFeaturedImageProps) {
  const [imageError, setImageError] = useState(false);
  const hasValidImage = !!imageUrl && !imageError;
  const ringThickness = 4;
  const glowPadding = 8;

  return (
    <View style={[styles.circularImageWrapper, { marginTop: -overlapAmount, width: size + glowPadding * 2, height: size + glowPadding * 2 }]}>
      <View style={[styles.circularImageGlow, { width: size + glowPadding * 2, height: size + glowPadding * 2, borderRadius: (size + glowPadding * 2) / 2 }]}>
        <View style={[styles.circularImageBorder, { width: size + ringThickness * 2, height: size + ringThickness * 2, borderRadius: (size + ringThickness * 2) / 2 }]}>
          <View style={[styles.circularImageInner, { width: size, height: size, borderRadius: size / 2 }]}>
            {hasValidImage ? (
              <Image source={{ uri: imageUrl }} style={[styles.circularImage, { width: size, height: size, borderRadius: size / 2 }]} onError={() => setImageError(true)} resizeMode="cover" />
            ) : (
              <Text allowFontScaling={false} style={[styles.circularImageFallback, { fontSize: moderateScale(size * 0.4) }]}>{fallbackEmoji}</Text>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}
