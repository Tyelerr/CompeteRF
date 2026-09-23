// src/viewmodels/useGiveawayGrantEntries.ts
// Super Admin → Giveaways → Manage → Grant Giveaway Entries.
// Find a user, see their balance, then Grant or Remove entries. Grant and Remove are separate,
// explicit server actions (never one signed-delta field); Remove needs a reason and can't take a
// balance below zero. Each submit carries an idempotency key so a retried request applies once.

import { useCallback, useEffect, useRef, useState } from "react";
import { giveawayWalletService } from "../models/services/giveaway-wallet.service";
import { profileService } from "../models/services/profile.service";
import { Profile } from "../models/types/profile.types";

export type GrantMode = "grant" | "remove";

export function useGiveawayGrantEntries() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Profile | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [mode, setMode] = useState<GrantMode>("grant");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const keyRef = useRef(giveawayWalletService.newRequestId());

  // Debounced user search (username or name).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || selected) return;
    let alive = true;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const found = await profileService.searchProfiles(q, 10);
        if (alive) setResults(found);
      } catch {
        if (alive) setResults([]);
      } finally {
        if (alive) setSearching(false);
      }
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query, selected]);

  const selectUser = useCallback(async (p: Profile) => {
    setSelected(p);
    setResults([]);
    setMessage(null);
    setError(null);
    setBalance(null);
    try {
      setBalance(await giveawayWalletService.getBalanceOf(p.id_auto));
    } catch {
      setError("Couldn't load this user's balance.");
    }
  }, []);

  const clearUser = useCallback(() => {
    setSelected(null);
    setBalance(null);
    setQuery("");
    setAmount("");
    setNote("");
    setMessage(null);
    setError(null);
  }, []);

  const amountNum = parseInt(amount, 10);
  const canSubmit =
    !!selected && !submitting && amountNum > 0 && amountNum <= 10000 && (mode === "grant" || note.trim().length > 0);

  const submit = useCallback(async () => {
    if (!selected || !canSubmit) return;
    setSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      const res =
        mode === "grant"
          ? await giveawayWalletService.grantEntries(selected.id_auto, amountNum, note.trim() || null, keyRef.current)
          : await giveawayWalletService.revokeEntries(selected.id_auto, amountNum, note.trim(), keyRef.current);
      if (!res.ok) {
        setError(
          res.status === "insufficient_balance" ? `They only have ${res.balance ?? 0} — can't remove ${amountNum}.`
          : res.status === "note_required" ? "A reason is required to remove entries."
          : res.status === "invalid_amount" ? "Enter an amount from 1 to 10,000."
          : res.status === "no_such_user" ? "User not found."
          : "That didn't work. Please try again.",
        );
        return;
      }
      keyRef.current = giveawayWalletService.newRequestId();
      if (typeof res.balance === "number") setBalance(res.balance);
      setMessage(
        res.status === "duplicate"
          ? "Already applied — nothing changed."
          : `${mode === "grant" ? "Granted" : "Removed"} ${amountNum} ${amountNum === 1 ? "entry" : "entries"}. New balance: ${res.balance}.`,
      );
      setAmount("");
      setNote("");
    } catch (e: any) {
      // Same key kept: retrying can't apply twice.
      setError(e?.message?.includes("not authorized") ? "Only a Super Admin can do this." : "Network problem — please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [selected, canSubmit, mode, amountNum, note]);

  return {
    query, setQuery, results, searching,
    selected, selectUser, clearUser, balance,
    mode, setMode, amount, setAmount, note, setNote,
    canSubmit, submitting, submit, message, error,
  };
}
