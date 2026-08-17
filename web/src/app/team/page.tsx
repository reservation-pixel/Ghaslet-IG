"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { apiFetch, apiJson } from "@/lib/apiFetch";
import { ROLE_LABEL, type UserRole } from "@/lib/auth/roles";

interface TeamUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  created_at: string;
}

const ROLE_TONE: Record<string, "accent" | "neutral" | "good"> = {
  superadmin: "accent",
  manager: "good",
  viewer: "neutral",
};

export default function TeamPage() {
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ email: "", name: "", role: "manager" as string, password: "" });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [editId, setEditId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<string>("manager");
  const [saving, setSaving] = useState(false);

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/users", { credentials: "same-origin" });
    if (res.status === 403 || res.status === 401) {
      setForbidden(true);
      setLoading(false);
      return;
    }
    const data = await res.json();
    if (Array.isArray(data)) setUsers(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate() {
    setCreating(true);
    setCreateError(null);

    const res = await apiFetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setCreateError(body?.error ?? "Failed to create user");
      setCreating(false);
      return;
    }

    setForm({ email: "", name: "", role: "manager", password: "" });
    setShowCreate(false);
    setCreating(false);
    await load();
  }

  async function handleEditRole(id: string) {
    setSaving(true);
    await apiFetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: editRole }),
    });
    setEditId(null);
    setSaving(false);
    await load();
  }

  async function handleDelete(id: string) {
    setDeleting(true);
    await apiFetch(`/api/users/${id}`, { method: "DELETE" });
    setDeleteId(null);
    setDeleting(false);
    await load();
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 lg:px-8">
        <PageHeader title="Team" subtitle="Loading..." />
        <div className="h-48 animate-pulse rounded-[12px]" style={{ background: "var(--surface-2)" }} />
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 lg:px-8">
        <PageHeader title="Team" />
        <Card>
          <EmptyState
            title="Access denied"
            hint="Only the superadmin can manage team members."
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 lg:px-8">
      <PageHeader
        title="Team"
        subtitle="Create and manage user accounts."
        action={
          <Button variant="primary" onClick={() => setShowCreate(!showCreate)}>
            {showCreate ? "Cancel" : "New user"}
          </Button>
        }
      />

      {showCreate && (
        <Card className="mb-5">
          <h2 className="mb-4 text-sm font-semibold" style={{ color: "var(--ink)" }}>
            Create user
          </h2>
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email">
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="user@example.com"
                />
              </Field>
              <Field label="Name">
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Full name"
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Role">
                <Select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                >
                  <option value="manager">Manager</option>
                  <option value="viewer">Viewer</option>
                </Select>
              </Field>
              <Field label="Password" hint="Min 12 characters.">
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="••••••••••••"
                />
              </Field>
            </div>

            {createError && (
              <p className="text-xs font-medium" style={{ color: "var(--critical)" }}>
                {createError}
              </p>
            )}

            <div>
              <Button variant="primary" onClick={handleCreate} disabled={creating}>
                {creating ? "Creating..." : "Create user"}
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card padded={false}>
        {users.length === 0 ? (
          <EmptyState title="No users yet" hint="Create your first team member above." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>User</Th>
                <Th>Role</Th>
                <Th>Joined</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <Td>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium" style={{ color: "var(--ink)" }}>
                        {u.name || u.email}
                      </p>
                      {u.name && (
                        <p className="truncate text-[11px]" style={{ color: "var(--ink-muted)" }}>
                          {u.email}
                        </p>
                      )}
                    </div>
                  </Td>
                  <Td>
                    {editId === u.id ? (
                      <div className="flex items-center gap-2">
                        <Select
                          value={editRole}
                          onChange={(e) => setEditRole(e.target.value)}
                          className="!w-auto"
                        >
                          <option value="manager">Manager</option>
                          <option value="viewer">Viewer</option>
                        </Select>
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => handleEditRole(u.id)}
                          disabled={saving}
                        >
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Badge tone={ROLE_TONE[u.role] ?? "neutral"}>
                        {ROLE_LABEL[u.role] ?? u.role}
                      </Badge>
                    )}
                  </Td>
                  <Td>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>
                      {new Date(u.created_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  </Td>
                  <Td align="right">
                    {u.role !== "superadmin" && (
                      <div className="flex items-center justify-end gap-2">
                        {editId !== u.id && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditId(u.id);
                              setEditRole(u.role);
                            }}
                          >
                            Edit role
                          </Button>
                        )}
                        {deleteId === u.id ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs" style={{ color: "var(--critical)" }}>
                              Delete?
                            </span>
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => handleDelete(u.id)}
                              disabled={deleting}
                            >
                              Yes
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setDeleteId(null)}>
                              No
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => setDeleteId(u.id)}
                          >
                            Delete
                          </Button>
                        )}
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
