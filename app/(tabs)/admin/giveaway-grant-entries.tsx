import { Platform } from "react-native";
import { GiveawayGrantEntriesScreen } from "../../../src/views/screens/admin/giveaway-grant-entries.screen";
import { EntryWalletConsoleScreen } from "../../../src/views/screens/admin/giveaway-console/entry-wallet-console.screen";

// Web / desktop gets the Giveaway Management console page; native keeps its screen unchanged.
export default function GiveawayGrantEntriesRoute() {
  return Platform.OS === "web" ? <EntryWalletConsoleScreen /> : <GiveawayGrantEntriesScreen />;
}
