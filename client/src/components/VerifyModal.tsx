import { useEffect, useRef, useState } from 'react';
import { runVerify, cancelVerify, type VerifyResult } from '../verifyFace';
import { getPrimaryPhoto, type Profile } from '../profile';

interface Props {
  profile: Profile | null;
  onClose: () => void;
  onVerified: () => void | Promise<void>;
}

type Phase = 'intro' | 'capturing' | 'pass' | 'fail';

const REASON_COPY: Record<VerifyResult['reason'], string> = {
  ok: 'Verified.',
  'no-face': 'We couldn\'t see your face clearly. Move into good light and try again.',
  'no-blink': 'We didn\'t catch a natural blink. Try once more — relax and look at the camera.',
  mismatch: 'This doesn\'t look like the photo on your profile. Make sure your primary photo is up to date and try again.',
  cancelled: 'Cancelled.',
  error: 'Something went wrong. Try again in a moment.'
};

export function VerifyModal({ profile, onClose, onVerified }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>('intro');
  const [progress, setProgress] = useState(0);
  const [hint, setHint] = useState<string>('Position your face in the frame');
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // Stop the camera on close.
  useEffect(() => {
    return () => {
      cancelVerify();
      const s = streamRef.current;
      if (s) for (const t of s.getTracks()) t.stop();
    };
  }, []);

  async function start() {
    setErrMsg(null);
    setPhase('capturing');
    try {
      if (!streamRef.current) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 480, height: 480, facingMode: 'user' },
          audio: false
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      }
      const r = await runVerify({
        videoEl: videoRef.current!,
        referencePhoto: getPrimaryPhoto(profile),
        onProgress: (p, h) => { setProgress(p); setHint(h); }
      });
      setResult(r);
      setPhase(r.ok ? 'pass' : 'fail');
      if (r.ok) {
        await onVerified();
      }
    } catch (err: any) {
      setErrMsg(err?.message ?? 'Could not access your camera');
      setPhase('intro');
    }
  }

  function tryAgain() {
    setResult(null);
    setProgress(0);
    setPhase('intro');
  }

  return (
    <div className="modal-backdrop" onClick={() => phase !== 'capturing' && onClose()}>
      <div className="modal verify-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Get verified</h2>
          <p>Take a quick selfie. We check that there's a real face here, and if you've set a primary photo, that it's you. We never store the selfie — only the pass/fail.</p>
        </div>

        <div className="verify-stage">
          <video
            ref={videoRef}
            className="verify-video"
            autoPlay
            playsInline
            muted
          />
          <div className="verify-mask" />
          {phase === 'capturing' && (
            <div className="verify-progress">
              <div className="verify-progress-bar" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          )}
        </div>

        <div className="verify-hint">
          {phase === 'intro' && 'Center your face. Tap Start, then blink naturally.'}
          {phase === 'capturing' && hint}
          {phase === 'pass' && '✓ Verified — your profile now shows a verification badge.'}
          {phase === 'fail' && result && REASON_COPY[result.reason]}
        </div>

        {errMsg && <div className="auth-error" style={{ marginTop: 12 }}>{errMsg}</div>}

        <div className="modal-actions">
          {phase === 'intro' && (
            <>
              <button className="settings-secondary-btn" onClick={onClose}>Cancel</button>
              <button className="settings-save-btn" onClick={start}>Start</button>
            </>
          )}
          {phase === 'capturing' && (
            <button className="settings-secondary-btn" disabled>Verifying…</button>
          )}
          {phase === 'pass' && (
            <button className="settings-save-btn" onClick={onClose}>Done</button>
          )}
          {phase === 'fail' && (
            <>
              <button className="settings-secondary-btn" onClick={onClose}>Close</button>
              <button className="settings-save-btn" onClick={tryAgain}>Try again</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
