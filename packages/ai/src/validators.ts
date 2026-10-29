/**
 * Semantic validators (§18.8). They run after the Zod parse and catch what a schema cannot: claims the
 * policy forbids, IDs that were not provided, and text that is not grounded in the input.
 */

export type ClaimKind =
  'edibility' | 'pesticide' | 'air-purifying' | 'certainty' | 'safety-certification' | 'api-key';

interface Rule {
  kind: ClaimKind;
  re: RegExp;
  /** Skip the match when a negation or hedge appears just before it ("not safe to eat", "whether it is edible"). */
  negatable: boolean;
}

const RULES: Rule[] = [
  // Edibility or toxicity clearance (English, Spanish, Hindi).
  {
    kind: 'edibility',
    re: /\b(?:is|are|it's|they're)\s+(?:completely\s+|totally\s+|perfectly\s+)?(?:edible|safe to eat|safe to consume|non[- ]?toxic|not toxic|pet[- ]safe|safe for (?:cats|dogs|pets|children|kids|babies))\b/gi,
    negatable: true,
  },
  { kind: 'edibility', re: /\b(?:you can|you may|feel free to)\s+(?:safely\s+)?eat\b/gi, negatable: true },
  {
    kind: 'edibility',
    re: /\bsafe (?:to eat|to consume|for (?:cats|dogs|pets|children|kids|babies))\b/gi,
    negatable: true,
  },
  {
    kind: 'edibility',
    re: /\b(?:es|son)\s+(?:comestibles?|seguros? para comer|no t[óo]xic[oa]s?)\b/gi,
    negatable: true,
  },
  {
    kind: 'edibility',
    re: /(?:खाने योग्य|खाने के लिए सुरक्षित|विषैला नहीं|ज़हरीला नहीं|जहरीला नहीं)/g,
    negatable: true,
  },
  // Named pesticide, herbicide or fungicide products and doses.
  {
    kind: 'pesticide',
    re: /\b(?:imidacloprid|glyphosate|malathion|chlorpyrifos|carbaryl|permethrin|cypermethrin|bifenthrin|acephate|mancozeb|chlorothalonil|paraquat|2,4-d|copper oxychloride|bordeaux mixture|roundup|sevin|spinosad|neem oil|pyrethrin|dimethoate|thiamethoxam|lambda-cyhalothrin|carbendazim|metalaxyl)\b/gi,
    negatable: false,
  },
  {
    kind: 'pesticide',
    re: /(?<![\d.,])\d{1,6}(?:[.,]\d{1,3})?\s{0,3}(?:ml|g|tsp|tbsp|teaspoons?|tablespoons?|drops?)\s{0,3}(?:per|\/|in|of)\s{0,3}(?:a\s{1,3})?(?:l|litre|liter|gallon|bucket|water)\b/gi,
    negatable: false,
  },
  // Air purification.
  { kind: 'air-purifying', re: /\bair[- ]purif(?:ying|ier|ication)\b/gi, negatable: true },
  {
    kind: 'air-purifying',
    re: /\b(?:purif(?:y|ies)|cleans?|filters?)\s+(?:the\s+|your\s+)?(?:indoor\s+|room\s+)?air\b/gi,
    negatable: true,
  },
  { kind: 'air-purifying', re: /\b(?:purifica|limpia)\s+el\s+aire\b/gi, negatable: true },
  { kind: 'air-purifying', re: /हवा (?:को )?शुद्ध/g, negatable: true },
  // Certainty language.
  {
    kind: 'certainty',
    re: /\b(?:definitely|certainly|guaranteed|without (?:a|any) doubt|100 ?%|for sure|undoubtedly)\b/gi,
    negatable: false,
  },
  { kind: 'certainty', re: /\b(?:definitivamente|sin duda|seguramente)\b/gi, negatable: false },
  { kind: 'certainty', re: /(?:निश्चित रूप से|बिल्कुल पक्का)/g, negatable: false },
  // Structural, soil or water safety certification.
  {
    kind: 'safety-certification',
    re: /\b(?:balcony|roof|terrace|structure|soil|water)\s+(?:is|are)\s+(?:structurally\s+)?(?:safe|strong enough|uncontaminated|safe to drink)\b/gi,
    negatable: true,
  },
  // A Gemini key must never be echoed.
  { kind: 'api-key', re: /AIza[0-9A-Za-z_-]{35}/g, negatable: false },
];

const NEGATION =
  /\b(?:not|n't|never|no|whether|if|cannot|can't|unclear|unknown|unsure|don't|doesn't|isn't|aren't|nunca)\b|n't\b|नहीं|क्या/i;

export interface ClaimHit {
  kind: ClaimKind;
  text: string;
}

/** Finds forbidden claims in a piece of model output. */
export function prohibitedClaims(text: string): ClaimHit[] {
  const hits: ClaimHit[] = [];
  for (const rule of RULES) {
    for (const m of text.matchAll(rule.re)) {
      if (rule.negatable) {
        // Look back within the same clause only, so "Not only is it pretty, it is edible" still counts.
        const window = text.slice(Math.max(0, (m.index ?? 0) - 60), m.index ?? 0);
        const before = window.split(/[.,;:!?।]/).pop() ?? '';
        // "not toxic" is itself a clearance; only a negation *before* the phrase cancels it.
        if (NEGATION.test(before)) continue;
      }
      hits.push({ kind: rule.kind, text: m[0] });
    }
  }
  return hits;
}

/** Every string anywhere inside a value (for scanning whole structured outputs). */
export function stringsOf(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) stringsOf(v, out);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) stringsOf(v, out);
  return out;
}

export function claimErrors(value: unknown): string[] {
  return stringsOf(value).flatMap((s) =>
    prohibitedClaims(s).map((h) => `Forbidden ${h.kind} claim: "${h.text}". Rephrase without it.`),
  );
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** True when `span` appears in `source` (case- and whitespace-insensitive). */
export function isGrounded(span: string, source: string): boolean {
  const s = norm(span);
  return s.length > 0 && norm(source).includes(s);
}
