/**
 * Tiny lexicon-based sentiment scorer. Returns a score in [-1, 1].
 * Good enough for a vibes-meter — not for serious NLP.
 */

const POSITIVE = new Set([
  'love', 'lovely', 'amazing', 'awesome', 'beautiful', 'cute', 'sweet',
  'great', 'good', 'fun', 'funny', 'haha', 'lol', 'lmao', 'nice', 'cool',
  'wonderful', 'fantastic', 'incredible', 'gorgeous', 'attractive', 'hot',
  'pretty', 'handsome', 'smart', 'interesting', 'fascinating', 'happy',
  'glad', 'excited', 'yes', 'yeah', 'yay', 'wow', 'omg', 'perfect',
  'best', 'favorite', 'kind', 'sweetheart', 'adore', 'enjoy', 'enjoying',
  'like', 'liked', 'loving', 'crush', 'chemistry', 'match', 'vibe',
  'vibes', 'spark', 'heart', 'romantic', 'date', 'kiss', 'hug', 'soulmate'
]);

const NEGATIVE = new Set([
  'hate', 'hated', 'awful', 'terrible', 'horrible', 'bad', 'worst', 'ugly',
  'boring', 'bored', 'gross', 'creepy', 'weird', 'rude', 'mean', 'stupid',
  'dumb', 'no', 'nope', 'nah', 'ew', 'yuck', 'angry', 'mad', 'sad',
  'depressed', 'annoying', 'whatever', 'meh', 'ugh', 'cringe', 'lame',
  'leave', 'bye', 'goodbye', 'never', 'shut', 'wtf'
]);

const INTENSIFIERS = new Set(['very', 'really', 'super', 'so', 'totally', 'absolutely']);

const NEGATORS = new Set(['not', "don't", 'dont', 'no', 'never', "isn't", "wasn't", "aren't"]);

export function scoreText(text: string): number {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z'\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length === 0) return 0;

  let score = 0;
  let hits = 0;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    let weight = 0;
    if (POSITIVE.has(t)) weight = 1;
    else if (NEGATIVE.has(t)) weight = -1;
    if (weight === 0) continue;

    const prev = tokens[i - 1];
    const prev2 = tokens[i - 2];
    if (prev && INTENSIFIERS.has(prev)) weight *= 1.5;
    if ((prev && NEGATORS.has(prev)) || (prev2 && NEGATORS.has(prev2))) weight *= -1;

    score += weight;
    hits += 1;
  }

  if (hits === 0) return 0;
  // squash to [-1, 1]
  return Math.max(-1, Math.min(1, score / Math.max(3, hits)));
}

/** Update a running chemistry score (0-100) given a new message score. */
export function nextChemistry(prev: number, msgScore: number): number {
  // EMA toward 50 + 50*msgScore, but bias toward larger swings up.
  const target = 50 + 50 * msgScore;
  const alpha = msgScore > 0 ? 0.25 : 0.18;
  const next = prev + (target - prev) * alpha;
  return Math.max(0, Math.min(100, next));
}
