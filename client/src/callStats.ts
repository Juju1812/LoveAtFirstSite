/**
 * Call statistics — accumulated during a 2-minute Glimpse call and
 * displayed on the results screen after.
 *
 * Face stats come from MediaPipe FaceLandmarker on the LOCAL video stream
 * (own face only). Speech/chat stats come from the existing chemistry pipeline.
 *
 * Everything stays in the browser; nothing about the conversation reaches
 * our server.
 */

export interface ChemistryPoint { t: number; score: number; }

export interface CallStats {
  startedAt: number;
  endedAt: number | null;

  // Chemistry trajectory
  chemistryHistory: ChemistryPoint[];
  peakChemistry: number;
  avgChemistry: number;
  finalChemistry: number;

  // Face signals (from your own camera)
  smileSamples: number;       // total samples taken
  smileFrames: number;        // frames where smile > threshold
  attentionFrames: number;    // frames where you were looking at camera
  surpriseFrames: number;     // frames with eyebrow raise (laughter/interest)
  faceFrames: number;         // total face frames analyzed (excludes "no face")
  totalFaceSamples: number;   // includes "no face" frames

  // Conversational
  messagesSent: number;
  messagesReceived: number;
  spokenChunks: number;       // speech recognition results

  // Outcome
  outcome: 'matched' | 'rejected-by-them' | 'you-rejected' | 'next' | 'peer-left' | 'ended-other';
}

export function emptyStats(): CallStats {
  return {
    startedAt: Date.now(),
    endedAt: null,
    chemistryHistory: [{ t: Date.now(), score: 50 }],
    peakChemistry: 50,
    avgChemistry: 50,
    finalChemistry: 50,
    smileSamples: 0,
    smileFrames: 0,
    attentionFrames: 0,
    surpriseFrames: 0,
    faceFrames: 0,
    totalFaceSamples: 0,
    messagesSent: 0,
    messagesReceived: 0,
    spokenChunks: 0,
    outcome: 'ended-other'
  };
}

/** Build a punchy AI-style narrative from raw stats. Deterministic, but
 *  sounds personal because it cites real numbers from the call. */
export function buildNarrative(s: CallStats): string[] {
  const lines: string[] = [];
  const durationSec = s.endedAt ? Math.max(1, (s.endedAt - s.startedAt) / 1000) : 1;
  const smileRate = s.faceFrames > 0 ? s.smileFrames / s.faceFrames : 0;
  const attentionRate = s.faceFrames > 0 ? s.attentionFrames / s.faceFrames : 0;
  const peak = Math.round(s.peakChemistry);
  const avg = Math.round(s.avgChemistry);
  const final = Math.round(s.finalChemistry);
  const messageCount = s.messagesSent + s.messagesReceived;

  // ---- Opening verdict ----
  if (avg >= 75) {
    lines.push("That was electric. The chemistry meter doesn't lie — your call ran hot from the jump.");
  } else if (avg >= 60) {
    lines.push("Solid energy throughout. There were real sparks here.");
  } else if (avg >= 50) {
    lines.push("A pleasant call. You held the conversation but the spark stayed mellow.");
  } else if (avg >= 35) {
    lines.push("The vibe was a bit cool — didn't quite click this time.");
  } else {
    lines.push("Not your match. The conversation never found a rhythm.");
  }

  // ---- Peak / final commentary ----
  if (peak - final > 20) {
    lines.push(`You hit a high of ${peak}% but cooled to ${final}% by the end. Something shifted.`);
  } else if (final - 50 > 20 && final >= peak - 5) {
    lines.push(`You ended at ${final}% — strongest right at the buzzer. Always a good sign.`);
  } else if (peak >= 80) {
    lines.push(`You peaked at ${peak}%. Whatever was said in that moment, it landed.`);
  }

  // ---- Face signals ----
  if (s.faceFrames > 5) {
    if (smileRate > 0.45) {
      lines.push(`You smiled ${pct(smileRate)}% of the time — easy energy on your end.`);
    } else if (smileRate > 0.2) {
      lines.push(`You smiled ${pct(smileRate)}% of the time — engaged but holding back.`);
    } else {
      lines.push(`You smiled only ${pct(smileRate)}% of the time. You came across reserved.`);
    }

    if (attentionRate > 0.7) {
      lines.push("Your eye contact was strong — you stayed locked in.");
    } else if (attentionRate > 0.4) {
      lines.push("Your eye contact was decent. You stayed mostly present.");
    } else if (s.faceFrames > 20) {
      lines.push("You looked away a lot. Consider keeping the camera on your face next time.");
    }

    if (s.surpriseFrames > s.faceFrames * 0.08) {
      lines.push("You showed real reactions — your face moved with the conversation.");
    }
  }

  // ---- Conversational ----
  if (messageCount === 0 && s.spokenChunks < 4) {
    lines.push("It was quiet on your end. Talking really does help.");
  } else if (s.spokenChunks > 25) {
    lines.push("You two talked nonstop — clearly something to say to each other.");
  }

  // ---- Outcome footer ----
  if (s.outcome === 'matched') {
    lines.push("And then you both swiped right. Nice.");
  } else if (s.outcome === 'rejected-by-them') {
    lines.push("They swiped left. Their loss.");
  } else if (s.outcome === 'you-rejected') {
    lines.push("You called it. Onto the next.");
  } else if (s.outcome === 'peer-left') {
    lines.push("They dropped out before the timer ended.");
  } else if (s.outcome === 'next') {
    lines.push("You hit Next. Sometimes you just know.");
  }

  return lines;
}

function pct(n: number): number {
  return Math.round(n * 100);
}

export function summarizeStats(s: CallStats) {
  const smileRate = s.faceFrames > 0 ? s.smileFrames / s.faceFrames : 0;
  const attentionRate = s.faceFrames > 0 ? s.attentionFrames / s.faceFrames : 0;
  const surpriseRate = s.faceFrames > 0 ? s.surpriseFrames / s.faceFrames : 0;
  return {
    durationSec: s.endedAt ? Math.round((s.endedAt - s.startedAt) / 1000) : 0,
    smileRate,
    attentionRate,
    surpriseRate,
    peakChemistry: Math.round(s.peakChemistry),
    avgChemistry: Math.round(s.avgChemistry),
    finalChemistry: Math.round(s.finalChemistry),
    messagesSent: s.messagesSent,
    messagesReceived: s.messagesReceived,
    spokenChunks: s.spokenChunks,
    haveFaceData: s.faceFrames > 5
  };
}
