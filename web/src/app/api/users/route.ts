import { NextRequest } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/guard";
import { createUser, findUserByEmail, listUsers } from "@/database/userRepository";
import { hashPassword, validatePasswordStrength } from "@/lib/auth/password";
import { isUserRole } from "@/lib/auth/roles";

export async function GET() {
  const auth = await requireSuperAdmin();
  if (auth instanceof Response) return auth;

  const users = await listUsers();
  return Response.json(users);
}

export async function POST(request: NextRequest) {
  const auth = await requireSuperAdmin();
  if (auth instanceof Response) return auth;

  const body = await request.json();
  const { email, name, role, password } = body;

  if (!email || typeof email !== "string" || !email.includes("@")) {
    return Response.json({ error: "A valid email is required" }, { status: 400 });
  }

  if (!password || typeof password !== "string") {
    return Response.json({ error: "Password is required" }, { status: 400 });
  }

  const passwordError = validatePasswordStrength(password);
  if (passwordError) {
    return Response.json({ error: passwordError }, { status: 400 });
  }

  if (!role || !isUserRole(role)) {
    return Response.json({ error: "Role must be manager or viewer" }, { status: 400 });
  }

  if (role === "superadmin") {
    return Response.json({ error: "Cannot create another superadmin" }, { status: 400 });
  }

  const existing = await findUserByEmail(email);
  if (existing) {
    return Response.json({ error: "A user with this email already exists" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const user = await createUser({
    email,
    passwordHash,
    name: typeof name === "string" ? name.trim() : null,
    role,
  });

  return Response.json(
    { id: user.id, email: user.email, name: user.name, role: user.role, created_at: user.created_at },
    { status: 201 }
  );
}
