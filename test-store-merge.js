/**
 * Regression test for the projects.json merge.
 *
 * The bug: `persistRepos()` wrote only its own in-memory map, so a process that
 * had started before a repository was saved would erase it on its next write.
 * That is how a freshly analysed repo could vanish between two commands.
 *
 * This test runs two real processes against one storage root:
 *   B starts first and loads the file as it is.
 *   A then saves a new repository.
 *   B writes again (a `touch`).
 * Under the old code B's write dropped A's repository. It must not now.
 *
 * Usage: node test-store-merge.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const STORAGE = fs.mkdtempSync(path.join(os.tmpdir(), 'aliya-store-'));
const REPOS = path.join(STORAGE, 'repos');

let failures = 0;
function check(label, ok, detail = '') {
  console.log(` ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

function makeRepoDir(repoId) {
  const dir = path.join(REPOS, repoId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Run a snippet in a fresh process that shares our storage root. */
function runInChild(script) {
  const file = path.join(STORAGE, `child-${Math.random().toString(36).slice(2)}.js`);
  fs.writeFileSync(file, script, 'utf8');
  const result = spawnSync(process.execPath, [file], {
    cwd: ROOT,
    env: {
      ...process.env,
      ALIYA_STORAGE_ROOT: STORAGE,
      // Child scripts live in a temp dir, so `./server/store.js` would resolve
      // against that dir — hand them the absolute path instead.
      ALIYA_STORE_MODULE: path.join(ROOT, 'server', 'store.js'),
    },
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    throw new Error('child process failed');
  }
  return result.stdout.trim();
}

const readFile = () => {
  try {
    return JSON.parse(fs.readFileSync(path.join(STORAGE, 'projects.json'), 'utf8'));
  } catch {
    return [];
  }
};

const fakeAnalysis = (name) => ({ repoName: name, repoUrl: `https://github.com/x/${name}`, summary: {}, files: [], graph: { nodes: [], edges: [] } });

// ── Seed: one repository on disk ────────────────────────────────────────────
const seedDir = makeRepoDir('repo_seed');
runInChild(`
  const store = require(process.env.ALIYA_STORE_MODULE);
  store.saveRepo({ repoId: 'repo_seed', repoPath: ${JSON.stringify(seedDir)}, analysis: ${JSON.stringify(fakeAnalysis('seed'))} });
`);

check('seed record written', readFile().length === 1, `${readFile().length} record(s)`);

// ── B loads the file, then A saves, then B writes ───────────────────────────
const lateDir = makeRepoDir('repo_late');
const touchDir = makeRepoDir('repo_touch');

// One child that (a) loads the store — snapshotting the file — then (b) waits
// while another process saves, then (c) writes again. Simulated by having the
// child itself spawn the writer after it has already required the store.
const combined = runInChild(`
  const path = require('path');
  const { spawnSync } = require('child_process');
  const store = require(process.env.ALIYA_STORE_MODULE);

  // Store is now loaded with only repo_seed in memory, exactly like a server
  // that has been running since before the next save.
  const before = store.listRepos().map((r) => r.repoId);
  console.log('LOADED:' + before.join(','));

  // Another process saves a new repo.
  const writer = spawnSync(process.execPath, ['-e', \`
    const s = require(process.env.ALIYA_STORE_MODULE);
    s.saveRepo({ repoId: 'repo_late', repoPath: ${JSON.stringify(lateDir)}, analysis: ${JSON.stringify(fakeAnalysis('late'))} });
  \`], { cwd: process.cwd(), env: process.env, encoding: 'utf8' });
  if (writer.status !== 0) { console.error(writer.stderr); process.exit(1); }

  // Now this stale process writes (a touch is the cheapest write path).
  store.saveRepo({ repoId: 'repo_touch', repoPath: ${JSON.stringify(touchDir)}, analysis: ${JSON.stringify(fakeAnalysis('touch'))} });
`);

check('the stale process really started without repo_late', combined.includes('LOADED:repo_seed'), combined);

const after = readFile();
const ids = after.map((record) => record.repoId).sort();

check('the newly saved repo survived the stale write', ids.includes('repo_late'), ids.join(', '));
check('the stale process could still write its own repo', ids.includes('repo_touch'), ids.join(', '));
check('the original repo is still there', ids.includes('repo_seed'), ids.join(', '));
check('no duplicate records', new Set(ids).size === ids.length, `${ids.length} record(s)`);

// ── Deletion must not be undone by a stale copy ─────────────────────────────
const deleteResult = runInChild(`
  const store = require(process.env.ALIYA_STORE_MODULE);
  store.deleteRepo('repo_late');
  console.log('DELETED');
`);

const afterDelete = readFile().map((record) => record.repoId);
check('delete removed the record', deleteResult.includes('DELETED') && !afterDelete.includes('repo_late'), afterDelete.join(', '));

// A second process, started fresh, must not resurrect it either.
runInChild(`
  const store = require(process.env.ALIYA_STORE_MODULE);
  store.saveRepo({ repoId: 'repo_touch', repoPath: ${JSON.stringify(touchDir)}, analysis: ${JSON.stringify(fakeAnalysis('touch'))} });
`);
check('a later write does not resurrect a deleted repo', !readFile().some((r) => r.repoId === 'repo_late'), readFile().map((r) => r.repoId).join(', '));

// ── A running process must see a repo another process saved ─────────────────
const visibleDir = makeRepoDir('repo_visible');
const visibility = runInChild(`
  const { spawnSync } = require('child_process');
  const store = require(process.env.ALIYA_STORE_MODULE);

  console.log('BEFORE:' + (store.getRepo('repo_visible') ? 'present' : 'missing'));

  const writer = spawnSync(process.execPath, ['-e', \`
    const s = require(process.env.ALIYA_STORE_MODULE);
    s.saveRepo({ repoId: 'repo_visible', repoPath: ${JSON.stringify(visibleDir)}, analysis: ${JSON.stringify(fakeAnalysis('visible'))} });
  \`], { cwd: process.cwd(), env: process.env, encoding: 'utf8' });
  if (writer.status !== 0) { console.error(writer.stderr); process.exit(1); }

  console.log('AFTER:' + (store.getRepo('repo_visible') ? 'present' : 'missing'));
  console.log('LISTED:' + (store.listRepos().some((r) => r.repoId === 'repo_visible') ? 'yes' : 'no'));
`);

check('the repo was genuinely absent before the other process saved it', visibility.includes('BEFORE:missing'), visibility.split('\n').join(' | '));
check('getRepo sees a repo saved by another process', visibility.includes('AFTER:present'), visibility.split('\n').join(' | '));
check('listRepos sees a repo saved by another process', visibility.includes('LISTED:yes'), visibility.split('\n').join(' | '));

// ── Delete must work on a record this process never loaded ──────────────────
const orphanDir = makeRepoDir('repo_orphan');
const orphanDelete = runInChild(`
  const { spawnSync } = require('child_process');
  const store = require(process.env.ALIYA_STORE_MODULE);

  const writer = spawnSync(process.execPath, ['-e', \`
    const s = require(process.env.ALIYA_STORE_MODULE);
    s.saveRepo({ repoId: 'repo_orphan', repoPath: ${JSON.stringify(orphanDir)}, analysis: ${JSON.stringify(fakeAnalysis('orphan'))} });
  \`], { cwd: process.cwd(), env: process.env, encoding: 'utf8' });
  if (writer.status !== 0) { console.error(writer.stderr); process.exit(1); }

  // This process never loaded repo_orphan — it exists only on disk.
  console.log('REMOVED:' + (store.deleteRepo('repo_orphan') ? 'yes' : 'no'));
`);

check('delete removes a record this process never loaded', orphanDelete.includes('REMOVED:yes'), orphanDelete);
check('the orphan record is gone from the file', !readFile().some((r) => r.repoId === 'repo_orphan'), readFile().map((r) => r.repoId).join(', '));

fs.rmSync(STORAGE, { recursive: true, force: true });

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
