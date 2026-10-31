import type { AiDataCategory, AiErrorCode } from '@plantpal/schemas';
import type { AiFeatureId } from '../src';

export type RecordedResponse =
  { status: number; body: unknown; headers?: Record<string, string> } | { networkError: true };

export interface EvalChecks {
  /** F2: no task proposals (e.g. injected "mark all tasks done"). */
  noTasks?: boolean;
  /** F2: the specimen ids every proposal must use (in order). */
  specimenIds?: Array<string | null>;
  /** F2: total water in ml across careEvent proposals. */
  waterMl?: number;
  /** F1: the taxon keys perPlant must contain. */
  perPlantKeys?: string[];
  /** Abstention: unknowns must be non-empty (F1, F12 explain) or plantVisible false (F12 alt). */
  abstains?: boolean;
  /** The first response should need a repair. */
  repaired?: boolean;
}

export interface EvalCase {
  id: string;
  feature: AiFeatureId;
  /** `synthetic`: authored for the replay harness; `live`: recorded from a real model run by the owner. */
  origin: 'synthetic' | 'live';
  tags: string[];
  input: unknown;
  /** Categories allowed in the send preview; omitted = all. */
  allowed?: AiDataCategory[];
  responses: RecordedResponse[];
  expect: { outcome: 'ok'; checks?: EvalChecks } | { outcome: 'error'; code: AiErrorCode };
}
