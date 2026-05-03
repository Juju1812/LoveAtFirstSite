import { useMemo, useRef, useState } from 'react';
import {
  DEFAULT_REACTION_PALETTE,
  MAX_CUSTOM_REACTIONS,
  MAX_REACTION_EMOJIS,
  REACTION_EMOJI_OPTIONS,
  resizeCustomReaction,
  MAX_CUSTOM_REACTION_BYTES
} from '../profile';

interface Props {
  initialEmojis: string[];        // user's current emoji stack (can be empty)
  initialCustom: string[];        // user's current custom reactions (data URLs)
  isPremium: boolean;
  onSave: (next: { reaction_emojis: string[]; custom_reactions: string[] }) => Promise<void> | void;
}

/**
 * Inline editor (used in Settings) for the user's reaction palette.
 * Lets users:
 *   - pick which standard emojis appear in their in-call stack (cap MAX_REACTION_EMOJIS)
 *   - upload custom image-based reactions (Pro-only, cap MAX_CUSTOM_REACTIONS)
 */
export function ReactionStackEditor({ initialEmojis, initialCustom, isPremium, onSave }: Props) {
  const [picked, setPicked] = useState<string[]>(
    initialEmojis.length ? initialEmojis : DEFAULT_REACTION_PALETTE
  );
  const [customs, setCustoms] = useState<string[]>(initialCustom);
  const [savedHint, setSavedHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const fullSet = useMemo(() => REACTION_EMOJI_OPTIONS, []);

  function toggle(em: string) {
    setError(null);
    setPicked(prev => {
      if (prev.includes(em)) return prev.filter(x => x !== em);
      if (prev.length >= MAX_REACTION_EMOJIS) {
        setError(`You can pick at most ${MAX_REACTION_EMOJIS} emojis.`);
        return prev;
      }
      return [...prev, em];
    });
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (!isPremium) return;
    if (customs.length >= MAX_CUSTOM_REACTIONS) {
      setError(`You can have at most ${MAX_CUSTOM_REACTIONS} custom reactions.`);
      return;
    }
    if (!file.type.startsWith('image/')) {
      setError('Please pick an image file.');
      return;
    }
    setError(null);
    try {
      const url = await resizeCustomReaction(file);
      if (url.length > MAX_CUSTOM_REACTION_BYTES) {
        setError('Image is too large even after resize.');
        return;
      }
      setCustoms(prev => [...prev, url]);
    } catch (err: any) {
      setError(err?.message ?? 'Could not read that image.');
    }
  }

  function removeCustom(idx: number) {
    setCustoms(prev => prev.filter((_, i) => i !== idx));
  }

  async function save() {
    setBusy(true);
    try {
      await onSave({
        reaction_emojis: picked,
        custom_reactions: isPremium ? customs : []
      });
      setSavedHint('Saved ✓');
      setTimeout(() => setSavedHint(null), 1800);
    } catch (err: any) {
      setError(err?.message ?? 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="reaction-stack-editor">
      <div className="reaction-stack-preview">
        <div className="reaction-stack-preview-label">Your stack ({picked.length}/{MAX_REACTION_EMOJIS})</div>
        <div className="reaction-stack-preview-row">
          {picked.length === 0 && <span className="reaction-stack-empty">Pick at least one emoji.</span>}
          {picked.map(em => (
            <button
              key={em}
              type="button"
              className="reaction-stack-chip reaction-stack-chip-on"
              onClick={() => toggle(em)}
              title="Remove"
            >
              {em}
            </button>
          ))}
          {customs.map((url, idx) => (
            <span key={`c-${idx}`} className="reaction-stack-chip reaction-stack-chip-custom" title="Custom">
              <img src={url} alt="" draggable={false} />
            </span>
          ))}
        </div>
      </div>

      <div className="reaction-stack-grid">
        {fullSet.map(em => {
          const on = picked.includes(em);
          return (
            <button
              key={em}
              type="button"
              className={`reaction-stack-grid-cell ${on ? 'is-on' : ''}`}
              onClick={() => toggle(em)}
            >
              {em}
            </button>
          );
        })}
      </div>

      <div className="reaction-stack-custom-section">
        <div className="reaction-stack-custom-header">
          <h3>Custom reactions {isPremium ? <span className="verify-badge verify-badge-on">✨ Glimpse+</span> : <span className="verify-badge verify-badge-off">Glimpse+ only</span>}</h3>
          <p>{isPremium
            ? `Upload your own images. Up to ${MAX_CUSTOM_REACTIONS}.`
            : 'Upgrade to Glimpse+ to upload your own images as reactions.'}</p>
        </div>
        <div className="reaction-creator-grid">
          {customs.map((url, idx) => (
            <div key={idx} className="reaction-creator-tile">
              <img src={url} alt={`custom ${idx + 1}`} draggable={false} />
              <button type="button" className="reaction-creator-remove" onClick={() => removeCustom(idx)} disabled={!isPremium}>×</button>
            </div>
          ))}
          {isPremium && customs.length < MAX_CUSTOM_REACTIONS && (
            <button
              type="button"
              className="reaction-creator-add"
              onClick={() => fileRef.current?.click()}
            >
              <span>＋</span>
              <span className="reaction-creator-add-label">Upload</span>
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFile}
        />
      </div>

      {error && <div className="auth-error" style={{ marginTop: 12 }}>{error}</div>}

      <div className="settings-actions" style={{ marginTop: 16 }}>
        <button className="settings-save-btn" onClick={save} disabled={busy || picked.length === 0}>
          {busy ? 'Saving…' : 'Save reactions'}
        </button>
        {savedHint && <span className="settings-saved-hint">{savedHint}</span>}
      </div>
    </div>
  );
}
