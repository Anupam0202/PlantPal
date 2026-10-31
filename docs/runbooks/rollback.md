# Roll back

1. `cd apps/api && pnpm exec wrangler deployments list` and pick the last good version.
2. `pnpm exec wrangler rollback <version-id>`. This restores the Worker code and the web app it serves; it does not touch D1.
3. Database: migrations only add tables and columns, so the previous code keeps working with the newer schema. Never run a down migration on real data without owner approval (O3).
4. If a release wrote bad data, restore from Time Travel (see [restore](restore.md)) only after the owner agrees, because it also removes good writes made since that point.
5. Devices keep their local data and their unsent changes; sync resumes when the server is healthy.

## The Vercel site

The static web app on Vercel is published from `main`. To undo a bad release there, use Instant Rollback in the Vercel dashboard (Deployments, then the last good production deployment, then Instant Rollback), then revert the commit on `main` so the next push does not publish it again.
