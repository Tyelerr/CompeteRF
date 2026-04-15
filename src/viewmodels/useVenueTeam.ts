// src/viewmodels/useVenueTeam.ts
import { useCallback, useState } from "react";
import { Alert } from "react-native";
import { supabase } from "../lib/supabase";
import { useAuthContext } from "../providers/AuthProvider";

export interface TeamMember {
  id: number;
  userId: number;
  name: string;
  email: string;
  role: "owner" | "co_owner" | "director";
  isPrimary: boolean;
}

export interface UserSearchResult {
  id: number;
  name: string;
  email: string;
}

const PROTECTED_ROLES = ["super_admin", "compete_admin"];
const OWNER_ROLES = ["super_admin", "compete_admin", "bar_owner"];
const DIRECTOR_ROLES = ["super_admin", "compete_admin", "bar_owner", "tournament_director"];

export const useVenueTeam = (venueId: number | null) => {
  const { profile } = useAuthContext();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const loadTeam = useCallback(async () => {
    if (!venueId) return;
    setLoading(true);
    try {
      const { data: owners } = await supabase
        .from("venue_owners")
        .select("id, owner_id, profiles!venue_owners_owner_id_fkey(id_auto, name, email)")
        .eq("venue_id", venueId)
        .is("archived_at", null)
        .order("id", { ascending: true });

      const { data: directors } = await supabase
        .from("venue_directors")
        .select("id, director_id, profiles!venue_directors_director_id_fkey(id_auto, name, email)")
        .eq("venue_id", venueId)
        .is("archived_at", null);

      const ownerMembers: TeamMember[] = (owners || []).map((o: any, index: number) => ({
        id: o.id,
        userId: o.owner_id,
        name: o.profiles?.name || o.profiles?.email || "Unknown",
        email: o.profiles?.email || "",
        role: index === 0 ? "owner" : "co_owner",
        isPrimary: index === 0,
      }));

      const directorMembers: TeamMember[] = (directors || []).map((d: any) => ({
        id: d.id,
        userId: d.director_id,
        name: d.profiles?.name || d.profiles?.email || "Unknown",
        email: d.profiles?.email || "",
        role: "director" as const,
        isPrimary: false,
      }));

      setMembers([...ownerMembers, ...directorMembers]);
    } catch (err) {
      console.error("Error loading team:", err);
    } finally {
      setLoading(false);
    }
  }, [venueId]);

  const searchUsers = useCallback(async (query: string) => {
    if (query.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const { data: nameData } = await supabase
        .from("profiles")
        .select("id_auto, name, email")
        .ilike("name", `%${query}%`)
        .limit(10);
      const { data: emailData } = await supabase
        .from("profiles")
        .select("id_auto, name, email")
        .ilike("email", `%${query}%`)
        .limit(10);
      const combined = [...(nameData || []), ...(emailData || [])];
      const unique = combined.filter((v, i, a) => a.findIndex((t) => t.id_auto === v.id_auto) === i);
      setSearchResults(unique.map((u: any) => ({ id: u.id_auto, name: u.name || u.email, email: u.email })));
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  // ── Role helpers ───────────────────────────────────────────────────────────
  const promoteRole = async (userId: number, newRole: string) => {
    const { data: userProfile } = await supabase
      .from("profiles").select("role").eq("id_auto", userId).maybeSingle();
    if (!userProfile) return;
    if (PROTECTED_ROLES.includes(userProfile.role)) return;
    const { error } = await supabase
      .from("profiles").update({ role: newRole }).eq("id_auto", userId);
    if (error) console.error("Role promote error:", error);
  };

  const downgradeRoleIfUnassigned = async (userId: number) => {
    // Check remaining venue owner rows
    const { count: ownerCount } = await supabase
      .from("venue_owners")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", userId)
      .is("archived_at", null);

    // Check remaining director rows
    const { count: directorCount } = await supabase
      .from("venue_directors")
      .select("id", { count: "exact", head: true })
      .eq("director_id", userId)
      .is("archived_at", null);

    const { data: userProfile } = await supabase
      .from("profiles").select("role").eq("id_auto", userId).maybeSingle();
    if (!userProfile || PROTECTED_ROLES.includes(userProfile.role)) return;

    if ((ownerCount || 0) === 0 && (directorCount || 0) === 0) {
      await supabase.from("profiles").update({ role: "basic_user" }).eq("id_auto", userId);
    } else if ((ownerCount || 0) === 0 && (directorCount || 0) > 0) {
      await supabase.from("profiles").update({ role: "tournament_director" }).eq("id_auto", userId);
    }
    // If still has owner rows, keep bar_owner
  };

  // ── Add Co-Owner ───────────────────────────────────────────────────────────
  const addCoOwner = useCallback(async (userId: number, userName: string): Promise<boolean> => {
    if (!venueId || !profile?.id_auto) return false;
    const already = members.find((m) => m.userId === userId);
    if (already) {
      Alert.alert("Already a Member", `${userName} is already on this venue''s team.`);
      return false;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("venue_owners").insert({
        venue_id: venueId,
        owner_id: userId,
        assigned_by: profile.id_auto,
      });
      if (error) throw error;
      await promoteRole(userId, "bar_owner");
      await loadTeam();
      return true;
    } catch (err) {
      console.error("Error adding co-owner:", err);
      Alert.alert("Error", "Failed to add co-owner.");
      return false;
    } finally {
      setSaving(false);
    }
  }, [venueId, profile?.id_auto, members, loadTeam]);

  // ── Add Director ───────────────────────────────────────────────────────────
  const addDirector = useCallback(async (userId: number, userName: string): Promise<boolean> => {
    if (!venueId || !profile?.id_auto) return false;
    const already = members.find((m) => m.userId === userId && m.role === "director");
    if (already) {
      Alert.alert("Already a Director", `${userName} is already a director at this venue.`);
      return false;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("venue_directors").upsert(
        { venue_id: venueId, director_id: userId, assigned_by: profile.id_auto },
        { onConflict: "venue_id,director_id" }
      );
      if (error) throw error;
      await promoteRole(userId, "tournament_director");
      await loadTeam();
      return true;
    } catch (err) {
      console.error("Error adding director:", err);
      Alert.alert("Error", "Failed to add director.");
      return false;
    } finally {
      setSaving(false);
    }
  }, [venueId, profile?.id_auto, members, loadTeam]);

  // ── Remove Co-Owner ────────────────────────────────────────────────────────
  const removeCoOwner = useCallback(async (member: TeamMember): Promise<boolean> => {
    if (!venueId) return false;
    if (member.isPrimary) {
      Alert.alert("Cannot Remove", "The primary owner cannot be removed. Transfer ownership through a super admin.");
      return false;
    }
    setSaving(true);
    try {
      console.log("Removing co-owner row id:", member.id, "userId:", member.userId);
      const { error, data } = await supabase.from("venue_owners").delete().eq("id", member.id).select();
      console.log("Delete result:", data, "error:", error);
      if (error) throw error;
      await downgradeRoleIfUnassigned(member.userId);
      await loadTeam();
      return true;
    } catch (err) {
      console.error("Error removing co-owner:", err);
      Alert.alert("Error", "Failed to remove co-owner.");
      return false;
    } finally {
      setSaving(false);
    }
  }, [venueId, loadTeam]);

  // ── Remove Director ────────────────────────────────────────────────────────
  const removeDirector = useCallback(async (member: TeamMember): Promise<boolean> => {
    if (!venueId) return false;
    setSaving(true);
    try {
      const { error } = await supabase.from("venue_directors").delete().eq("id", member.id);
      if (error) throw error;
      await downgradeRoleIfUnassigned(member.userId);
      await loadTeam();
      return true;
    } catch (err) {
      console.error("Error removing director:", err);
      Alert.alert("Error", "Failed to remove director.");
      return false;
    } finally {
      setSaving(false);
    }
  }, [venueId, loadTeam]);

  const primaryOwner = members.find((m) => m.isPrimary);
  const coOwners = members.filter((m) => m.role === "co_owner");
  const directors = members.filter((m) => m.role === "director");

  return {
    loading,
    saving,
    members,
    primaryOwner,
    coOwners,
    directors,
    searchResults,
    searching,
    loadTeam,
    searchUsers,
    addCoOwner,
    addDirector,
    removeCoOwner,
    removeDirector,
    clearSearch: () => setSearchResults([]),
  };
};