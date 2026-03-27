// src/views/components/onboarding/OnboardingModal.tsx

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  FlatList,
  ImageBackground,
  ImageSourcePropType,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { COLORS } from '../../../theme/colors';
import { RADIUS, SPACING } from '../../../theme/spacing';
import { FONT_SIZES } from '../../../theme/typography';

// ── Layout constants ──────────────────────────────────────────────────────────

const OVERLAY_COLOR = 'rgba(0,0,0,0.88)';
const BOTTOM_H = Platform.OS === 'ios' ? 164 : 124;
const TEXT_BOTTOM = BOTTOM_H + SPACING.lg;

// ── Types ─────────────────────────────────────────────────────────────────────

interface SpotlightDef {
  topPct: number;
  leftPct: number;
  widthPct: number;
  heightPct: number;
  borderRadius: number;
}

interface SlideDef {
  id: string;
  image: ImageSourcePropType;
  title: string;
  subtitle: string;
  spotlight: SpotlightDef;
  textTopPct?: number;
  pulseTopPct?: number;
  pulseLeftPct?: number;
}

// ── Slide definitions ─────────────────────────────────────────────────────────

const SLIDES: SlideDef[] = [
  {
    id: 'find',
    image: require('../../../../assets/onboarding/slide-billiards.png'),
    title: 'Find Tournaments',
    subtitle: 'Search by state, city, or zip — then filter by game type, format, table size, entry fee, and more',
    spotlight: {
      topPct: 0.075,
      leftPct: 0.03,
      widthPct: 0.94,
      heightPct: 0.232,
      borderRadius: 14,
    },
    textTopPct: 0.50,
  },
  {
    id: 'favorite',
    image: require('../../../../assets/onboarding/slide-billiards.png'),
    title: 'Favorite Tournaments',
    subtitle: 'Tap the heart icon to save tournaments to your profile and get notified when details change',
    spotlight: {
      topPct: 0.368,
      leftPct: 0.02,
      widthPct: 0.49,
      heightPct: 0.29,
      borderRadius: 14,
    },
    // Nudged up from 0.422 → 0.400
    pulseTopPct: 0.413,
    pulseLeftPct: 0.418,
  },
  {
    id: 'filters',
    image: require('../../../../assets/onboarding/slide-filters.png'),
    title: 'Tournament Filters',
    subtitle: 'Use filters to narrow down the tournaments you want to see',
    spotlight: {
      topPct: 0.040,
      leftPct: 0.02,
      widthPct: 0.96,
      heightPct: 0.585,
      borderRadius: 16,
    },
  },
  {
    id: 'details',
    image: require('../../../../assets/onboarding/slide-detail.png'),
    title: 'View Details',
    subtitle: 'Tap any tournament card to see more info like time, fee, format, and rules',
    textTopPct: 0.775,
    spotlight: {
      topPct: 0.115,
      leftPct: 0.02,
      widthPct: 0.96,
      heightPct: 0.645,
      borderRadius: 16,
    },
  },
  {
    id: 'giveaways',
    image: require('../../../../assets/onboarding/slide-giveaways.png'),
    title: 'Enter Giveaways',
    subtitle: 'Win gear and prizes by entering giveaways from top brands',
    spotlight: {
      topPct: 0.305,
      leftPct: 0.03,
      widthPct: 0.94,
      heightPct: 0.295,
      borderRadius: 14,
    },
  },
  {
    id: 'alerts',
    image: require('../../../../assets/onboarding/slide-alert.png'),
    title: 'Search Alerts',
    subtitle: "Set up search alerts and we'll notify you when matching tournaments are posted",
    spotlight: {
      topPct: 0.265,
      leftPct: 0.03,
      widthPct: 0.94,
      heightPct: 0.445,
      borderRadius: 16,
    },
  },
];

const TOTAL = SLIDES.length;

// ── Pulse indicator ───────────────────────────────────────────────────────────

interface PulseProps {
  topPct: number;
  leftPct: number;
  screenW: number;
  screenH: number;
}

const PulseIndicator = React.memo(
  ({ topPct, leftPct, screenW, screenH }: PulseProps) => {
    const scaleAnim = useRef(new Animated.Value(1)).current;
    const opacityAnim = useRef(new Animated.Value(0.85)).current;

    useEffect(() => {
      const loop = Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(scaleAnim, { toValue: 1.65, duration: 750, useNativeDriver: true }),
            Animated.timing(scaleAnim, { toValue: 1, duration: 750, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(opacityAnim, { toValue: 0.15, duration: 750, useNativeDriver: true }),
            Animated.timing(opacityAnim, { toValue: 0.85, duration: 750, useNativeDriver: true }),
          ]),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }, []);

    const SIZE = 40;
    return (
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: screenH * topPct - SIZE / 2,
          left: screenW * leftPct - SIZE / 2,
          width: SIZE,
          height: SIZE,
          borderRadius: SIZE / 2,
          borderWidth: 3,
          borderColor: COLORS.primary,
          opacity: opacityAnim,
          transform: [{ scale: scaleAnim }],
        }}
      />
    );
  },
);

// ── Spotlight overlay ─────────────────────────────────────────────────────────

interface SpotlightProps {
  spot: SpotlightDef;
  w: number;
  h: number;
}

