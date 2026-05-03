import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { openBillingPortal, requestVerification } from '../api';
import { ReactionStackEditor } from './ReactionStackEditor';
import { VerifyModal } from './VerifyModal';
import { NotificationToggle } from './NotificationToggle';
import { type Profile } from '../profile';

export function Settings() {
  const { user, profile, setProfile, refresh } = useAuth();
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [verifyOpen, setVerifyOpen] = useState(false);

  async function manageSubscription() {
    setBillingBusy(true); setBillingError(null);
    try {
      const { url } = await openBillingPortal();
      window.location.href = url;
    } catch (err: any) {
      setBillingError(err.message ?? 'Could not open billing portal');
      setBillingBusy(false);
    }
  }

  return (
    <div className="dash-panel">
      <div className="dash-panel-header">
        <div>
          <div className="dash-panel-eyebrow">Settings</div>
          <h1 className="dash-panel-title">Account</h1>
          <p className="dash-panel-sub">{user ? `Signed in as ${user.email}` : 'You are not signed in.'}</p>
        </div>
      </div>

      {!user && (
        <div className="settings-section">
          <div className="settings-section-header">
            <h2>Sign in</h2>
            <p>Profile, preferences, likes, and messages all sync to your account.</p>
          </div>
          <div className="settings-actions">
            <Link to="/login" className="settings-secondary-btn">Sign in</Link>
            <Link to="/signup" className="settings-save-btn">Create account</Link>
          </div>
        </div>
      )}

      {/* Subscription */}
      {user && (
        <div className="settings-section">
          <div className="settings-section-header">
            <h2>Subscription {user.premium && <span className="verify-badge verify-badge-on" style={{ marginLeft: 8, verticalAlign: 'middle' }}>✨ Glimpse+</span>}</h2>
            <p>{user.premium
              ? 'You\'re on Glimpse+. Manage your plan, payment method, or cancel anytime.'
              : 'Get Glimpse+ for priority matching, replay, unlimited AI coach, and the premium badge.'}</p>
          </div>
          {billingError && <div className="auth-error">{billingError}</div>}
          {user.premium ? (
            <button className="settings-secondary-btn" onClick={manageSubscription} disabled={billingBusy} style={{ cursor: 'pointer' }}>
              {billingBusy ? 'Opening…' : 'Manage subscription'}
            </button>
          ) : (
            <Link to="/upgrade" className="settings-save-btn">Get Glimpse+</Link>
          )}
        </div>
      )}

      {/* Reaction stack */}
      <div className="settings-section">
        <div className="settings-section-header">
          <h2>Reactions</h2>
          <p>Pick the emojis that show up in your in-call reaction tray. Glimpse+ members can also upload their own images.</p>
        </div>
        <ReactionStackEditor
          initialEmojis={profile?.reaction_emojis ?? []}
          initialCustom={profile?.custom_reactions ?? []}
          isPremium={!!user?.premium}
          onSave={async ({ reaction_emojis, custom_reactions }) => {
            const updated: Profile = {
              ...(profile ?? {}),
              reaction_emojis,
              custom_reactions
            };
            await setProfile(updated);
          }}
        />
      </div>

      {/* Identity verification (optional) */}
      <div className="settings-section">
        <div className="settings-section-header">
          <h2>Identity verification</h2>
          <p>Optional. Take a quick selfie — we check it's a real face and (if you have a primary photo) that it matches you. Verified profiles get a badge.</p>
        </div>
        <div className="verify-row">
          <div className="verify-status">
            {profile?.verified ? (
              <span className="verify-badge verify-badge-on">✓ Verified</span>
            ) : (
              <span className="verify-badge verify-badge-off">Not verified</span>
            )}
          </div>
          <button
            className="settings-edit-btn"
            disabled={!user}
            onClick={() => setVerifyOpen(true)}
            style={{ cursor: user ? 'pointer' : 'not-allowed' }}
          >
            {profile?.verified ? 'Re-verify' : 'Verify now'}
          </button>
        </div>
        <div className="settings-fineprint">
          Runs entirely in your browser. We only store the pass/fail outcome — never the selfie itself.
        </div>
      </div>

      {/* Push notifications */}
      {user && (
        <div className="settings-section">
          <div className="settings-section-header">
            <h2>Notifications</h2>
            <p>Get a push when someone likes you, you get a mutual match, or a message arrives.</p>
          </div>
          <NotificationToggle />
        </div>
      )}

      {verifyOpen && (
        <VerifyModal
          profile={profile}
          onClose={() => setVerifyOpen(false)}
          onVerified={async () => {
            try {
              await requestVerification();
              await refresh();
            } catch (err) {
              console.warn('Server-side verification flag failed', err);
            }
          }}
        />
      )}

      <div className="settings-section">
        <div className="settings-section-header">
          <h2>About</h2>
          <p>How Glimpse works, what we don't store, and the philosophy behind the 2-minute timer.</p>
        </div>
        <div className="settings-actions">
          <Link to="/about" className="settings-secondary-btn">Read the manifesto →</Link>
        </div>
      </div>
    </div>
  );
}
