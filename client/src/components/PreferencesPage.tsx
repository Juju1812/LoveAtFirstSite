import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { type Profile, type Gender } from '../profile';

const GENDERS: Array<{ id: Gender; label: string }> = [
  { id: 'man', label: 'Man' },
  { id: 'woman', label: 'Woman' },
  { id: 'nonbinary', label: 'Non-binary' },
  { id: 'other', label: 'Other / prefer not to say' }
];

const LOOKING_FOR: Array<{ id: string; label: string }> = [
  { id: 'men', label: 'Men' },
  { id: 'women', label: 'Women' },
  { id: 'nonbinary', label: 'Non-binary' },
  { id: 'everyone', label: 'Everyone' }
];

export function PreferencesPage() {
  const { user, profile, setProfile } = useAuth();
  const [gender, setGender] = useState<Gender | null>(profile?.gender ?? null);
  const [lookingFor, setLookingFor] = useState<string[]>(
    profile?.looking_for ? profile.looking_for.split(',') : ['everyone']
  );
  const [ageMin, setAgeMin] = useState<string>(profile?.age_min?.toString() ?? '');
  const [ageMax, setAgeMax] = useState<string>(profile?.age_max?.toString() ?? '');
  const [savedHint, setSavedHint] = useState<string | null>(null);

  function toggleLF(id: string) {
    setLookingFor(prev => {
      if (id === 'everyone') return ['everyone'];
      const without = prev.filter(x => x !== 'everyone');
      return without.includes(id) ? without.filter(x => x !== id) : [...without, id];
    });
  }

  async function save() {
    const updates: Profile = {
      ...(profile ?? {}),
      gender,
      looking_for: lookingFor.length ? lookingFor.join(',') : null,
      age_min: ageMin ? parseInt(ageMin, 10) : null,
      age_max: ageMax ? parseInt(ageMax, 10) : null
    };
    await setProfile(updates);
    setSavedHint('Saved ✓');
    setTimeout(() => setSavedHint(null), 1800);
  }

  return (
    <div className="dash-panel">
      <div className="dash-panel-header">
        <div>
          <div className="dash-panel-eyebrow">Match preferences</div>
          <h1 className="dash-panel-title">Who you want to meet</h1>
          <p className="dash-panel-sub">Used to filter your queue. Leave anything blank to disable that filter.</p>
        </div>
      </div>

      {!user && (
        <div className="settings-note">
          💡 Preferences sync across devices when you <Link to="/signup">create an account</Link>.
        </div>
      )}

      <div className="settings-section">
        <div className="settings-field">
          <label>I am</label>
          <div className="chip-row">
            {GENDERS.map(g => (
              <button
                key={g.id}
                type="button"
                className={`chip ${gender === g.id ? 'chip-active' : ''}`}
                onClick={() => setGender(gender === g.id ? null : g.id)}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-field">
          <label>I want to meet</label>
          <div className="chip-row">
            {LOOKING_FOR.map(lf => (
              <button
                key={lf.id}
                type="button"
                className={`chip ${lookingFor.includes(lf.id) ? 'chip-active' : ''}`}
                onClick={() => toggleLF(lf.id)}
              >
                {lf.label}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-field">
          <label>Age range</label>
          <div className="age-range">
            <input type="number" min={13} max={120} placeholder="min" value={ageMin}
                   onChange={(e) => setAgeMin(e.target.value)} />
            <span>to</span>
            <input type="number" min={13} max={120} placeholder="max" value={ageMax}
                   onChange={(e) => setAgeMax(e.target.value)} />
          </div>
        </div>

        <div className="settings-actions">
          <button className="settings-save-btn" onClick={save}>Save preferences</button>
          {savedHint && <span className="settings-saved-hint">{savedHint}</span>}
        </div>
      </div>
    </div>
  );
}
