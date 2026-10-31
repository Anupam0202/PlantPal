# Security policy

## Reporting a vulnerability

Please do **not** open a public issue for security problems. Use GitHub's private vulnerability reporting ("Security" tab → "Report a vulnerability") on this repository. Include steps to reproduce, the affected version or commit, and the impact you expect.

We aim to acknowledge reports within 7 days and to fix confirmed high-severity issues as quickly as possible.

## Scope notes

- PlantPal never ships a developer AI key. Users bring their own Gemini key, which is encrypted on their device and never sent to PlantPal servers. Reports that show a key leaving the device, appearing in logs, exports or build output are high priority.
- Cross-garden data access, location disclosure, media access without authorization and stored script injection are high priority.
