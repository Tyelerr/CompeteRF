import { useState } from "react";

export type ShopTab = "shop" | "giveaways";

export function useShop() {
  const [activeTab, setActiveTab] = useState<ShopTab>("giveaways");

  return {
    activeTab,
    setActiveTab,
  };
}
