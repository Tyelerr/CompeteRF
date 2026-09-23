// src/views/components/referral/ReferralCodeField.tsx
// Optional "Referral Code" input for the signup screens. Presentation only — state comes from
// useReferralCodeField (owned by the screen so it can call vm.commit() on submit).

import React from "react";
import { ReferralFieldCheck } from "../../../viewmodels/hooks/use.referral.code.field";
import { Input } from "../common/input";

interface ReferralCodeFieldProps {
  code: string;
  onChangeCode: (value: string) => void;
  check: ReferralFieldCheck;
  inviter: string | null;
}

export function ReferralCodeField({ code, onChangeCode, check, inviter }: ReferralCodeFieldProps) {
  const helper =
    check === "valid"
      ? `✓ Invited by ${inviter ?? "a friend"}`
      : check === "checking"
        ? "Checking code..."
        : "Optional — got a code from a friend? Enter it here.";

  return (
    <Input
      label="Referral Code (optional)"
      value={code}
      onChangeText={onChangeCode}
      placeholder="e.g. TYELERR"
      autoCapitalize="characters"
      autoComplete="off"
      helper={check === "invalid" ? undefined : helper}
      error={check === "invalid" ? "Code not found — check it or leave this blank" : undefined}
    />
  );
}
