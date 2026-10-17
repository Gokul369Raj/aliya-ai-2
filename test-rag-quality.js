/**
 * Retrieval quality checks for the hybrid RAG index.
 *
 * The old scorer had a fake IDF (`docFreq.has(token) ? 1 : 0.3`) that ignored
 * the document frequency it had already computed, so a term in every file
 * scored the same as a term in one file. These checks lock in the fix plus the
 * vector-space and graph-expansion layers.
 *
 * Usage: node test-rag-quality.js [--assert]
 */
const fs = require('fs');
const path = require('path');

const {
  buildSearchIndex,
  searchIndex,
  buildEmbedding,
  cosineSimilarity,
  termsMatch,
  isGeneratedArtifact,
} = require('./server/search-index');

const REPO_DIR = path.join(__dirname, '.aliya-ai', 'repos');

// ─── Fixtures ────────────────────────────────────────────────────────

const IDF_FIXTURE = [
  { path: 'src/a.js', content: 'const zephyr = 1\nmodule.exports = zephyr\n', size: 40, language: 'js' },
  { path: 'src/b.js', content: 'const common = 2\nmodule.exports = common\n', size: 40, language: 'js' },
  { path: 'src/c.js', content: 'const common = 3\nmodule.exports = common\n', size: 40, language: 'js' },
  { path: 'src/d.js', content: 'const common = 4\nmodule.exports = common\n', size: 40, language: 'js' },
];

const GENERATED_FIXTURE = [
  { path: 'src/real.js', content: 'const handler = 1\nmodule.exports = handler\n', size: 40, language: 'js' },
  { path: 'frontend/build/static/js/main.137212d1.js', content: 'const handler = 2\n', size: 40, language: 'js' },
  { path: 'dist/bundle.min.js', content: 'const handler = 3\n', size: 40, language: 'js' },
];

// ─── Helpers ─────────────────────────────────────────────────────────

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

const SKIP_DIRS = new Set(['.git', 'node_modules', 'build', 'dist', 'coverage', '.next']);

function readRepoFiles(repoPath) {
  const out = [];
  (function walk(dir, root = dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') && entry.name !== '.github') continue;
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(absolute, root);
        continue;
      }
      if (!/\.(js|jsx|ts|tsx|mjs|cjs|json|md|css|py|go)$/.test(entry.name)) continue;
      let content;
      try {
        content = fs.readFileSync(absolute, 'utf8');
      } catch {
        continue;
      }
      if (content.length > 400_000) continue;
      out.push({
        path: path.relative(root, absolute).split(path.sep).join('/'),
        content,
        size: content.length,
        language: path.extname(entry.name).slice(1),
      });
    }
  })(repoPath);
  return out;
}

function loadAnalysis(repoName) {
  try {
    const projects = JSON.parse(fs.readFileSync(path.join(__dirname, '.aliya-ai/projects.json'), 'utf8'));
    const list = Array.isArray(projects) ? projects : projects.projects || [];
    return list.find((project) => project.analysis?.repoName === repoName)?.analysis || null;
  } catch {
    return null;
  }
}

// ─── Assertions ──────────────────────────────────────────────────────

