import { supabase } from "@/lib/supabase";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8787";

async function authHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = { "Content-Type": "application/json", ...(await authHeaders()), ...init?.headers };
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((body as { error?: string } | null)?.error ?? `שגיאת שרת (${res.status})`);
  }
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "POST", body: data ? JSON.stringify(data) : undefined }),
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "PATCH", body: data ? JSON.stringify(data) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
