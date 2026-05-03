/**
 * Tiered, modifier-aware sentiment scorer for the chemistry meter.
 * Returns a normalized score in [-1, 1].
 *
 * Improvements over a flat lexicon:
 *  - 4 word tiers (strong/mild × pos/neg) so "love" outweighs "okay"
 *  - Phrase patterns (multi-word) score stronger than single words
 *  - Negators flip nearby polarity ("not great" → negative)
 *  - Intensifiers boost ("really cute" > "cute")
 *  - Diminishers shrink ("kinda nice" < "nice")
 *  - Punctuation/emphasis adds energy ("yes!!!", "YESSS", elongation)
 *  - Emoji carry weight (❤️ +2, 😂 +1, 😬 -1, 🤢 -2)
 *  - Question marks alone add slight positive (engagement)
 *  - Short greetings/affirmations get small positive nudges so chemistry
 *    drifts up slightly during normal back-and-forth chatter.
 */

// ---- Lexicons ----
const STRONG_POS = new Set([
  'love', 'loved', 'loving', 'adore', 'obsessed', 'amazing', 'incredible',
  'gorgeous', 'beautiful', 'stunning', 'perfect', 'fantastic', 'wonderful',
  'excellent', 'awesome', 'brilliant', 'soulmate', 'crush', 'smitten',
  'sexy', 'hot', 'attractive', 'handsome', 'pretty', 'breathtaking',
  'phenomenal', 'magical', 'magnetic', 'electric', 'best', 'favorite',
  'mesmerizing', 'enchanting', 'delightful', 'spectacular', 'epic',
  'dreamy', 'irresistible', 'stunning', 'flawless', 'soulful'
]);

const MILD_POS = new Set([
  'like', 'liked', 'likable', 'nice', 'cool', 'good', 'sweet', 'kind',
  'cute', 'adorable', 'happy', 'glad', 'fun', 'enjoy', 'enjoying', 'enjoyed',
  'great', 'okay', 'alright', 'sure', 'yes', 'yeah', 'yep', 'yup', 'fine',
  'interesting', 'curious', 'fascinating', 'lovely', 'charming', 'warm',
  'haha', 'hahaha', 'lol', 'lmao', 'rofl', 'lmfao', 'hehe', 'cute',
  'agree', 'definitely', 'absolutely', 'totally', 'exactly', 'right',
  'true', 'real', 'tell', 'fr', 'frfr', 'facts',
  'hi', 'hey', 'hello', 'hiya',
  'thanks', 'thank', 'cheers', 'awesome', 'wow', 'omg', 'oh',
  'smile', 'smiling', 'laugh', 'laughing', 'funny', 'hilarious',
  'spark', 'vibe', 'vibes', 'chemistry', 'click', 'cute', 'genuine',
  'thoughtful', 'smart', 'witty', 'clever', 'fun', 'energetic',
  'date', 'dating', 'hangout', 'meet', 'meetup', 'coffee', 'drinks'
]);

const STRONG_NEG = new Set([
  'hate', 'hated', 'hating', 'disgusting', 'awful', 'horrible', 'terrible',
  'worst', 'creepy', 'creep', 'gross', 'nasty', 'cringe', 'cringey',
  'pathetic', 'disgust', 'repulsive', 'vile', 'wtf', 'stfu',
  'ugly', 'hideous', 'revolting', 'sickening', 'unbearable', 'insufferable',
  'leave', 'goodbye', 'bye', 'never', 'shut',
  'asshole', 'jerk', 'idiot', 'moron', 'stupid', 'dumb', 'pervert',
  'racist', 'sexist', 'predator', 'creepo', 'weirdo'
]);

const MILD_NEG = new Set([
  'meh', 'eh', 'whatever', 'maybe', 'idk', 'unsure', 'awkward',
  'boring', 'bored', 'tired', 'weird', 'strange', 'odd', 'off',
  'no', 'nope', 'nah', 'nuh', 'doubt', 'doubtful',
  'sad', 'lonely', 'depressed', 'down', 'upset', 'mad', 'angry', 'annoyed',
  'annoying', 'frustrating', 'rude', 'mean', 'hard', 'difficult',
  'sorry', 'oops', 'mistake', 'regret', 'lame', 'busy', 'gotta', 'gtg',
  'ew', 'yuck', 'ugh', 'hmm', 'huh',
  'stop', 'enough', 'quit'
]);

