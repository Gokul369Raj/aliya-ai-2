/**
 * Theme contrast regression test.
 *
 * The app was converted from a dark theme to the cream "Tavus" palette, but the
 * swap left values behind that were tuned for near-black surfaces. They fail
 * silently — nothing errors, the text is just invisible. Three real examples
 * this test would have caught:
 *
 *   --bg-input: #140206      with color: var(--text-primary)  → ink on ink
 *   color: white             on background: var(--bg-hover)   → white on cream
 *   text-background: #08080a with text color #3a2b30          → ink on ink
 *
 * Usage: node test-theme-contrast.js [--assert]
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'client', 'src');
const CREAM = '#f3eee7';

// ─── Colour maths ────────────────────────────────────────────────────

function parseHex(value) {
  const hex = String(value).trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(hex)) return null;
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function relativeLuminance({ r, g, b }) {
  const channel = (value) => {
    const v = value / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const NAMED = { white: '#ffffff', black: '#000000' }

/**
 * Parse `#rgb`, `#rrggbb`, `rgb()`, `rgba()` and the named keywords we use.
 * Alpha matters: `rgba(20, 2, 6, 0.3)` is 30% ink over whatever is behind it,
 * which lands far lighter than the hex suggests — that is how several labels
 * ended up at 2.57:1 while looking correct in the source.
 */
function parseCssColor(value) {
  const text = String(value || '').trim()
  if (!text) return null

  const named = NAMED[text.toLowerCase()]
  if (named) return { ...parseHex(named), a: 1 }

  const fn = text.match(/^rgba?\(([^)]+)\)$/i)
  if (fn) {
    const parts = fn[1].split(/[,/]/).map((p) => parseFloat(p.trim()))
    if (parts.length < 3 || parts.some((p) => Number.isNaN(p))) return null
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 }
  }

  const hex = parseHex(text)
  return hex ? { ...hex, a: 1 } : null
}

/** Flatten a translucent foreground over an opaque background. */
function composite(fg, bg) {
  const a = fg.a ?? 1
  if (a >= 1) return { r: fg.r, g: fg.g, b: fg.b }
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
  }
};

// ─── Minimal CSS reader ──────────────────────────────────────────────

/** Collect `--token: value` declarations so `var(--token)` can be resolved. */
function readTokens(css) {
  const tokens = new Map();
  for (const match of css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    const value = match[2].trim();
    if (/^#[0-9a-fA-F]{3,6}$/.test(value)) tokens.set(match[1], value);
  }
  return tokens;
}

function resolveColor(raw, tokens) {
  if (!raw) return null;
  let value = String(raw).trim();
  const varMatch = value.match(/var\((--[\w-]+)(?:\s*,\s*([^)]+))?\)/);
  if (varMatch) {
    const fallback = varMatch[2] ? varMatch[2].trim() : null;
    value = tokens.get(varMatch[1]) || fallback;
    if (!value) return null;
  }
  const named = NAMED[value.toLowerCase()];
  if (named) return parseHex(named);
  return parseHex(value);
}

/**
 * Map each class to the background its own rule paints.
 *
 * A rule that only sets `color` inherits its surface from an ancestor, so the
 * surface cannot be read off the rule itself. Without this, `.tv-badge span`
 * (neon green on the badge's ink fill, ~12:1) is mis-measured against cream and
 * reported as a 1.65:1 failure. This is a one-level cascade lookup, which is
 * enough for the flat BEM-ish class structure here.
 */
function readClassBackgrounds(css, tokens) {
  const backgrounds = new Map();
  for (const { selector, body } of readBlocks(css)) {
    const simple = selector.match(/^\.([\w-]+)$/);
    if (!simple) continue;
    const raw = readDeclaration(body, 'background-color') || readDeclaration(body, 'background');
    if (!raw || raw.includes('gradient')) continue;
    const color = resolveColor(raw, tokens);
    if (color) backgrounds.set(simple[1], color);
  }
  return backgrounds;
}

