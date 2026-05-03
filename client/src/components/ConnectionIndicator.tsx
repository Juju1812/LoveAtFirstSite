import type { ConnectionQuality } from '../useWebRTC';

interface Props {
  quality: ConnectionQuality;
  rttMs: number | null;
}

const LABELS: Record<ConnectionQuality, string> = {
  good: 'Good connection',
  ok: 'Ok connection',
  poor: 'Poor connection',
  lost: 'Reconnecting…',
  unknown: 'Connecting…'
};

/**
 * Tiny WiFi-style indicator shown in the call topbar. 3 bars colored by
 * `quality`. Tooltip surfaces label + RTT for debugging.
 */
export function ConnectionIndicator({ quality, rttMs }: Props) {
  const filled =
    quality === 'good' ? 3 :
    quality === 'ok' ? 2 :
    quality === 'poor' ? 1 : 0;

  const title = rttMs != null
    ? `${LABELS[quality]} · ${rttMs}ms`
    : LABELS[quality];

  return (
    <div className={`conn-ind conn-ind-${quality}`} title={title} aria-label={title}>
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className={`conn-bar ${i < filled ? 'conn-bar-on' : ''}`}
        />
      ))}
    </div>
  );
}
