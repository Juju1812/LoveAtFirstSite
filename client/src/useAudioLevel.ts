import { useEffect, useRef, useState } from 'react';

/**
 * Returns a smoothed 0..1 audio level for the given MediaStream's audio track.
 * Used for "is this person speaking?" UI accents.
 */
export function useAudioLevel(stream: MediaStream | null): number {
  const [level, setLevel] = useState(0);
  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!stream || stream.getAudioTracks().length === 0) {
      setLevel(0);
      return;
    }
    let ctx: AudioContext;
    try {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      return;
    }
    ctxRef.current = ctx;

    let source: MediaStreamAudioSourceNode;
    try {
      source = ctx.createMediaStreamSource(stream);
    } catch {
      ctx.close();
      return;
    }
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.55;
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);
    let smoothed = 0;
    let raf = 0;
    let cancelled = false;

    function tick() {
      if (cancelled) return;
      analyser.getByteTimeDomainData(data);
      // RMS-ish: mean absolute deviation from center (128)
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const d = data[i] - 128;
        sum += d * d;
      }
      const rms = Math.sqrt(sum / data.length) / 128;
      // Clamp & soft-curve so quiet ambient doesn't trigger
      const v = Math.min(1, Math.max(0, (rms - 0.04) * 6));
      smoothed = smoothed * 0.7 + v * 0.3;
      setLevel(smoothed);
      raf = requestAnimationFrame(tick);
    }
    tick();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      try { source.disconnect(); } catch { /* noop */ }
      try { ctx.close(); } catch { /* noop */ }
      ctxRef.current = null;
      setLevel(0);
    };
  }, [stream]);

  return level;
}
