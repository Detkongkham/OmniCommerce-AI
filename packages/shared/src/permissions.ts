export const MODULES = [
  "inbox",
  "posting",
  "image-studio",
  "live-cf",
  "promotion",
  "affiliate",
  "inventory",
  "logistics",
  "automation",
  "analytics",
  "crm",
  "staff",
] as const;

export const ACTIONS = ["read", "write"] as const;

export type PermissionModule = (typeof MODULES)[number];
export type PermissionAction = (typeof ACTIONS)[number];
export type Permission = `${PermissionModule}:${PermissionAction}`;

export const PERMISSIONS: readonly Permission[] = MODULES.flatMap((module) =>
  ACTIONS.map((action) => `${module}:${action}` as const),
);

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}

export function hasPermission(granted: readonly string[], required: Permission): boolean {
  return granted.includes(required);
}
