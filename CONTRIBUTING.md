# Contributing to PlantPal

Thanks for helping people grow healthier, wilder urban spaces.

## Ground rules
- Read `docs/PlantPal-Master-Prompt-v4.md` (the product and engineering contract) and `docs/scope-ledger.md` (what is in scope and its status).
- Science first: every number needs a unit, a method, a time and a source. Unknown stays unknown; zero stays zero. See the science rules (S1–S18) in the master prompt.
- No fabricated data in the product: no fake neighbours, ratings, counts or placeholder images.
- Accessibility is part of "done": keyboard, screen reader, reduced motion and 200% zoom.

## Development
```bash
corepack enable
pnpm install
pnpm dev          # web app + API (mock providers by default)
pnpm test         # unit + integration tests
pnpm lint && pnpm typecheck
pnpm e2e          # Playwright end-to-end tests
```

## Commits and pull requests
- Conventional Commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`.
- One focused PR per change. CI must be green: lint, typecheck, tests, build, bundle budget.
- Describe user-visible changes and how you tested them. Add or update tests for every behaviour change.

## Questions
Open a GitHub Discussion (Q&A) for gardening or contributor questions, or an issue for bugs.
