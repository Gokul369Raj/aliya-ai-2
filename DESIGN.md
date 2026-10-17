# DESIGN.md — Aliya AI

Reference material for intentional design decisions. **Adapt, don't copy.**

The app runs on a single **neo-brutalist** theme. There is no dark theme and no second
skin — landing and in-app views share one palette, one border weight and one shadow rule.

---

## The system in six lines

| Move | Value |
|---|---|
| Border | `2px solid #111111` (`3px` on panes and modals) |
| Shadow | `4px 4px 0 #111111` — solid offset, **never blurred** |
| Radius | `0` everywhere. Cards, buttons, chips, inputs. |
| Surface | Pure white cards (`#ffffff`) on warm paper (`#f3eee7`) |
| Hover | Butter yellow `#ffe9a3` — a highlighter stroke, not a whisper |
| Press | Element translates *into* its shadow (`translate(2px, 2px)`, shadow removed) |

That is the whole aesthetic. Colour is unchanged from the previous Tavus palette — the
brutalist character comes from **structure**, not from a new hue. Green stays the one
interactive accent; paper and ink stay the canvas.

---

## Where the theme lives

| Layer | File | What it owns |
|---|---|---|
| Tokens | `client/src/index.css` `:root` | Full token set + base elements (inputs, scrollbars, focus) |
| Tokens | `client/src/App.css` `:root` | Same set — **App.css wins the cascade**, so it must stay in sync |
| Overrides | `client/src/App.css`, final `NEO-BRUTALIST THEME` block | Every component re-skin |
| Charts | `client/src/graph-utils.js` `VIZ_PALETTE` | Single source of truth for node / edge / legend colour |
| Canvas | `Graph2D.jsx`, `Graph3D.jsx`, `CommitHistory3D.jsx`, `LayeredFlowView.jsx` | Cytoscape node + label styles, three.js canvas background |
| PDF | `client/src/utils/pdfReport.js` `THEME` + `CHART_COLORS` | The printed report — hand-rolled PDF writer, no library |

**Add new component CSS at the end of the override block**, not after it — anything that
restyles an existing component belongs in the theme layer so the theme stays in one place.
Only genuinely new components go below it.

---

## The printed report

`pdfReport.js` writes raw PDF operators, so it has its own `THEME` table with the same
rules as the CSS: paper page, **white** cards, `#111111` ink borders, offset ink shadows,
one green accent, and a 2.4pt ink frame around every page.

Two constraints the table exists to enforce:

- **Nothing dark may carry dark text.** The previous palette filled cards with `#111114`
  and then drew `THEME.text` (`#140206`) on top — every table cell was ink on near-black,
  i.e. invisible. Surfaces are light now.
- **`accent` (`#0cb531`) is a fill only** — it is 1.9:1 on white, so it may carry a slab,
  swatch or bar but never a label. Green *text* is `accentText` (`#0a6b22`). The legacy
  `cyan` key is kept and resolves to `accentText`, because every existing use of it is a
  label or a rule.

`CHART_COLORS` must clear **4.5:1 on white** — those values are painted as label text in
the evidence lists, language legend, ranked rows and commit timeline, not only as fills.

Helper vocabulary: `fillRect` (pure fill, no hairline), `hardShadow(x, y, w, h, offset)`,
`card(...)` = shadow + white rect + ink frame, `rect(..., lineWidth)` (the width is now
explicit — it used to inherit whatever `line()` set last), `metricCard`, `bar`, `donut`.

---

## Graph view switch

The **2D / 3D switch sits on the canvas itself** (`.graph-view-toggle`, bottom-left of
`.graph-container`) — not in the pane toolbar, which scrolls horizontally and could push
it out of reach. Bottom-left keeps it clear of the legend (top-left), the zoom cluster
(bottom-right) and the summary dock (top-right). It only renders when `graphScope === 'repo'`.

---

## Reading the graph

Both views encode the same three things, and the legend in `App.jsx` states the key rather
than leaving the user to guess it:

| Channel | Meaning |
|---|---|
| **Colour** | Language (or category, when the filter type is switched) |
| **Shape** | `folder` → rounded square · `file` → circle · `important` → diamond |
| **Edge** | solid + arrowhead = **imports** · faint dashed = **contains** · dotted = semantic |

Rules that make it legible — do not undo these:

1. **The layout is deterministic.** fcose runs with `randomize: false`; the 3D view seeds
   from a **Fibonacci sphere** with an importance-weighted shell (hubs near the core, leaves
   toward the surface, squashed 0.82 on Y). Together with soft repulsion (`charge -38`,
   `distanceMax 260`) the settled graph reads as one dense clustered mass — the
   repository's brain — rather than a flat ring disc.
2. **Labels are earned, not universal.** Cytoscape drops labels below
   `min-zoomed-font-size`; the 3D view shows a sprite only for folders, key modules,
   broken/dead nodes, and the hovered/selected neighbourhood. Naming 300 nodes is noise.
