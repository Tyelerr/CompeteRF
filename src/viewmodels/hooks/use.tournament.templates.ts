import { useCallback, useEffect, useState } from "react";
import { Alert, Platform } from "react-native";
import {
  MAX_USER_TEMPLATES,
  TournamentTemplateUserService,
  UserTemplate,
} from "../../models/services/tournament-template.service";

const isWeb = Platform.OS === "web";

interface UseTournamentTemplatesProps {
  userId: number | null;
  onApplyTemplate: (template: UserTemplate) => void;
}

export const useTournamentTemplates = ({
  userId,
  onApplyTemplate,
}: UseTournamentTemplatesProps) => {
  const [templates, setTemplates] = useState<UserTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const templateCount = templates.length;
  const atLimit = templateCount >= MAX_USER_TEMPLATES;
  const hasTemplates = templateCount > 0;

  // ── Load templates on mount ───────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const loadTemplates = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await TournamentTemplateUserService.getUserTemplates(userId);
      setTemplates(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // ── Save current form state as a template ────────────────────────────────
  const saveTemplate = useCallback(
    async (formData: {
      name: string;
      gameType: string;
      tournamentFormat: string;
      gameSpot: string;
      race: string;
      description: string;
      maxFargo: string;
      entryFee: string;
      sidePots: { name: string; amount: string }[];
      reportsToFargo: boolean;
      openTournament: boolean;
      tableSize: string;
      equipment: string;
      thumbnail: string | null;
      chipRanges: { label: string; minRating: number; maxRating: number; chips: number }[];
      calcutta: boolean;
      phoneNumber: string;
    }) => {
      if (!userId) return;

      if (atLimit) {
        const msg = `You've reached the ${MAX_USER_TEMPLATES} template limit. Delete a template to save a new one.`;
        if (isWeb) { alert(msg); } else { Alert.alert("Template Limit Reached", msg); }
        return;
      }

      if (!formData.name.trim()) {
        const msg = "Please enter a tournament name before saving as a template.";
        if (isWeb) { alert(msg); } else { Alert.alert("Name Required", msg); }
        return;
      }

      setSaving(true);
      setError(null);
      try {
        const saved = await TournamentTemplateUserService.saveTemplate({
          user_id: userId,
          name: formData.name.trim(),
          game_type: formData.gameType || null,
          tournament_format: formData.tournamentFormat || null,
          game_spot: formData.gameSpot || null,
          race: formData.race || null,
          description: formData.description || null,
          max_fargo: formData.maxFargo ? parseInt(formData.maxFargo) : null,
          required_fargo_games: null,
          entry_fee: formData.entryFee ? parseFloat(formData.entryFee) : null,
          added_money: null,
          side_pots: formData.sidePots.length > 0 ? formData.sidePots : null,
          reports_to_fargo: formData.reportsToFargo,
          open_tournament: formData.openTournament,
          table_size: formData.tableSize || null,
          number_of_tables: null,
          equipment: formData.equipment || null,
          thumbnail: formData.thumbnail || null,
          chip_ranges: formData.chipRanges.length > 0 ? formData.chipRanges : null,
          calcutta: formData.calcutta,
        });

        setTemplates((prev) => [saved, ...prev]);

        const msg = `"${saved.name}" saved as a template!`;
        if (isWeb) { alert(msg); } else { Alert.alert("Template Saved", msg); }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        setError(msg);
        if (isWeb) { alert(msg); } else { Alert.alert("Error", msg); }
      } finally {
        setSaving(false);
      }
    },
    [userId, atLimit]
  );

  // ── Delete a template ─────────────────────────────────────────────────────
  const deleteTemplate = useCallback(
    async (id: number) => {
      if (!userId) return;
      const confirm = () => {
        TournamentTemplateUserService.deleteTemplate(id, userId)
          .then(() => setTemplates((prev) => prev.filter((t) => t.id !== id)))
          .catch((err) => setError(err.message));
      };

      if (isWeb) {
        if (window.confirm("Delete this template?")) confirm();
      } else {
        Alert.alert("Delete Template", "Are you sure you want to delete this template?", [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: confirm },
        ]);
      }
    },
    [userId]
  );

  // ── Rename a template ────────────────────────────────────────────────────
  const renameTemplate = useCallback(
    async (id: number, newName: string) => {
      if (!userId) return;
      try {
        const updated = await TournamentTemplateUserService.updateTemplate(id, { name: newName });
        setTemplates((prev) => prev.map((t) => (t.id === id ? updated : t)));
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    },
    [userId]
  );

  // ── Apply a template to the form ─────────────────────────────────────────
  const applyTemplate = useCallback(
    (template: UserTemplate) => {
      onApplyTemplate(template);
    },
    [onApplyTemplate]
  );

  return {
    templates,
    templateCount,
    atLimit,
    hasTemplates,
    loading,
    saving,
    error,
    saveTemplate,
    deleteTemplate,
    renameTemplate,
    applyTemplate,
    reload: loadTemplates,
  };
};
