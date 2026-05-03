import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { listLikes, likeBack, dismissLike, unlikeUser, type LikesResponse, type LikeEntry } from '../api';

type Tab = 'received' | 'mutual' | 'given';

export function Likes() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<LikesResponse | null>(null);
  const [tab, setTab] = useState<Tab>('received');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    listLikes()
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [user]);

  if (!user) {
    return (
      <div className="dash-panel">
        <div className="dash-panel-header">
          <div>
            <div className="dash-panel-eyebrow">Likes</div>
            <h1 className="dash-panel-title">See who liked you</h1>
            <p className="dash-panel-sub">Sign in to see who liked you and like them back.</p>
          </div>
        </div>
        <div className="saved-empty">
          <div className="saved-empty-icon">🔒</div>
          <div className="settings-actions">
            <Link to="/login" className="settings-secondary-btn">Sign in</Link>
            <Link to="/signup" className="settings-save-btn">Create account</Link>
          </div>
        </div>
      </div>
    );
  }

  const reload = async () => {
    try { setData(await listLikes()); } catch (e: any) { setError(e.message); }
  };

  async function handleLikeBack(userId: number) {
    setBusyId(userId);
    try {
      const { conversationId } = await likeBack(userId);
      if (conversationId) navigate(`/messages/${conversationId}`);
      else await reload();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDismiss(userId: number) {
    setBusyId(userId);
    try {
      await dismissLike(userId);
      await reload();
    } catch (e: any) { setError(e.message); }
    finally { setBusyId(null); }
  }

  async function handleUnlike(userId: number) {
    if (!confirm('Take back your like?')) return;
    setBusyId(userId);
    try {
      await unlikeUser(userId);
      await reload();
    } catch (e: any) { setError(e.message); }
    finally { setBusyId(null); }
  }

  const tabs: Array<{ id: Tab; label: string; count: number }> = [
    { id: 'received', label: 'Liked you', count: data?.received_only.length ?? 0 },
    { id: 'mutual',   label: 'Mutual', count: data?.mutual.length ?? 0 },
    { id: 'given',    label: 'You liked', count: data?.given_only.length ?? 0 }
  ];

  const list: LikeEntry[] = data
    ? (tab === 'received' ? data.received_only
       : tab === 'mutual' ? data.mutual
       : data.given_only)
    : [];

  return (
    <div className="dash-panel">
      <div className="dash-panel-header">
        <div>
          <div className="dash-panel-eyebrow">Likes</div>
          <h1 className="dash-panel-title">
            {tab === 'received' ? 'These people liked you'
              : tab === 'mutual' ? 'It was mutual'
              : "Waiting on them"}
          </h1>
          <p className="dash-panel-sub">
            {tab === 'received'
              ? "Like them back and a conversation opens automatically."
              : tab === 'mutual'
              ? "You both swiped right. Keep talking in Messages."
              : "You liked them — they haven't swiped on you yet."}
          </p>
        </div>
      </div>

      <div className="like-tabs">
        {tabs.map(t => (
          <button
            key={t.id}
            className={`like-tab ${tab === t.id ? 'like-tab-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}{t.count > 0 && <span className="like-tab-count">{t.count}</span>}
          </button>
        ))}
      </div>

      {error && <div className="auth-error">{error}</div>}

      {data == null ? (
        <div className="saved-empty"><p>Loading…</p></div>
      ) : list.length === 0 ? (
        <div className="saved-empty">
          <div className="saved-empty-icon">{tab === 'received' ? '👀' : tab === 'mutual' ? '💞' : '⏳'}</div>
          <h2>
            {tab === 'received' ? 'Nobody yet'
              : tab === 'mutual' ? 'No mutual matches yet'
              : "You haven't liked anyone"}
          </h2>
          <p>
            {tab === 'received' ? 'When someone swipes right on you in a call, they\'ll show up here.'
              : tab === 'mutual' ? 'Match someone to see them here.'
              : 'Hit the heart in a call after the timer unlocks.'}
          </p>
        </div>
      ) : (
        <ul className="likes-grid">
          {list.map(l => (
            <LikeCard
              key={l.user_id}
              entry={l}
              tab={tab}
              busy={busyId === l.user_id}
              onLikeBack={() => handleLikeBack(l.user_id)}
              onDismiss={() => handleDismiss(l.user_id)}
              onUnlike={() => handleUnlike(l.user_id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function LikeCard({
  entry, tab, busy, onLikeBack, onDismiss, onUnlike
}: {
  entry: LikeEntry; tab: Tab; busy: boolean;
  onLikeBack: () => void; onDismiss: () => void; onUnlike: () => void;
}) {
  return (
    <li className="like-card">
      {entry.photo
        ? <img src={entry.photo} alt="" className="like-photo" />
        : <div className="like-photo like-photo-empty">👤</div>}
      <div className="like-meta">
        <div className="like-name">
          {entry.name || 'Anonymous'}
          {entry.age ? <span className="like-age">, {entry.age}</span> : null}
          {entry.chemistry ? <span className="like-chem">💘 {entry.chemistry}%</span> : null}
        </div>
        {entry.bio && <div className="like-bio">{entry.bio}</div>}
        {entry.vibes && <div className="like-vibes">✨ {entry.vibes}</div>}
        {entry.topic && <div className="like-topic">{entry.topic}</div>}
      </div>
      <div className="like-actions">
        {tab === 'received' && (
          <>
            <button className="like-back-btn" onClick={onLikeBack} disabled={busy}>
              ♥ Like back
            </button>
            <button className="like-dismiss-btn" onClick={onDismiss} disabled={busy}>
              ✕
            </button>
          </>
        )}
        {tab === 'mutual' && (
          <Link to={`/messages`} className="like-message-btn">💬 Message</Link>
        )}
        {tab === 'given' && (
          <button className="like-dismiss-btn" onClick={onUnlike} disabled={busy} title="Take back like">
            Undo
          </button>
        )}
      </div>
    </li>
  );
}
