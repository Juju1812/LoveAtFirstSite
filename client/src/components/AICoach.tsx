import { useEffect, useRef, useState } from 'react';
import { getCoachTip } from '../api';

interface Props {
  active: boolean;
  topic: string | null;
  secondsLeft: number;
  recentTranscripts: string[];
}

const POLL_MS = 18_000;     // request a new tip every ~18s
const SILENCE_MS = 8_000;   // or sooner if there's been silence this long
const MIN_TIP_DURATION = 12_000;

export function AICoach({ active, topic, secondsLeft, recentTranscripts }: Props) {
  const [tip, setTip] = useState<string | null>(null);
  const [tipShownAt, setTipShownAt] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const lastFetchRef = useRef(0);
  const lastSpeechRef = useRef(Date.now());

  // Track when speech last happened (for silence detection)
  useEffect(() => {
    if (recentTranscripts.length > 0) lastSpeechRef.current = Date.now();
  }, [recentTranscripts.length]);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(async () => {
      const now = Date.now();
      const sinceFetch = now - lastFetchRef.current;
      const sinceSpeech = now - lastSpeechRef.current;

      // Either: enough time has passed, OR there's been silence
      const shouldFetch =
        sinceFetch > POLL_MS ||
        (sinceFetch > 6_000 && sinceSpeech > SILENCE_MS);

      if (!shouldFetch) return;
      lastFetchRef.current = now;

      try {
        const { tip: newTip } = await getCoachTip({
          transcripts: recentTranscripts,
          topic: topic ?? undefined,
          secondsLeft
        });
        if (newTip) {
          setTip(newTip);
          setTipShownAt(Date.now());
          setDismissed(false);
        }
      } catch {
        // ignore — coach is best-effort
      }
    }, 2000);
    return () => clearInterval(id);
  }, [active, topic, secondsLeft, recentTranscripts]);

  // Auto-fade tip after a while
  useEffect(() => {
    if (!tip || dismissed) return;
    const id = setTimeout(() => setDismissed(true), MIN_TIP_DURATION);
    return () => clearTimeout(id);
  }, [tip, tipShownAt, dismissed]);

  if (!active || !tip || dismissed) return null;

  return (
    <div className="ai-coach" key={tipShownAt}>
      <div className="ai-coach-icon">💡</div>
      <div className="ai-coach-text">
        <div className="ai-coach-label">AI coach</div>
        <div className="ai-coach-tip">{tip}</div>
      </div>
      <button className="ai-coach-close" onClick={() => setDismissed(true)} aria-label="Dismiss">✕</button>
    </div>
  );
}
