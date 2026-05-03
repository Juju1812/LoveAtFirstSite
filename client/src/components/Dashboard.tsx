import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { TOPICS, hasMeaningfulProfile } from '../profile';
import {
  listSaved, listConversations, listEvents, getInsights,
  type SavedConnection, type ConversationSummary, type DatingEvent, type InsightsSummary
} from '../api';

interface Props {
  onStart: (topic: string) => void;
}

export function Dashboard({ onStart }: Props) {
  const { user, profile, logout } = useAuth();
  const navigate = useNavigate();
  const [topic, setTopic] = useState<string>('any');
  const [savedCount, setSavedCount] = useState(0);
  const [savedMutual, setSavedMutual] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [upcomingEvents, setUpcomingEvents] = useState<DatingEvent[]>([]);
  const [insights, setInsights] = useState<InsightsSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (user) {
      Promise.all([
        listSaved().then(({ saved }) => { if (!cancelled) {
          setSavedCount(saved.length);
          setSavedMutual(saved.filter((s: SavedConnection) => s.mutual).length);
        }}).catch(() => {}),
        listConversations().then(({ conversations }) => {
          if (!cancelled) setUnreadCount(conversations.filter((c: ConversationSummary) => c.unread).length);
        }).catch(() => {}),
        getInsights().then(({ summary }) => { if (!cancelled) setInsights(summary); }).catch(() => {})
      ]);
    }
    listEvents().then(({ events }) => { if (!cancelled) setUpcomingEvents(events.slice(0, 3)); }).catch(() => {});
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
          <Link to="/messages" className="dash-nav-link">
            Messages {unreadCount > 0 && <span className="dash-nav-badge">{unreadCount}</span>}
          </Link>
          <Link to="/events" className="dash-nav-link">Events</Link>
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

        {upcomingEvents.length > 0 && (
          <section className="dash-card">
            <div className="dash-card-header-row">
              <div>
                <div className="dash-section-eyebrow">Upcoming events</div>
                <div className="dash-card-title">Themed nights worth showing up for</div>
              </div>
              <Link to="/events" className="dash-link-arrow">See all →</Link>
            </div>
            <ul className="dash-event-mini-list">
              {upcomingEvents.map(ev => (
                <li key={ev.id} className="dash-event-mini">
                  <div className="dash-event-mini-meta">
                    <div className="dash-event-mini-name">{ev.name}</div>
                    <div className="dash-event-mini-when">{formatEventWhen(ev.starts_at)}</div>
                  </div>
                  <div className="dash-event-mini-status">
                    {ev.rsvpd ? <span className="dash-event-rsvpd">✓ Going</span> : <span className="dash-event-count">{ev.rsvp_count} going</span>}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {insights && insights.total_calls >= 3 && (
          <section className="dash-card">
            <div className="dash-section-eyebrow">Your insights</div>
            <div className="dash-card-title">After {insights.total_calls} calls — here's your read</div>
            <div className="insights-grid">
              <div className="insight-stat">
                <div className="insight-stat-value">{insights.avg_chemistry}%</div>
                <div className="insight-stat-label">Avg chemistry</div>
              </div>
              <div className="insight-stat">
                <div className="insight-stat-value">{insights.avg_peak}%</div>
                <div className="insight-stat-label">Avg peak</div>
              </div>
              <div className="insight-stat">
                <div className="insight-stat-value">{insights.match_rate_pct}%</div>
                <div className="insight-stat-label">Match rate</div>
              </div>
              {insights.best_topic && (
                <div className="insight-stat insight-stat-wide">
                  <div className="insight-stat-value insight-best-topic">{insights.best_topic}</div>
                  <div className="insight-stat-label">Your best topic ({insights.best_topic_avg}% avg)</div>
                </div>
              )}
            </div>
          </section>
        )}

        <div className="dash-footer-link">
          New here? <Link to="/about">See how Glimpse works →</Link>
        </div>
      </main>
    </div>
  );
}

function formatEventWhen(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return `Today · ${time}`;
  if (isTomorrow) return `Tomorrow · ${time}`;
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) + ` · ${time}`;
}
