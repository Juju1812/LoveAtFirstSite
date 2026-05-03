import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { TOPICS, hasMeaningfulProfile } from '../profile';
import {
  listEvents, getInsights, listLikes,
  type DatingEvent, type InsightsSummary
} from '../api';

interface Props {
  onStart: (topic: string) => void;
}

export function Dashboard({ onStart }: Props) {
  const { user, profile } = useAuth();
  const [topic, setTopic] = useState<string>('any');
  const [upcomingEvents, setUpcomingEvents] = useState<DatingEvent[]>([]);
  const [insights, setInsights] = useState<InsightsSummary | null>(null);
  const [likeCount, setLikeCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listEvents().then(({ events }) => { if (!cancelled) setUpcomingEvents(events.slice(0, 3)); }).catch(() => {});
    if (user) {
      getInsights().then(({ summary }) => { if (!cancelled) setInsights(summary); }).catch(() => {});
      listLikes().then((l) => {
        if (!cancelled) setLikeCount(l.received_only.length + l.mutual.length);
      }).catch(() => {});
    }
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
    <div className="dash-panel">
      <div className="dash-panel-header dash-hero-header">
        <div>
          <div className="dash-greeting">
            {greeting}{profile?.name ? `, ${profile.name}` : ''}.
          </div>
          <h1 className="dash-panel-title dash-hero-title">Who do you want to meet today?</h1>
        </div>
        {likeCount > 0 && user && (
          <Link to="/likes" className="dash-like-pill">
            <span className="dash-like-pill-icon">❤️</span>
            <span><strong>{likeCount}</strong> {likeCount === 1 ? 'person' : 'people'} liked you</span>
          </Link>
        )}
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

      {!profileComplete && (
        <section className="dash-card dash-profile-nudge">
          <div className="dash-card-icon">👤</div>
          <div className="dash-card-title">Make a profile</div>
          <div className="dash-card-body">
            People you match with will see who you are. Optional — but recommended.
          </div>
          <Link to="/profile" className="dash-link-btn">Create profile →</Link>
        </section>
      )}

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
