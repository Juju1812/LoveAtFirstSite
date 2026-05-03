/**
 * Lightweight profile system. No server, no auth — profiles live in
 * localStorage on the user's device and are sent peer-to-peer over the
 * WebRTC data channel after a match. On-brand with the no-account ethos.
 */

const STORAGE_KEY = 'glimpse:profile:v1';

export interface Profile {
  name?: string;
  age?: number;
  bio?: string;
  vibes?: string;        // free-form interests / emojis
  contact?: string;      // optional fallback contact (IG, phone, email)
  photo?: string;        // base64 data URL, resized client-side
}

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
  // Cap photo to ~400KB raw dataURL to prevent abuse / breakage
  if (typeof p.photo === 'string' && p.photo.startsWith('data:image/') && p.photo.length < 400_000) {
    out.photo = p.photo;
  }
  return out;
}
