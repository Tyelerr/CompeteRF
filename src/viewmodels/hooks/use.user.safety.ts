// src/viewmodels/hooks/use.user.safety.ts
// Block / unblock state for the signed-in user (Google Play UGC protections). Blocks only
// gate direct messaging (enforced server-side); this hook keeps the local set in sync for
// UI state and wraps block/unblock in confirmations.

import { useCallback, useEffect, useState } from "react";
import { Alert } from "react-native";
import { blockService } from "../../models/services/block.service";

export interface SafetyTarget {
  id: string;
  name: string;
}

export function useUserSafety(userId?: string | null) {
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    blockService
      .getMyBlockedIds()
      .then((ids) => { if (alive) setBlockedIds(ids); })
      .catch(() => { /* non-blocking: server still enforces blocks */ });
    return () => { alive = false; };
  }, [userId]);

  const isBlocked = useCallback((id?: string | null) => !!id && blockedIds.has(id), [blockedIds]);

  const confirmBlock = useCallback((target: SafetyTarget) => {
    if (!userId || target.id === userId) return;
    Alert.alert(
      `Block ${target.name}?`,
      "You won't be able to message each other. They won't be notified. Tournament registrations and results aren't affected. You can unblock them at any time.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: async () => {
            try {
              await blockService.block(userId, target.id);
              setBlockedIds((prev) => new Set(prev).add(target.id));
            } catch {
              Alert.alert("Couldn't block", "Please try again.");
            }
          },
        },
      ],
    );
  }, [userId]);

  const confirmUnblock = useCallback((target: SafetyTarget) => {
    if (!userId) return;
    Alert.alert(`Unblock ${target.name}?`, "You'll be able to message each other again.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Unblock",
        onPress: async () => {
          try {
            await blockService.unblock(userId, target.id);
            setBlockedIds((prev) => {
              const next = new Set(prev);
              next.delete(target.id);
              return next;
            });
          } catch {
            Alert.alert("Couldn't unblock", "Please try again.");
          }
        },
      },
    ]);
  }, [userId]);

  return { isBlocked, confirmBlock, confirmUnblock };
}
