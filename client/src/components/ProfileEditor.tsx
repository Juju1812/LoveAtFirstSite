import { useState } from 'react';
import { type Profile, resizePhoto, clearProfile } from '../profile';

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
  const [photo, setPhoto] = useState<string | undefined>(initial?.photo);
  const [error, setError] = useState<string | null>(null);
  const [resizing, setResizing] = useState(false);

  async function handlePhoto(file: File) {
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('Please pick an image file.');
      return;
    }
    setResizing(true);
    try {
      const dataUrl = await resizePhoto(file);
      setPhoto(dataUrl);
    } catch (e) {
      setError("Couldn't process that image. Try a different one.");
    } finally {
      setResizing(false);
    }
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
      photo
    };
    onSave(profile);
  }

  function handleClear() {
    if (!confirm('Delete your saved profile?')) return;
    clearProfile();
    setName(''); setAge(''); setBio(''); setVibes(''); setContact(''); setPhoto(undefined);
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onCancel} aria-label="Close">✕</button>

        <div className="modal-header">
          <h2>Your profile</h2>
          <p>Optional. Only shown to people you match with — not before, never to anyone else. Stored on this device.</p>
        </div>

        <form className="profile-form" onSubmit={handleSubmit}>
          <div className="profile-photo-row">
            <div className="profile-photo-preview" aria-label="Profile photo preview">
              {photo ? <img src={photo} alt="profile" /> : <span className="profile-photo-placeholder">📷</span>}
            </div>
            <div className="profile-photo-controls">
              <label className="profile-photo-btn">
                {resizing ? 'Processing…' : photo ? 'Change photo' : 'Add a photo'}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => e.target.files?.[0] && handlePhoto(e.target.files[0])}
                  hidden
                />
              </label>
              {photo && (
                <button type="button" className="profile-photo-remove" onClick={() => setPhoto(undefined)}>
                  Remove
                </button>
              )}
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
