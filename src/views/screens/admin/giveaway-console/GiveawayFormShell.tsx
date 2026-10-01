// src/views/screens/admin/giveaway-console/GiveawayFormShell.tsx
// WEB desktop frame for New Giveaway / Edit Giveaway. The route files hand over their existing
// form sections (same JSX, same viewmodel, same validation) and this lays them out as a desktop
// form: shared Giveaway Management header, two columns + a full-width section, and a sticky
// action bar (Cancel · primary). Presentation only.
import React from "react";
import { Text, View } from "react-native";
import { GiveawayAdminHeader, GiveawayAdminPage } from "./giveaway-admin-shell";
import { ConsoleButton } from "./giveaway-console.parts";
import { consoleSt } from "./giveaway-console.styles";

interface Props {
  title: string;
  subtitle?: string | null;
  onBack: () => void;
  /** Banners above the form (locks, unsaved changes, errors). */
  notices?: React.ReactNode;
  left: React.ReactNode;
  right: React.ReactNode;
  /** Full-width section below the columns. */
  bottom?: React.ReactNode;
  footerNote?: string | null;
  cancelLabel?: string;
  onCancel: () => void;
  cancelDisabled?: boolean;
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  primaryBusy?: boolean;
}

export function GiveawayFormShell(p: Props) {
  const footer = (
    <View style={consoleSt.formFooter}>
      <View style={consoleSt.formFooterInner}>
        <Text allowFontScaling={false} style={consoleSt.formFooterNote} numberOfLines={2}>
          {p.footerNote ?? ""}
        </Text>
        <ConsoleButton label={p.cancelLabel ?? "Cancel"} onPress={p.onCancel} disabled={p.cancelDisabled} />
        <ConsoleButton
          label={p.primaryLabel}
          variant="primary"
          onPress={p.onPrimary}
          disabled={p.primaryDisabled}
          busy={p.primaryBusy}
        />
      </View>
    </View>
  );

  return (
    <GiveawayAdminPage footer={footer}>
      <GiveawayAdminHeader title={p.title} subtitle={p.subtitle} backLabel="Giveaway Management" onBack={p.onBack} />
      {p.notices}
      <View style={consoleSt.formColumns}>
        <View style={[consoleSt.formCol, consoleSt.formCard]}>{p.left}</View>
        <View style={[consoleSt.formCol, consoleSt.formCard]}>{p.right}</View>
      </View>
      {p.bottom ? <View style={[consoleSt.formCard, { marginTop: 24 }]}>{p.bottom}</View> : null}
    </GiveawayAdminPage>
  );
}