/** Find the nearest ancestor class of `selector` that paints a background. */
function inheritedSurface(selector, classBackgrounds, fallback) {
  const classes = [...String(selector).matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
  for (let i = classes.length - 1; i >= 0; i -= 1) {
    const found = classBackgrounds.get(classes[i]);
    if (found) return found;
  }
  return fallback;
}

/** Split a stylesheet into `{ selector, body }` blocks. */
function readBlocks(css) {
  const blocks = [];
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const match of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    blocks.push({ selector: match[1].trim().replace(/\s+/g, ' '), body: match[2] });
  }
  return blocks;
}

function readDeclaration(body, property) {
  const match = body.match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, 'i'));
  return match ? match[1].trim() : null;
}

// ─── Checks ──────────────────────────────────────────────────────────

function runAssertions() {
  let failures = 0;
  const check = (label, ok, detail = '') => {
    console.log(` ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failures += 1;
  };

  const indexCss = fs.readFileSync(path.join(SRC, 'index.css'), 'utf8');
  const appCss = fs.readFileSync(path.join(SRC, 'App.css'), 'utf8');
  const tokens = new Map([...readTokens(indexCss), ...readTokens(appCss)]);

  console.log('\n── TOKENS: the input surface must not swallow its own text ──');
  const inputBg = resolveColor(tokens.get('--bg-input'), tokens);
  const inputText = resolveColor(tokens.get('--text-primary'), tokens);
  check('--bg-input is a light surface', inputBg && relativeLuminance(inputBg) > 0.6,
    `--bg-input = ${tokens.get('--bg-input')}`);
  check('input text contrasts with the input surface',
    inputBg && inputText && contrastRatio(inputBg, inputText) >= 4.5,
    `${contrastRatio(inputBg, inputText).toFixed(2)}:1`);
  check('--bg-inset is defined', Boolean(tokens.get('--bg-inset')));

  console.log('\n── CSS: no rule may render text invisible ──');
  // WCAG asks 3:1 of large text and 4.5:1 of body text. Font size is usually
  // declared on an ancestor (`.tv-headline` sets `clamp(46px, 6.4vw, 88px)`,
  // `.tv-nav .logo-text` sets 26px) which a rule-level reader cannot see, so
  // these two are declared large explicitly. This supplies a missing fact — it
  // does not waive a failure: both still have to clear 3:1.
  const LARGE_TEXT = new Set([
    '.tv-headline-accent',   // inherits clamp(46px, 6.4vw, 88px) from .tv-headline
    '.tv-nav .logo-accent',  // inherits 26px from .tv-nav .logo-text
  ]);
  const creamColor = { ...parseHex(CREAM), a: 1 };
  const classBackgrounds = readClassBackgrounds(appCss, tokens);
  const invisible = [];
  for (const { selector, body } of readBlocks(appCss + '\n' + indexCss)) {
    const colorRaw = readDeclaration(body, 'color');
    if (!colorRaw) continue;
    // Resolve the token, keeping any alpha so it can be composited.
    let fg = parseCssColor(colorRaw);
    if (!fg) {
      const varMatch = colorRaw.match(/var\((--[\w-]+)(?:\s*,\s*([^)]+))?\)/);
      if (varMatch) fg = parseCssColor(tokens.get(varMatch[1]) || varMatch[2] || '');
    }
    if (!fg) continue;

    const bgRaw = readDeclaration(body, 'background-color') || readDeclaration(body, 'background');
    let bg = null;
    if (bgRaw && !bgRaw.includes('gradient')) {
      bg = parseCssColor(bgRaw);
      if (!bg) {
        const varMatch = bgRaw.match(/var\((--[\w-]+)(?:\s*,\s*([^)]+))?\)/);
        if (varMatch) bg = parseCssColor(tokens.get(varMatch[1]) || varMatch[2] || '');
      }
    }
    // No background on the rule itself: inherit from the nearest ancestor
    // class that paints one, and only fall back to cream if there is none.
    const onCream = !bg;
    if (!bg) bg = inheritedSurface(selector, classBackgrounds, creamColor);
    // A translucent background still sits on the cream page.
    bg = { ...composite(bg, creamColor), a: 1 };
    const surface = bg;

    const effective = composite(fg, surface);
    const ratio = contrastRatio(effective, surface);
    // WCAG asks 4.5:1 of text and 3:1 of meaningful non-text graphics (icons,
    // indicators). Treating an icon like a label would force us to darken
    // shapes that are deliberately lighter than their neighbours.
    const isGraphic = /(^|[\s.>])svg\b|dot|icon|indicator|bar\b|marker/i.test(selector);
    const required = isGraphic || LARGE_TEXT.has(selector) ? 3 : 4.5;
    if (ratio < required) {
      invisible.push({
        selector,
        ratio: ratio.toFixed(2),
        required,
        colorRaw,
        bgRaw: onCream ? '(cream page)' : bgRaw,
      });
    }
  }
  check('every text/graphic colour clears its WCAG floor (alpha composited)', invisible.length === 0);
  for (const item of invisible.slice(0, 12)) {
    console.log(`        ${item.selector.slice(0, 42).padEnd(44)} ${item.ratio}:1 (needs ${item.required})  ${item.colorRaw} on ${item.bgRaw}`);
  }

  console.log('\n── CSS: no dark-theme panel backgrounds left ──');
  // Small decorative elements are *meant* to be saturated: a status dot, a
  // progress bar, an avatar disc. Only element-sized surfaces count as panels.
  const DECORATIVE = /dot|bar|indicator|bullet|thumb|handle|spinner|pulse|thinking|avatar|marker|track|ring|orb|wave|chip|badge/i;
  const darkSurfaces = [];
  for (const { selector, body } of readBlocks(appCss)) {
    if (DECORATIVE.test(selector)) continue;
    const bgRaw = readDeclaration(body, 'background-color') || readDeclaration(body, 'background');
    if (!bgRaw || bgRaw.includes('gradient')) continue;
    const bg = resolveColor(bgRaw, tokens);
    if (!bg) continue;
    if (relativeLuminance(bg) >= 0.25) continue;
    // An ink-filled element is legitimate *if* its own text is light.
    const fg = resolveColor(readDeclaration(body, 'color'), tokens);
    if (fg && contrastRatio(fg, bg) >= 4.5) continue;
    darkSurfaces.push({ selector, bgRaw });
  }
  check('no dark panel background without readable text on it', darkSurfaces.length === 0);
  for (const item of darkSurfaces.slice(0, 8)) {
    console.log(`        ${item.selector.slice(0, 46).padEnd(48)} background: ${item.bgRaw}`);
  }

  console.log('\n── CSS: no hard-coded white/black text ──');
  const keywordText = [];
  for (const { selector, body } of readBlocks(appCss + '\n' + indexCss)) {
    const colorRaw = readDeclaration(body, 'color');
    if (!colorRaw) continue;
    if (/^\s*(white|black)\s*$/i.test(colorRaw)) keywordText.push({ selector, colorRaw });
  }
  check('text colours use tokens, not `white`/`black`', keywordText.length === 0);
  for (const item of keywordText.slice(0, 6)) {
    console.log(`        ${item.selector.slice(0, 46).padEnd(48)} color: ${item.colorRaw}`);
  }

  console.log('\n── PALETTE: data colours must read on cream ──');
  const graphUtils = fs.readFileSync(path.join(SRC, 'graph-utils.js'), 'utf8');
  const paletteBlock = graphUtils.slice(
    graphUtils.indexOf('export const VIZ_PALETTE'),
    graphUtils.indexOf('export const VIZ_NODE_PALETTE'),
  );
  const palette = new Map();
  for (const match of paletteBlock.matchAll(/(\w+):\s*'(#[0-9a-fA-F]{6})'/g)) {
    palette.set(match[1], match[2]);
  }
  const cream = parseHex(CREAM);

  // These two are deliberately low-contrast: they are the "de-emphasised"
  // states, and the whole point is that they recede toward the canvas. They
  // still have to be *visible* — the old dark-theme values (#18181b, #fbf8f1)
  // were either darker than a normal edge or the exact canvas colour.
  const DIMMED = new Set(['dimEdge', 'dimLabel']);
  const dataColors = [...palette.entries()].filter(([name]) => !DIMMED.has(name));
  const faint = dataColors.filter(([, hex]) => contrastRatio(parseHex(hex), cream) < 3);
  check(`all ${dataColors.length} data colours clear 3:1 on cream`, faint.length === 0);
  for (const [name, hex] of faint) {
    console.log(`        ${name.padEnd(12)} ${hex}  ${contrastRatio(parseHex(hex), cream).toFixed(2)}:1`);
  }

  const dimmedTooFaint = [...palette.entries()]
    .filter(([name]) => DIMMED.has(name))
    .filter(([, hex]) => contrastRatio(parseHex(hex), cream) < 1.15);
  check('dimmed states are still visible on cream', dimmedTooFaint.length === 0);
  for (const [name, hex] of dimmedTooFaint) {
    console.log(`        ${name.padEnd(12)} ${hex}  ${contrastRatio(parseHex(hex), cream).toFixed(2)}:1`);
  }

  // A dimmed colour that is *darker* than the normal one inverts its meaning.
  const dimEdgeRatio = contrastRatio(parseHex(palette.get('dimEdge')), cream);
  const normalEdgeRatio = contrastRatio(parseHex(palette.get('blue')), cream);
  check('dimmed edges are lighter than active edges, not darker',
    dimEdgeRatio < normalEdgeRatio,
    `dimmed ${dimEdgeRatio.toFixed(2)}:1 vs active ${normalEdgeRatio.toFixed(2)}:1`);

  // The brand neon green is an accent for borders and dots only — as a data
  // fill on cream it sits at 2.37:1 and disappears.
  const greenAsFill = /CATEGORY_COLORS[\s\S]*?\n\}/.exec(graphUtils)?.[0]?.includes('#0cb531');
  check('brand neon green is not used as a category fill', !greenAsFill);

  // Every category must map to a colour that survives the same rule.
  const categoryBlock = graphUtils.slice(
    graphUtils.indexOf('export const CATEGORY_COLORS'),
    graphUtils.indexOf('export const CATEGORY_LABELS'),
  );
  const categoryEntries = [...categoryBlock.matchAll(/(\w+):\s*(?:VIZ_PALETTE\.(\w+)|'(#[0-9a-fA-F]{6})')/g)]
    .map((m) => ({ key: m[1], hex: m[3] || palette.get(m[2]) }));
  // Category colours are used as graph fills *and* as label text — Flow
  // Explorer paints `.flow-current-layer` with `CATEGORY_COLORS[layer]`. So
  // they carry the text floor, not the graphics one. (#7d766c sat at 3.89:1
  // and was the actual colour behind two "unreadable label" reports.)
  const categoryFaint = categoryEntries.filter((e) => e.hex && contrastRatio(parseHex(e.hex), cream) < 4.5);
  check(`all ${categoryEntries.length} category colours clear 4.5:1 (they are label text too)`, categoryFaint.length === 0);
  for (const item of categoryFaint) {
    console.log(`        ${item.key.padEnd(12)} ${item.hex}  ${contrastRatio(parseHex(item.hex), cream).toFixed(2)}:1`);
  }

  // The vivid node-fill table only has to clear the 3:1 graphics floor — that
  // is the whole reason it is a separate table from the text-safe palette.
  // If one of these ever drifts dark, the graph goes muddy, so guard it too.
  const nodeBlock = graphUtils.slice(
    graphUtils.indexOf('export const VIZ_NODE_PALETTE'),
    graphUtils.indexOf('export const CATEGORY_COLORS'),
  );
  const nodePalette = new Map();
  for (const match of nodeBlock.matchAll(/(\w+):\s*'(#[0-9a-fA-F]{6})'/g)) {
    nodePalette.set(match[1], match[2]);
  }
  const faintNodes = [...nodePalette.entries()].filter(([, hex]) => contrastRatio(parseHex(hex), cream) < 3);
  check(`all ${nodePalette.size} node-fill colours clear 3:1 on paper`, faintNodes.length === 0);
  for (const [name, hex] of faintNodes) {
    console.log(`        ${name.padEnd(12)} ${hex}  ${contrastRatio(parseHex(hex), cream).toFixed(2)}:1`);
  }

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

if (process.argv[2] === '--assert') {
  runAssertions();
} else {
  console.log('Usage: node test-theme-contrast.js --assert');
  process.exit(1);
}
