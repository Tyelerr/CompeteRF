import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { moderateScale, scale } from "../../../utils/scaling";

interface PaginationProps {
  totalCount: number;
  displayStart: number;
  displayEnd: number;
  currentPage: number;
  totalPages: number;
  onPrevPage: () => void;
  onNextPage: () => void;
  canGoPrev: boolean;
  canGoNext: boolean;
}

export function Pagination({ totalCount, displayStart, displayEnd, currentPage, totalPages, onPrevPage, onNextPage, canGoPrev, canGoNext }: PaginationProps) {
  if (totalCount === 0) return null;
  return (
    <View style={styles.container}>
      <Text allowFontScaling={false} style={styles.countText}>
        Total count: {totalCount} Displaying {displayStart}-{displayEnd}
      </Text>
      <View style={styles.pagination}>
        <TouchableOpacity onPress={onPrevPage} disabled={!canGoPrev} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text allowFontScaling={false} style={[styles.pageArrow, !canGoPrev && styles.pageArrowDisabled]}>{"<"}</Text>
        </TouchableOpacity>
        <Text allowFontScaling={false} style={styles.pageText}>Page {currentPage} / {totalPages || 1}</Text>
        <TouchableOpacity onPress={onNextPage} disabled={!canGoNext} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text allowFontScaling={false} style={[styles.pageArrow, !canGoNext && styles.pageArrowDisabled]}>{">"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: scale(SPACING.md), paddingVertical: scale(SPACING.md) },
  countText: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.primary },
  pagination: { flexDirection: "row", alignItems: "center", gap: scale(SPACING.sm) },
  pageArrow: { fontSize: moderateScale(FONT_SIZES.lg), color: COLORS.primary, paddingHorizontal: scale(SPACING.sm) },
  pageArrowDisabled: { color: COLORS.textMuted },
  pageText: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textSecondary },
});
