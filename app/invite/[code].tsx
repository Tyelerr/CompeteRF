// app/invite/[code].tsx — preferred invite link: https://thecompeteapp.com/invite/<CODE>
// Same landing, attribution and analytics as the original /r/<CODE> (app/r/[code].tsx), which keeps
// working permanently.
//   ?v=<visit id>     set when a link hands off into the app, so App Open joins the visit
//   ?c= / ?utm_campaign=  optional campaign slug (analytics only)
import { useLocalSearchParams } from "expo-router";
import { ReferralLandingScreen } from "../../src/views/screens/referral/referral-landing.screen";

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default function InviteRoute() {
  const params = useLocalSearchParams<{ code?: string; v?: string; c?: string; utm_campaign?: string }>();
  const code = first(params.code);
  // Keyed by code: a different /invite/<code> in the same session gets a fresh landing instance.
  return (
    <ReferralLandingScreen
      key={code ?? ""}
      code={code}
      visitParam={first(params.v)}
      campaign={first(params.c) ?? first(params.utm_campaign)}
    />
  );
}
