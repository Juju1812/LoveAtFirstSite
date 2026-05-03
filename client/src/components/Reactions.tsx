import { useEffect, useState } from 'react';

const PALETTE = ['❤️', '😂', '🔥', '👀', '🥰', '🤯'];

interface Props {
  onSend: (emoji: string) => void;
  /** Trigger an incoming-reaction animation (called when peer sends one) */
  registerIncoming?: (handler: (emoji: string) => void) => void;
  disabled?: boolean;
}

interface Floater {
  id: number;
  emoji: string;
  left: number;
  drift: number;
  duration: number;
  size: number;
}

export function Reactions({ onSend, registerIncoming, disabled }: Props) {
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [open, setOpen] = useState(false);

  // Hook: parent calls registerIncoming(handler) once. Handler drops a floater.
  useEffect(() => {
    if (!registerIncoming) return;
    registerIncoming((emoji: string) => spawn(emoji, 'left'));
  }, [registerIncoming]);

  function spawn(emoji: string, side: 'self' | 'left' = 'self') {
    const id = Date.now() + Math.random();
    const left = side === 'self'
      ? 50 + (Math.random() - 0.5) * 18
      : 25 + (Math.random() - 0.5) * 30;
    const drift = (Math.random() - 0.5) * 60;
    const duration = 2400 + Math.random() * 800;
    const size = 38 + Math.floor(Math.random() * 16);
    setFloaters(prev => [...prev, { id, emoji, left, drift, duration, size }]);
    setTimeout(() => {
      setFloaters(prev => prev.filter(f => f.id !== id));
    }, duration + 200);
  }

  function handlePick(emoji: string) {
    if (disabled) return;
    spawn(emoji, 'self');
    onSend(emoji);
    setOpen(false);
  }

  return (
    <>
      <div className="reactions-floaters" aria-hidden>
        {floaters.map(f => (
          <span
            key={f.id}
            className="reaction-floater"
            style={{
              left: `${f.left}%`,
              fontSize: `${f.size}px`,
              animationDuration: `${f.duration}ms`,
              ['--drift' as any]: `${f.drift}px`
            }}
          >
            {f.emoji}
          </span>
        ))}
      </div>

      <div className={`reactions-tray ${open ? 'open' : ''}`}>
        {open && (
          <div className="reactions-palette">
            {PALETTE.map(em => (
              <button
                key={em}
                type="button"
                className="reaction-emoji"
                onClick={() => handlePick(em)}
                disabled={disabled}
              >
                {em}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          className={`reactions-toggle ${open ? 'is-open' : ''}`}
          onClick={() => setOpen(o => !o)}
          disabled={disabled}
          title="Send a reaction"
        >
          {open ? '✕' : '😀'}
        </button>
      </div>
    </>
  );
}
