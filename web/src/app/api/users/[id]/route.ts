import { NextRequest } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/guard";
import {
  deleteUser,
  findUserById,
  setPassword,
  updateUser,
  revokeAllSessions,
} from "@/database/userRepository";
import { hashPassword, validatePasswordStrength } from "@/lib/auth/password";
import { isUserRole } from "@/lib/auth/roles";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperAdmin();
  if (auth instanceof Response) return auth;

  const { id } = await params;
  const body = await request.json();

  const target = await findUserById(id);
  if (!target) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  if (target.role === "superadmin") {
    return Response.json({ error: "Cannot modify the superadmin" }, { status: 403 });
  }

  if (body.role !== undefined) {
    if (!isUserRole(body.role) || body.role === "superadmin") {
      return Response.json({ error: "Role must be manager or viewer" }, { status: 400 });
    }
  }

  if (body.password !== undefined) {
    const passwordError = validatePasswordStrength(body.password);
    if (passwordError) {
      return Response.json({ error: passwordError }, { status: 400 });
    }
    const hash = await hashPassword(body.password);
    await setPassword(id, hash);
    await revokeAllSessions(id);
  }

  const updated = await updateUser(id, {
    name: body.name,
    role: body.role,
  });

  if (!updated) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  return Response.json({
    id: updated.id,
    email: updated.email,
    name: updated.name,
    role: updated.role,
    created_at: updated.created_at,
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperAdmin();
  if (auth instanceof Response) return auth;

  const { id } = await params;

  if (id === auth.sub) {
    return Response.json({ error: "Cannot delete yourself" }, { status: 400 });
  }

  const target = await findUserById(id);
  if (!target) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  if (target.role === "superadmin") {
    return Response.json({ error: "Cannot delete the superadmin" }, { status: 403 });
  }

  await deleteUser(id);
  return Response.json({ ok: true });
}
