import { useEffect, useState } from 'react';
import { getPushPublicKey, registerPushSubscription, unregisterPushSubscription } from '../api';

type Status = 'unsupported' | 'denied' | 'unsubscribed' | 'subscribed' | 'loading' | 'unconfigured';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  // Allocate a fresh ArrayBuffer so the resulting view is typed as
  // Uint8Array<ArrayBuffer> (not SharedArrayBuffer) — keeps PushManager.subscribe
  // happy in strict TS lib targets.
  const buf = new ArrayBuffer(raw.length);
  const arr = new Uint8Array(buf);
  for (let i = 0; i < raw.length; ++i) arr[i] = raw.charCodeAt(i);
  return arr;
}

/**
 * Settings tile that toggles push notifications for the signed-in user.
 *
 * Shows different states:
 *   - unsupported: browser/device can't do push
 *   - unconfigured: server didn't return a VAPID key (no env var set)
 *   - denied: user has blocked notifications system-wide
 *   - unsubscribed: ready to opt in
 *   - subscribed: opted in
 */
export function NotificationToggle() {
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        if (!cancelled) setStatus('unsupported');
        return;
      }
      try {
        const { publicKey: key } = await getPushPublicKey();
        if (cancelled) return;
        if (!key) {
          setStatus('unconfigured');
          return;
        }
        setPublicKey(key);
        if (Notification.permission === 'denied') {
          setStatus('denied');
          return;
        }
        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        if (existing) {
          setEndpoint(existing.endpoint);
          setStatus('subscribed');
        } else {
          setStatus('unsubscribed');
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? 'Could not check notification status');
        if (!cancelled) setStatus('unsubscribed');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function subscribe() {
    setError(null);
    if (!publicKey) return;
    try {
      const perm = await Notification.requestPermission();
      if (perm === 'denied') { setStatus('denied'); return; }
      if (perm !== 'granted') return;
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource
      });
      const json = sub.toJSON();
      await registerPushSubscription(json);
      setEndpoint(sub.endpoint);
      setStatus('subscribed');
    } catch (err: any) {
      setError(err?.message ?? 'Could not enable notifications');
    }
  }

  async function unsubscribe() {
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        await existing.unsubscribe();
        try { await unregisterPushSubscription(existing.endpoint); } catch { /* noop */ }
      }
      setEndpoint(null);
      setStatus('unsubscribed');
    } catch (err: any) {
      setError(err?.message ?? 'Could not disable notifications');
    }
  }

  let content: React.ReactNode;
  if (status === 'unsupported') {
    content = <div className="settings-fineprint">This browser doesn't support push notifications.</div>;
  } else if (status === 'unconfigured') {
    content = <div className="settings-fineprint">Push notifications aren't configured on this server yet.</div>;
  } else if (status === 'denied') {
    content = <div className="settings-fineprint">Notifications are blocked in your browser settings. Enable them there to subscribe.</div>;
  } else if (status === 'subscribed') {
    content = (
      <div className="notif-row">
        <span className="verify-badge verify-badge-on">🔔 Notifications on</span>
        <button className="settings-secondary-btn" onClick={unsubscribe}>Turn off</button>
      </div>
    );
  } else if (status === 'unsubscribed') {
    content = (
      <div className="notif-row">
        <span className="verify-badge verify-badge-off">Off</span>
        <button className="settings-save-btn" onClick={subscribe}>Enable notifications</button>
      </div>
    );
  } else {
    content = <div className="settings-fineprint">Checking…</div>;
  }

  return (
    <div>
      {content}
      {error && <div className="auth-error" style={{ marginTop: 10 }}>{error}</div>}
    </div>
  );
}
