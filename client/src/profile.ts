/**
 * Lightweight profile system. No server, no auth — profiles live in
 * localStorage on the user's device and are sent peer-to-peer over the
 * WebRTC data channel after a match. On-brand with the no-account ethos.
 */

const STORAGE_KEY = 'glimpse:profile:v1';

export type Gender = 'man' | 'woman' | 'nonbinary' | 'other';
export type LookingFor = 'men' | 'women' | 'nonbinary' | 'everyone';

export interface Profile {
  name?: string;
  age?: number;
  bio?: string;
  vibes?: string;        // free-form interests / emojis
  contact?: string;      // optional fallback contact (IG, phone, email)
  photo?: string;        // legacy: kept in sync with photos[0] for back-compat
  photos?: string[];     // 1-6 photos (data URLs, resized client-side)
  gender?: Gender | null;
  looking_for?: string | null; // comma-separated list of LookingFor
  age_min?: number | null;
  age_max?: number | null;
  verified?: boolean;
  /** User-picked palette of standard emoji reactions (max 8). */
  reaction_emojis?: string[];
  /** Pro-only: small image data URLs used as custom reactions (max 4). */
  custom_reactions?: string[];
}

/** Returns the full list of photos for a profile (handles legacy single-photo). */
export function getProfilePhotos(p: Profile | null | undefined): string[] {
  if (!p) return [];
  if (p.photos && p.photos.length > 0) return p.photos;
  if (p.photo) return [p.photo];
  return [];
}

/** The "primary" photo used in compact views (sidebar, list rows). */
export function getPrimaryPhoto(p: Profile | null | undefined): string | undefined {
  const all = getProfilePhotos(p);
  return all[0];
}

export const MAX_PHOTOS = 6;

// ---- Reaction palette ----
export const MAX_REACTION_EMOJIS = 8;
export const MAX_CUSTOM_REACTIONS = 4;
export const MAX_CUSTOM_REACTION_BYTES = 60_000; // ~60KB per custom emoji data URL

/** Default emoji stack — what the user gets if they haven't customized. */
export const DEFAULT_REACTION_PALETTE: string[] = ['❤️', '😂', '🔥', '👀', '🥰', '🤯'];

/** Big pickable list users can choose from when customizing their stack. */
export const REACTION_EMOJI_OPTIONS: string[] = [
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍',
  '💕', '💖', '💗', '💘', '💞', '💓', '💝', '💌',
  '😂', '🤣', '😆', '😅', '😄', '😊', '😍', '🥰',
  '😘', '😎', '🥺', '😏', '🤩', '🤗', '😋', '🙃',
  '🔥', '✨', '💯', '🎉', '🥂', '🍷', '🍻', '☕',
  '👀', '👁️', '💋', '🌹', '🌟', '⭐', '🌈', '☀️',
  '🤯', '😮', '😱', '🤔', '🧐', '🙄', '😬', '🫠',
  '👍', '👎', '👏', '🙌', '🤝', '🫶', '🤙', '✌️',
  '😴', '😢', '🥲', '😭', '😤', '😡', '🤡', '💀',
  '🐶', '🐱', '🐻', '🦄', '🐝', '🦋', '🐢', '🐙'
];

/** Resolve the user's actual emoji stack — falls back to default when unset/empty. */
export function getReactionPalette(p: Profile | null | undefined): string[] {
  const picked = p?.reaction_emojis;
  if (Array.isArray(picked) && picked.length > 0) {
    return picked.slice(0, MAX_REACTION_EMOJIS);
  }
  return DEFAULT_REACTION_PALETTE;
}

/** Pro custom reactions, normalized + capped. */
export function getCustomReactions(p: Profile | null | undefined): string[] {
  const c = p?.custom_reactions;
  if (!Array.isArray(c)) return [];
  return c.filter(x => typeof x === 'string' && x.startsWith('data:image/')).slice(0, MAX_CUSTOM_REACTIONS);
}

/** True when a reaction string is one of our custom-image data URLs. */
export function isCustomReaction(s: string): boolean {
  return typeof s === 'string' && s.startsWith('data:image/');
}

