"use client";

import { createContext, useContext } from "react";
import type { UserRole } from "@/lib/auth/roles";
import { hasAtLeast } from "@/lib/auth/roles";

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
}

const SessionContext = createContext<SessionUser | null>(null);

export const SessionProvider = SessionContext.Provider;

export function useSession(): SessionUser | null {
  return useContext(SessionContext);
}

export function useCanManage(): boolean {
  const user = useSession();
  return user ? hasAtLeast(user.role, "manager") : false;
}
