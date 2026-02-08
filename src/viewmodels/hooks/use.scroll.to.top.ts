import { useFocusEffect } from "expo-router";
import { useCallback, useRef } from "react";

/**
 * Returns a ref to attach to your ScrollView or FlatList.
 * Scrolls to top when the screen LOSES focus (tab switch away),
 * so when you come back it's already at the top — no visible jump.
 *
 * Usage:
 *   const scrollRef = useScrollToTopOnFocus();
 *   <ScrollView ref={scrollRef} ...>
 *   <FlatList ref={scrollRef} ...>
 */
export function useScrollToTopOnFocus<T = any>() {
  const scrollRef = useRef<any>(null);

  useFocusEffect(
    useCallback(() => {
      // The cleanup function runs when the screen loses focus
      return () => {
        if (!scrollRef.current) return;

        // FlatList / SectionList
        if (typeof scrollRef.current.scrollToOffset === "function") {
          scrollRef.current.scrollToOffset({ offset: 0, animated: false });
        }
        // ScrollView
        else if (typeof scrollRef.current.scrollTo === "function") {
          scrollRef.current.scrollTo({ y: 0, animated: false });
        }
      };
    }, []),
  );

  return scrollRef;
}
