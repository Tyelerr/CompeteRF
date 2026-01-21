export const ROLES = {
  BASIC_USER: 'basic_user',
  TOURNAMENT_DIRECTOR: 'tournament_director',
  BAR_OWNER: 'bar_owner',
  COMPETE_ADMIN: 'compete_admin',
  SUPER_ADMIN: 'super_admin',
} as const;

export type Role = typeof ROLES[keyof typeof ROLES];

export const ROLE_HIERARCHY: Role[] = [
  ROLES.BASIC_USER,
  ROLES.TOURNAMENT_DIRECTOR,
  ROLES.BAR_OWNER,
  ROLES.COMPETE_ADMIN,
  ROLES.SUPER_ADMIN,
];