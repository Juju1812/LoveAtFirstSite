import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { listSaved, unsaveConnection, type SavedConnection } from '../api';

export function SavedList() {
  const { user } = useAuth();
  const [saved, setSaved] = useState<SavedConnection[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    listSaved()
      .then(({ saved }) => { if (!cancelled) setSaved(saved); })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [user]);

  async function remove(userId: number) {
    if (!confirm('Remove from your saved list?')) return;
    await unsaveConnection(userId);
    setSaved(prev => prev?.filter(s => s.user_id !== userId) ?? prev);
  }

  if (!user) {
    return (
      <div className="saved-page">
        <header className="settings-nav">
          <Link to="/" className="settings-back">← Home</Link>
          <h1>Saved connections</h1>
        </header>
        <main className="settings-main">
          <div className="saved-empty">
            <div className="saved-empty-icon">🔒</div>
            <h2>Sign in to save people</h2>
            <p>Saved connections sync to your account so you can keep them across devices.</p>
            <div className="settings-actions">
              <Link to="/login" className="settings-secondary-btn">Sign in</Link>
              <Link to="/signup" className="settings-save-btn">Create account</Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="saved-page">
      <header className="settings-nav">
        <Link to="/" className="settings-back">← Home</Link>
        <h1>Saved connections</h1>
      </header>
      <main className="settings-main">
        {error && <div className="auth-error">{error}</div>}
        {saved == null ? (
          <div className="saved-empty"><p>Loading…</p></div>
        ) : saved.length === 0 ? (
          <div className="saved-empty">
            <div className="saved-empty-icon">💗</div>
            <h2>No saves yet</h2>
            <p>After a call ends, you'll get an option to "Save" the person. If they save you back, you both get a notification.</p>
          </div>
        ) : (
          <ul className="saved-list">
            {saved.map(s => (
              <li key={s.user_id} className={`saved-item ${s.mutual ? 'saved-item-mutual' : ''}`}>
                {s.photo
                  ? <img src={s.photo} alt="" className="saved-photo" />
                  : <div className="saved-photo saved-photo-empty">👤</div>}
                <div className="saved-meta">
                  <div className="saved-name">
                    {s.name || 'Anonymous'}
                    {s.mutual && <span className="saved-mutual-badge">💞 Mutual</span>}
                  </div>
                  {s.bio && <div className="saved-bio">{s.bio}</div>}
                  {s.vibes && <div className="saved-vibes">{s.vibes}</div>}
                  <div className="saved-when">Saved {timeAgo(s.saved_at)}</div>
                </div>
                <button className="saved-remove" onClick={() => remove(s.user_id)} title="Remove">
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function timeAgo(ts: number): string {
  const d = Date.now() - ts;
  if (d < 60_000) return 'just now';
  if (d < 3600_000) return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86400_000) return `${Math.floor(d / 3600_000)}h ago`;
  return `${Math.floor(d / 86400_000)}d ago`;
}
