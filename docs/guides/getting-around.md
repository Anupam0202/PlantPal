# Guide: Getting around the app

1. `pnpm install && pnpm --filter @plantpal/web build && pnpm --filter @plantpal/web preview`
2. Open `/` → redirects to **Today**. On a phone-sized window the bottom navigation shows five destinations; on desktop a navigation rail appears (labels at ≥ 1280 px).
3. Press `Tab` once: **Skip to content** appears; `Enter` moves focus to the main region.
4. Press `Ctrl/⌘ K`: the command palette opens; type "nature" + `Enter`.
5. Go to **Settings**: switch theme to Dark, turn on _Increase contrast_, change language to Español. Reload — preferences persist and apply before first paint (no flash).
6. Visit `/dev/design-system` for the component gallery (buttons, evidence badges, forms, dialog, bottom sheet, sprout animation, icons).
7. Visit `/anything-else` → the not-found page with a way back.

Automated evidence: `pnpm test` (54 contrast checks), `pnpm e2e` (28 checks: navigation, axe on every route in both viewports, keyboard, preferences, CSP with Trusted Types).
