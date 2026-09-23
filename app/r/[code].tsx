// app/r/[code].tsx — referral link landing: https://thecompeteapp.com/r/<CODE>
//   ?v=<visit id>     set when a link hands off into the app (Phase B), so App Open joins the visit
//   ?c= / ?utm_campaign=  optional campaign slug (analytics only; no campaign UI yet)
import { useLocalSearchParams } from "expo-router";
import { ReferralLandingScreen } from "../../src/views/screens/referral/referral-landing.screen";

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default function ReferralRoute() {
  const params = useLocalSearchParams<{ code?: string; v?: string; c?: string; utm_campaign?: string }>();
  const code = first(params.code);
  // Keyed by code: a different /r/<code> in the same session gets a fresh landing instance.
  return (
    <ReferralLandingScreen
      key={code ?? ""}
      code={code}
      visitParam={first(params.v)}
      campaign={first(params.c) ?? first(params.utm_campaign)}
    />
  );
}
