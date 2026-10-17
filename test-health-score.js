/**
 * Health-score assertions.
 *
 * Guards the scanner-data contract: every score must be backed by fields that
 * actually exist on `analysis.files[]` (`{ path, label, size, language }`).
 *
 * Usage: node test-health-score.js
 */
const { analyzeHealthScore } = require('./server/health-score');
const { buildCodeIntelligence } = require('./server/code-intelligence');

let failures = 0;

function check(label, ok, detail = '') {
  console.log(` ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

// ── Fixture: the exact shape repo-analyzer produces (no `name` field) ──────
const sourceLines = [];
for (let i = 0; i < 40; i += 1) {
  sourceLines.push(`function helper${i}() { return helper${i - 1}() }`);
}
const fixtureFiles = [
  { path: 'README.md', label: 'README.md', size: 2400, language: 'markdown' },
  { path: 'LICENSE', label: 'LICENSE', size: 1100, language: 'plaintext' },
  { path: '.gitignore', label: '.gitignore', size: 60, language: 'plaintext' },
  { path: 'package.json', label: 'package.json', size: 400, language: 'json' },
  { path: 'package-lock.json', label: 'package-lock.json', size: 9000, language: 'json' },
  { path: '.env.example', label: '.env.example', size: 120, language: 'plaintext' },
  { path: 'src/index.js', label: 'index.js', size: 3000, language: 'javascript' },
  { path: 'src/app.js', label: 'app.js', size: 2000, language: 'javascript' },
  { path: 'src/utils/format.js', label: 'format.js', size: 800, language: 'javascript' },
];

const fixtureAnalysis = {
  repoName: 'fixture',
  repoUrl: 'https://example.com/fixture',
  files: fixtureFiles,
  graph: { nodes: [], edges: [] },
  summary: { fileCount: fixtureFiles.length },
  architecture: { summary: {}, risks: [], deadNodeIds: [], brokenNodeIds: [] },
  codeIntelligence: {
    totalFunctions: 40,
    totalEntryPoints: 4,
    entryPoints: [{ name: 'main' }],
    communities: [],
    frameworks: ['Express'],
    filePurposes: {},
    topExporters: [],
  },
};

const health = analyzeHealthScore(fixtureAnalysis, fixtureAnalysis.architecture, fixtureAnalysis.codeIntelligence, []);
const documentationEvidence = health.scores.documentation.evidence.join(' | ');
const securityEvidence = health.scores.security.evidence.join(' | ');

console.log('── Documentation: filenames must be read from `path`/`label` ──');
check('detects the README', /README found/.test(documentationEvidence), documentationEvidence.slice(0, 80));
check('does not claim "No README file found"', !/No README file found/.test(documentationEvidence));
check('detects the LICENSE', /LICENSE file present/.test(documentationEvidence));
check('counts config files', /config file\(s\)/.test(documentationEvidence));

console.log('\n── Security: templates are not secrets ──');
check('does not flag .env.example as sensitive', !/Sensitive file/.test(securityEvidence), securityEvidence.slice(0, 90));
check('does not count .env.example as a real .env', !/\.env file\(s\) in repo/.test(securityEvidence));
check('detects .gitignore', /\.gitignore file present/.test(securityEvidence));
check('detects the lock file', /Lock file present/.test(securityEvidence));

console.log('\n── Entry points: judged relative to codebase size ──');
const archEvidence = health.scores.architecture.evidence.join(' | ');
check('reports the entry-point ratio', /entry points/.test(archEvidence), archEvidence.slice(0, 110));
check('does not use a fixed "too many" verdict', !/review if too many/.test(archEvidence));

console.log('\n── Entry-point scoring must discriminate ──');
const ci = buildCodeIntelligence([
  {
    path: 'src/lib.js',
    content: `
export function publicApi() { return 1 }
export function calledEverywhere() { return 2 }
export function internalUser() { return calledEverywhere() }
function privateHelper() { return 3 }
`,
    size: 200,
    language: 'js',
  },
]);
const entryNames = new Set(ci.summary.entryPoints.map((entry) => entry.name));
check('an uncalled export is an entry point', entryNames.has('publicApi'));
check('not every function is an entry point', ci.summary.totalEntryPoints < ci.summary.totalFunctions,
  `${ci.summary.totalEntryPoints}/${ci.summary.totalFunctions}`);

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