3. **Emphasis is ink, never bloom.** The selected neighbourhood is redrawn in `#111111`.
   In 3D, a node that matters gets a heavier **back-side ink outline** — no emissive, no
   particles except on the traced path.
4. **Two edge kinds must never look alike.** An import is the graph you read; "folder
   contains file" is scaffolding. Different colour, width, dash and arrowhead.
5. **Import direction is stated.** Both views draw an arrowhead on dependency edges.
6. **Focus mode is absolute.** Selecting a node leaves it and its direct neighbours at full
   strength and drops *everything else* to a ghost (3D core 7% / outline 5% / links 2.5%;
   2D `node.dimmed` 0.08, `edge.dimmed` 0.04). Ghosted nodes also lose their labels. If you
   are tempted to raise those numbers, don't — "show me only this and what it touches" is
   the point of clicking.
7. **`.graph-node-readout`** (shared by both views) names what is under the cursor: label,
   path, language, category, status flags and a connection count derived from the edge
   list. Nothing inferred — a missing field is simply not rendered.

`GraphNodeReadout.jsx` sits bottom-centre, above the control row, so it never collides with
the legend, summary dock, view switch or zoom cluster.

### Keeping the 3D view fast

The view used to own one geometry and two materials **per node** — 300 geometries, 600
materials, 600 shader compiles and a full-scene transparency sort every frame. It stuttered.

- Everything is cached and shared by key: `getGeometry(shape, roundedSize)`,
  `getCoreMaterial(color)`, `getGhostMaterial(color)`, and six `OUTLINE_MATERIALS` keyed by
  state. **The emphasis pass swaps references and never mutates a material** — mutating a
  shared material would recolour every node that shares it.
- `MeshLambertMaterial` + `flatShading`, not `MeshStandardMaterial`: matte, faceted, and a
  fraction of the fragment cost.
- `renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))`. On a Retina display the default
  2× doubles fragment work for a difference nobody can see; this is the single biggest win
  for camera smoothness.
- `controls.dampingFactor` 0.075 (long glide), `warmupTicks: 12`, `d3VelocityDecay: 0.45`.
- The dot-grid floor uses `depthWrite: false` so it can never hide a node that drifts below
  it, and it is the only transparent object in the scene besides ghosted nodes.

`frameCamera()` derives its bounds from the **live** `graphData` node positions rather than
`getGraphBbox()`, so it cannot silently no-op if the library API changes. It frames at a
three-quarter angle and sets `scene.fog` from the resulting camera distance.

---

## Health score

`HealthScorePanel.jsx` is class-driven (`.health-*` in the App.css override block), not
inline-styled — it used to paint `rgba(20, 2, 6, 0.3)` text, which is about 1.9:1 on paper.

**The score explains itself.** `server/health-score.js` builds each category through a
**ledger**: `credit(text, delta)`, `penalty(text, delta)` and `note(text)` record the exact
delta the scoring code applied. `evidence` is derived from the ledger, so the flat string
contract (and `test-health-score.js`) is unchanged, and each category additionally returns
`breakdown`, `baseline`, `credits`, `penalties`, `rawScore` and `clamped`.
`analyzeHealthScore` also returns `weights` and `contributions`.

The panel renders:

- the **weighted-mean arithmetic** for the overall score (`82 × 0.25 = 20.50` …),
- **+earned / −lost** chips on every category card,
- and, for the open category, a ledger line — `starts at 50 · +26 earned · −97 lost · = 0 ·
  ran past the scale, capped at 0` — followed by every signal with its real delta.

Nothing is inferred. If a signal cost 8 points the list says −8, because the server said so.

- Overall card: white, ink border, hard shadow, an **ink-framed dial** with a flat-capped
  arc (`strokeLinecap: butt` — no rounded caps in this theme).
- **The score colour is set inline** because it tracks the band, so the open state must
  override it explicitly (`.is-open .health-category-score { color: var(--accent-fg)
  !important }`) — otherwise the number is green-on-green. Same for the delta chips.
- The grade next to the overall score comes from a client-side `getGrade()` that mirrors
  `server/health-score.js` (A+ ≥ 90 … F < 30). It previously printed the *architecture*
  grade beside the overall number, so the two could disagree.

---

## Palette

| Token | Hex | Role |
|---|---|---|
| `--bg-app` / `--paper` | `#f3eee7` | Page canvas. The contrast tests are tuned against this exact value. |
| `--bg-panel` / `--card` | `#ffffff` | Every raised surface, card, input, modal |
| `--bg-inset` | `#e8e2d3` | Recessed strips: code lines, PDF well, timeline track |
| `--bg-hover` | `#ffe9a3` | Hover highlight — butter yellow |
| `--ink` / `--border` | `#111111` | Text, and **every border**. Borders are no longer a faint wash. |
| `--border-soft` | `rgba(17,17,17,0.18)` | Hairlines that must not read as a rule (timeline connectors) |
| `--text-primary` | `#111111` | Body + headings |
| `--text-secondary` | `#4a453d` | Supporting copy |
| `--text-muted` | `#6b6559` | Meta, placeholders |
| `--text-invert` | `#fffdf6` | Text on an ink fill. **Never** the literal `white`. |
| `--accent` | `#0cb531` | The one interactive accent: fills, borders, dots, focus rings |
| `--accent-text` | `#0a6b22` | Green **text** on a light surface (the neon is 2.37:1 and cannot be a label) |
| `--accent-secondary` | `#ff5c8a` | Typographic accent only |

