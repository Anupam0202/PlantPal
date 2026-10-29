# ADR-0011: Space Designer

- Status: Accepted
- Date: 2026-10-29

## Context

M8 adds the Space Designer (§6.7, W6): a 2D plan of a balcony, terrace, roof or yard, drawn to scale, with plants in containers, checks for spacing, light and weight, a sun and shade overlay, growth scenarios, versions and exports. Photo-to-Plan (F9) is experimental and sits behind a Labs switch.

The integrity rules shape it:

- the weight estimate is never a structural assessment;
- a single photo cannot give true measurements;
- a plan has no georeference, so it is never exported as GeoJSON.

## Decisions

1. **Coordinates are metres in a named local frame.**
   - Every layout stores `{frame: 'local-metric', unit: 'm', origin: [0, 0], rotationDeg}`. `rotationDeg` is the compass bearing that the top of the plan points to; the sun maths uses it to turn sun azimuths into plan directions.
   - Items share one uniform shape (`LayoutItem`): point items (round or rotated rectangle) and line items (walls, railings, doors, windows, trellises) carry the same fields, so the table view, exports and validation treat every kind alike.
   - The outline is any simple polygon of 3–64 corners. A crossing outline is shown as a warning and cannot be saved.
2. **Pure geometry in `packages/domain/src/layout`, tested without a browser.**
   - `geometry.ts`: footprints, area, point-in-polygon, containment for concave outlines, segment crossing, simple-polygon check, convex hull, snapping.
   - `conflicts.ts`: spacing (mature-spread overlap), container too small for the plant's minimum volume, light mismatch against the sun grid or the space's monthly sun profile, height against clearance, paths narrower than 60 cm, items outside the outline, plants not inside their container.
   - `estimateLoad`: wet potting mix at 1.2 kg/L plus 10 % for the container shell, and full water tanks. The assumptions are shown next to the number, items without a soil depth are listed as not counted, and the panel always says "Not a structural assessment… consult a qualified professional".
   - `shade.ts`: shadow polygons from walls, overhangs and solid items for any date and time, and a direct-sun-hours grid for a day in the chosen month. Far obstacles come from the space's horizon profile (the Sun Hours Finder).
   - `growth.ts`: planting → 1 year → 3 years → mature from the catalogue's spread _range_, with the range drawn as an uncertainty ring. Annuals reach full size within the season and reset. The panel labels sizes "illustrative".
3. **The sun runs in a Web Worker.** The grid cell is 10 cm for spaces up to about 40 m², coarser above that to stay near 4,000 cells. Sampling is every 10 minutes in the garden's time zone. Results come back as a transferable `Float32Array`. The canvas stays responsive while the grid is computed, and a stale request is dropped when a newer one arrives.
4. **Keyboard and non-visual parity.**
   - Every item on the SVG canvas is a focusable button named by kind, label and position. Arrows move 10 cm (Shift 1 cm, Alt 50 cm), `R` rotates by 15°, Delete removes, and Ctrl+Z / Ctrl+Y undo and redo (100 steps; a drag is one step).
   - The property panel has a numeric field for every value the canvas shows. The outline is edited as numbered corners.
   - The table view lists every item with coordinates and dimensions.
   - The W6 E2E test builds a whole layout without a pointer.
5. **Versions are snapshots.** `layouts` and `layoutVersions` were added in Dexie v6, and both are included in backups.
   - Saving writes a new version with an optional note, guarded by optimistic concurrency like every other record.
   - The compare view draws both versions and counts items added, removed and moved.
   - "Unsaved changes" compares key-sorted JSON, so a body that went through validation still counts as saved.
6. **Exports.**
   - JSON (`type: 'plantpal-layout'`, schema 1) round-trips through import, which creates a new layout. GeoJSON files are refused with a clear message.
   - The SVG export is self-contained and to scale, with a legend, a 1 m scale bar and a north arrow from `rotationDeg`. PNG is rasterised from it. PDF goes through the browser's print dialog with print-only CSS.
   - The shopping list counts containers, beds and fixtures with sizes and estimated potting mix. It is ready to feed Resources & Costs (M9).
7. **Photo-to-Plan (F9) is opt-in and draft-only.**
   - It appears only when **Settings › AI › Labs › Photo-to-Plan** is on and AI is enabled.
   - The photo is resized and re-encoded on the device, never stored, and sent only from the send preview (photos are a required category).
   - `spaceDetectV1` asks Gemini only to mark items with `box_2d` boxes on a 0–1000 grid. Validators reject swapped or malformed boxes, any stated size or distance, and structural-safety claims; one repair is allowed. The box is a 4-number array rather than a tuple because the structured-output schema subset has no `prefixItems`.
   - The person picks one marked item and types its real width. Every item is then scaled from it and placed inside the outline. Left–right comes from the photo; front–back comes from where each item meets the floor.
   - Each placed item is labelled "Draft from photo; check measurements", and one Undo removes the whole draft.
   - Nine eval cases cover F9, including abstention, malformed boxes, measurement claims and truncated output.
   - Writing these cases found a gap in the shared validator: "structurally safe", "certified safe to load" and "can hold the weight" were not caught. The rule now covers them in English, Spanish and Hindi.

## Consequences and deferred work

- **Not built yet:**
  - **AI mock-up (EXP)**, which illustrates a plan on the user's photo with an image model: it is often paid, so it needs a cost display before use;
  - freehand drawing of the outline on the canvas (the outline is edited as corners);
  - snapping to other items' edges;
  - a per-item shadow-height editor for plants (plants cast no shade in this version).
- The designer chunk loads only on the designer routes. The sun worker is its own chunk.
- The Resources & Costs hand-off from the shopping list lands with M9.
