import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";

interface FullScreenImageViewerProps {
  visible: boolean;
  imageUrl: string | null;
  title?: string;
  onClose: () => void;
}

export const FullScreenImageViewer = ({
  visible,
  imageUrl,
  title,
  onClose,
}: FullScreenImageViewerProps) => {
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);

  if (!imageUrl) return null;

  const handleImageLoad = () => {
    setImageLoading(false);
    setImageError(false);
  };

  const handleImageError = () => {
    setImageLoading(false);
    setImageError(true);
  };

  const handleShare = async () => {
    try {
      const shareOptions = {
        message: title
          ? `Check out this tournament: ${title}`
          : "Check out this tournament image!",
        url: imageUrl,
        title: title || "Tournament Image",
      };

      if (Platform.OS === "ios") {
        await Share.share({
          message: shareOptions.message,
          url: shareOptions.url,
          title: shareOptions.title,
        });
      } else {
        await Share.share({
          message: `${shareOptions.message} ${shareOptions.url}`,
          title: shareOptions.title,
        });
      }
    } catch (error) {
      console.log("Error sharing:", error);
    }
  };

  const handleBackgroundPress = () => {
    onClose();
  };

  const handleImagePress = (e: any) => {
    // Stop propagation so tapping the image doesn't close the modal
    e.stopPropagation();
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent={true}
    >
      <TouchableOpacity
        style={styles.modalContainer}
        activeOpacity={1}
        onPress={handleBackgroundPress}
      >
        {/* Main Content Area */}
        <View style={styles.contentContainer}>
          {/* Image Container */}
          <View style={styles.imageContainer}>
            <TouchableOpacity
              activeOpacity={1}
              onPress={handleImagePress}
              style={styles.imageWrapper}
            >
              <Image
                source={{ uri: imageUrl }}
                style={styles.image}
                resizeMode="contain"
                onLoad={handleImageLoad}
                onError={handleImageError}
                onLoadStart={() => setImageLoading(true)}
              />

              {/* Loading indicator - only show when loading */}
              {imageLoading && !imageError && (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={COLORS.primary} />
                </View>
              )}

              {/* Error state */}
              {imageError && (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>Failed to load image</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* Buttons attached to bottom of image */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
              <Text style={styles.buttonIcon}>📤</Text>
              <Text style={styles.buttonText}>Share</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.buttonIcon}>✕</Text>
              <Text style={styles.buttonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)", // Reduced from 0.85 to 0.75
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.lg,
  },
  contentContainer: {
    alignItems: "center",
    maxWidth: "90%",
    maxHeight: "80%",
  },
  imageContainer: {
    width: "100%",
    aspectRatio: 1, // Keep it square-ish, but will adapt to image
    minHeight: 300,
    maxHeight: 500,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.2)",
    borderRadius: RADIUS.lg,
    overflow: "hidden",
  },
  imageWrapper: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  loadingContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  errorContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  errorText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.md,
    textAlign: "center",
  },
  buttonContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    marginTop: SPACING.sm, // Small gap between image and buttons
    paddingHorizontal: SPACING.sm,
  },
  shareButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg + SPACING.sm,
    borderRadius: RADIUS.lg,
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: SPACING.sm,
    justifyContent: "center",
    // Add subtle shadow for depth
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  closeButton: {
    backgroundColor: "rgba(60, 60, 60, 0.9)",
    borderColor: "rgba(255, 255, 255, 0.3)",
    borderWidth: 1,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg + SPACING.sm,
    borderRadius: RADIUS.lg,
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginLeft: SPACING.sm,
    justifyContent: "center",
    // Add subtle shadow for depth
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  buttonIcon: {
    fontSize: FONT_SIZES.md,
    marginRight: SPACING.xs,
  },
  buttonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
  },
});
