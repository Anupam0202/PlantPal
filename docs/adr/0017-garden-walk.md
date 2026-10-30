# ADR-0017: Garden Walk (F7, Gemini Live) is not built yet

- Status: Accepted (blocked on an owner decision)
- Date: 2026-10-30
- Milestone: M12 (§18.5 F7, experimental)

## Context

F7 is a spoken walk round the garden using the Gemini Live API, with proposals reviewed in a tray afterwards. The Live API is a WebSocket session. Browsers cannot set headers on a WebSocket, so a browser can authenticate only by:

1. putting the API key in the WebSocket URL (`?key=…`), or
2. using a short-lived token minted by a server that holds a key.

Both conflict with rules PlantPal keeps everywhere else (ADR-0009): the person's key travels only in the `x-goog-api-key` header, never in a URL (URLs end up in logs, proxies and history), and no PlantPal server ever holds or uses a Gemini key. Pl@ntNet was deferred for the same reason (ADR-0010).

## Decision

F7 is not built. The scope ledger marks it `BLOCKED (owner decision)`. Until then, the fallback the spec names applies: Quick Capture by typing, or by the phone keyboard's own dictation, which needs nothing from PlantPal.

## Options for the owner

| Option                                  | What changes                                                                                                            | Risk                                                                      |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| A. Key in the WebSocket URL, Labs only  | The person's key appears in one URL to Google, only during a walk they start                                            | Breaks the "never in a URL" rule; the key may be logged by intermediaries |
| B. Ephemeral tokens from the Worker     | The person pastes their key into a server route once per walk; the Worker mints a short-lived token and forgets the key | A PlantPal server handles the key, which ADR-0009 rules out               |
| C. Wait for a header-based browser path | Nothing now                                                                                                             | None; the feature waits                                                   |

Recommendation: C, unless the owner accepts A as an experimental, clearly explained opt-in.
