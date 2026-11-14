/**
 * Role-based access control policy.
 * Permissions are the unit of authorization; roles are bundles of permissions.
 * API keys carry an explicit subset of permissions (scopes) instead of a role.
 * Enforcement always reads from the verified principal — never the request body.
 */
export const ALL_PERMISSIONS = [
  'wallet:read',
  'wallet:write',
  'transaction:read',
  'transaction:write',
  'webhook:manage',
  'apikey:manage',
  'member:manage',
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  owner: [...ALL_PERMISSIONS],
  admin: [
    'wallet:read',
    'wallet:write',
    'transaction:read',
    'transaction:write',
    'webhook:manage',
    'apikey:manage',
  ],
  member: ['wallet:read', 'wallet:write', 'transaction:read', 'transaction:write'],
  viewer: ['wallet:read', 'transaction:read'],
};

export function permissionsForRole(role: string): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function isValidPermission(value: string): value is Permission {
  return (ALL_PERMISSIONS as readonly string[]).includes(value);
}
