/**
 * Dashboard roles, in one place.
 *
 * The union was previously redeclared in five files, which is exactly how a
 * new tier ends up recognised by the login route and ignored by the guard.
 */
export type UserRole = "superadmin" | "admin" | "agent";

export const USER_ROLES: UserRole[] = ["superadmin", "admin", "agent"];

/**
 * Higher outranks lower. Checks are `hasAtLeast`, never equality — an
 * `=== "admin"` test would lock the superadmin out of admin-only routes.
 */
const RANK: Record<UserRole, number> = {
  superadmin: 30,
  admin: 20,
  agent: 10,
};

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && (USER_ROLES as string[]).includes(value);
}

export function hasAtLeast(role: UserRole, required: UserRole): boolean {
  return RANK[role] >= RANK[required];
}

export const ROLE_LABEL: Record<UserRole, string> = {
  superadmin: "Superadmin",
  admin: "Admin",
  agent: "Agent",
};

export const ROLE_DESCRIPTION: Record<UserRole, string> = {
  superadmin: "Full access, including managing other users. Exactly one exists.",
  admin: "Full access to conversations, contacts and automation rules.",
  agent: "Read and reply to conversations.",
};