// Multi-word phrases. Match longest first.
const PHRASES: Array<[string[], number]> = [
  [['i', 'love', 'you'], 3.0],
  [['love', 'you'], 2.5],
  [['i', 'love', 'this'], 2.0],
  [['i', 'love', 'that'], 2.0],
  [['i', 'love'], 1.6],
  [["you're", 'amazing'], 2.0],
  [['you', 'are', 'amazing'], 2.0],
  [["you're", 'beautiful'], 2.0],
  [['you', 'are', 'beautiful'], 2.0],
  [["you're", 'gorgeous'], 2.2],
  [["you're", 'cute'], 1.6],
  [['you', 'are', 'cute'], 1.6],
  [["you're", 'sweet'], 1.4],
  [["you're", 'funny'], 1.4],
  [["you're", 'smart'], 1.4],
  [["you're", 'hot'], 1.8],
  [['so', 'cute'], 1.4],
  [['so', 'pretty'], 1.4],
  [['so', 'sweet'], 1.4],
  [['so', 'funny'], 1.4],
  [['so', 'good'], 1.2],
  [['really', 'like'], 1.4],
  [['really', 'love'], 1.8],
  [["i'm", 'into'], 1.5],
  [['into', 'you'], 1.6],
  [['my', 'type'], 1.4],
  [['lets', 'meet'], 1.5],
  [["let's", 'meet'], 1.5],
  [['wanna', 'meet'], 1.5],
  [['want', 'to', 'meet'], 1.5],
  [['hang', 'out'], 1.3],
  [['grab', 'coffee'], 1.4],
  [['get', 'drinks'], 1.4],
  [['take', 'you', 'out'], 1.6],
  [['go', 'on', 'a', 'date'], 1.8],
  [['second', 'date'], 1.6],
  [['phone', 'number'], 1.0],
  [['your', 'number'], 1.2],
  [['my', 'number'], 1.0],
  [['snap', 'me'], 1.0],
  [['add', 'me'], 0.8],
  [['follow', 'me'], 0.8],
  [['stay', 'in', 'touch'], 1.2],
  [['keep', 'talking'], 1.2],

  // Negative
  [['i', 'hate', 'you'], -3.0],
  [['i', 'hate', 'this'], -2.5],
  [['i', 'hate'], -2.0],
  [["you're", 'creepy'], -2.5],
  [["you're", 'weird'], -1.8],
  [["you're", 'boring'], -1.8],
  [["you're", 'gross'], -2.5],
  [["you're", 'rude'], -1.8],
  [['this', 'is', 'awkward'], -1.6],
  [['this', 'is', 'boring'], -1.8],
  [['this', 'is', 'weird'], -1.4],
  [['not', 'interested'], -2.0],
  [['no', 'thanks'], -1.0],
  [['no', 'thank', 'you'], -1.0],
  [['gotta', 'go'], -1.4],
  [['have', 'to', 'go'], -1.4],
  [['i', 'should', 'go'], -1.6],
  [['i', 'gotta', 'go'], -1.6],
  [['shut', 'up'], -2.5],
  [['leave', 'me', 'alone'], -2.8],
  [['stop', 'it'], -1.6]
];

// Sort phrases by length desc so longer phrases match first
PHRASES.sort((a, b) => b[0].length - a[0].length);

const INTENSIFIERS = new Set(['very', 'really', 'super', 'so', 'totally', 'absolutely', 'extremely', 'damn', 'hella', 'mad', 'lowkey', 'highkey']);
const DIMINISHERS = new Set(['kinda', 'sorta', 'kind', 'sort', 'somewhat', 'slightly', 'barely', 'hardly', 'maybe']);
const NEGATORS = new Set(['not', 'no', 'never', "don't", 'dont', "didn't", "didnt", "isn't", "isnt", "wasn't", "wasnt", "aren't", "arent", "ain't", "cant", "can't", "won't", "wont", "shouldn't", "wouldn't"]);

// Emoji map (rough). Not exhaustive, but covers common ones.
const POS_EMOJI = ['❤️', '❤', '💕', '💖', '💗', '💓', '💞', '💘', '😍', '🥰', '😘', '😻', '🤩', '😊', '😄', '😃', '😁', '🙂', '😎', '🔥', '✨', '💯', '🥺', '😏', '👀', '😂', '🤣', '😆'];
const NEG_EMOJI = ['😡', '🤬', '👿', '😠', '🤢', '🤮', '🥱', '😴', '😬', '😕', '😟', '😢', '😭', '💔', '👎', '🙄', '😒', '🤡', '😑', '😐'];

const POS_EMOJI_SET = new Set(POS_EMOJI);
const NEG_EMOJI_SET = new Set(NEG_EMOJI);

function getWordWeight(token: string): number {
  if (STRONG_POS.has(token)) return 1.5;
  if (MILD_POS.has(token)) return 0.7;
  if (STRONG_NEG.has(token)) return -1.5;
  if (MILD_NEG.has(token)) return -0.7;
  return 0;
}