Landing-only tokens live under `.tv-landing` (`--tv-*`): `--tv-green`, `--tv-yellow`
(`#ffd23f`), `--tv-pink`, and `--tv-hairline: 2px solid var(--tv-ink)`.

### `--accent` is not a text colour

`#0cb531` is 2.37:1 on paper. It may carry a border, a dot, a fill or a focus ring —
never a label. Green *text* is `--accent-text`; green *data* is `VIZ_PALETTE.green`.

---

## Typography

| Role | Family | Notes |
|---|---|---|
| Display | `Space Grotesk` (app) / `Archivo Black` (landing) | Uppercase, tight tracking on the hero |
| Body | `Inter` 14px / 1.5 | Unchanged |
| Micro / labels | `JetBrains Mono` 10–11px, uppercase, ls 0.10–0.18em | Unchanged |

The landing headline is `Archivo Black`, uppercase, `clamp(30px, 4.5vw, 60px)`, lh 0.98.
The accent line is **ink on a solid green block** with a `6px 6px 0` ink shadow — a
highlighter stroke, not italics. The block must keep `box-decoration-break: clone` so it
survives a line wrap.

---

## Data-visualisation palette

`client/src/graph-utils.js` holds **two** palettes, and the split is deliberate:

| Table | Floor | Used for |
|---|---|---|
| `VIZ_PALETTE` → `CATEGORY_COLORS` | **4.5:1** on paper | Anything painted as **text** — `FlowExplorerPanel` layer names, the PDF |
| `VIZ_NODE_PALETTE` → `LANGUAGE_COLORS`, `CATEGORY_NODE_COLORS` | **3:1** on paper | Graph **node fills** and legend swatches |

The text-safe table is necessarily dark, and dark fills read as mud on paper — that is the
whole reason the second table exists. `getNodeColor()` and `getNodeCategoryColor()` return
the vivid table; never use the vivid table for a label.

**The brand neon green is never a data fill or a label.**

**Dimming fades toward the canvas.** A de-emphasised node, edge or label moves *toward*
paper (`dimEdge` `#ded7cb`, `dimLabel` `#8a8175`) — never to near-black.

Cytoscape node labels are **ink text on a white pill with an ink outline**. three.js canvases
use `#f3eee7` so the graph sits on the same paper as the pane.

---

## Rules for future work

1. **Grounding is a hard rule.** The logo cloud is built from `LANGUAGE_LABELS`, never
   invented. Repo facts come from the scanner payload — no invented counts in the UI, the
   AI prompt or the PDF.
2. **The floor is 4.5:1, not 3:1.** Run `node test-theme-contrast.js --assert` before and
   after any colour change. It catches invisible text, dark panels without readable text,
   literal `white`/`black` keywords, and palette regressions — statically.
3. **Check the pair, not the colour.** The historical failures were never a single bad
   value; they were a *pair* that was right in one theme and invisible in the other:
   - `--bg-input` left at ink with ink text → invisible.
   - `background: var(--border)` on a chip, once `--border` became ink → ink on ink.
     (`.badge`, `.run-flow-index` and `.timeline-step::before` were all fixed for this.)
   - `color: white` on a cream surface.
   - A dark cytoscape `text-background-color` under dark label text.
   When you touch either half of a pair, check the other half.
4. **Never blur a shadow.** No `box-shadow` with a blur radius, no `backdrop-filter` on
   chrome. Both were removed deliberately — the flat offset shadow *is* the theme.
5. **One accent for interaction.** Green means "you can act on this". Don't spend it on
   decoration; `--tv-yellow` carries hover instead.
6. **The landing keeps its own tokens.** `.tv-landing` / `--tv-*` exists so the hero can
   use `Archivo Black` at 60px and square chips without dragging that scale into the app
   shell.

## Commands

- `node test-theme-contrast.js --assert` — static colour + contrast gate.
- `node scripts/theme-check-harness.mjs` — writes `/tmp/theme-check.html`, a page that
  loads the real CSS and asserts computed contrast in a browser (use when the cascade is
  in doubt).
- `cd client && ./node_modules/.bin/esbuild src/main.jsx --bundle --format=esm
  --loader:.jsx=jsx --jsx=automatic --outfile=/tmp/app-check.js` — checks every import and
  JSX file without a full build.
