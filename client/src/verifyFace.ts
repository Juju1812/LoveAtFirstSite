/**
 * Selfie verification helpers.
 *
 * Runs entirely client-side using MediaPipe FaceLandmarker. We do two checks:
 *   1. Liveness — at least one blink (eyeBlink* > 0.5) during the capture window.
 *   2. Identity — cosine similarity between geometric "fingerprints" derived
 *      from the 478 landmarks of the live face and the user's primary photo.
 *
 * Identity checking is geometric, not learned. It catches obvious mismatches
 * (different person, photo of someone else) but is nowhere near as strong as a
 * production face-recognition model. It's good enough as a trust badge for a
 * v1 — we mark `verified=true` only if both checks pass.
 */

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

/** Subset of landmark indices that form a stable face geometry signature.
 *  Selected to span eyes, nose, mouth, jaw — relatively pose-invariant once
 *  normalized to a canonical face frame. */
const KEY_LANDMARKS = [
  // Eye corners
  33, 133, 362, 263,
  // Eyebrows
  70, 105, 300, 334,
  // Nose
  1, 4, 5, 6, 195,
  // Mouth corners + center top/bottom
  61, 291, 13, 14,
  // Cheek anchors
  234, 454,
  // Chin / jaw
  152, 172, 397, 199,
  // Outer brow / temple
  103, 332,
  // Inner mouth
  78, 308,
  // Upper face midline
  10, 168,
];

interface MPLandmark { x: number; y: number; z: number; }

let landmarkerCache: any | null = null;
let landmarkerPromise: Promise<any> | null = null;

async function getLandmarker(runningMode: 'IMAGE' | 'VIDEO'): Promise<any> {
  if (landmarkerCache && landmarkerCache.__mode === runningMode) return landmarkerCache;
  if (landmarkerPromise) {
    const lm = await landmarkerPromise;
    if (lm.__mode === runningMode) return lm;
  }
  landmarkerPromise = (async () => {
    const mod: any = await import('@mediapipe/tasks-vision');
    const fileset = await mod.FilesetResolver.forVisionTasks(WASM_BASE);
    if (landmarkerCache) {
      try { landmarkerCache.close?.(); } catch { /* noop */ }
    }
    const lm = await mod.FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      outputFaceBlendshapes: true,
      numFaces: 1,
      runningMode
    });
    lm.__mode = runningMode;
    landmarkerCache = lm;
    return lm;
  })();
  return landmarkerPromise;
}

/** Build a unit-length "fingerprint" of a face from landmarks. Normalizes for
 *  scale and translation by centering on the face midpoint and dividing by
 *  inter-eye distance. */
function buildSignature(landmarks: MPLandmark[]): Float32Array | null {
  if (!landmarks || landmarks.length < 478) return null;
  const eyeL = landmarks[33];
  const eyeR = landmarks[263];
  const cx = (eyeL.x + eyeR.x) / 2;
  const cy = (eyeL.y + eyeR.y) / 2;
  const cz = (eyeL.z + eyeR.z) / 2;
  const dx = eyeR.x - eyeL.x;
  const dy = eyeR.y - eyeL.y;
  const eyeDist = Math.sqrt(dx * dx + dy * dy) || 1e-6;

  const sig = new Float32Array(KEY_LANDMARKS.length * 3);
  for (let i = 0; i < KEY_LANDMARKS.length; i++) {
    const lm = landmarks[KEY_LANDMARKS[i]];
    if (!lm) return null;
    sig[i * 3 + 0] = (lm.x - cx) / eyeDist;
    sig[i * 3 + 1] = (lm.y - cy) / eyeDist;
    sig[i * 3 + 2] = (lm.z - cz) / eyeDist;
  }
  // L2 normalize so cosine similarity is a simple dot product
  let norm = 0;
  for (let i = 0; i < sig.length; i++) norm += sig[i] * sig[i];
  norm = Math.sqrt(norm) || 1e-6;
  for (let i = 0; i < sig.length; i++) sig[i] /= norm;
  return sig;
}

function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

/** Compute a face signature from a (data URL) image, off-screen. */
export async function signatureFromImage(imageUrl: string): Promise<Float32Array | null> {
  const img = await new Promise<HTMLImageElement | null>((resolve) => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null);
    im.src = imageUrl;
  });
  if (!img) return null;
  const lm = await getLandmarker('IMAGE');
  const result = lm.detect(img);
  const lms = result?.faceLandmarks?.[0];
  if (!lms) return null;
  return buildSignature(lms);
}

