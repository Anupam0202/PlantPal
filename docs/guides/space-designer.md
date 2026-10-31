# Guide: Space Designer

Demo mode works for everything except Photo-to-Plan (`VITE_PROVIDERS=mock pnpm --filter @plantpal/web dev`). Photo-to-Plan needs a Gemini key in Settings › AI; the Playwright suite mocks Gemini.

1. **Start a layout.** Plan › **Space designer** (or the command palette).
   - Give it a name, link it to a space, and enter the width and depth in metres.
   - Choose where the top of the plan points (for example **South**), then **Create layout**.
   - With nothing selected, the property panel shows **Space outline**. Add a corner after corner 2 and move it to make an L-shape or a bay.
   - If you drag a corner so the edges cross, a warning appears and **Save version** is disabled until you fix it.
2. **Place things.** Use the **Add** toolbar: pot, raised bed, railing, wall, overhang, path, trellis, rain tank and more.
   - Select a pot and press **Add plant**: the plant goes into the pot. Pick its species from the catalogue or link a plant from your garden.
   - The plant's growth circle and its faint uncertainty ring come from the catalogue's spread range.
3. **Keyboard only.** Tab to an item on the plan.
   - Arrows move it 10 cm, Shift moves 1 cm and Alt moves 50 cm. `R` rotates; Delete removes.
   - Ctrl+Z undoes and Ctrl+Y redoes.
   - Every value can also be typed in the property panel.
   - The **Table** tab lists every item with coordinates and sizes.
4. **Checks.** Make a path 40 cm wide: "keep at least 60 cm".
   - Put a large plant in a small pot: "needs at least … L".
   - Put two plants close together: "will crowd each other".
   - **Estimated saturated load** shows kilograms over the area with its assumptions, and always says "Not a structural assessment".
5. **Sun and shade** (needs the garden's location).
   - Pick a month and drag the time slider: shadows from walls, overhangs and solid items move.
   - **Show direct-sun hours** draws a heat map for that month.
   - Plants in too little sun are flagged in Checks.
6. **Growth.** Slide **Planting → 1 year → 3 years → Mature**. Sizes are illustrative, and annuals reach full size within the season.
7. **Versions.** **Save version** with a note, change something, save again, then **Compare** with an earlier version: both drawings appear side by side with counts of items added, removed and moved.
8. **Export and import.**
   - **JSON (local metric frame)**, **SVG drawing** (legend, 1 m scale bar, north arrow), **PNG image**, and **Print or save as PDF**.
   - **Import layout JSON** brings a file back as a new layout. A GeoJSON map file is refused with an explanation.
   - **Shopping list** counts pots, beds and fixtures with sizes and the potting mix needed. **Copy list** copies it.
9. **Photo-to-Plan (Labs).**
   - Turn it on in Settings › AI › Labs › **Photo-to-Plan**.
   - In the designer, **Choose a photo** of the space, then **Mark items with AI**. The send preview shows that only the photo is sent, resized and without metadata.
   - Pick one marked item, type its real width in centimetres, then **Place draft items**.
   - Every placed item says "Draft from photo; check measurements". One **Undo** removes them all.

Automated evidence:

- **Unit tests:**
  - geometry: overlap, containment in concave outlines, crossing outlines, snapping;
  - conflicts, saturated load, and shadow projection against fixtures;
  - sun-hours grid, growth stages, SVG export, and the JSON round trip including the GeoJSON refusal;
  - layout commands with optimistic concurrency and outbox, and archive round trip;
  - the Dexie v6 upgrade;
  - Photo-to-Plan placement and scaling;
  - key-order-independent "unsaved changes".
- **`pnpm eval`:** 169 cases including 9 F9 cases (abstention, swapped and short boxes, measurement claims, structural-safety claims, truncated JSON, consent denied). All gates pass.
- **Playwright (both viewports):**
  - **W6:** a layout built with the keyboard alone, with checks, load, table view, versions, compare, shopping list, an accessibility scan and a reload;
  - **export round trip:** outline editing with the crossing guard, JSON, SVG, GeoJSON refusal and re-import;
  - **F9 Photo-to-Plan:** off by default, Labs switch, send preview, no GPS reaching Gemini, scale from one width, draft placement, single undo.
