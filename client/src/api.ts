import type { Profile } from './profile';

const API_BASE =
  (import.meta.env.VITE_SIGNAL_URL as string | undefined) ??
  (import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin);

const TOKEN_KEY = 'glimpse:auth:token';

export interface User {
  id: number;
  email: string;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function apiFetch(path: string, init: RequestInit = {}) {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined)
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const msg = body?.error || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return body;
}

export async function signup(email: string, password: string): Promise<{ token: string; user: User }> {
  return apiFetch('/api/signup', { method: 'POST', body: JSON.stringify({ email, password }) });
}

export async function login(email: string, password: string): Promise<{ token: string; user: User }> {
  return apiFetch('/api/login', { method: 'POST', body: JSON.stringify({ email, password }) });
}

export async function fetchMe(): Promise<{ user: User; profile: Profile | null }> {
  return apiFetch('/api/me');
}

export async function saveProfileToServer(profile: Profile): Promise<{ profile: Profile }> {
  return apiFetch('/api/profile', { method: 'PUT', body: JSON.stringify(profile) });
}
