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

const isWeb = Platform.OS === "web";

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

  const handleShare = async () => {
    try {
      await Share.share({
        message: title
          ? `Check out this tournament: ${title}`
          : "Check out this tournament image!",
        url: imageUrl,
        title: title || "Tournament Image",
      });
    } catch (error) {
      console.log("Error sharing:", error);
    }
  };

  // ── Web: simple overlay with native <img> ─────────────────────────────
  if (isWeb) {
    if (!visible) return null;
    return (
      <>
        {/* Backdrop */}
        <div
          onClick={onClose}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.85)",
            zIndex: 9000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* Image container — stop click propagation so clicking image doesn't close */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              maxWidth: "80vw",
              maxHeight: "85vh",
            }}
          >
            <img
              src={imageUrl}
              alt={title || "Tournament image"}
              style={{
                maxWidth: "100%",
                maxHeight: "75vh",
                objectFit: "contain",
                borderRadius: 12,
                display: "block",
              }}
            />
            {/* Close only — no share on web */}
            <button
              onClick={onClose}
              style={{
                marginTop: 16,
                backgroundColor: "rgba(60,60,60,0.9)",
                border: "1px solid rgba(255,255,255,0.3)",
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                padding: "10px 28px",
                borderRadius: 10,
                cursor: "pointer",
              }}
            >
              ✕ Close
            </button>
          </div>
        </div>
      </>
    );
  }

  // ── Mobile: original modal (unchanged) ───────────────────────────────
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableOpacity
        style={styles.modalContainer}
        activeOpacity={1}
        onPress={onClose}
      >
        <View style={styles.contentContainer}>
          <View style={styles.imageContainer}>
            <TouchableOpacity
              activeOpacity={1}
              onPress={(e) => e.stopPropagation()}
              style={styles.imageWrapper}
            >
              <Image
                source={{ uri: imageUrl }}
                style={styles.image}
                resizeMode="contain"
                onLoad={() => {
                  setImageLoading(false);
                  setImageError(false);
                }}
                onError={() => {
                  setImageLoading(false);
                  setImageError(true);
                }}
                onLoadStart={() => setImageLoading(true)}
              />
              {imageLoading && !imageError && (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={COLORS.primary} />
                </View>
              )}
              {imageError && (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>Failed to load image</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

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
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.lg,
  },
  contentContainer: { alignItems: "center", maxWidth: "90%", maxHeight: "80%" },
  imageContainer: {
    width: "100%",
    aspectRatio: 1,
    minHeight: 300,
    maxHeight: 500,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.2)",
    borderRadius: RADIUS.lg,
    overflow: "hidden",
  },
  imageWrapper: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  image: { width: "100%", height: "100%" },
  loadingContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  errorContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
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
    marginTop: SPACING.sm,
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
  },
  closeButton: {
    backgroundColor: "rgba(60,60,60,0.9)",
    borderColor: "rgba(255,255,255,0.3)",
    borderWidth: 1,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg + SPACING.sm,
    borderRadius: RADIUS.lg,
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginLeft: SPACING.sm,
    justifyContent: "center",
  },
  buttonIcon: { fontSize: FONT_SIZES.md, marginRight: SPACING.xs },
  buttonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
  },
});
