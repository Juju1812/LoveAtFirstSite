import { useState } from 'react';
import { Confetti } from './Confetti';
import type { Profile } from '../profile';

interface Props {
  chemistry: number;
  peerProfile: Profile | null;
  myProfile: Profile | null;
  peerContact: string | null;
  hasSentContact: boolean;
  onShareContact: (contact: string) => void;
  onContinue: () => void;
  onLeave: () => void;
}

export function MatchedOverlay({
  chemistry,
  peerProfile,
  myProfile,
  peerContact,
  hasSentContact,
  onShareContact,
  onContinue,
  onLeave
}: Props) {
  const [contact, setContact] = useState('');

  function submitContact(e: React.FormEvent) {
    e.preventDefault();
    const c = contact.trim();
    if (!c) return;
    onShareContact(c);
    setContact('');
  }

  const hasPeerProfile = !!(peerProfile?.name || peerProfile?.bio || peerProfile?.photo);

  return (
    <div className="matched-overlay">
      <Confetti />
      <div className="matched-card">
        <div className="matched-title">It's a match! 💞</div>
        <div className="matched-sub">Chemistry locked in at <strong>{Math.round(chemistry)}%</strong></div>

        {hasPeerProfile ? (
          <div className="profile-card">
            <div className="profile-card-header">
              {peerProfile?.photo ? (
                <img className="profile-card-photo" src={peerProfile.photo} alt={peerProfile.name ?? 'their photo'} />
              ) : (
                <div className="profile-card-photo profile-card-photo-empty">👤</div>
              )}
              <div className="profile-card-id">
                <div className="profile-card-name">
                  {peerProfile?.name || 'Anonymous'}
                  {peerProfile?.age && <span className="profile-card-age">, {peerProfile.age}</span>}
                </div>
                {peerProfile?.vibes && <div className="profile-card-vibes">{peerProfile.vibes}</div>}
              </div>
            </div>
            {peerProfile?.bio && <div className="profile-card-bio">{peerProfile.bio}</div>}
            {peerProfile?.contact && (
              <div className="profile-card-contact">
                <span>📬</span> {peerProfile.contact}
              </div>
            )}
          </div>
        ) : (
          <div className="profile-card profile-card-empty">
            <div className="profile-card-empty-icon">👻</div>
            <div className="profile-card-empty-text">
              They didn't share a profile. Use the chat or contact field below to keep talking.
            </div>
          </div>
        )}

        <div className="matched-section-divider" />

        {!peerContact ? (
          !hasSentContact ? (
            <form className="contact-form" onSubmit={submitContact}>
              <label>Share a way to keep talking (optional)</label>
              <input
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="@instagram, phone, email…"
                maxLength={120}
              />
              <button type="submit" disabled={!contact.trim()}>Send to them</button>
            </form>
          ) : (
            <div className="contact-shared">Contact sent ✓ — waiting for theirs…</div>
          )
        ) : (
          <div className="peer-contact">
            <div className="peer-contact-label">They sent you</div>
            <div className="peer-contact-value">{peerContact}</div>
            {!hasSentContact && (
              <form className="contact-form contact-form-tight" onSubmit={submitContact}>
                <input
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="Send them yours back…"
                  maxLength={120}
                />
                <button type="submit" disabled={!contact.trim()}>Send</button>
              </form>
            )}
          </div>
        )}

        <div className="matched-actions">
          <button className="matched-continue" onClick={onContinue}>Keep talking</button>
          <button className="matched-leave" onClick={onLeave}>End & find another</button>
        </div>

        {!myProfile?.name && !myProfile?.bio && (
          <div className="matched-tip">
            💡 You haven't made a profile yet — they couldn't see one. Make one for next time.
          </div>
        )}
      </div>
    </div>
  );
}
