import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { ProfileEditor } from './ProfileEditor';
import { type Profile } from '../profile';

export function ProfilePage() {
  const { user, profile, setProfile } = useAuth();
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  async function handleSave(p: Profile) {
    await setProfile(p);
    setEditing(false);
    setSaved('Saved ✓');
    setTimeout(() => setSaved(null), 1800);
  }

  return (
    <div className="dash-panel">
      <div className="dash-panel-header">
        <div>
          <div className="dash-panel-eyebrow">Your profile</div>
          <h1 className="dash-panel-title">How matches see you</h1>
          <p className="dash-panel-sub">Only shown to people you both swipe right on. Stored on your account when you're signed in.</p>
        </div>
        {saved && <span className="settings-saved-hint">{saved}</span>}
      </div>

      {!user && (
        <div className="settings-note">
          ⚠️ You're not signed in. Profile changes only persist on this device. <Link to="/signup">Create an account</Link> to sync across devices.
        </div>
      )}

      <div className="profile-card-large">
        <div className="profile-card-photo-wrap">
          {profile?.photo ? (
            <img src={profile.photo} alt="" className="profile-card-photo-large" />
          ) : (
            <div className="profile-card-photo-large profile-card-photo-empty-large">👤</div>
          )}
        </div>
        <div className="profile-card-large-meta">
          <h2>
            {profile?.name || <em className="muted">No name yet</em>}
            {profile?.age ? <span className="profile-card-age">, {profile.age}</span> : null}
          </h2>
          <p className="profile-card-bio-large">{profile?.bio || <em className="muted">No bio yet.</em>}</p>
          {profile?.vibes && <p className="profile-card-vibes-large">✨ {profile.vibes}</p>}
          {profile?.contact && <p className="profile-card-contact-large">📬 {profile.contact}</p>}
        </div>
        <button className="settings-save-btn" onClick={() => setEditing(true)}>
          {profile?.name || profile?.bio ? 'Edit profile' : 'Create profile'}
        </button>
      </div>

      {editing && (
        <ProfileEditor
          initial={profile}
          onSave={handleSave}
          onCancel={() => setEditing(false)}
        />
      )}
    </div>
  );
}