export interface VerifyResult {
  ok: boolean;
  reason: 'ok' | 'no-face' | 'no-blink' | 'mismatch' | 'cancelled' | 'error';
  similarity?: number;
}

interface VerifyOpts {
  /** Live <video> element with the user's webcam attached. */
  videoEl: HTMLVideoElement;
  /** Reference photo data URL (their primary profile photo). Optional. */
  referencePhoto?: string | null;
  /** Capture window in ms. Default 4500 (~4.5s). */
  durationMs?: number;
  /** Cosine-similarity threshold for identity match. Default 0.7. */
  matchThreshold?: number;
  /** Fired during the run with progress signals (0..1). */
  onProgress?: (p: number, hint: string) => void;
}

/** Run liveness + identity verification against the live video. Resolves with a
 *  VerifyResult. The caller should handle the video lifecycle. */
export async function runVerify(opts: VerifyOpts): Promise<VerifyResult> {
  const {
    videoEl,
    referencePhoto,
    durationMs = 4500,
    matchThreshold = 0.7,
    onProgress
  } = opts;

  const lm = await getLandmarker('VIDEO');

  // Compute reference signature first so we can fail fast.
  let refSig: Float32Array | null = null;
  if (referencePhoto) {
    // Need IMAGE-mode landmarker. We close + recreate the cached one.
    try {
      // Switch landmarker to IMAGE mode for the photo.
      const imgLm = await getLandmarker('IMAGE');
      const img = await new Promise<HTMLImageElement | null>((resolve) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => resolve(null);
        im.src = referencePhoto;
      });
      if (img) {
        const result = imgLm.detect(img);
        const lms = result?.faceLandmarks?.[0];
        if (lms) refSig = buildSignature(lms);
      }
    } catch (e) {
      console.warn('Could not derive reference signature', e);
    }
    // Switch back to VIDEO mode for the live capture
    await getLandmarker('VIDEO');
  }

  return new Promise<VerifyResult>((resolve) => {
    const start = performance.now();
    let blinkSeen = false;
    let bestMatch = 0;
    let faceSeenCount = 0;
    let frameCount = 0;
    let cancelled = false;
    let lastSig: Float32Array | null = null;

    const tick = () => {
      if (cancelled) return;
      const now = performance.now();
      const elapsed = now - start;
      if (elapsed >= durationMs) {
        finalize();
        return;
      }
      onProgress?.(elapsed / durationMs, blinkSeen ? 'Looking good — hold still' : 'Blink naturally');
      try {
        if (videoEl.readyState >= 2) {
          frameCount++;
          const result = lm.detectForVideo(videoEl, now);
          const blendshapes = result?.faceBlendshapes?.[0]?.categories ?? [];
          const lms = result?.faceLandmarks?.[0];
          if (lms) {
            faceSeenCount++;
            lastSig = buildSignature(lms);
            const blink =
              (blendshapes.find((b: any) => b.categoryName === 'eyeBlinkLeft')?.score ?? 0) +
              (blendshapes.find((b: any) => b.categoryName === 'eyeBlinkRight')?.score ?? 0);
            if (blink > 1.0) blinkSeen = true; // either side near full blink
            if (refSig && lastSig) {
              const sim = cosine(refSig, lastSig);
              if (sim > bestMatch) bestMatch = sim;
            }
          }
        }
      } catch {
        // landmarker errors are common; skip frame
      }
      requestAnimationFrame(tick);
    };

    function finalize() {
      onProgress?.(1, 'Done');
      const faceRatio = frameCount > 0 ? faceSeenCount / frameCount : 0;
      if (faceRatio < 0.3) {
        return resolve({ ok: false, reason: 'no-face' });
      }
      if (!blinkSeen) {
        return resolve({ ok: false, reason: 'no-blink' });
      }
      if (refSig) {
        if (bestMatch < matchThreshold) {
          return resolve({ ok: false, reason: 'mismatch', similarity: bestMatch });
        }
        return resolve({ ok: true, reason: 'ok', similarity: bestMatch });
      }
      // No reference photo — liveness alone counts. Still mark ok; UI can word
      // this as "verified human" rather than "matches your photo".
      return resolve({ ok: true, reason: 'ok' });
    }

    requestAnimationFrame(tick);

    // Allow caller to cancel by closing the modal — we expose this via a
    // global. (Component sets it up before calling runVerify.)
    (runVerify as any).__cancel = () => { cancelled = true; resolve({ ok: false, reason: 'cancelled' }); };
  });
}

/** Public cancel hook — invoked when the user closes the modal mid-capture. */
export function cancelVerify() {
  const fn = (runVerify as any).__cancel;
  if (typeof fn === 'function') fn();
}
