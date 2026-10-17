/**
 * Risk-detection diagnostic + assertions.
 *
 * Prints every risk the detector reports for a local repository clone, grouped
 * by kind, so false positives are visible at a glance.
 *
 * Usage:
 *   node test-architecture-risks.js <repoPath> [repoName]   # report only
 *   node test-architecture-risks.js --assert                # run checks
 */
const fs = require('fs');
const path = require('path');

const { buildArchitectureIntelligence, extractRouteDefinitions } = require('./server/architecture-intelligence');
const { TEXT_FILE_EXTENSIONS, IGNORED_DIRECTORY_NAMES, MAX_TEXT_FILE_BYTES } = require('./server/constants');

const REPO_DIR = path.join(__dirname, '.aliya-ai', 'repos');

// Real repos must not report risks driven by docs, assets or normal framework
// setup code. These are the shapes that previously produced false positives.
const PRECISION_REPOS = [
  { prefix: 'expressjs__express__', label: 'express' },
  { prefix: 'jigar-sable__flipkart-mern__', label: 'flipkart-mern' },
  { prefix: 'Gokul369Raj__aliya-ai-2__', label: 'aliya-ai-2' },
  { prefix: 'github__copilot-engine-sdk__', label: 'copilot-engine-sdk' },
  // Docs-heavy repo: README/scratchpad code samples must not become risks.
  { prefix: 'github__gh-aw-threat-detection__', label: 'gh-aw-threat-detection' },
];

// A synthetic repo with genuine defects: the detector must still catch these.
const RECALL_FIXTURE = [
  { path: 'src/index.js', content: "const a = require('./used')\nconsole.log(a)\n", size: 60, language: 'js' },
  { path: 'src/used.js', content: 'module.exports = 1\n', size: 20, language: 'js' },
  { path: 'src/orphan.js', content: 'const x = 1\nconst y = x + 1\n', size: 40, language: 'js' },
  { path: 'src/broken.js', content: "const missing = require('./does-not-exist')\nconsole.log(missing)\n", size: 60, language: 'js' },
];

// TypeScript ESM imports use the *emitted* extension: `./types.js` loads
// `types.ts`. Those must resolve; a genuinely missing module must not.
const TS_SPECIFIER_FIXTURE = [
  { path: 'src/index.ts', content: "import { A } from './types.js'\nimport { B } from './missing.js'\nexport const ab = A + B\n", size: 80, language: 'ts' },
  { path: 'src/types.ts', content: 'export const A = 1\nexport const B = 2\n', size: 40, language: 'ts' },
];

function walk(dir, root = dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.github') continue;
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORY_NAMES.has(entry.name)) continue;
      walk(path.join(dir, entry.name), root, out);
      continue;
    }
    const absolute = path.join(dir, entry.name);
    const relative = path.relative(root, absolute).split(path.sep).join('/');
    const ext = path.extname(entry.name).toLowerCase();
    if (!TEXT_FILE_EXTENSIONS.has(ext)) continue;
    let stats;
    try {
      stats = fs.statSync(absolute);
    } catch {
      continue;
    }
    if (stats.size > MAX_TEXT_FILE_BYTES) continue;
    let content = '';
    try {
      content = fs.readFileSync(absolute, 'utf8');
    } catch {
      continue;
    }
    out.push({ path: relative, content, size: stats.size, language: ext.replace('.', '') });
  }
  return out;
}

function resolveRepoPath(prefix) {
  let entries = [];
  try {
    entries = fs.readdirSync(REPO_DIR, { withFileTypes: true });
  } catch {
    return null;
  }
  const matches = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix))
    .map((entry) => {
      const absolute = path.join(REPO_DIR, entry.name);
      let mtime = 0;
      try {
        mtime = fs.statSync(absolute).mtimeMs;
      } catch {
        mtime = 0;
      }
      return { absolute, mtime };
    })
    .sort((left, right) => right.mtime - left.mtime);
  return matches[0]?.absolute || null;
}

/** Risks that indicate a heuristic fired on something that is not a code defect. */
function findSuspiciousRisks(risks) {
  return risks.filter((risk) => {
    const file = (risk.fileId || '').replace('file:', '');
    const isDoc = /\.(md|txt|rst)$/i.test(file);
    const isAssetImport = risk.kind === 'unresolved-import'
      && /\.(png|jpe?g|gif|webp|avif|ico|bmp|svg|mp4|webm|woff2?|ttf|otf|pdf|zip|wasm)$/i.test(risk.message || '');
    const isTestOrScript = /(^|\/)(test|tests|__tests__|spec|specs|bin|scripts)\//.test(file)
      || /(^|\/)(test|spec)[-_.]/.test(file);
    return isDoc || isAssetImport || (isTestOrScript && risk.kind === 'dead-code');
  });
}

