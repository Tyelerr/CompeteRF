import { useEffect, useState } from "react";
import { Alert } from "react-native";
import { supabase } from "../lib/supabase";
import { TABLE_BRANDS, TABLE_SIZES } from "../utils/constants";

export interface VenueTable {
  id: number;
  venue_id: number;
  table_size: string;
  brand: string | null;
  quantity: number;
  custom_size: string | null;
  created_at: string;
}

export interface NewTable {
  table_size: string;
  brand: string;
  quantity: number;
  custom_size?: string;
}

export const useVenueTables = (venueId: number) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tables, setTables] = useState<VenueTable[]>([]);

  // Form state for adding new table
  const [newTable, setNewTable] = useState<NewTable>({
    table_size: "9ft",
    brand: "Diamond",
    quantity: 1,
    custom_size: "",
  });

  // Dropdown options
  const tableSizeOptions = TABLE_SIZES;
  const brandOptions = TABLE_BRANDS;

  useEffect(() => {
    if (venueId) {
      loadTables();
    }
  }, [venueId]);

  const loadTables = async () => {
    try {
      const { data, error } = await supabase
        .from("venue_tables")
        .select("*")
        .eq("venue_id", venueId)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error loading tables:", error);
        return;
      }

      setTables(data || []);
    } catch (error) {
      console.error("Error loading tables:", error);
    } finally {
      setLoading(false);
    }
  };

  const addTable = async () => {
    if (!newTable.table_size) {
      Alert.alert("Error", "Please select a table size");
      return;
    }

    if (newTable.table_size === "custom" && !newTable.custom_size?.trim()) {
      Alert.alert("Error", "Please enter a custom size");
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("venue_tables")
        .insert({
          venue_id: venueId,
          table_size: newTable.table_size,
          brand: newTable.brand || null,
          quantity: newTable.quantity,
          custom_size:
            newTable.table_size === "custom" ? newTable.custom_size : null,
        })
        .select()
        .single();

      if (error) {
        Alert.alert("Error", "Failed to add table");
        console.error("Error adding table:", error);
        return;
      }

      setTables([...tables, data]);
      // Reset form
      setNewTable({
        table_size: "9ft",
        brand: "Diamond",
        quantity: 1,
        custom_size: "",
      });
    } catch (error) {
      console.error("Error adding table:", error);
      Alert.alert("Error", "Failed to add table");
    } finally {
      setSaving(false);
    }
  };

  const updateTable = async (tableId: number, updates: Partial<VenueTable>) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("venue_tables")
        .update(updates)
        .eq("id", tableId);

      if (error) {
        Alert.alert("Error", "Failed to update table");
        console.error("Error updating table:", error);
        return;
      }

      setTables(
        tables.map((t) => (t.id === tableId ? { ...t, ...updates } : t)),
      );
    } catch (error) {
      console.error("Error updating table:", error);
      Alert.alert("Error", "Failed to update table");
    } finally {
      setSaving(false);
    }
  };

  const deleteTable = async (tableId: number) => {
    Alert.alert("Delete Table", "Are you sure you want to remove this table?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const { error } = await supabase
              .from("venue_tables")
              .delete()
              .eq("id", tableId);

            if (error) {
              Alert.alert("Error", "Failed to delete table");
              console.error("Error deleting table:", error);
              return;
            }

            setTables(tables.filter((t) => t.id !== tableId));
          } catch (error) {
            console.error("Error deleting table:", error);
            Alert.alert("Error", "Failed to delete table");
          }
        },
      },
    ]);
  };

  const updateNewTable = (field: keyof NewTable, value: string | number) => {
    setNewTable({ ...newTable, [field]: value });
  };

  return {
    // State
    loading,
    saving,
    tables,
    newTable,

    // Options
    tableSizeOptions,
    brandOptions,

    // Actions
    loadTables,
    addTable,
    updateTable,
    deleteTable,
    updateNewTable,
  };
};
