// src/utils/admin-route-access.ts
// Client-side access map for the /admin stack (defense in depth — server RLS / RPC checks stay
// authoritative). Derived from where each route is linked: the TD, bar-owner, Compete-admin
// and Super-admin dashboards in app/(tabs)/admin/index.tsx. Admins may open everything except
// super-only bulk import; bar owners may open everything a TD may; basic users get nothing
// under /admin except the index, which renders its own "No Dashboard Access" state.
// Tournament-level authorization (does this user manage THIS tournament?) is a separate,
// server-verified check — see TournamentManageGuard.

import { ROLES } from "../permissions/roles";

type Access = "signed_in" | "td" | "owner" | "admin" | "super";

const ADMIN = new Set<string>([ROLES.COMPETE_ADMIN, ROLES.SUPER_ADMIN]);
const OWNER = new Set<string>([ROLES.BAR_OWNER, ...ADMIN]);
const TD = new Set<string>([ROLES.TOURNAMENT_DIRECTOR, ...OWNER]);

// First path segment(s) after /admin → required access. Longest match wins; unlisted routes
// default to "td" (the admin stack is staff-only).
const ROUTE_ACCESS: Record<string, Access> = {
  "": "signed_in", // /admin — the role router (shows "No Dashboard Access" to basic users)
  index: "signed_in", // the same screen by its route name (screen-level gate uses route names)
  "notification-preferences": "signed_in",

  "bulk-import": "super",

  "user-management": "admin",
  "edit-user": "admin",
  "venue-management": "admin",
  "report-management": "admin",
  "super-admin-analytics": "admin",
  "featured-content": "admin",
  "featured-management": "admin",
  "bar-requests": "admin",
  "giveaway-management": "admin",
  "giveaway-participants": "admin",
  "giveaway-past-winners": "admin",
  "giveaway-grant-entries": "admin",
  // Server RPCs are super_admin-only; the page is too (no read-only view for other admins).
  "giveaway-earning-rules": "super",
  "create-giveaway": "admin",
  "edit-giveaway": "admin",
  "tournament-management": "admin",
  "tournaments/admin-tournament-manager": "admin",
  "tournaments/super-admin-tournament-manager": "admin",

  "bar-owner-analytics": "owner",
  "bar-owner-billing": "owner",
  "bar-owner-venues": "owner",
  "directors": "owner",
  "my-directors": "owner",
  "add-director": "owner",
  "create-venue": "owner",
  "edit-venue": "owner",
  "my-venues-tournaments": "owner",
  "tournaments/bar-tournament-manager": "owner",
};

export const adminRouteAccess = (pathname: string): Access => {
  // "/admin/tournaments/bar-tournament-manager" → "tournaments/bar-tournament-manager"
  const rest = (pathname ?? "")
    .replace(/[?#].*$/, "")
    .replace(/^.*?\/admin(?=\/|$)/, "")
    .replace(/^\/+|\/+$/g, "");
  const parts = rest ? rest.split("/") : [];
  if (parts.length === 0) return ROUTE_ACCESS[""];
  for (let n = parts.length; n >= 1; n--) {
    const key = parts.slice(0, n).join("/");
    if (key in ROUTE_ACCESS) return ROUTE_ACCESS[key];
  }
  return "td";
};

export const canAccessAdminPath = (pathname: string, role: string | null | undefined): boolean => {
  if (!role) return false;
  switch (adminRouteAccess(pathname)) {
    case "signed_in":
      return true;
    case "super":
      return role === ROLES.SUPER_ADMIN;
    case "admin":
      return ADMIN.has(role);
    case "owner":
      return OWNER.has(role);
    case "td":
    default:
      return TD.has(role);
  }
};
