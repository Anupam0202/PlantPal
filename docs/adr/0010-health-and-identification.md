# ADR-0010: Health cases, photo identification and species drafts

- Status: Accepted
- Date: 2026-10-29

## Context

M7 adds Health Cases (§6.8, F4), photo identification (F5), species intake (F3) with a curator queue, and species field-guide pages (§6.19). The integrity rules apply in full:

- no definitive diagnosis, no product names or doses, no edibility advice;
- toxicity only from cited sources (S10);
- nothing partial or unvalidated is ever stored (L05).

## Decisions

1. **Rules first, AI second.**
   - `packages/domain/src/health.ts` holds a deterministic triage tree that reads the questionnaire and the plant's context: sun hours, container, the next 3 days of forecast extremes, and waterings in the last 14 days.
   - It returns the same `HealthTriage` shape as the AI, with likelihood classes and non-chemical first steps, so both render with one component.
   - A property test checks that every answer combination produces a schema-valid triage with no percentages and sorted likelihoods.
   - The AI second look (F4) is optional and receives the rule candidates as hints it may disagree with.
2. **Health cases extend the v3-era record.**
   - `HealthCase` keeps its embedded, append-only `entries`.
   - New fields with defaults (`by`, `mediaIds`, `text`, `followUpScheduleIds`) keep migrated v3 scans valid without a data migration.
   - The outcome set follows the spec: resolved, improving, worse, unknown.
   - Opening a case creates one-off follow-up checks (default +3 and +7 days) as care schedules; closing the case removes the ones not yet due.
   - AI entries carry `AI_DRAFT` evidence; rule entries carry `MODELLED`.
3. **Photos and consent.**
   - Guided slots (whole plant, leaf top and underside, stem base, soil) store photos on the device.
   - Only re-encoded copies of at most 1536 px are sent, and only when the person sends from the preview. The E2E test checks that the GPS marker in the original never reaches Gemini.
   - Photos are a _required_ category for F4 and F5: switching them off sends nothing, and the rule triage stays available.
   - The AI button appears only once the small copies are ready, so a tap always opens the preview.
4. **Photo ID shows GBIF-confirmed names only.**
   - Candidates are resolved with the GBIF backbone match: plant kingdom, species rank or below, confidence ≥ 80. Unresolved names are dropped, and the drop count is shown.
   - A confirmed name that is in the catalogue links the specimen (`catalogTaxonId`).
   - Validators reject non-binomial names, percentages and any edibility or safety claim.
5. **Species drafts (F3) are two-step and cited.**
   - **Step 1:** grounded research with Google Search. Only the scientific name leaves the device; sources come only from the grounding metadata, deduplicated and HTTPS-only.
   - **Step 2:** structured extraction (`SpeciesDraft`) limited to the research text. Every citation must be in the grounding set, otherwise one repair, then `SCHEMA_INVALID`.
   - Drafts are stored on the device (`speciesDrafts`, Dexie v5, included in backups). Every trait starts as `AI_DRAFT`.
   - A person can accept or reject each trait after opening its source. Toxicity and edibility can never be accepted from an AI draft.
   - Drafts never feed the eligibility engine.
6. **Species pages** (`/species/:taxonKey`).
   - Catalogue facts are shown with evidence badges and review state, plus cited toxicity per group with unknown groups named, and status in the garden's region.
   - Live lookups:
     - the GBIF backbone match;
     - common names from Wikidata (via GBIF id P846, CC0);
     - Wikimedia Commons photos, keeping only CC0, CC BY, CC BY-SA and public domain, with author and licence shown.

   These open APIs carry no location, are called directly from the browser in every mode, and are cached in IndexedDB. `commons.wikimedia.org` was added to `connect-src`.

## Deferred or changed (owner decisions recorded in RUN-STATE)

- **Pl@ntNet** is not integrated. Its API takes the key in the URL query, which this app forbids for keys. It also needs a second user key and unverified CORS. It needs an owner decision: a server proxy with the owner's key, or BYOK through the vault.
- **Weather context:** "14-day weather history" uses the next 3 days of forecast plus the 14-day care log. Past-days weather needs a forecast adapter change, planned with the M8 sun and shade worker.
- **Not yet built:**
  - the expert share link (scoped, expiring) needs accounts (M10);
  - framing overlays for guided photos;
  - GBIF synonyms on species pages.
- The curator queue is per device until shared curation arrives with accounts (M10–M11).
