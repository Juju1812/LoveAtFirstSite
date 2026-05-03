import { useState } from 'react';
import { type Profile, resizePhoto, clearProfile, getProfilePhotos, MAX_PHOTOS } from '../profile';

interface Props {
  initial: Profile | null;
  onSave: (p: Profile) => void | Promise<void>;
  onCancel: () => void;
}

export function ProfileEditor({ initial, onSave, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [age, setAge] = useState(initial?.age ? String(initial.age) : '');
  const [bio, setBio] = useState(initial?.bio ?? '');
  const [vibes, setVibes] = useState(initial?.vibes ?? '');
  const [contact, setContact] = useState(initial?.contact ?? '');
  const [photos, setPhotos] = useState<string[]>(getProfilePhotos(initial));
  const [error, setError] = useState<string | null>(null);
  const [resizing, setResizing] = useState(false);

  async function handlePhoto(file: File, slotIdx?: number) {
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('Please pick an image file.');
      return;
    }
    setResizing(true);
    try {
      const dataUrl = await resizePhoto(file);
      setPhotos(prev => {
        const next = [...prev];
        if (slotIdx !== undefined && slotIdx < next.length) {
          next[slotIdx] = dataUrl;
        } else if (next.length < MAX_PHOTOS) {
          next.push(dataUrl);
        }
        return next;
      });
    } catch (e) {
      setError("Couldn't process that image. Try a different one.");
    } finally {
      setResizing(false);
    }
  }

  function removePhoto(idx: number) {
    setPhotos(prev => prev.filter((_, i) => i !== idx));
  }

  function movePhoto(idx: number, direction: -1 | 1) {
    setPhotos(prev => {
      const next = [...prev];
      const target = idx + direction;
      if (target < 0 || target >= next.length) return next;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ageNum = age ? parseInt(age, 10) : undefined;
    if (ageNum !== undefined && (isNaN(ageNum) || ageNum < 13 || ageNum > 120)) {
      setError('Age must be between 13 and 120.');
      return;
    }
    const profile: Profile = {
      name: name.trim() || undefined,
      age: ageNum,
      bio: bio.trim() || undefined,
      vibes: vibes.trim() || undefined,
      contact: contact.trim() || undefined,
      photos: photos.length > 0 ? photos : undefined,
      photo: photos[0] // back-compat
    };
    onSave(profile);
  }

  function handleClear() {
    if (!confirm('Delete your saved profile?')) return;
    clearProfile();
    setName(''); setAge(''); setBio(''); setVibes(''); setContact(''); setPhotos([]);
  }

  // Build the slot grid: filled slots + one "+" empty slot if there's room
  const slots: Array<{ kind: 'photo'; src: string; idx: number } | { kind: 'add' }> = [
    ...photos.map((src, idx) => ({ kind: 'photo' as const, src, idx })),
    ...(photos.length < MAX_PHOTOS ? [{ kind: 'add' as const }] : [])
  ];

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onCancel} aria-label="Close">✕</button>

        <div className="modal-header">
          <h2>Your profile</h2>
          <p>Optional. Only shown to people you match with — not before, never to anyone else. First photo is your primary.</p>
        </div>

        <form className="profile-form" onSubmit={handleSubmit}>
          <div className="photo-grid-section">
            <label className="photo-grid-label">
              Photos <span className="photo-grid-count">{photos.length}/{MAX_PHOTOS}</span>
            </label>
            <div className="photo-grid">
              {slots.map((slot, i) => {
                if (slot.kind === 'add') {
                  return (
                    <label key="add" className="photo-slot photo-slot-add" title="Add photo">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => e.target.files?.[0] && handlePhoto(e.target.files[0])}
                        hidden
                      />
                      <span className="photo-slot-add-icon">+</span>
                      <span className="photo-slot-add-label">{resizing ? 'Processing…' : 'Add photo'}</span>
                    </label>
                  );
                }
                const isPrimary = slot.idx === 0;
                return (
                  <div key={slot.idx} className={`photo-slot ${isPrimary ? 'photo-slot-primary' : ''}`}>
                    <img src={slot.src} alt={`Photo ${slot.idx + 1}`} />
                    {isPrimary && <span className="photo-slot-badge">Primary</span>}
                    <div className="photo-slot-actions">
                      {slot.idx > 0 && (
                        <button type="button" className="photo-slot-action" onClick={() => movePhoto(slot.idx, -1)} title="Move up">↑</button>
                      )}
                      {slot.idx < photos.length - 1 && (
                        <button type="button" className="photo-slot-action" onClick={() => movePhoto(slot.idx, 1)} title="Move down">↓</button>
                      )}
                      <button type="button" className="photo-slot-remove" onClick={() => removePhoto(slot.idx)} title="Remove">✕</button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="photo-grid-hint">
              Drag the order with the arrows. The first photo is what people see in their match alerts and inbox.
            </div>
          </div>

          <label className="field">
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="What should they call you?" />
          </label>

          <label className="field field-half">
            <span>Age</span>
            <input value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, ''))} maxLength={3} placeholder="—" inputMode="numeric" />
          </label>

          <label className="field">
            <span>Bio</span>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={400}
              rows={3}
              placeholder="Two sentences. Keep it real."
            />
            <span className="field-counter">{bio.length}/400</span>
          </label>

          <label className="field">
            <span>Vibes / interests</span>
            <input
              value={vibes}
              onChange={(e) => setVibes(e.target.value)}
              maxLength={200}
              placeholder="rock climbing 🧗 · jazz · taco truck enthusiast"
            />
          </label>

          <label className="field">
            <span>Contact</span>
            <input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              maxLength={200}
              placeholder="@instagram, phone, email — your call"
            />
          </label>

          {error && <div className="profile-error">{error}</div>}

          <div className="profile-actions">
            <button type="button" className="profile-clear" onClick={handleClear}>Delete profile</button>
            <button type="button" className="profile-cancel" onClick={onCancel}>Cancel</button>
            <button type="submit" className="profile-save">Save</button>
          </div>
        </form>
      </div>
    </div>
  );
}
