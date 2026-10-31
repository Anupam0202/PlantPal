# Accessibility review (§11, release gate 7)

Target: WCAG 2.2 AA. Automated checks cannot prove conformance, and no certification is claimed.

## Automated (in CI on every push)

- **axe-core** (WCAG 2.0–2.2 A and AA rules) on every route in `e2e/shell.spec.ts`, and on every new screen and state inside the feature tests (forms, dialogs, errors, empty states, the map, the Copilot, the community and moderation pages), on a Pixel 7 and a 1280 px desktop viewport.
- **Phone width:** every key page fits a 412 px phone without sideways scrolling (`e2e/care.spec.ts`).
- **Reflow at 320 CSS px** on eight core pages, and **200% text** on Today, Garden and Plan (`e2e/a11y.spec.ts`). The 200% check found that Today overflowed: buttons now wrap their labels (minimum rather than fixed heights), the phone header wraps, and Today's grid has an explicit single column on phones.
- **Forced colours** (Windows high contrast) on Today, Plan and Field stamps: every axe rule except colour contrast, which axe cannot judge in this mode because the system palette replaces the theme's colours.
- **Keyboard:** 25 Tab stops on Today each show a focus indicator and focus keeps moving (no trap). The Space Designer has a keyboard-only E2E (`e2e/designer.spec.ts`), and the skip link is tested.
- **Contrast of design tokens:** 54 automated WCAG contrast checks in `packages/ui/test/contrast.test.ts`, light and dark.
- **Lighthouse accessibility:** 100 on Today, Plan, Garden and Nature (`docs/perf.md`).

## Manual review: still needed

A person using assistive technology has **not** reviewed PlantPal yet. Before calling a build pilot-ready, the owner (or a tester) should run these checks and record the results here:

| Flow                                                | VoiceOver (iOS or macOS) | TalkBack or NVDA | Keyboard only          |
| --------------------------------------------------- | ------------------------ | ---------------- | ---------------------- |
| First run → first plan (W1)                         | NOT_RUN                  | NOT_RUN          | Covered in part by E2E |
| Log care from Today; check and skip a task (W3)     | NOT_RUN                  | NOT_RUN          | NOT_RUN                |
| Add a plant with a photo and alt text               | NOT_RUN                  | NOT_RUN          | NOT_RUN                |
| Health case with the send preview (W5)              | NOT_RUN                  | NOT_RUN          | NOT_RUN                |
| Space designer: add, move and rotate an item (W6)   | NOT_RUN                  | NOT_RUN          | Covered by E2E         |
| Timed pollinator count (W7)                         | NOT_RUN                  | NOT_RUN          | NOT_RUN                |
| Copilot: ask, read the answer, confirm a suggestion | NOT_RUN                  | NOT_RUN          | NOT_RUN                |

For each, check: headings and landmarks make sense; every control has a clear name; live updates (toasts, streamed Copilot text, timer) are announced politely and errors assertively; nothing needs drag, hover, voice or a camera without another way; and zoom to 400% keeps everything usable.
