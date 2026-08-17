"use client";

/**
 * fetch wrapper that transparently renews an expired access token.
 *
 * Access tokens last 15 minutes. Rather than making every page handle that,
 * a 401 triggers one refresh attempt and one retry. If the refresh also fails
 * the session is genuinely over and we go to /login.
 */

let refreshing: Promise<boolean> | null = null;

/** Collapse concurrent 401s into a single refresh — the token rotates, so
 *  parallel refreshes would invalidate each other and trip replay detection. */
function refreshOnce(): Promise<boolean> {
  if (!refreshing) {
    refreshing = fetch("/api/auth/refresh", { method: "POST", credentials: "same-origin" })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

function redirectToLogin() {
  if (typeof window === "undefined") return;
  const next = window.location.pathname + window.location.search;
  window.location.href = `/login?next=${encodeURIComponent(next)}`;
}

export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const options: RequestInit = { credentials: "same-origin", ...init };

  let res = await fetch(input, options);
  if (res.status !== 401) return res;

  const renewed = await refreshOnce();
  if (!renewed) {
    redirectToLogin();
    return res;
  }

  res = await fetch(input, options);
  if (res.status === 401) redirectToLogin();
  return res;
}

/** apiFetch + JSON parse. Returns null instead of throwing on a failed request. */
export async function apiJson<T>(input: string, init?: RequestInit): Promise<T | null> {
  const res = await apiFetch(input, init);
  if (!res.ok) return null;
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
