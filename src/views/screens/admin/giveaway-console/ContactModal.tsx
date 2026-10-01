// src/views/screens/admin/giveaway-console/ContactModal.tsx
// WEB desktop compact Contact card for a participant / winner: name, email, phone (only what the
// page already shows a Super Admin) with explicit Email / Call / Copy actions and an optional
// "View …" action. Replaces the unlabeled mail / phone icons in the Participants and Winners rows.
import React, { useState } from "react";
import { Linking, Text, View } from "react-native";
import { AdminModal, DetailRow } from "./AdminModal";
import { ConsoleButton } from "./giveaway-console.parts";
import { consoleSt } from "./giveaway-console.styles";

export interface ContactInfo {
  name: string;
  subtitle?: string | null;
  email?: string | null;
  phone?: string | null;
}

interface Props {
  contact: ContactInfo;
  onClose: () => void;
  /** e.g. "View participant" / "Winner details". */
  viewLabel?: string;
  onView?: () => void;
  /** Shown under the details (e.g. where to find the phone number). */
  note?: string | null;
}

async function copyText(value: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    /* clipboard blocked */
  }
  return false;
}

export function ContactModal({ contact, onClose, viewLabel, onView, note }: Props) {
  const [copied, setCopied] = useState<"email" | "phone" | null>(null);
  const copy = async (what: "email" | "phone", value: string) => {
    if (await copyText(value)) {
      setCopied(what);
      setTimeout(() => setCopied(null), 1600);
    }
  };

  const footer = (
    <>
      <View style={{ flex: 1 }} />
      {onView && viewLabel ? <ConsoleButton label={viewLabel} onPress={onView} /> : null}
      <ConsoleButton label="Close" onPress={onClose} />
    </>
  );

  return (
    <AdminModal title={contact.name} subtitle={contact.subtitle ?? "Contact"} onClose={onClose} footer={footer} width={480} accessibilityLabel={`Contact ${contact.name}`}>
      <View style={consoleSt.section}>
        <DetailRow
          k="Email"
          v={
            contact.email ? (
              <View style={{ gap: 8 }}>
                <Text allowFontScaling={false} style={consoleSt.kvVal} selectable>{contact.email}</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <ConsoleButton label="Email" icon="mail-outline" variant="primary" onPress={() => Linking.openURL(`mailto:${contact.email}`).catch(() => {})} />
                  <ConsoleButton label={copied === "email" ? "Copied ✓" : "Copy"} icon="copy-outline" onPress={() => copy("email", contact.email!)} />
                </View>
              </View>
            ) : (
              "—"
            )
          }
        />
        <DetailRow
          k="Phone"
          v={
            contact.phone ? (
              <View style={{ gap: 8 }}>
                <Text allowFontScaling={false} style={consoleSt.kvVal} selectable>{contact.phone}</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <ConsoleButton label="Call" icon="call-outline" onPress={() => Linking.openURL(`tel:${contact.phone}`).catch(() => {})} />
                  <ConsoleButton label={copied === "phone" ? "Copied ✓" : "Copy"} icon="copy-outline" onPress={() => copy("phone", contact.phone!)} />
                </View>
              </View>
            ) : (
              "—"
            )
          }
        />
      </View>
      {note ? <Text allowFontScaling={false} style={consoleSt.emptySub}>{note}</Text> : null}
    </AdminModal>
  );
}
