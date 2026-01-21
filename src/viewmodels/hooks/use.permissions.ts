import { Permission, PERMISSIONS } from "../../permissions/permissions";
import { Role, ROLE_HIERARCHY } from "../../permissions/roles";
import { useAuthStore } from "../stores/auth.store";

export const usePermissions = () => {
  const { profile } = useAuthStore();
  const userRole = profile?.role as Role | undefined;

  const hasPermission = (permission: Permission): boolean => {
    if (!userRole) return false;
    const allowedRoles = PERMISSIONS[permission] as readonly string[];
    return allowedRoles.includes(userRole);
  };

  const hasRole = (role: Role): boolean => {
    if (!userRole) return false;
    return userRole === role;
  };

  const hasRoleOrHigher = (role: Role): boolean => {
    if (!userRole) return false;
    const roleIndex = ROLE_HIERARCHY.indexOf(role);
    const userRoleIndex = ROLE_HIERARCHY.indexOf(userRole);
    return userRoleIndex >= roleIndex;
  };

  const isBasicUser = userRole === "basic_user";
  const isTournamentDirector = userRole === "tournament_director";
  const isBarOwner = userRole === "bar_owner";
  const isCompeteAdmin = userRole === "compete_admin";
  const isSuperAdmin = userRole === "super_admin";
  const isAdmin = isCompeteAdmin || isSuperAdmin;

  return {
    userRole,
    hasPermission,
    hasRole,
    hasRoleOrHigher,
    isBasicUser,
    isTournamentDirector,
    isBarOwner,
    isCompeteAdmin,
    isSuperAdmin,
    isAdmin,
  };
};
