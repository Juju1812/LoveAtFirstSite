import { useEffect, useState } from 'react';

interface Props {
  /** Latest caption arriving from the peer. New `at` triggers display. */
  caption: { text: string; at: number } | null;
  /** Whether the user has captions enabled — we still receive them either way. */
  enabled: boolean;
}

const HOLD_MS = 4500;       // keep a caption on screen this long
const FADE_MS = 600;        // and then fade for this long

/**
 * Bottom-of-screen captions overlay. Shows the most recent peer caption,
 * automatically clears after HOLD_MS. Premium-only — App.tsx gates the
 * toggle, but receiving still works in case the user upgrades mid-call.
 */
export function CaptionsOverlay({ caption, enabled }: Props) {
  const [visible, setVisible] = useState(false);
  const [shown, setShown] = useState<{ text: string; at: number } | null>(null);

  useEffect(() => {
    if (!caption) return;
    setShown(caption);
    setVisible(true);
    const id = window.setTimeout(() => setVisible(false), HOLD_MS);
    return () => window.clearTimeout(id);
  }, [caption?.at, caption]);

  if (!enabled || !shown) return null;

  return (
    <div
      className={`captions-overlay ${visible ? 'is-visible' : ''}`}
      style={{ transition: `opacity ${FADE_MS}ms ease, transform ${FADE_MS}ms ease` }}
      aria-live="polite"
    >
      <div className="captions-text">{shown.text}</div>
    </div>
  );
}
