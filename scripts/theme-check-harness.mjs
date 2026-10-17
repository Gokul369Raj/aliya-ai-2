/**
 * Builds a standalone page that loads the REAL index.css + App.css and renders
 * the elements the theme work touched, then asserts computed contrast in a
 * browser.
 *
 * Why this exists: `test-theme-contrast.js` parses the stylesheets as text, so
 * it cannot see the cascade — App.css overriding index.css, an inherited
 * background, or a more specific rule winning. This harness runs in a real
 * engine and reads `getComputedStyle`, so what it measures is what ships.
 *
 * Usage: node scripts/theme-check-harness.mjs   → writes /tmp/theme-check.html
 */
import fs from 'node:fs'
import path from 'node:path'

const SRC = path.resolve(import.meta.dirname, '..', 'client', 'src')
const OUT = '/tmp/theme-check.html'

// Drop the remote font @import so the page never waits on the network.
const stripRemote = (css) => css.replace(/@import\s+url\([^)]*\)\s*;?/g, '')

const indexCss = stripRemote(fs.readFileSync(path.join(SRC, 'index.css'), 'utf8'))
const appCss = stripRemote(fs.readFileSync(path.join(SRC, 'App.css'), 'utf8'))

// Each sample names a selector that the theme work changed or that carries text
// on a surface. `expect` documents what the rule is supposed to be.
const SAMPLES = [
  ['input field', '<div class="commit-field"><input id="s-input" value="main" /></div>'],
  ['select', '<div class="commit-field"><select id="s-select"><option>all</option></select></div>'],
  ['run-flow code', '<div class="run-flow-copy"><code id="s-runflow">npm run dev</code></div>'],
  ['flow controls', '<div class="flow-controls" id="s-flowcontrols"><span>controls</span></div>'],
  ['control btn active', '<div class="flow-controls"><button class="control-btn active" id="s-ctlactive">Play</button></div>'],
  ['control btn primary', '<div class="flow-controls"><button class="control-btn primary" id="s-ctlprimary">Run</button></div>'],
  ['status bar cell', '<div class="layered-flow-statusbar"><div id="s-statuscell"><span class="label">nodes</span><strong>12</strong></div></div>'],
  ['step number', '<div class="timeline-step"><span class="step-number" id="s-stepnum">3</span></div>'],
  ['step number past', '<div class="timeline-step past"><span class="step-number" id="s-stepnumpast">1</span></div>'],
  ['pdf shell', '<div class="pdf-viewer-shell" id="s-pdfshell"><div class="pdf-viewer-body" id="s-pdfbody"></div></div>'],
  ['error bar', '<div class="error-bar" id="s-errorbar">Something failed</div>'],
  ['chat code block', '<div class="chat-code"><pre class="chat-code-block" id="s-chatcode">const a = 1</pre></div>'],
  ['chat code lang', '<div class="chat-code"><div class="chat-code-head"><span class="chat-code-lang" id="s-chatlang">js</span></div></div>'],
  ['flow side title', '<div class="flow-side-info"><div class="flow-side-title" id="s-sidetitle">Evidence</div></div>'],
  ['filter button', '<button class="filter-button" id="s-filterbtn">All</button>'],
  ['filter chip', '<span class="filter-count-chip" id="s-filterchip">7</span>'],
  ['icon button', '<button class="icon-button" id="s-iconbtn">x</button>'],
  ['flow explorer', '<div class="flow-explorer-container" id="s-flowexplorer"><span>flow</span></div>'],
  ['layered node card', '<div class="layered-flow-node-card" id="s-nodecard" style="--node-color:#1f6fb2"><strong id="s-nodecardtext">orderController.js</strong></div>'],
  ['nav status', '<div class="nav-ai-status"><span class="nav-ai-dot" id="s-navdot"></span></div>'],
  ['muted meta', '<div id="s-muted" style="color:var(--text-muted)">muted meta text</div>'],
  ['secondary text', '<div id="s-secondary" style="color:var(--text-secondary)">secondary text</div>'],
]

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Aliya AI — theme contrast check</title>
<style>${indexCss}</style>
<style>${appCss}</style>
<style>
  /* Only enough layout for the samples to have real boxes. */
  body { margin: 0; padding: 24px; background: var(--bg-app); }
  .probe { margin: 0 0 18px; }
  .probe > * { margin-right: 8px; }
  .probe-label { font: 600 11px/1 var(--mono); color: var(--text-secondary); display: block; margin-bottom: 6px; }
</style>
</head>
<body>
${SAMPLES.map(([label, markup], i) => `<div class="probe"><span class="probe-label">${i}: ${label}</span>${markup}</div>`).join('\n')}

<script>
window.__THEME_SAMPLES = ${JSON.stringify(SAMPLES.map(([label]) => label))};

function parseColor(value) {
  const m = String(value).match(/rgba?\\(([^)]+)\\)/);
  if (!m) return null;
  const parts = m[1].split(',').map((p) => parseFloat(p.trim()));
  return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
}

function channel(v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
function luminance(c) { return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b); }
function contrast(a, b) {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Walk ancestors until an opaque background is found. */
function effectiveBackground(el) {
  let node = el;
  while (node && node !== document.documentElement) {
    const bg = parseColor(getComputedStyle(node).backgroundColor);
    if (bg && bg.a > 0.5) return bg;
    node = node.parentElement;
  }
  return { r: 243, g: 238, b: 231, a: 1 };
}

/** Measure every element inside the samples that actually renders text. */
window.__checkTheme = () => {
  const results = [];
  const seen = new Set();
  for (const el of document.querySelectorAll('.probe *')) {
    const text = (el.textContent || '').trim();
    if (!text) continue;
    // Only leaf-ish text nodes — skip wrappers that merely contain others.
    if ([...el.children].some((c) => (c.textContent || '').trim())) continue;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    const fg = parseColor(style.color);
    if (!fg) continue;
    const bg = effectiveBackground(el);
    const ratio = contrast(fg, bg);
    const key = el.className + '|' + text.slice(0, 20);
    if (seen.has(key)) continue;
    seen.add(key);
    const fontSize = parseFloat(style.fontSize) || 12;
    const bold = (parseInt(style.fontWeight, 10) || 400) >= 700;
    // WCAG AA: 3:1 for large text (>=18.66px bold or >=24px), 4.5:1 otherwise.
    const large = fontSize >= 24 || (fontSize >= 18.66 && bold);
    const required = large ? 3 : 4.5;
    results.push({
      selector: el.id || el.className || el.tagName.toLowerCase(),
      text: text.slice(0, 26),
      ratio: Math.round(ratio * 100) / 100,
      required,
      pass: ratio >= required,
    });
  }
  return {
    total: results.length,
    failures: results.filter((r) => !r.pass),
    sample: results.slice(0, 4),
  };
};
</script>
</body>
</html>`

fs.writeFileSync(OUT, html)
console.log(`wrote ${OUT} (${html.length} bytes, ${SAMPLES.length} samples)`)
