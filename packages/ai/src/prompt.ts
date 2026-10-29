import type { AiDataCategory, ModelRole } from '@plantpal/schemas';
import type { z } from 'zod';
import { sharedPolicy, userData, type PolicyContext } from './policy';

export type AiFeatureId =
  | 'plan-explain'
  | 'capture-parse'
  | 'alt-text'
  | 'plain-explain'
  | 'health-triage'
  | 'photo-id'
  | 'species-draft'
  | 'space-detect';

/** Spec feature numbers, for docs and the send preview. */
export const FEATURE_NUMBER: Record<AiFeatureId, string> = {
  'plan-explain': 'F1',
  'capture-parse': 'F2',
  'alt-text': 'F12',
  'plain-explain': 'F12',
  'health-triage': 'F4',
  'photo-id': 'F5',
  'species-draft': 'F3',
  'space-detect': 'F9',
};

export interface ImagePart {
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  /** Base64 without the data: prefix. Already resized (≤ 1536 px) and stripped of metadata. */
  data: string;
}

/**
 * One block of context. The send preview shows exactly these blocks, and the request is built from
 * exactly these blocks, so what people see is what is sent.
 */
export interface ContextSection {
  /** `request` is the instruction for this feature and is always sent. */
  category: AiDataCategory | 'request';
  title: string;
  text?: string;
  image?: ImagePart;
  /** The feature cannot run without it. */
  required?: boolean;
  /** Typed by people or third parties: wrapped as <user_data>. */
  untrusted?: boolean;
}

export type Thinking = 'minimal' | 'low' | 'default';

export interface PromptModule<I, T> {
  id: AiFeatureId;
  version: number;
  role: ModelRole;
  schema: z.ZodType<T>;
  maxOutputTokens: number;
  temperature: number;
  thinking: Thinking;
  /** Feature-specific instruction, appended after the shared policy. */
  task: string;
  policy(input: I): PolicyContext;
  sections(input: I): ContextSection[];
  /** Semantic checks after the schema parse; each string is fed back once in a repair attempt. */
  validate(output: T, input: I): string[];
}

export function systemInstruction<I, T>(m: PromptModule<I, T>, input: I): string {
  return `${sharedPolicy(m.policy(input))}\n\n${m.task}`;
}

/** Filters sections by consent. Returns the missing required categories when consent blocks the feature. */
export function consentedSections(
  sections: ContextSection[],
  allowed: ReadonlySet<AiDataCategory> | null,
): { sections: ContextSection[]; blockedBy: AiDataCategory[] } {
  if (!allowed) return { sections, blockedBy: [] };
  const blockedBy: AiDataCategory[] = [];
  const kept = sections.filter((s) => {
    if (s.category === 'request' || allowed.has(s.category)) return true;
    if (s.required && !blockedBy.includes(s.category)) blockedBy.push(s.category);
    return false;
  });
  return { sections: kept, blockedBy };
}

/** The text of one section exactly as it is sent. */
export function renderSection(s: ContextSection): string {
  const body = s.text ?? '';
  return `### ${s.title}\n${s.untrusted ? userData(s.category, body) : body}`;
}

export type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

/** Stable content first (instructions, lists), volatile content last, so implicit caching can help. */
export function partsOf(sections: ContextSection[]): GeminiPart[] {
  const parts: GeminiPart[] = [];
  for (const s of sections) {
    if (s.text !== undefined) parts.push({ text: renderSection(s) });
    if (s.image) parts.push({ inlineData: { mimeType: s.image.mimeType, data: s.image.data } });
  }
  return parts;
}
