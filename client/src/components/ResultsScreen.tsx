import { useState } from 'react';
import { type CallStats, buildNarrative, summarizeStats } from '../callStats';
import { ChemistryChart } from './ChemistryChart';

interface Props {
  stats: CallStats;
  onGoAgain: () => void;
  onDone: () => void;
  canSave: boolean;
  saved: boolean;
  onSavePeer: () => void;
}

export function ResultsScreen({ stats, onGoAgain, onDone, canSave, saved, onSavePeer }: Props) {
  const [expanded, setExpanded] = useState(false);
  const summary = summarizeStats(stats);
  const narrative = buildNarrative(stats);

  const headline = (() => {
    if (stats.outcome === 'matched') return "It was a match";
    if (stats.outcome === 'rejected-by-them') return "Not a match this time";
    if (stats.outcome === 'you-rejected') return "You passed";
    if (stats.outcome === 'next') return "You skipped";
    if (stats.outcome === 'peer-left') return "They left early";
    return "Call ended";
  })();

  return (
    <div className="results-screen">
      <div className="results-card">
        <div className="results-header">
          <div className="results-eyebrow">Call analysis</div>
          <h1 className="results-headline">{headline}</h1>
          <div className="results-duration">{summary.durationSec}s · {summary.messagesSent + summary.messagesReceived} messages · {summary.spokenChunks} spoken phrases</div>
        </div>

        <div className="results-chart-block">
          <ChemistryChart history={stats.chemistryHistory} />
          <div className="results-chart-stats">
            <Stat label="Peak" value={`${summary.peakChemistry}%`} accent />
            <Stat label="Average" value={`${summary.avgChemistry}%`} />
            <Stat label="Final" value={`${summary.finalChemistry}%`} />
          </div>
        </div>

        {summary.haveFaceData && (
          <div className="results-face-stats">
            <div className="results-section-title">Body language read</div>
            <div className="results-face-grid">
              <FaceStat
                emoji="😊"
                label="Smile time"
                value={`${Math.round(summary.smileRate * 100)}%`}
                tone={summary.smileRate > 0.4 ? 'good' : summary.smileRate > 0.15 ? 'neutral' : 'cool'}
              />
              <FaceStat
                emoji="👀"
                label="Eye contact"
                value={`${Math.round(summary.attentionRate * 100)}%`}
                tone={summary.attentionRate > 0.6 ? 'good' : summary.attentionRate > 0.35 ? 'neutral' : 'cool'}
              />
              <FaceStat
                emoji="✨"
                label="Reactions"
                value={`${Math.round(summary.surpriseRate * 100)}%`}
                tone={summary.surpriseRate > 0.06 ? 'good' : 'neutral'}
              />
            </div>
          </div>
        )}

        <div className="results-narrative">
          <div className="results-section-title">The read</div>
          {narrative.slice(0, expanded ? narrative.length : 3).map((line, i) => (
            <p key={i}>{line}</p>
          ))}
          {narrative.length > 3 && !expanded && (
            <button className="results-more" onClick={() => setExpanded(true)}>
              Show more →
            </button>
          )}
        </div>

        {canSave && (
          <div className="results-save-row">
            <div className="results-save-text">
              <strong>Wish you had them back?</strong> Save them — if they save you, you both get a notification.
            </div>
            <button
              className={`results-save-btn ${saved ? 'results-save-btn-on' : ''}`}
              onClick={onSavePeer}
              disabled={saved}
            >
              {saved ? '✓ Saved' : '+ Save them'}
            </button>
          </div>
        )}

        <div className="results-actions">
          <button className="results-go-again" onClick={onGoAgain}>
            Go again →
          </button>
          <button className="results-done" onClick={onDone}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`results-stat ${accent ? 'results-stat-accent' : ''}`}>
      <div className="results-stat-label">{label}</div>
      <div className="results-stat-value">{value}</div>
    </div>
  );
}

function FaceStat({ emoji, label, value, tone }: { emoji: string; label: string; value: string; tone: 'good' | 'neutral' | 'cool' }) {
  return (
    <div className={`face-stat face-stat-${tone}`}>
      <div className="face-stat-emoji">{emoji}</div>
      <div className="face-stat-text">
        <div className="face-stat-value">{value}</div>
        <div className="face-stat-label">{label}</div>
      </div>
    </div>
  );
}
