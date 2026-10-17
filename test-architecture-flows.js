/**
 * Architecture flow diagnostic + regression assertions.
 *
 * Runs the real flow detector over a local repository clone and reports which
 * flows were detected, how strongly they were proven, and how many files each
 * one covers.
 *
 * Usage:
 *   node test-architecture-flows.js <repoPath> [repoName]      # report only
 *   node test-architecture-flows.js --assert                   # run known-repo checks
 */
const fs = require('fs');
const path = require('path');

const { buildArchitectureIntelligence } = require('./server/architecture-intelligence');
const { TEXT_FILE_EXTENSIONS, IGNORED_DIRECTORY_NAMES, MAX_TEXT_FILE_BYTES } = require('./server/constants');

// Capabilities that must never be invented for a repo that lacks them.
const CAPABILITY_IDS = ['auth', 'payment', 'cache', 'websocket', 'microservice', 'ai', 'db', 'state', 'event', 'error'];

const REPO_DIR = path.join(__dirname, '.aliya-ai', 'repos');

// name → { prefix, mustHave: [], mustNotHave: [] }
// Repos are re-cloned under a new id on every analysis, so resolve the newest
// clone whose directory name starts with the repo prefix.
const EXPECTATIONS = {
  'aliya-ai-2': {
    prefix: 'Gokul369Raj__aliya-ai-2__',
    mustHave: ['application', 'component', 'ai'],
    mustNotHave: ['payment', 'websocket', 'microservice', 'cache', 'auth', 'db'],
  },
  express: {
    prefix: 'expressjs__express__',
    mustHave: ['application', 'routing'],
    mustNotHave: ['payment', 'websocket', 'microservice', 'ai', 'state'],
  },
  // MERN store: stripe + bcryptjs + jsonwebtoken + mongoose + react-redux are
  // all declared dependencies, so every one of these flows is real.
  'flipkart-mern': {
    prefix: 'jigar-sable__flipkart-mern__',
    mustHave: ['application', 'auth', 'db', 'state', 'error', 'payment'],
    mustNotHave: ['websocket', 'microservice', 'cache', 'ai'],
  },
};

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

function analyze(repoPath, repoName) {
  const files = walk(repoPath);
  const started = Date.now();
  const result = buildArchitectureIntelligence(files, repoName);
  return { files, result, elapsed: Date.now() - started };
}

function report(repoName, { files, result, elapsed }) {
  console.log(`\n${'='.repeat(72)}`);
  console.log(`REPO: ${repoName}  (${files.length} text files)`);
  console.log('='.repeat(72));

  const flows = result.flows.available || [];
  console.log(`Detected ${flows.length} flow(s) in ${elapsed}ms\n`);

  for (const flow of flows) {
    const strength = flow.strength || 'structural';
    console.log(`  ${flow.id.padEnd(14)} ${String(flow.confidence).padStart(3)}%  ${strength.padEnd(10)} ${String(flow.nodes.length).padStart(3)} nodes  ${String(flow.evidenceCoverage).padStart(3)}% evidence`);
    if (flow.capabilityReasons?.length) {
      console.log(`                 ↳ ${flow.capabilityReasons.join('; ')}`);
    }
    const sample = flow.stages.slice(0, 4).map((stage) => stage.path);
    if (sample.length) console.log(`                 files: ${sample.join(', ')}${flow.stages.length > 4 ? ` (+${flow.stages.length - 4})` : ''}`);
  }

  const roleCounts = {};
  for (const [, value] of Object.entries(result.nodeAnnotations || {})) {
    for (const role of value.roles || []) roleCounts[role] = (roleCounts[role] || 0) + 1;
  }
  console.log('\nCapability role counts (should be 0 for capabilities the repo lacks):');
  for (const role of ['payment', 'websocket', 'cache', 'microservice', 'auth', 'database', 'ai', 'state', 'event']) {
    console.log(`  ${role.padEnd(14)} ${roleCounts[role] || 0}`);
  }
  console.log('\nLayer summary:', JSON.stringify(result.summary.layerSummary));

  return flows.map((flow) => flow.id);
}

function runAssertions() {
  let failures = 0;
  let checked = 0;

  for (const [name, expectation] of Object.entries(EXPECTATIONS)) {
    const repoPath = resolveRepoPath(expectation.prefix);
    if (!repoPath) {
      console.log(`\nSKIP ${name} — no clone matching ${expectation.prefix}* in ${REPO_DIR}`);
      continue;
    }
    checked += 1;
    const analysis = analyze(repoPath, name);
    const detected = new Set(report(name, analysis));

    console.log('\nEXPECTATIONS');
    for (const id of expectation.mustHave) {
      const ok = detected.has(id);
      console.log(` ${ok ? 'PASS' : 'FAIL'}  ${name} detects "${id}"`);
      if (!ok) failures += 1;
    }
    for (const id of expectation.mustNotHave) {
      const ok = !detected.has(id);
      console.log(` ${ok ? 'PASS' : 'FAIL'}  ${name} does NOT invent "${id}"`);
      if (!ok) failures += 1;
    }

    // Every reported flow must carry a strength verdict.
    const missingStrength = analysis.result.flows.available.filter((flow) => !flow.strength).map((flow) => flow.id);
    const strengthOk = missingStrength.length === 0;
    console.log(` ${strengthOk ? 'PASS' : 'FAIL'}  ${name} every flow reports a strength`);
    if (!strengthOk) failures += 1;
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
    console.error('Usage: node test-architecture-flows.js <repoPath> [repoName]');
    console.error('       node test-architecture-flows.js --assert');
    process.exit(1);
  }
  report(repoName, analyze(repoPath, repoName));
}
