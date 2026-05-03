import { useEffect, useRef, useState } from 'react';

/**
 * MediaPipe FaceLandmarker on the local video stream.
 * Runs at ~6 fps, extracts smile / eye contact / surprise blendshapes
 * and feeds them to the chemistry pipeline.
 *
 * Privacy: model and inference run entirely in the browser. No frames
 * leave the device. The hook gracefully degrades if MediaPipe fails
 * to load.
 */

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const FPS = 6;

export interface FaceFrame {
  smile: number;        // [0,1]
  attention: number;    // [0,1] — looking-at-camera-ness
  surprise: number;     // [0,1] — brow raise
  hasFace: boolean;
}

interface UseFaceAnalysisOpts {
  active: boolean;
  videoEl: HTMLVideoElement | null;
  onFrame: (f: FaceFrame) => void;
}

export function useFaceAnalysis({ active, videoEl, onFrame }: UseFaceAnalysisOpts) {
  const onFrameRef = useRef(onFrame);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { onFrameRef.current = onFrame; }, [onFrame]);

  useEffect(() => {
    if (!active || !videoEl) {
      setReady(false);
      return;
    }

    let cancelled = false;
    let landmarker: any = null;
    let rafId: number | null = null;
    let intervalId: number | null = null;

    (async () => {
      try {
        const mod = await import('@mediapipe/tasks-vision');
        if (cancelled) return;
        const fileset = await mod.FilesetResolver.forVisionTasks(WASM_BASE);
        if (cancelled) return;
        landmarker = await mod.FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
          outputFaceBlendshapes: true,
          numFaces: 1,
          runningMode: 'VIDEO'
        });
        if (cancelled) { landmarker?.close?.(); return; }
        setReady(true);

        intervalId = window.setInterval(() => {
          if (!videoEl || videoEl.readyState < 2 || videoEl.videoWidth === 0) return;
          const ts = performance.now();
          let result: any;
          try {
            result = landmarker.detectForVideo(videoEl, ts);
          } catch (e) {
            return;
          }
          if (!result) return;

          const blendshapes = result.faceBlendshapes?.[0]?.categories;
          if (!blendshapes || blendshapes.length === 0) {
            onFrameRef.current({ smile: 0, attention: 0, surprise: 0, hasFace: false });
            return;
          }

          const get = (name: string) =>
            blendshapes.find((b: any) => b.categoryName === name)?.score ?? 0;

          const smileLeft = get('mouthSmileLeft');
          const smileRight = get('mouthSmileRight');
          const smile = (smileLeft + smileRight) / 2;

          // Looking at camera: eyes mostly forward (no strong look-out / look-up / look-down)
          const lookOutL = get('eyeLookOutLeft');
          const lookOutR = get('eyeLookOutRight');
          const lookUpL = get('eyeLookUpLeft');
          const lookUpR = get('eyeLookUpRight');
          const lookDownL = get('eyeLookDownLeft');
          const lookDownR = get('eyeLookDownRight');
          const blinkL = get('eyeBlinkLeft');
          const blinkR = get('eyeBlinkRight');
          const awayScore =
            (lookOutL + lookOutR + lookUpL + lookUpR + lookDownL + lookDownR) / 6;
          // Blink shouldn't count as "looking away"
          const blinkPenalty = (blinkL + blinkR) / 2 > 0.5 ? 0.5 : 1;
          const attention = Math.max(0, Math.min(1, (1 - awayScore * 1.2) * blinkPenalty));

          const browInner = get('browInnerUp');
          const browOuterL = get('browOuterUpLeft');
          const browOuterR = get('browOuterUpRight');
          const surprise = (browInner + browOuterL + browOuterR) / 3;

          onFrameRef.current({ smile, attention, surprise, hasFace: true });
        }, Math.round(1000 / FPS));
      } catch (err: any) {
        console.warn('Face analysis init failed', err);
        if (!cancelled) setError(err?.message ?? 'init failed');
      }
    })();

    return () => {
      cancelled = true;
      if (intervalId !== null) clearInterval(intervalId);
      if (rafId !== null) cancelAnimationFrame(rafId);
      try { landmarker?.close?.(); } catch { /* noop */ }
      setReady(false);
    };
  }, [active, videoEl]);

  return { ready, error };
}
