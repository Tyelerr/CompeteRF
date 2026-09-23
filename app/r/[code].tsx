// app/r/[code].tsx — referral link landing: https://thecompeteapp.com/r/<CODE>
import { useLocalSearchParams } from "expo-router";
import { ReferralLandingScreen } from "../../src/views/screens/referral/referral-landing.screen";

export default function ReferralRoute() {
  const params = useLocalSearchParams<{ code?: string }>();
  const code = Array.isArray(params.code) ? params.code[0] : params.code;
  // Keyed by code: a different /r/<code> in the same session gets a fresh landing instance.
  return <ReferralLandingScreen key={code ?? ""} code={code} />;
}
