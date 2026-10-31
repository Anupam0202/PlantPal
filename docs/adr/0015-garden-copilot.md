# ADR-0015: Garden Copilot (F6) and weekly reflection (F8)

- Status: Accepted
- Date: 2026-10-30
- Specification: §18.5–§18.7

## Context

The Copilot answers questions about the person's own garden with their own Gemini key. It must not write anything on its own, must keep personal data on the device unless a tool needs it, must cite open-world facts, and must keep the prohibited claims out (Appendix A).

## Decisions

### 1. A streamed tool loop on the REST API

- `GeminiClient.streamStep` calls `streamGenerateContent?alt=sse` with `functionDeclarations`; the key stays in the `x-goog-api-key` header. Visible text streams to the page; thoughts are never shown.
- The model's turn goes back to the API exactly as received, thought signatures included, so a multi-step turn keeps working on thinking models.
- At most six tool calls per turn. After the sixth, the next request sets `functionCallingConfig.mode = NONE`, so the model must answer.
- Retries follow the client policy (two attempts, retryable errors only); a retry clears the partly streamed text.

### 2. Tools

- **Read tools** run on the device against the active garden only: overview, plant, recent activity, conditions, climate, catalogue search, species facts, eligibility, tasks. Weather and climate are fetched on the device; only the results are sent, never coordinates.
- **Proposal tools** never write. Each payload is checked with Zod and the claim validators, every id is checked against the person's own records, and the app writes the card text from checked data, not from model prose.
- **Web search** (`search_web`) is a separate grounded request that sends only the query. Sources come from grounding metadata and show as numbered chips.
- **Consent.** The person chooses which data categories the tools may read (plants, spaces, care history and notes, weather and climate) and whether web search is allowed. A tool whose category is off is not offered to the model at all. The catalogue holds no personal data and is always offered.

### 3. Proposals are bound and re-checked

Each proposal is bound to `{actor, workspace, SHA-256 of the tool and payload, versions of the records it touches, policy version, expires in 30 minutes}`. Confirming re-reads the records and re-checks all of it. Anything expired, changed or stale is not applied; the card asks the person to ask again.

### 4. Answers are checked before they are kept

The final text goes through `prohibitedClaims`. One rewrite is requested with tool calls off; if the rewrite still breaks a rule, the answer is withheld and the page points to a manual next step.

While building this, the dose rule wrongly flagged "500 ml of water" (a watering amount) as a pesticide dose. It now matches only amounts mixed into water ("5 ml per litre", "2 g in water") or into a bucket or gallon.

### 5. Weekly reflection (F8)

- On the first visit to Today in a new week, for gardens that existed for the whole of last week, a card counts what was recorded last week (care, notes, nature visits, harvests; harvest mass only from weights). A quiet week says so kindly. It can be closed for the week.
- "Put it in words" sends only that summary and the coming tasks to the fast model (`weekly-reflection` v1). The validator rejects blaming or pressuring words, streak talk, numbers not in the summary, and prohibited claims (one repair). Six eval cases cover it.

## Consequences

- The Copilot works with any Gemini model that supports function calling; the conversation lives in page memory only and is never synced.
- The eval harness replays single-request features; the Copilot's multi-step loop is covered by unit tests (`packages/ai/test/copilot.test.ts`) and an E2E run against a scripted streaming mock.
- A side panel on every page (§5.2) is not built yet; the Copilot is a page at `/copilot` and in the command palette.
