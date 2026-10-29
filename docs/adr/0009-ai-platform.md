# ADR-0009: AI platform with the person's own Gemini key

- Status: Accepted
- Date: 2026-10-29

## Context

AI features must run on the person's own Gemini key, on their own device, and must never decide anything that deterministic code can decide (§18). The v3 app stored the key in plain text, conflated "no key" with "quota exceeded", walked a long list of model names on any failure, parsed Markdown, and trusted unvalidated JSON (L02–L05).

## Decisions

1. **REST adapter instead of `@google/genai` (deviation from §18.4).** `packages/ai` calls the Gemini REST API with `fetch` behind the `AiClient` interface. The SDK is removed from the dependencies.
   - The key goes in exactly one place, the `x-goog-api-key` header, and the E2E test proves this.
   - Retries, deadlines, error mapping and the thinking-setting fallback are ours to test. Cookies and referrer are never sent.
   - The runtime chunk is 8 kB gzip and loads only when an AI feature is used.

   Chat, Live and embeddings join the same interface when Copilot (M12) and Garden Walk arrive. They can use the SDK, lazy-loaded, if it proves worth its size.

2. **Vault** (`packages/ai/src/vault.ts`). The person chooses one of two modes:
   - **Session:** the key is held in memory only.
   - **Device:** the key is encrypted with AES-GCM under a non-extractable WebCrypto key.

   The CryptoKey object and the ciphertext live in their own IndexedDB database, `plantpal-vault`. That database is never exported, synced or backed up. AI settings, remembered consent choices and the usage meter live there too.

   A v3 plaintext key is offered for import into the vault, then deleted. Passkey (WebAuthn PRF) and passphrase protection are deferred; ADR-0001's security pass will revisit them in M12. Settings › AI states the remaining risk: code running in the page could use an unlocked key.

3. **Discovery** (`discovery.ts`).
   - The paginated model list is requested with the key in a header.
   - One model is picked per role: it must support the method; stable is preferred over preview (except `deep`); seed ids are used when the key lists them; otherwise the newest version in the family. A user override wins if the key lists it.
   - Seeds carry a `verifiedAt` date and are used only when the live list contains them.
   - On `MODEL_UNAVAILABLE` the client re-discovers **once**. It never walks a list of names (L03).
4. **Error taxonomy** (`errors.ts`). Gemini errors map to typed codes, each with its own copy and recovery in the UI:
   - key invalid; permission denied; region unsupported;
   - rate limited, with a countdown; daily quota; billing required (a free-tier limit of 0);
   - model unavailable; safety blocked; recitation; truncated; schema invalid; no output;
   - network; timeout; cancelled; consent required; AI disabled.

   "No key" is checked before any request (L02). At most 2 attempts are made, and only for network errors, 5xx responses and rate limits of 20 s or less (L03). Fixable errors record a pending action, which resumes when the key or models change.

5. **Structured outputs only** (L04, L05).
   - Responses use `responseMimeType: application/json` with `responseJsonSchema` generated from the Zod schemas in `packages/schemas/src/ai.ts`. The schema is reduced to the documented subset: `anyOf` instead of `oneOf` or type arrays, single-value `enum` instead of `const`, and no length or pattern limits.
   - Each response is checked by the Zod parse, then by semantic validators:
     - IDs must come from the provided lists, and spans must be quoted from the note;
     - dates and units must be sane;
     - forbidden claims are rejected in English, Spanish and Hindi: edibility or toxicity clearance, pesticide names and doses, air purification, certainty language and safety certification.
   - A failure gets one repair round with the validator errors. If that also fails, the result is `SCHEMA_INVALID` and the manual fallback is shown.
   - Thinking is set per feature. If a model rejects the setting, it is dropped once.
6. **Prompts as versioned modules** (`prompts/*.ts`).
   - Each module combines the shared policy (Appendix A.1, `POLICY_VERSION`) with a task instruction.
   - Context is built as **sections**. Each section has a data category (`plants`, `space`, `climate`, `journal`, `photos`, `location`) and can be marked required or untrusted. Untrusted text is wrapped as `<user_data>`, and the wrapper cannot be closed early from inside.
   - The send preview renders exactly these sections. The person can switch optional categories off, and their choices are remembered per feature. Text that contains an API key is never sent.
   - Location is a city or region only; photos are re-encoded to at most 1536 px.
7. **Features in M6.**
   - **F1:** explains plan matches. Extra suggestions are shown only when PlantPal's own eligibility engine finds them eligible in this garden; for example, _Lantana camara_ is dropped in India.
   - **F2:** reads a Quick Capture note into proposals (care, notes, harvests, one-off tasks). They go into the same review list as the deterministic reader and are saved only on confirmation.
   - **F12:** suggests alt text for a stored photo; the person edits and confirms it. It also explains the Climate Fit figures in plain words.
8. **Usage and limits.** A local meter counts requests and tokens per model per day (31 days kept). The person can set a daily soft cap; PlantPal asks before going over it. There is no background AI, and leaving a page aborts its request.
9. **Evaluation.** `pnpm eval` replays 124 versioned cases (`packages/ai/evals/cases/*.jsonl`) through the real client, validators and error mapping in CI.
   - **Gates:** every case meets its expectation; 0 prohibited claims in accepted outputs; 0 ungrounded IDs; 7 climates; and every required scenario (injection, zero light, covered balconies, pets and children, invasive and toxic plants, malformed and truncated output, refusals, consent, quota, billing, Hindi, Spanish, units) is covered.
   - The cases are **synthetic**: authored to exercise the pipeline, and labelled `origin: synthetic`. `pnpm eval:live` records real responses with the owner's own key. It never runs in CI and has not been run yet.

## Consequences

- AI quality claims rest on validators and replayed fixtures until the owner runs `pnpm eval:live`.
- Adding a feature means a prompt module, a schema, validators and eval cases. Changing a prompt or schema version requires a fresh eval run.
