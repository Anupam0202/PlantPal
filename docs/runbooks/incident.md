# Incident response

1. **Assess.** `/api/v1/status` shows provider health and open circuits. Cloudflare dashboard › Workers › plantpal › Logs (observability is on; logs carry no garden content, coordinates or keys).
2. **Contain.**
   - A failing provider: add it to `DISABLED_PROVIDERS` in `wrangler.toml` and deploy. The app shows cached facts marked stale and manual answers.
   - Community abuse: set `FEATURE_COMMUNITY = "off"` and deploy; all community routes disappear except `status`.
   - A bad release: [roll back](rollback.md).
   - A leaked secret: rotate it with `wrangler secret put`. Rotating `BETTER_AUTH_SECRET` signs everyone out; data is untouched.
3. **Security reports** arrive as described in `SECURITY.md`. Acknowledge within the time stated there.
4. **Personal data breach.** Record what, when and who is affected. Notification duties depend on the owner's jurisdiction (for example 72 hours under the GDPR); the owner decides and sends any notice (specification §2, O2).
5. **Afterwards.** Write a short note in `docs/incidents/<date>.md`: timeline, cause, fix, and the test that now guards against it.
