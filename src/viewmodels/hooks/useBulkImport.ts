// ─── Bulk Import ViewModel ───────────────────────────────────────────────────
// src/viewmodels/hooks/useBulkImport.ts

import * as DocumentPicker from "expo-document-picker";
import { useState } from "react";
import { Alert } from "react-native";
import { bulkImportService } from "../../models/services/bulk-import.service";
import {
  BulkImportState,
  INITIAL_BULK_IMPORT_STATE,
} from "../../models/types/bulk-import.types";

export const useBulkImport = () => {
  const [state, setState] = useState<BulkImportState>(INITIAL_BULK_IMPORT_STATE);

  // ── Computed ──────────────────────────────────────────────────────────────

  const isLoading = state.phase === "parsing" || state.phase === "importing";
  const canImport = state.phase === "validated" && state.validRows.length > 0;
  const progress =
    state.phase === "importing" && state.validRows.length > 0
      ? state.currentRow / state.validRows.length
      : 0;

  // ── Read File Content ─────────────────────────────────────────────────────
  // Uses fetch() instead of expo-file-system to avoid EncodingType.UTF8 crash

  const readFileAsText = async (uri: string): Promise<string> => {
    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error(`Failed to read file (HTTP ${response.status})`);
    }
    return await response.text();
  };

  // ── Pick File ─────────────────────────────────────────────────────────────

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["text/csv", "text/comma-separated-values", "application/vnd.ms-excel", "*/*"],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const file = result.assets[0];

      // Validate file extension
      const fileName = file.name || "unknown";
      if (!fileName.toLowerCase().endsWith(".csv")) {
        Alert.alert(
          "Invalid File",
          "Please select a .csv file. You can export your spreadsheet as CSV from Excel or Google Sheets.",
        );
        return;
      }

      setState((prev) => ({
        ...prev,
        phase: "parsing",
        fileName,
      }));

      await parseAndValidate(file.uri);
    } catch (error: any) {
      console.error("File picker error:", error);
      Alert.alert("Error", "Failed to open file picker. Please try again.");
      setState(INITIAL_BULK_IMPORT_STATE);
    }
  };

  // ── Parse & Validate ──────────────────────────────────────────────────────

  const parseAndValidate = async (fileUri: string) => {
    try {
      // Read file content using fetch() — avoids expo-file-system entirely
      const content = await readFileAsText(fileUri);

      if (!content.trim()) {
        Alert.alert("Empty File", "The selected CSV file is empty.");
        setState(INITIAL_BULK_IMPORT_STATE);
        return;
      }

      // Parse CSV into row objects
      const rows = bulkImportService.parseCSV(content);

      if (rows.length === 0) {
        Alert.alert(
          "No Data Found",
          "The CSV file has no data rows. Make sure it has a header row and at least one data row.",
        );
        setState(INITIAL_BULK_IMPORT_STATE);
        return;
      }

      // Validate all rows against DB
      const { valid, errors } = await bulkImportService.validateRows(rows);

      setState((prev) => ({
        ...prev,
        phase: "validated",
        totalRows: rows.length,
        validRows: valid,
        errorRows: errors,
      }));
    } catch (error: any) {
      console.error("Parse/validate error:", error);
      Alert.alert(
        "Parse Error",
        error.message || "Failed to parse CSV file. Check the file format.",
      );
      setState(INITIAL_BULK_IMPORT_STATE);
    }
  };

  // ── Start Import ──────────────────────────────────────────────────────────

  const startImport = async () => {
    if (!canImport) return;

    setState((prev) => ({
      ...prev,
      phase: "importing",
      importedCount: 0,
      failedDuringImport: [],
      currentRow: 0,
    }));

    try {
      const { imported, failed } = await bulkImportService.importTournaments(
        state.validRows,
        (current, _total) => {
          setState((prev) => ({ ...prev, currentRow: current }));
        },
      );

      setState((prev) => ({
        ...prev,
        phase: "complete",
        importedCount: imported,
        failedDuringImport: failed,
      }));
    } catch (error: any) {
      console.error("Import error:", error);
      Alert.alert("Import Error", error.message || "An unexpected error occurred during import.");
      setState((prev) => ({ ...prev, phase: "validated" }));
    }
  };

  // ── Reset ─────────────────────────────────────────────────────────────────

  const reset = () => {
    setState(INITIAL_BULK_IMPORT_STATE);
  };

  // ── Public API ────────────────────────────────────────────────────────────

  return {
    state,
    isLoading,
    canImport,
    progress,
    pickFile,
    startImport,
    reset,
  };
};