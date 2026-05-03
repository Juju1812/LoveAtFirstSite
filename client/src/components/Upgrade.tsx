import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { startCheckout, openBillingPortal } from '../api';

export function Upgrade() {
  const { user, refresh } = useAuth();
  const [params] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSucceeded, setJustSucceeded] = useState(false);

  // After Stripe redirects back with status=success, refresh the user state
  useEffect(() => {
    if (params.get('status') === 'success') {
      setJustSucceeded(true);
      // Subscription state arrives via webhook — give it a moment, then refresh
      const id = setTimeout(() => { refresh().catch(() => {}); }, 1500);
      return () => clearTimeout(id);
    }
  }, [params, refresh]);

  async function handleSubscribe() {
    setLoading(true); setError(null);
    try {
      const { url } = await startCheckout();
      window.location.href = url;
    } catch (err: any) {
      setError(err.message ?? 'Could not start checkout');
      setLoading(false);
    }
  }

  async function handleManage() {
    setLoading(true); setError(null);
    try {
      const { url } = await openBillingPortal();
      window.location.href = url;
    } catch (err: any) {
      setError(err.message ?? 'Could not open billing portal');
      setLoading(false);
    }
  }

  const premium = user?.premium;

  return (
    <div className="dash-panel">
      <div className="dash-panel-header">
        <div>
          <div className="dash-panel-eyebrow">Upgrade</div>
          <h1 className="dash-panel-title">Glimpse<span className="upgrade-plus">+</span></h1>
          <p className="dash-panel-sub">A small upgrade. A noticeably better experience.</p>
        </div>
      </div>

      {justSucceeded && (
        <div className="upgrade-success">
          🎉 Welcome to Glimpse+. Your perks are active.
        </div>
      )}

      {params.get('status') === 'cancelled' && (
        <div className="settings-note">No worries — checkout cancelled, no charge.</div>
      )}

      <div className="upgrade-card">
        <div className="upgrade-price">
          <span className="upgrade-amount">$9.99</span>
          <span className="upgrade-period">/month</span>
        </div>
        <p className="upgrade-tag">Cancel anytime. Renews monthly.</p>

        <ul className="upgrade-perks">
          <li>
            <span className="upgrade-perk-icon">✨</span>
            <div>
              <div className="upgrade-perk-title">Premium badge</div>
              <div className="upgrade-perk-body">Show up with a verified pink ✨ on your profile.</div>
            </div>
          </li>
          <li>
            <span className="upgrade-perk-icon">🚀</span>
            <div>
              <div className="upgrade-perk-title">Priority queue</div>
              <div className="upgrade-perk-body">Jump to the front of the matching line — paired first when you tap Find a match.</div>
            </div>
          </li>
          <li>
            <span className="upgrade-perk-icon">↩️</span>
            <div>
              <div className="upgrade-perk-title">Replay your last pass</div>
              <div className="upgrade-perk-body">Changed your mind? Undo your most recent ✕ within 24 hours. If they liked you, instant match.</div>
            </div>
          </li>
          <li>
            <span className="upgrade-perk-icon">🧠</span>
            <div>
              <div className="upgrade-perk-title">Unlimited AI coach</div>
              <div className="upgrade-perk-body">No rate limit on real-time conversation tips during calls.</div>
            </div>
          </li>
        </ul>

        {!user ? (
          <div className="upgrade-cta-row">
            <Link to="/login" className="upgrade-cta-secondary">Sign in</Link>
            <Link to="/signup" className="upgrade-cta-primary">Sign up to subscribe</Link>
          </div>
        ) : premium ? (
          <div className="upgrade-cta-row">
            <div className="upgrade-already-on">✓ You're on Glimpse+. Thank you.</div>
            <button className="upgrade-cta-secondary" onClick={handleManage} disabled={loading}>
              {loading ? '…' : 'Manage subscription'}
            </button>
          </div>
        ) : (
          <button className="upgrade-cta-primary upgrade-cta-full" onClick={handleSubscribe} disabled={loading}>
            {loading ? 'Redirecting to checkout…' : 'Subscribe — $9.99/mo'}
          </button>
        )}

        {error && <div className="auth-error" style={{ marginTop: 16 }}>{error}</div>}
      </div>

      <p className="upgrade-fineprint">
        Secure payment via Stripe. Cancel any time from <strong>Settings → Manage subscription</strong>.
      </p>
    </div>
  );
}
