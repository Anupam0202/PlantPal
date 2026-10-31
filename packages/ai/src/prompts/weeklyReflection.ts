import { WeeklyReflection } from '@plantpal/schemas';
import type { PolicyContext } from '../policy';
import type { PromptModule } from '../prompt';
import { claimErrors, stringsOf } from '../validators';

export interface WeeklyReflectionInput {
  policy: PolicyContext;
  /** The deterministic summary the app already shows (counts and plant names). */
  summary: string;
  /** Tasks coming up this week, as plain lines. */
  upcoming: string[];
}

/** Words that blame or pressure; a reflection never uses them (F8, §6.20 "no streak punishment"). */
const SHAMING =
  /\b(?:fail(?:ed|ure)?|neglect(?:ed)?|lazy|forgot|missed|should have|only managed|behind|disappoint\w*|streak|broke your)\b/i;

/** F8 weekly reflection on Today, in a new week only, after the person asks for it. */
export const weeklyReflectionV1: PromptModule<WeeklyReflectionInput, WeeklyReflection> = {
  id: 'weekly-reflection',
  version: 1,
  role: 'fast',
  schema: WeeklyReflection,
  maxOutputTokens: 600,
  temperature: 0.5,
  thinking: 'minimal',
  task: [
    'Task: write a short, warm reflection on last week in this garden from the summary only.',
    'headline: one sentence. highlights: up to 3 specific things that happened. nextSteps: up to 3 small, optional ideas for this week, taken from the upcoming tasks when there are any.',
    'A quiet week is fine: say so kindly. Never blame, never mention streaks, never invent events or numbers.',
  ].join('\n'),
  policy: (i) => i.policy,
  sections: (i) => [
    {
      category: 'plants',
      title: 'Last week (from the garden records)',
      required: true,
      text: i.summary,
      untrusted: true,
    },
    {
      category: 'plants',
      title: 'Coming up this week',
      text: i.upcoming.length ? i.upcoming.join('\n') : 'Nothing scheduled.',
      untrusted: true,
    },
  ],
  validate(out, i) {
    const errors = claimErrors(out);
    const text = stringsOf(out).join('\n');
    if (SHAMING.test(text)) errors.push('Remove blaming or pressuring words; keep it kind and optional.');
    // Every number must come from what the app sent.
    const source = `${i.summary}\n${i.upcoming.join('\n')}`;
    for (const n of text.match(/\d+(?:[.,]\d+)?/g) ?? [])
      if (!source.includes(n)) errors.push(`The number ${n} is not in the summary. Use only numbers given.`);
    return errors;
  },
};