const SpotlightOverlay = React.memo(({ spot, w, h }: SpotlightProps) => {
  const top = h * spot.topPct;
  const left = w * spot.leftPct;
  const sw = w * spot.widthPct;
  const sh = h * spot.heightPct;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: top, backgroundColor: OVERLAY_COLOR }} />
      <View style={{ position: 'absolute', top, left: 0, width: left, height: sh, backgroundColor: OVERLAY_COLOR }} />
      <View style={{ position: 'absolute', top, left: left + sw, right: 0, height: sh, backgroundColor: OVERLAY_COLOR }} />
      <View style={{ position: 'absolute', top: top + sh, left: 0, right: 0, bottom: 0, backgroundColor: OVERLAY_COLOR }} />
      <View
        style={{
          position: 'absolute',
          top: top - 2,
          left: left - 2,
          width: sw + 4,
          height: sh + 4,
          borderRadius: spot.borderRadius,
          borderWidth: 2,
          borderColor: COLORS.primary,
        }}
      />
    </View>
  );
});

// ── Individual slide ──────────────────────────────────────────────────────────

interface SlideItemProps {
  slide: SlideDef;
  screenW: number;
  screenH: number;
}

const SlideItem = React.memo(({ slide, screenW, screenH }: SlideItemProps) => {
  const textStyle = slide.textTopPct != null
    ? [styles.textBlock, { top: screenH * slide.textTopPct }]
    : [styles.textBlock, { bottom: TEXT_BOTTOM }];

  return (
    <View style={{ width: screenW, height: screenH }}>
      <ImageBackground
        source={slide.image}
        style={{ width: screenW, height: screenH }}
        resizeMode="cover"
      >
        <SpotlightOverlay spot={slide.spotlight} w={screenW} h={screenH} />

        {slide.pulseTopPct != null && slide.pulseLeftPct != null && (
          <PulseIndicator
            topPct={slide.pulseTopPct}
            leftPct={slide.pulseLeftPct}
            screenW={screenW}
            screenH={screenH}
          />
        )}

        <View style={textStyle}>
          <Text style={styles.slideTitle} allowFontScaling={false}>
            {slide.title}
          </Text>
          <Text style={styles.slideSubtitle} allowFontScaling={false}>
            {slide.subtitle}
          </Text>
        </View>
      </ImageBackground>
    </View>
  );
});

// ── Main component ────────────────────────────────────────────────────────────

export interface OnboardingModalProps {
  visible: boolean;
  onComplete: () => void;
  onSkip: () => void;
}

export const OnboardingModal = ({
  visible,
  onComplete,
  onSkip,
}: OnboardingModalProps) => {
  const { width, height } = useWindowDimensions();
  const [currentSlide, setCurrentSlide] = useState(0);
  const flatListRef = useRef<FlatList<SlideDef>>(null);
  const isLastSlide = currentSlide === TOTAL - 1;

  useEffect(() => {
    if (visible) {
      setCurrentSlide(0);
      const t = setTimeout(() => {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
      }, 40);
      return () => clearTimeout(t);
    }
  }, [visible]);

  const viewabilityConfig = useRef({
    viewAreaCoveragePercentThreshold: 50,
  }).current;

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: any[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setCurrentSlide(viewableItems[0].index as number);
      }
    },
  ).current;

  const handleSkip = useCallback(() => onSkip(), [onSkip]);
  const handleComplete = useCallback(() => onComplete(), [onComplete]);

  const renderItem = useCallback(
    ({ item }: { item: SlideDef }) => (
      <SlideItem slide={item} screenW={width} screenH={height} />
    ),
    [width, height],
  );

  const keyExtractor = useCallback((item: SlideDef) => item.id, []);

  const getItemLayout = useCallback(
    (_: any, index: number) => ({
      length: width,
      offset: width * index,
      index,
    }),
    [width],
  );

  return (
    <Modal
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      transparent={false}
      onRequestClose={handleSkip}
    >
      <View style={{ flex: 1, backgroundColor: COLORS.background }}>
        <FlatList
          ref={flatListRef}
          data={SLIDES}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          horizontal
          pagingEnabled
          bounces={false}
          showsHorizontalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          getItemLayout={getItemLayout}
          initialNumToRender={1}
          maxToRenderPerBatch={2}
          windowSize={3}
          scrollEventThrottle={16}
        />

        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <View style={styles.bottomControls}>
            <View style={styles.dotsRow}>
              {Array.from({ length: TOTAL }).map((_, i) => (
                <View
                  key={i}
                  style={[styles.dot, i === currentSlide && styles.dotActive]}
                />
              ))}
            </View>

            {isLastSlide ? (
              <TouchableOpacity
                style={styles.getStartedBtn}
                onPress={handleComplete}
                activeOpacity={0.85}
              >
                <Text style={styles.getStartedText} allowFontScaling={false}>
                  Get Started
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.ctaPlaceholder} />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  textBlock: {
    position: 'absolute',
    left: SPACING.xl,
    right: SPACING.xl,
    alignItems: 'center',
    gap: SPACING.sm,
  },
  slideTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.95)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  slideSubtitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: FONT_SIZES.md * 1.55,
    textShadowColor: 'rgba(0,0,0,0.95)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  bottomControls: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: BOTTOM_H,
    backgroundColor: 'rgba(0,0,0,0.80)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.xl,
    paddingBottom: Platform.OS === 'ios' ? SPACING.xl + SPACING.md : SPACING.lg,
    paddingTop: SPACING.md,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.border,
  },
  dotActive: {
    width: 24,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  getStartedBtn: {
    width: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  getStartedText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
  },
  ctaPlaceholder: {
    width: '100%',
    height: SPACING.md * 2 + FONT_SIZES.lg,
  },
});


