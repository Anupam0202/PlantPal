# Retire or replace an AI model

PlantPal never hard-codes Gemini model names: it lists the models each person's key can use and picks one per role (ADR-0009).

- **A model is retired.** Requests to it fail with `MODEL_UNAVAILABLE`; the client re-discovers once and moves to the next suitable model for that role. People who pinned the retired model in Settings › AI see the error with a link to choose another.
- **Change the preferred models.** Edit the role preferences in `packages/ai/src/discovery.ts` (`pickModels`), then run `pnpm eval` (replayed cases) and, with your own key and a small budget, `GEMINI_API_KEY=… pnpm eval:live -- --limit 20` to record real responses.
- **A prompt or schema changes.** Bump its version in `packages/ai/src/prompts/`; the eval gate must pass with 0 prohibited claims before release.
- **The API changes shape.** The REST adapter is in `packages/ai/src/client.ts`; recorded responses in `packages/ai/evals/cases/` show what each feature expects.
