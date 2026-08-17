/**
 * Dashboard roles, in one place.
 *
 * The union was previously redeclared in five files, which is exactly how a
 * new tier ends up recognised by the login route and ignored by the guard.
 */
export type UserRole = "superadmin" | "manager" | "viewer";

export const USER_ROLES: UserRole[] = ["superadmin", "manager", "viewer"];

const RANK: Record<UserRole, number> = {
  superadmin: 30,
  manager: 20,
  viewer: 10,
};

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && (USER_ROLES as string[]).includes(value);
}

export function hasAtLeast(role: UserRole, required: UserRole): boolean {
  return RANK[role] >= RANK[required];
}

export const ROLE_LABEL: Record<UserRole, string> = {
  superadmin: "Superadmin",
  manager: "Manager",
  viewer: "Viewer",
};

export const ROLE_DESCRIPTION: Record<UserRole, string> = {
  superadmin: "Full access, including managing other users. Exactly one exists.",
  manager: "Manage conversations, automation, scripts, and broadcasts.",
  viewer: "View-only access to the dashboard.",
};
