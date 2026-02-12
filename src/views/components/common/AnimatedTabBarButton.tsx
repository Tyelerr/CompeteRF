import { useRef } from "react";
import { Animated, Pressable } from "react-native";

const AnimatedTabBarButton = (props: any) => {
  const {
    children,
    onPress,
    onLongPress,
    style,
    accessibilityLabel,
    accessibilityRole,
    accessibilityState,
    testID,
  } = props;

  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 1.25,
      speed: 50,
      bounciness: 12,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      speed: 50,
      bounciness: 12,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      accessibilityState={accessibilityState}
      testID={testID}
      style={style}
    >
      <Animated.View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          transform: [{ scale }],
        }}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
};

export default AnimatedTabBarButton;
