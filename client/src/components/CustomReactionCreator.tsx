import { useRef, useState } from 'react';
import { MAX_CUSTOM_REACTIONS, MAX_CUSTOM_REACTION_BYTES, resizeCustomReaction } from '../profile';

interface Props {
  existing: string[];
  onSave: (next: string[]) => void | Promise<void>;
  onClose: () => void;
}

/**
 * Pro-only modal for creating custom emoji reactions. Users upload an image,
 * we resize it client-side to a small data URL (≤ ~60KB), and store it on
 * their profile. They can have up to MAX_CUSTOM_REACTIONS at once.
 */
export function CustomReactionCreator({ existing, onSave, onClose }: Props) {
  const [items, setItems] = useState<string[]>(existing);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // allow re-picking the same file
    if (items.length >= MAX_CUSTOM_REACTIONS) {
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
        setError('Image is too large even after resize. Try a smaller / simpler image.');
        return;
      }
      setItems(prev => [...prev, url]);
    } catch (err: any) {
      setError(err?.message ?? 'Could not read that image.');
    }
  }

  function removeAt(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    setBusy(true);
    try {
      await onSave(items);
    } catch (err: any) {
      setError(err?.message ?? 'Could not save.');
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal reaction-creator-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Custom reactions</h2>
          <p>Upload up to {MAX_CUSTOM_REACTIONS} images to use as reactions during a call. Glimpse+ exclusive.</p>
        </div>

        <div className="reaction-creator-grid">
          {items.map((url, idx) => (
            <div key={idx} className="reaction-creator-tile">
              <img src={url} alt={`custom ${idx + 1}`} draggable={false} />
              <button type="button" className="reaction-creator-remove" onClick={() => removeAt(idx)} title="Remove">×</button>
            </div>
          ))}
          {items.length < MAX_CUSTOM_REACTIONS && (
            <button
              type="button"
              className="reaction-creator-add"
              onClick={() => fileRef.current?.click()}
              title="Upload image"
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

        {error && <div className="auth-error" style={{ marginTop: 12 }}>{error}</div>}

        <div className="modal-actions">
          <button type="button" className="settings-secondary-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="settings-save-btn" onClick={handleSave} disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
