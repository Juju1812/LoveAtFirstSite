import { useEffect, useMemo, useState } from 'react';

interface Props {
  topic: string | null;
  /** Time elapsed in the live phase, in seconds. */
  elapsedSec: number;
  /** Hide entirely once any of these become true (matched, ended, etc). */
  hidden?: boolean;
}

/**
 * Topic-aware icebreaker prompt that appears at the very start of a call,
 * fades out automatically after a while, and can be dismissed at any time.
 * Designed to kill the dreaded 0:00–0:15 silence by giving both people a
 * concrete first thing to say.
 */
const PROMPTS_BY_TOPIC: Record<string, string[]> = {
  any: [
    "Quick: best thing that happened to you this week?",
    "What's something you're irrationally good at?",
    "If you weren't here right now, where would you be?",
    "What's your most-used app today?",
    "Coffee, tea, or unhinged energy drink?"
  ],
  casual: [
    "Weirdest thing you've eaten on purpose?",
    "What's your go-to karaoke song? Be honest.",
    "Last show that genuinely made you laugh?",
    "Beach person or mountain person — defend it.",
    "What's a low-stakes opinion you'll die on?"
  ],
  deep: [
    "What's a question you've never been asked but wish you had?",
    "What did you believe at 15 that you'd argue with now?",
    "What's something you're working on that nobody knows about?",
    "When did you last surprise yourself?",
    "What's the kindest thing a stranger ever did for you?"
  ],
  laughs: [
    "Tell me the worst joke you know — go.",
    "What's a deeply unserious thing you take very seriously?",
    "Most embarrassing thing you Googled this month?",
    "If your life had a laugh track, when would it kick in?",
    "What's the dumbest reason you've ever cried?"
  ],
  plans: [
    "If we got coffee tomorrow, where are we going?",
    "What's the best low-key date you've ever been on?",
    "Pick: brunch, walk, museum, or dive bar.",
    "Are you a planner or a 'show up and figure it out' person?",
    "What's open near you right now that I'd love?"
  ],
  music: [
    "What's the last song you played twice in a row?",
    "Pick your karaoke song and one cover song.",
    "Best concert you've ever been to?",
    "Guilty-pleasure track you'd put on a date playlist?",
    "Who's an artist you'd drop everything to see live?"
  ],
  adventure: [
    "Last time you did something that scared you?",
    "Pick: hike at sunrise, surf at noon, or campfire at midnight.",
    "Where's somewhere you'd go back to immediately?",
    "Most spontaneous trip you've ever taken?",
    "Bucket-list thing you might actually do this year?"
  ],
  drinks: [
    "Cocktail order: tells me everything about you.",
    "Best dive bar story you'll admit to?",
    "What's your perfect Friday night look like?",
    "First-round drink, no thinking: go.",
    "What's a bar you keep meaning to try?"
  ]
};

const FADE_OUT_AT_SEC = 30; // hide automatically after 30s in
const APPEAR_AT_SEC = 1;    // give the call ~1s to settle before showing

function pickPrompt(topic: string | null): string {
  const key = (topic || 'any').toLowerCase();
  const list = PROMPTS_BY_TOPIC[key] ?? PROMPTS_BY_TOPIC.any;
  return list[Math.floor(Math.random() * list.length)];
}

export function Icebreaker({ topic, elapsedSec, hidden }: Props) {
  const prompt = useMemo(() => pickPrompt(topic), [topic]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(false); // new topic / new call → reshow
  }, [topic]);

  if (hidden) return null;
  if (elapsedSec < APPEAR_AT_SEC) return null;
  if (elapsedSec > FADE_OUT_AT_SEC) return null;
  if (dismissed) return null;

  return (
    <div className="icebreaker">
      <div className="icebreaker-eyebrow">Icebreaker</div>
      <div className="icebreaker-text">{prompt}</div>
      <button className="icebreaker-close" onClick={() => setDismissed(true)} aria-label="Dismiss">✕</button>
    </div>
  );
}