function runAssertions() {
  let failures = 0;
  const check = (label, ok) => {
    console.log(` ${ok ? 'PASS' : 'FAIL'}  ${label}`);
    if (!ok) failures += 1;
  };

  console.log('\n── IDF: rare terms must outrank common ones ──');
  const idfIndex = buildSearchIndex(IDF_FIXTURE, null);
  const rareHits = searchIndex(idfIndex, 'zephyr', { maxResults: 4 });
  check('a term unique to one file ranks that file first', rareHits[0]?.path === 'src/a.js');
  check('IDF is computed from document frequency', idfIndex.idf instanceof Map && idfIndex.idf.size > 0);
  const rareIdf = idfIndex.idf.get('zephyr');
  const commonIdf = idfIndex.idf.get('common');
  check('rare term has higher IDF than a term in every file', rareIdf > commonIdf);

  console.log('\n── VECTORS: embeddings are sub-word aware ──');
  const idf = new Map([['authentication', 2], ['auth', 2], ['database', 2]]);
  const authFull = buildEmbedding(new Map([['authentication', 1]]), idf);
  const authShort = buildEmbedding(new Map([['auth', 1]]), idf);
  const database = buildEmbedding(new Map([['database', 1]]), idf);
  const related = cosineSimilarity(authFull, authShort);
  const unrelated = cosineSimilarity(authFull, database);
  check(`"authentication" is closer to "auth" (${related.toFixed(3)}) than to "database" (${unrelated.toFixed(3)})`, related > unrelated);
  check('embeddings are unit length', Math.abs(Math.sqrt(authFull.reduce((s, v) => s + v * v, 0)) - 1) < 1e-6);

  console.log('\n── TERM MATCHING: symmetric, not substring-only ──');
  check('"auth" matches "authentication"', termsMatch('auth', 'authentication'));
  check('"authentication" matches "auth" (symmetric)', termsMatch('authentication', 'auth'));
  check('"authentication" matches "authenticated"', termsMatch('authentication', 'authenticated'));
  check('unrelated terms do not match', !termsMatch('database', 'authentication'));

  console.log('\n── GENERATED ARTIFACTS: never enter the corpus ──');
  check('content-hashed bundle is excluded', isGeneratedArtifact('frontend/build/static/js/main.137212d1.js'));
  check('minified file is excluded', isGeneratedArtifact('dist/bundle.min.js'));
  check('lock file is excluded', isGeneratedArtifact('package-lock.json'));
  check('real source is kept', !isGeneratedArtifact('src/real.js'));
  const genIndex = buildSearchIndex(GENERATED_FIXTURE, null);
  const genPaths = genIndex.entries.map((entry) => entry.filePath);
  check('generated files are absent from the index', genPaths.length === 1 && genPaths[0] === 'src/real.js');

  console.log('\n── REAL REPO: retrieval must find the implementation ──');
  const repoPath = resolveRepoPath('jigar-sable__flipkart-mern__');
  if (!repoPath) {
    console.log(' SKIP  flipkart-mern — no clone found');
  } else {
    const analysis = loadAnalysis('flipkart-mern');
    const index = buildSearchIndex(readRepoFiles(repoPath), analysis);
    console.log(` (indexed ${index.entries.length} files)`);

    const authHits = searchIndex(index, 'authentication flow', { maxResults: 6, analysis });
    const authPaths = authHits.map((hit) => hit.path);
    check('auth implementation is retrieved', authPaths.includes('backend/middlewares/auth.js'));
    check('no build artifact in auth results', !authPaths.some((p) => p.includes('/build/')));

    const payHits = searchIndex(index, 'how does payment work', { maxResults: 3, analysis });
    const payPaths = payHits.map((hit) => hit.path);
    check(
      `payment files rank at the top (${payPaths[0]})`,
      payPaths.some((p) => p.includes('payment')),
    );

    const dbHits = searchIndex(index, 'where is the database model', { maxResults: 3, analysis });
    check(
      `database config ranks first (${dbHits[0]?.path})`,
      dbHits[0]?.path === 'backend/config/database.js',
    );
  }

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

if (process.argv[2] === '--assert') {
  runAssertions();
} else {
  const repoPath = resolveRepoPath(process.argv[2] || 'jigar-sable__flipkart-mern__');
  if (!repoPath) {
    console.error('Usage: node test-rag-quality.js --assert | <repoPrefix>');
    process.exit(1);
  }
  const analysis = loadAnalysis(process.argv[3] || '');
  const index = buildSearchIndex(readRepoFiles(repoPath), analysis);
  const query = process.argv[3] ? process.argv[4] : process.argv[3];
  console.log(`indexed ${index.entries.length} files from ${repoPath}`);
  if (query) {
    for (const hit of searchIndex(index, query, { maxResults: 10, analysis })) {
      console.log(`  ${String(hit.score).padStart(3)}  ${hit.path}`);
    }
  }
}