export const TOPICS: Array<{ id: string; label: string; emoji: string; blurb: string }> = [
  { id: 'any', label: 'Anything', emoji: '🎲', blurb: 'No filter — meet whoever shows up.' },
  { id: 'casual', label: 'Casual', emoji: '🍻', blurb: 'Light, fun, no pressure.' },
  { id: 'deep', label: 'Deep talk', emoji: '🌊', blurb: 'Real questions, real answers.' },
  { id: 'laughs', label: 'Just laughs', emoji: '😂', blurb: 'Comedy energy only.' },
  { id: 'plans', label: 'Same-city plans', emoji: '📍', blurb: 'Looking for an actual date.' },
  { id: 'music', label: 'Music', emoji: '🎧', blurb: 'Trade taste, find a duet.' },
  { id: 'adventure', label: 'Adventure', emoji: '🏔️', blurb: 'Outdoorsy, restless, curious.' },
  { id: 'drinks', label: 'After-work drinks', emoji: '🍷', blurb: 'Wind-down vibes.' }
];

export function loadProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    return parsed as Profile;
  } catch {
    return null;
  }
}

export function saveProfile(p: Profile): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
}

export function clearProfile(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function hasMeaningfulProfile(p: Profile | null): boolean {
  if (!p) return false;
  return !!(p.name?.trim() || p.bio?.trim() || p.photo);
}

/** Resize an uploaded image to a square-fitting JPEG dataURL under ~256KB. */
export async function resizePhoto(file: File, maxDim = 512, quality = 0.82): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = url;
    });
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas unsupported');
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Sanitize an incoming profile from the peer (string lengths, photo size). */
export function sanitizeIncomingProfile(p: any): Profile | null {
  if (!p || typeof p !== 'object') return null;
  const out: Profile = {};
  if (typeof p.name === 'string') out.name = p.name.slice(0, 60).trim() || undefined;
  if (typeof p.age === 'number' && p.age >= 13 && p.age <= 120) out.age = Math.floor(p.age);
  if (typeof p.bio === 'string') out.bio = p.bio.slice(0, 400).trim() || undefined;
  if (typeof p.vibes === 'string') out.vibes = p.vibes.slice(0, 200).trim() || undefined;
  if (typeof p.contact === 'string') out.contact = p.contact.slice(0, 200).trim() || undefined;
  if (typeof p.photo === 'string' && p.photo.startsWith('data:image/') && p.photo.length < 400_000) {
    out.photo = p.photo;
  }
  if (Array.isArray(p.photos)) {
    const filtered = p.photos
      .filter((x: any) => typeof x === 'string' && x.startsWith('data:image/') && x.length < 400_000)
      .slice(0, 6);
    if (filtered.length > 0) out.photos = filtered;
  }
  if (Array.isArray(p.reaction_emojis)) {
    const cleaned = p.reaction_emojis
      .filter((x: any) => typeof x === 'string' && x.length > 0 && x.length <= 12)
      .slice(0, MAX_REACTION_EMOJIS);
    if (cleaned.length > 0) out.reaction_emojis = cleaned;
  }
  return out;
}

/** Resize an uploaded image to a small square JPEG/PNG dataURL for use as a custom emoji. */
export async function resizeCustomReaction(file: File, maxDim = 128, quality = 0.85): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = url;
    });
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas unsupported');
    ctx.drawImage(img, 0, 0, w, h);
    // Prefer PNG for transparency-friendly stickers; fallback JPEG if too large.
    let dataUrl = canvas.toDataURL('image/png');
    if (dataUrl.length > MAX_CUSTOM_REACTION_BYTES) {
      dataUrl = canvas.toDataURL('image/jpeg', quality);
    }
    return dataUrl;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const VISITED_KEY = 'glimpse:visited:v1';

export function isFirstVisit(): boolean {
  return localStorage.getItem(VISITED_KEY) !== '1';
}

export function markVisited(): void {
  localStorage.setItem(VISITED_KEY, '1');
}