function report(repoName, files) {
  const result = buildArchitectureIntelligence(files, repoName);
  const risks = result.risks || [];

  const byKind = {};
  for (const risk of risks) {
    (byKind[risk.kind] = byKind[risk.kind] || []).push(risk);
  }

  console.log(`\n${'='.repeat(72)}`);
  console.log(`RISKS: ${repoName}  (${files.length} text files, ${risks.length} risks)`);
  console.log('='.repeat(72));

  for (const [kind, list] of Object.entries(byKind).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n${kind} (${list.length})`);
    for (const risk of list.slice(0, 6)) {
      console.log(`   ${(risk.fileId || '').replace('file:', '').padEnd(52)} ${(risk.message || '').slice(0, 70)}`);
    }
    if (list.length > 6) console.log(`   … +${list.length - 6} more`);
  }

  const suspicious = findSuspiciousRisks(risks);
  console.log(`\nSUSPICIOUS (docs, assets or tests flagged as code problems): ${suspicious.length}`);
  for (const risk of suspicious.slice(0, 8)) {
    console.log(`   ${risk.kind} :: ${(risk.fileId || '').replace('file:', '')}`);
  }

  return { risks, suspicious };
}

function runAssertions() {
  let failures = 0;
  let checked = 0;

  console.log('\n── RECALL: genuine defects must still be detected ──');
  const recall = buildArchitectureIntelligence(RECALL_FIXTURE, 'synthetic-broken');
  const recallKinds = new Set((recall.risks || []).map((risk) => risk.kind));
  const recallChecks = [
    ['detects a broken relative import', recallKinds.has('unresolved-import')],
    ['detects an orphaned module', recallKinds.has('dead-code')],
  ];
  for (const [label, ok] of recallChecks) {
    console.log(` ${ok ? 'PASS' : 'FAIL'}  ${label}`);
    if (!ok) failures += 1;
  }

  console.log('\n── TS SPECIFIERS: `./types.js` must resolve to `types.ts` ──');
  const tsResult = buildArchitectureIntelligence(TS_SPECIFIER_FIXTURE, 'synthetic-ts');
  const tsUnresolved = (tsResult.risks || [])
    .filter((risk) => risk.kind === 'unresolved-import')
    .map((risk) => String(risk.message || ''));
  const tsChecks = [
    ['`./types.js` resolves against types.ts', !tsUnresolved.some((message) => message.includes('./types.js'))],
    ['`./missing.js` is still reported', tsUnresolved.some((message) => message.includes('./missing.js'))],
  ];
  for (const [label, ok] of tsChecks) {
    console.log(` ${ok ? 'PASS' : 'FAIL'}  ${label}`);
    if (!ok) failures += 1;
  }

  console.log('\n── ROUTE PATHS: only the leading argument is a path ──');
  const routeFixture = [
    "app.use(express.json({ limit: '2mb' }))",
    "app.use('/api/v1', router)",
    "app.get('/health', (req, res) => res.json({ ok: true }))",
    "app.get('*', (req, res) => res.send('x'))",
  ].join('\n');
  const extracted = extractRouteDefinitions(routeFixture);
  const extractedPaths = extracted.map((route) => route.path);
  const routeChecks = [
    ['option strings are not route paths', !extractedPaths.includes('2mb')],
    ['`app.get(\'/health\', ...)` keeps its path', extractedPaths.includes('/health')],
    ['`app.use(\'/api/v1\', ...)` keeps its path', extractedPaths.includes('/api/v1')],
    ['`app.get(\'*\', ...)` keeps its path', extractedPaths.includes('/*')],
  ];
  for (const [label, ok] of routeChecks) {
    console.log(` ${ok ? 'PASS' : 'FAIL'}  ${label}`);
    if (!ok) failures += 1;
  }

  console.log('\n── PRECISION: real repos must not report false positives ──');
  for (const { prefix, label } of PRECISION_REPOS) {
    const repoPath = resolveRepoPath(prefix);
    if (!repoPath) {
      console.log(` SKIP  ${label} — no clone matching ${prefix}*`);
      continue;
    }
    checked += 1;
    const { suspicious } = report(label, walk(repoPath));
    const ok = suspicious.length === 0;
    console.log(` ${ok ? 'PASS' : 'FAIL'}  ${label} reports no doc/asset/test false positives`);
    if (!ok) failures += 1;
  }

  if (checked === 0) {
    console.log('\nNo known repos are cloned — run an analysis first.');
    process.exit(0);
  }

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

if (process.argv[2] === '--assert') {
  runAssertions();
} else {
  const repoPath = process.argv[2];
  const repoName = process.argv[3] || path.basename(repoPath || '');
  if (!repoPath || !fs.existsSync(repoPath)) {
    console.error('Usage: node test-architecture-risks.js <repoPath> [repoName]');
    console.error('       node test-architecture-risks.js --assert');
    process.exit(1);
  }
  const { suspicious } = report(repoName, walk(repoPath));
  process.exit(suspicious.length === 0 ? 0 : 1);
}
