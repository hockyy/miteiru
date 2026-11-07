export type Difficulty = 'hard' | 'good' | 'easy' | 'banish';

export type CardEntry = [string, { level: number; updTime: number }];

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** How long a graded card waits before it comes back. Banish hides it for a year. */
export const DIFFICULTY_INTERVAL_MS: Record<Difficulty, number> = {
  hard: DAY,
  good: 3 * DAY,
  easy: 7 * DAY,
  banish: 365 * DAY,
};

/** The key that grades a card, as shown on its button. */
export const GRADE_KEYS: Record<string, Difficulty> = {
  '1': 'hard',
  '2': 'good',
  '3': 'easy',
  '4': 'banish',
};

export const GRADE_KEY_LABELS: Record<Difficulty, string> = {
  hard: '1',
  good: '2',
  easy: '3',
  banish: '4',
};

/** What a key press does on a card: Space shows the answer; 1-4 grade it once the answer is showing. */
export type FlashKeyAction = { type: 'show' } | { type: 'grade'; difficulty: Difficulty } | null;

export const flashKeyAction = (key: string, answerShown: boolean): FlashKeyAction => {
  if (key === ' ' || key === 'Spacebar') return answerShown ? null : { type: 'show' };
  const difficulty = GRADE_KEYS[key];
  return difficulty && answerShown ? { type: 'grade', difficulty } : null;
};

/** The cards whose review time has come, most overdue first. */
export const dueCards = (cards: CardEntry[], now: number): CardEntry[] =>
  cards.filter(([, state]) => state.updTime <= now).sort((a, b) => a[1].updTime - b[1].updTime);

/** "3 days", "5 hours", "20 minutes": how long until a time, rounded to the nearest sensible unit. */
export const formatTimeUntil = (timestamp: number, now: number): string => {
  const ms = Math.max(0, timestamp - now);
  if (ms >= 36 * HOUR) {
    const days = Math.round(ms / DAY);
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  if (ms >= HOUR) {
    const hours = Math.round(ms / HOUR);
    if (hours >= 24) return '1 day';
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }
  const minutes = Math.max(1, Math.ceil(ms / MINUTE));
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
};

/** When the next card comes due ("Next review in 2 days"), or null when nothing is waiting. */
export const nextReviewText = (cards: CardEntry[], now: number): string | null => {
  const upcoming = cards.map(([, state]) => state.updTime).filter((time) => time > now);
  if (upcoming.length === 0) return null;
  return `Next review in ${formatTimeUntil(Math.min(...upcoming), now)}`;
};

/** The line under a word on the Watch page: when it comes up for review, or when it was saved. */
export const reviewWording = (updTime: number, now: number, relativePast: string): string =>
  updTime > now ? `Review in ${formatTimeUntil(updTime, now)}` : `Learned ${relativePast}`;
