import type { CaptureProposal as AiCaptureProposal, CareKind } from '@plantpal/schemas';

/**
 * Deterministic Quick Capture parser for short English notes such as "watered tomatoes 2 l" or
 * "harvested 300 g basil". Anything it cannot read becomes a plain note. Results are proposals:
 * nothing is saved until the user confirms (L19).
 */
export type CaptureProposal =
  | {
      type: 'care';
      kind: CareKind;
      specimenIds: string[];
      plantText: string | null;
      amountMl: number | null;
      text: string;
    }
  | {
      type: 'harvest';
      specimenIds: string[];
      plantText: string | null;
      massG: number | null;
      count: number | null;
      countLabel: string | null;
      text: string;
    }
  | { type: 'note'; specimenIds: string[]; text: string }
  /** A one-off to-do (from the AI reader); saved as a single-occurrence custom task. */
  | { type: 'task'; specimenIds: string[]; title: string; dueOn: string | null; text: string };

export interface CaptureSpecimen {
  id: string;
  displayName: string;
}

const VERBS: Array<[RegExp, CareKind | 'harvest' | 'note']> = [
  [/^(watered|watering|water|gave water to)\b/i, 'water'],
  [/^(fed|feed|fertili[sz]ed|fertili[sz]e)\b/i, 'feed'],
  [/^(pruned|prune|trimmed|trim|pinched|pinch|deadheaded|deadhead)\b/i, 'prune'],
  [/^(repotted|repot|potted up)\b/i, 'repot'],
  [/^(mulched|mulch)\b/i, 'mulch'],
  [/^(checked for pests|pest check|inspected)\b/i, 'pest-check'],
  [/^(staked|tied|supported)\b/i, 'support'],
  [/^(harvested|harvest|picked)\b/i, 'harvest'],
];

/**
 * A number and its unit. The lookbehind lets a match start only at the beginning of a number and the
 * quantifiers are bounded, so long runs of digits cannot cause polynomial backtracking.
 */
const AMOUNT_RE =
  /(?<![\d.,])(\d{1,7}(?:[.,]\d{1,3})?)\s{0,3}(ml|millilitres?|milliliters?|l|litres?|liters?|ltrs?|kg|kilos?|g|grams?|gms?|pieces?|pcs|bunch(?:es)?|heads?|fruits?)\b\.?/i;

/** Longest note the reader looks at; longer text is cut, never scanned in full. */
const MAX_INPUT = 2000;

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Crude English singular form, applied to both sides of a comparison ("leaves" ~ "leaf"). */
function singular(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (word.endsWith('ves')) return word.slice(0, -3) + 'f';
  if (word.endsWith('ve')) return word.slice(0, -2) + 'f';
  if (word.endsWith('oes')) return word.slice(0, -2);
  if (/(ch|sh|x|z|ss)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  if (word.endsWith('fe')) return word.slice(0, -1);
  return word;
}

/** Specimens whose name appears in `text` (case-insensitive, plural-tolerant, whole words). */
export function matchSpecimens(text: string, specimens: readonly CaptureSpecimen[]): string[] {
  const words = normalize(text).split(' ').map(singular).join(' ');
  if (!words) return [];
  const hits: string[] = [];
  for (const s of specimens) {
    const name = normalize(s.displayName).split(' ').map(singular).join(' ');
    if (!name) continue;
    if (` ${words} `.includes(` ${name} `)) hits.push(s.id);
  }
  return hits;
}

function parseClause(clause: string, specimens: readonly CaptureSpecimen[]): CaptureProposal {
  const text = clause.trim();
  const verb = VERBS.find(([re]) => re.test(text));
  const amount = AMOUNT_RE.exec(text);
  const rest = (verb ? text.replace(verb[0], '') : text)
    .replace(AMOUNT_RE, '')
    .replace(/\b(the|my|some|a|an|of|to|on|in)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const plantText = rest.length > 0 ? rest : null;
  const specimenIds = matchSpecimens(text, specimens);

  if (!verb) return { type: 'note', specimenIds, text };

  const kind = verb[1];
  const value = amount ? Number((amount[1] ?? '').replace(',', '.')) : null;
  const unit = amount ? (amount[2] ?? '').toLowerCase() : '';

  if (kind === 'harvest') {
    let massG: number | null = null;
    let count: number | null = null;
    let countLabel: string | null = null;
    if (value !== null && Number.isFinite(value)) {
      if (/^(kg|kilos?)$/.test(unit)) massG = Math.round(value * 1000);
      else if (/^(g|grams?|gms?)$/.test(unit)) massG = Math.round(value);
      else if (Number.isInteger(value)) {
        count = value;
        countLabel = singular(unit);
      }
    }
    return { type: 'harvest', specimenIds, plantText, massG, count, countLabel, text };
  }

  if (kind === 'note') return { type: 'note', specimenIds, text };

  let amountMl: number | null = null;
  if (kind === 'water' && value !== null && Number.isFinite(value)) {
    if (/^(ml|millilitres?|milliliters?)$/.test(unit)) amountMl = Math.round(value);
    else if (/^(l|litres?|liters?|ltrs?)$/.test(unit)) amountMl = Math.round(value * 1000);
  }
  return { type: 'care', kind, specimenIds, plantText, amountMl, text };
}

/** Splits free text into clauses (",", ";", new lines, " then ") and parses each one. */
export function parseQuickCapture(input: string, specimens: readonly CaptureSpecimen[]): CaptureProposal[] {
  return input
    .slice(0, MAX_INPUT)
    .split(/[;\n]|,(?!\d)|\bthen\b/i)
    .map((c) => c.trim())
    .filter((c) => c.length > 0)
    .map((c) => parseClause(c, specimens));
}

/**
 * Maps a validated AI proposal (F2) onto the same proposal shape the deterministic reader produces,
 * so both go through one review-and-confirm list. Units are normalised here, not by the model.
 */
export function captureFromAi(p: AiCaptureProposal): CaptureProposal {
  const ids = p.specimenId ? [p.specimenId] : [];
  switch (p.type) {
    case 'careEvent':
      return {
        type: 'care',
        kind: p.kind,
        specimenIds: ids,
        plantText: null,
        amountMl: p.amount
          ? Math.round(p.amount.unit === 'l' ? p.amount.value * 1000 : p.amount.value)
          : null,
        text: p.sourceSpan,
      };
    case 'harvest':
      return {
        type: 'harvest',
        specimenIds: ids,
        plantText: null,
        massG: p.massG,
        count: p.count,
        countLabel: p.countLabel,
        text: p.sourceSpan,
      };
    case 'task':
      return { type: 'task', specimenIds: ids, title: p.title, dueOn: p.dueOn, text: p.sourceSpan };
    case 'observation':
      return {
        type: 'note',
        specimenIds: ids,
        text: p.count !== null ? `${p.text} (${p.count})` : p.text,
      };
  }
}
