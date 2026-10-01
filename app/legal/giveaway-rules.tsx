// app/legal/giveaway-rules.tsx — public Official Giveaway Rules (https://thecompeteapp.com/legal/giveaway-rules).
//   ?section=<id>  scroll to a section (e.g. referrals, entries)
import { useLocalSearchParams } from "expo-router";
import { GiveawayRulesScreen } from "../../src/views/screens/legal/giveaway-rules.screen";

export default function GiveawayRulesRoute() {
  const { section } = useLocalSearchParams<{ section?: string }>();
  return <GiveawayRulesScreen section={Array.isArray(section) ? section[0] : section} />;
}
