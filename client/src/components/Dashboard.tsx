import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { TOPICS, hasMeaningfulProfile } from '../profile';
import { listSaved, type SavedConnection } from '../api';

interface Props {
  onStart: (topic: string) => void;
}

export function Dashboard({ onStart }: Props) {
  const { user, profile, logout } = useAuth();
  const navigate = useNavigate();
  const [topic, setTopic] = useState<string>('any');
  const [savedCount, setSavedCount] = useState(0);
  const [savedMutual, setSavedMutual] = useState(0);

  // Load saved-connections summary if logged in
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    listSaved()
      .then(({ saved }) => {
        if (cancelled) return;
        setSavedCount(saved.length);
        setSavedMutual(saved.filter((s: SavedConnection) => s.mutual).length);
      })
      .catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, [user]);

  const profileComplete = hasMeaningfulProfile(profile);
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  })();

  return (
    <div className="dashboard">
      <header className="dash-nav">
        <Link to="/" className="dash-logo">
          <span>👀</span><span className="dash-logo-text">Glimpse</span>
        </Link>
        <div className="dash-nav-actions">
          <Link to="/saved" className="dash-nav-link">Saved {savedMutual > 0 && <span className="dash-nav-badge">{savedMutual}</span>}</Link>
          <Link to="/settings" className="dash-nav-link">Settings</Link>
          {user ? (
            <div className="dash-nav-user">
              {profile?.photo
                ? <img src={profile.photo} alt="" className="dash-nav-pic" />
                : <span className="dash-nav-pic dash-nav-pic-empty">👤</span>}
              <span className="dash-nav-email">{user.email}</span>
              <button className="dash-nav-signout" onClick={logout}>Sign out</button>
            </div>
          ) : (
            <>
              <Link to="/login" className="dash-nav-link">Sign in</Link>
              <Link to="/signup" className="dash-nav-link dash-nav-link-strong">Sign up</Link>
            </>
          )}
        </div>
      </header>

      <main className="dash-main">
        <div className="dash-hero">
          <div className="dash-greeting">
            {greeting}{profile?.name ? `, ${profile.name}` : ''}.
          </div>
          <h1 className="dash-title">Who do you want to meet today?</h1>
        </div>

        <section className="dash-card dash-topic-card">
          <div className="dash-section-eyebrow">Pick your vibe</div>
          <div className="topic-grid">
            {TOPICS.map(t => (
              <button
                key={t.id}
                className={`topic-pill ${topic === t.id ? 'topic-pill-active' : ''}`}
                onClick={() => setTopic(t.id)}
                type="button"
              >
                <span className="topic-emoji">{t.emoji}</span>
                <span className="topic-label">{t.label}</span>
                <span className="topic-blurb">{t.blurb}</span>
              </button>
            ))}
          </div>
          <button className="dash-find-btn" onClick={() => onStart(topic)}>
            Find a match →
          </button>
        </section>

        <div className="dash-row">
          <Link to="/settings" className="dash-card dash-card-clickable">
            <div className="dash-card-icon">⚙️</div>
            <div className="dash-card-title">Match preferences</div>
            <div className="dash-card-body">
              {profile?.looking_for || profile?.age_min || profile?.age_max
                ? `${profile.looking_for || 'everyone'} · ${profile.age_min || '–'}–${profile.age_max || '–'}`
                : "Tell us who you're looking for."}
            </div>
          </Link>

          <Link to="/saved" className="dash-card dash-card-clickable">
            <div className="dash-card-icon">💗</div>
            <div className="dash-card-title">Saved connections</div>
            <div className="dash-card-body">
              {!user ? (
                <span>Sign in to save people for later.</span>
              ) : savedCount === 0 ? (
                <span>No saves yet. After a call, hit "Save" to revisit.</span>
              ) : savedMutual > 0 ? (
                <span><strong>{savedMutual}</strong> mutual save{savedMutual > 1 ? 's' : ''} · {savedCount} total</span>
              ) : (
                <span>{savedCount} saved · waiting for them to save you back</span>
              )}
            </div>
          </Link>

          <button
            className="dash-card dash-card-clickable"
            onClick={() => navigate('/settings#profile')}
            type="button"
          >
            <div className="dash-card-icon">👤</div>
            <div className="dash-card-title">{profileComplete ? 'Edit profile' : 'Create profile'}</div>
            <div className="dash-card-body">
              {profileComplete
                ? `Currently shown as: ${profile?.name || 'Anonymous'}${profile?.age ? `, ${profile.age}` : ''}`
                : 'Optional. Only people you match with see it.'}
            </div>
          </button>
        </div>

        <div className="dash-footer-link">
          New here? <Link to="/about">See how Glimpse works →</Link>
        </div>
      </main>
    </div>
  );
}