function tokenize(text: string): string[] {
  // Keep apostrophes inside words; strip other punctuation.
  return text
    .toLowerCase()
    .replace(/[.,!?;:()[\]{}"]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function scoreText(text: string): number {
  if (!text || !text.trim()) return 0;

  const raw = text.trim();
  let total = 0;
  let hits = 0;
  const matchedRanges: Array<[number, number]> = []; // tokens consumed by phrase matches

  // ---- Emphasis multipliers from raw text ----
  let emphasis = 1;
  // Multiple exclamation points
  const exclMatch = raw.match(/!/g);
  if (exclMatch && exclMatch.length >= 2) emphasis += 0.2;
  if (exclMatch && exclMatch.length >= 4) emphasis += 0.2;
  // Elongation: yesss, lovveee, hahahaa
  if (/(\w)\1{2,}/.test(raw)) emphasis += 0.25;
  // ALL CAPS words (3+ letters)
  const capsWords = raw.match(/\b[A-Z]{3,}\b/g);
  if (capsWords && capsWords.length >= 1) emphasis += 0.2;
  // Cap emphasis multiplier
  emphasis = Math.min(emphasis, 1.8);

  // ---- Emoji scan (operates on raw text) ----
  // Use Array.from to handle surrogate pairs.
  for (const ch of Array.from(raw)) {
    if (POS_EMOJI_SET.has(ch)) { total += 1.4; hits += 1; }
    else if (NEG_EMOJI_SET.has(ch)) { total -= 1.4; hits += 1; }
  }

  const tokens = tokenize(raw);
  if (tokens.length === 0 && hits === 0) return 0;

  // ---- Phrase pass ----
  for (let i = 0; i < tokens.length; i++) {
    for (const [phrase, weight] of PHRASES) {
      if (i + phrase.length > tokens.length) continue;
      let match = true;
      for (let j = 0; j < phrase.length; j++) {
        if (tokens[i + j] !== phrase[j]) { match = false; break; }
      }
      if (match) {
        total += weight;
        hits += 1;
        matchedRanges.push([i, i + phrase.length - 1]);
        i += phrase.length - 1; // skip past phrase
        break;
      }
    }
  }

  // Helper: is index already consumed by a phrase?
  const inPhrase = (idx: number) =>
    matchedRanges.some(([a, b]) => idx >= a && idx <= b);

  // ---- Single-word pass with modifiers ----
  for (let i = 0; i < tokens.length; i++) {
    if (inPhrase(i)) continue;
    const t = tokens[i];
    let weight = getWordWeight(t);
    if (weight === 0) continue;

    // Intensifier in the prior 1-2 tokens
    const prev = tokens[i - 1];
    const prev2 = tokens[i - 2];
    if (prev && INTENSIFIERS.has(prev)) weight *= 1.4;
    else if (prev && DIMINISHERS.has(prev)) weight *= 0.5;

    // Negator within 2 tokens before
    const negated =
      (prev && NEGATORS.has(prev)) ||
      (prev2 && NEGATORS.has(prev2) && !INTENSIFIERS.has(prev || ''));
    if (negated) weight *= -0.85;

    total += weight;
    hits += 1;
  }

  // ---- Engagement nudge: lone question mark with no other signal ----
  if (hits === 0 && /\?/.test(raw) && tokens.length >= 3) {
    return 0.1; // small positive nudge for asking questions
  }

  // ---- Friendly chitchat nudge: longer messages with no strong words still feel like conversation ----
  if (hits === 0 && tokens.length >= 6) {
    return 0.05; // tiny upward drift — they're putting in effort
  }

  if (hits === 0) return 0;

  // Apply emphasis
  total *= emphasis;

  // Normalize: divide by sqrt(hits + 1) so multiple signals stack but don't explode
  const normalized = total / Math.sqrt(hits + 1);

  // Squash to [-1, 1] with a slight curve so extreme scores don't hard-cap
  return Math.max(-1, Math.min(1, normalized / 2.2));
}

/**
 * Update the running 0-100 chemistry score given a new message score in [-1, 1].
 * EMA-blended toward (50 + 50*msgScore), with positive moves slightly faster than
 * negative (a single mean comment shouldn't tank a good vibe).
 *
 * Tuning notes: alphas are deliberately low so a single noisy signal can't
 * yank the meter — the score is meant to *trend* over a 2-min call, not
 * twitch with every word. Strong signals still pull harder via the
 * magnitude-scaled term.
 */
export function nextChemistry(prev: number, msgScore: number): number {
  const target = 50 + 50 * msgScore;
  const magnitude = Math.abs(msgScore);

  // Dead zone: tiny signals don't move the meter at all. Keeps face/speech
  // micro-fluctuations from constantly nudging the bar.
  if (magnitude < 0.08) return prev;

  let alpha = msgScore > 0
    ? 0.12 + magnitude * 0.22  // 0.12..0.34
    : 0.10 + magnitude * 0.18; // 0.10..0.28
  alpha = Math.min(alpha, 0.4);

  const next = prev + (target - prev) * alpha;
  return Math.max(0, Math.min(100, next));
}
