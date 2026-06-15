// src/viewmodels/hooks/use.settings.templates.ts
// Loads + mutates the TD's saved settings templates (max 5). The settings blob is
// opaque here — the caller decides what subset of the settings form to store and
// how to apply it.

import { useCallback, useEffect, useState } from "react";
import {
  MAX_SETTINGS_TEMPLATES,
  SettingsTemplate,
  settingsTemplateService,
} from "../../models/services/settings-template.service";

export const useSettingsTemplates = (userId?: number | null) => {
  const [templates, setTemplates] = useState<SettingsTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const count = templates.length;
  const atLimit = count >= MAX_SETTINGS_TEMPLATES;

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      setTemplates(await settingsTemplateService.getTemplates(userId));
    } catch {
      /* table may not exist yet (migration unapplied) — treat as no templates */
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  // Returns the saved template, or throws (e.g. at the limit) for the caller to surface.
  const save = useCallback(
    async (name: string, settings: Record<string, unknown>) => {
      if (!userId) throw new Error("Not signed in.");
      setSaving(true);
      try {
        const saved = await settingsTemplateService.saveTemplate({
          user_id: userId,
          name: name.trim(),
          settings,
        });
        setTemplates((prev) => [saved, ...prev].slice(0, MAX_SETTINGS_TEMPLATES));
        return saved;
      } finally {
        setSaving(false);
      }
    },
    [userId],
  );

  const rename = useCallback(async (id: number, name: string) => {
    const updated = await settingsTemplateService.updateTemplate(id, {
      name: name.trim(),
    });
    setTemplates((prev) => prev.map((t) => (t.id === id ? updated : t)));
  }, []);

  const remove = useCallback(
    async (id: number) => {
      if (!userId) return;
      await settingsTemplateService.deleteTemplate(id, userId);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    },
    [userId],
  );

  return { templates, count, atLimit, loading, saving, load, save, rename, remove };
};

export { MAX_SETTINGS_TEMPLATES };
