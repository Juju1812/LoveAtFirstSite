import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { listEvents, rsvpToEvent, unrsvpFromEvent, type DatingEvent } from '../api';

export function Events() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [events, setEvents] = useState<DatingEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    listEvents()
      .then(({ events }) => { if (!cancelled) setEvents(events); })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, []);

  async function toggle(ev: DatingEvent) {
    if (!user) { navigate('/login'); return; }
    setBusyId(ev.id);
    try {
      if (ev.rsvpd) await unrsvpFromEvent(ev.id);
      else await rsvpToEvent(ev.id);
      const { events: refreshed } = await listEvents();
      setEvents(refreshed);
    } catch (e: any) {
      setError(e.message ?? 'Failed');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="settings-page">
      <header className="settings-nav">
        <Link to="/" className="settings-back">← Home</Link>
        <h1>Events</h1>
      </header>
      <main className="settings-main">
        <p className="events-intro">
          Scheduled rooms — match only with people who RSVP'd to the same event during the time window.
          Better than random matching at 2am.
        </p>
        {error && <div className="auth-error">{error}</div>}
        {events == null ? (
          <div className="saved-empty"><p>Loading…</p></div>
        ) : events.length === 0 ? (
          <div className="saved-empty">
            <div className="saved-empty-icon">📆</div>
            <h2>No events scheduled</h2>
            <p>Check back soon — we run themed nights weekly.</p>
          </div>
        ) : (
          <ul className="event-list">
            {events.map(ev => {
              const live = Date.now() >= ev.starts_at && Date.now() < ev.ends_at;
              return (
                <li key={ev.id} className={`event-card ${live ? 'event-live' : ''}`}>
                  <div className="event-when">
                    {live ? <span className="event-live-pill">● LIVE NOW</span> : formatDate(ev.starts_at)}
                  </div>
                  <div className="event-title">{ev.name}</div>
                  {ev.description && <div className="event-desc">{ev.description}</div>}
                  <div className="event-meta">
                    {ev.topic && <span className="event-tag">{ev.topic}</span>}
                    {(ev.age_min || ev.age_max) && (
                      <span className="event-tag">{ev.age_min ?? '?'}–{ev.age_max ?? '?'}</span>
                    )}
                    <span className="event-tag event-tag-count">{ev.rsvp_count} going</span>
                  </div>
                  <button
                    className={`event-rsvp-btn ${ev.rsvpd ? 'event-rsvp-on' : ''}`}
                    onClick={() => toggle(ev)}
                    disabled={busyId === ev.id}
                  >
                    {ev.rsvpd ? '✓ You\'re in' : 'RSVP'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return `Today · ${time}`;
  if (isTomorrow) return `Tomorrow · ${time}`;
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' }) + ` · ${time}`;
}
