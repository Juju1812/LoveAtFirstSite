import { useState } from 'react';
import { Confetti } from './Confetti';

interface Props {
  chemistry: number;
  peerContact: string | null;
  onShareContact: (contact: string) => void;
  onLeave: () => void;
}

export function MatchedOverlay({ chemistry, peerContact, onShareContact, onLeave }: Props) {
  const [contact, setContact] = useState('');
  const [shared, setShared] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const c = contact.trim();
    if (!c) return;
    onShareContact(c);
    setShared(true);
  }

  return (
    <div className="matched-overlay">
      <Confetti />
      <div className="matched-card">
        <div className="matched-title">It's a match! 💞</div>
        <div className="matched-sub">Chemistry locked in at <strong>{Math.round(chemistry)}%</strong></div>

        {!shared ? (
          <form className="contact-form" onSubmit={submit}>
            <label>Share a way to keep talking</label>
            <input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="@instagram, phone, email…"
              maxLength={120}
              autoFocus
            />
            <button type="submit" disabled={!contact.trim()}>Send to them</button>
          </form>
        ) : (
          <div className="contact-shared">Sent ✓</div>
        )}

        {peerContact && (
          <div className="peer-contact">
            <div className="peer-contact-label">Their contact</div>
            <div className="peer-contact-value">{peerContact}</div>
          </div>
        )}

        <button className="leave-btn" onClick={onLeave}>End & find another</button>
      </div>
    </div>
  );
}
