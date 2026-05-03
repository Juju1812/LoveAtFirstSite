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

export interface SavedConnection {
  user_id: number;
  saved_at: number;
  note: string | null;
  name: string | null;
  photo: string | null;
  bio: string | null;
  vibes: string | null;
  mutual: boolean;
}

export async function listSaved(): Promise<{ saved: SavedConnection[] }> {
  return apiFetch('/api/saved');
}

export async function saveConnection(userId: number, note?: string): Promise<void> {
  await apiFetch('/api/saved', { method: 'POST', body: JSON.stringify({ userId, note }) });
}

export async function unsaveConnection(userId: number): Promise<void> {
  await apiFetch(`/api/saved/${userId}`, { method: 'DELETE' });
}

export async function getCoachTip(input: { transcripts: string[]; topic?: string; secondsLeft?: number }): Promise<{ tip: string | null }> {
  return apiFetch('/api/coach', { method: 'POST', body: JSON.stringify(input) });
}

// ---- Messaging ----
export interface ConversationSummary {
  id: number;
  peer_id: number;
  peer_name: string | null;
  peer_photo: string | null;
  peer_bio: string | null;
  last_body: string | null;
  last_sender: number | null;
  last_msg_at: number;
  unread: number;
}

export interface Message {
  id: number;
  sender_id: number;
  body: string;
  sent_at: number;
}

export async function listConversations(): Promise<{ conversations: ConversationSummary[] }> {
  return apiFetch('/api/conversations');
}
export async function listMessages(conversationId: number): Promise<{ messages: Message[] }> {
  return apiFetch(`/api/conversations/${conversationId}/messages`);
}
export async function postMessage(conversationId: number, body: string): Promise<{ message: Message }> {
  return apiFetch(`/api/conversations/${conversationId}/messages`, { method: 'POST', body: JSON.stringify({ body }) });
}
export async function markRead(conversationId: number): Promise<void> {
  await apiFetch(`/api/conversations/${conversationId}/read`, { method: 'POST' });
}

// ---- Events ----
export interface DatingEvent {
  id: number;
  name: string;
  description: string | null;
  starts_at: number;
  ends_at: number;
  topic: string | null;
  age_min: number | null;
  age_max: number | null;
  max_participants: number | null;
  rsvpd: boolean;
  rsvp_count: number;
}
export async function listEvents(): Promise<{ events: DatingEvent[] }> {
  return apiFetch('/api/events');
}
export async function rsvpToEvent(id: number): Promise<void> {
  await apiFetch(`/api/events/${id}/rsvp`, { method: 'POST' });
}
export async function unrsvpFromEvent(id: number): Promise<void> {
  await apiFetch(`/api/events/${id}/rsvp`, { method: 'DELETE' });
}

// ---- Insights ----
export interface InsightsSummary {
  total_calls: number;
  avg_chemistry: number;
  avg_peak: number;
  match_rate_pct: number;
  best_topic: string | null;
  best_topic_avg: number | null;
}
export async function getInsights(): Promise<{ history: any[]; summary: InsightsSummary | null }> {
  return apiFetch('/api/insights');
}

// ---- Moderation ----
export async function moderateText(text: string): Promise<{ flagged: boolean; categories?: string[] }> {
  return apiFetch('/api/moderate-text', { method: 'POST', body: JSON.stringify({ text }) });
}
