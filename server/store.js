const fs = require('fs');
const path = require('path');

const { STORAGE_ROOT } = require('./constants');

const jobs = new Map();
const repos = new Map();
const searchIndexes = new Map();
const PROJECTS_FILE = path.join(STORAGE_ROOT, 'projects.json');

/**
 * Repositories this process has explicitly deleted.
 *
 * Without a tombstone a merge cannot tell "I have never heard of this repo" from
 * "I deleted it", so a stale copy on disk would resurrect a deleted project.
 */
const deletedRepoIds = new Set();

/**
 * Read projects.json, cached by mtime.
 *
 * The cache matters: `getRepo` falls back to this file on a miss, and the file
 * carries whole analyses (megabytes for a large repo). Statting is cheap; parsing
 * it on every miss is not.
 */
let cachedRecords = null;
let cachedMtimeMs = -1;

function readProjectsFile() {
  try {
    const stat = fs.statSync(PROJECTS_FILE);
    if (cachedRecords && stat.mtimeMs === cachedMtimeMs) return cachedRecords;

    const records = JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8'));
    cachedRecords = Array.isArray(records) ? records.filter((record) => record?.repoId) : [];
    cachedMtimeMs = stat.mtimeMs;
    return cachedRecords;
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn('Unable to read projects file:', error.message);
    return cachedRecords || [];
  }
}

/** Adopt records another process wrote, so this process stops serving a stale view. */
function adoptExternalRecords() {
  for (const record of readProjectsFile()) {
    if (deletedRepoIds.has(record.repoId)) continue;
    if (!record.analysis) continue;
    if (repos.has(record.repoId)) continue;
    if (record.repoPath && !fs.existsSync(record.repoPath)) continue;
    repos.set(record.repoId, record);
  }
}

/**
 * Merge this process's repositories into the file instead of overwriting it.
 *
 * Several processes legitimately hold this file at once — the CLI, a dev server,
 * and any server left running from an earlier session. The old version wrote only
 * its own in-memory map, so whichever process wrote last silently erased
 * repositories another process had just saved. That is how a freshly analysed
 * repo could vanish between two commands.
 */
function persistRepos() {
  fs.mkdirSync(STORAGE_ROOT, { recursive: true });

  const merged = new Map();

  for (const record of readProjectsFile()) {
    if (deletedRepoIds.has(record.repoId)) continue;
    if (!record.analysis) continue;
    // A clone deleted outside the app should not come back from the dead.
    if (record.repoPath && !fs.existsSync(record.repoPath)) continue;
    merged.set(record.repoId, record);
  }

  for (const [repoId, record] of repos) {
    if (deletedRepoIds.has(repoId)) continue;
    merged.set(repoId, record);
  }

  const records = Array.from(merged.values());
  const temporaryFile = `${PROJECTS_FILE}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(records), 'utf8');
  // rename is atomic on the same filesystem, so a reader never sees a half file.
  fs.renameSync(temporaryFile, PROJECTS_FILE);

  // Adopt what another process added. Otherwise this process keeps serving a
  // stale view and the *next* write would erase it all over again.
  for (const [repoId, record] of merged) {
    if (!repos.has(repoId)) repos.set(repoId, record);
  }
}

function restoreRepos() {
  for (const record of readProjectsFile()) {
    if (record.analysis && fs.existsSync(record.repoPath)) {
      repos.set(record.repoId, record);
    }
  }
}

restoreRepos();

function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function createJob() {
  const job = {
    id: createId('job'),
    status: 'queued',
    phase: 'queued',
    progress: 0,
    message: 'Waiting to start',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    error: null,
    result: null,
  };
  jobs.set(job.id, job);
  return job;
}

function updateJob(jobId, patch) {
  const existing = jobs.get(jobId);
  if (!existing) {
    return null;
  }

  const next = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  jobs.set(jobId, next);
  return next;
}

function completeJob(jobId, result) {
  return updateJob(jobId, {
    status: 'completed',
    phase: 'complete',
    progress: 100,
    message: 'Analysis ready',
    result,
    error: null,
  });
}

function failJob(jobId, error) {
  return updateJob(jobId, {
    status: 'failed',
    phase: 'error',
    progress: 100,
    message: error.message || 'Repository analysis failed',
    error: error.message || 'Repository analysis failed',
  });
}

function getJob(jobId) {
  return jobs.get(jobId) || null;
}

function saveRepo(record) {
  const now = new Date().toISOString();
  const next = { ...record, createdAt: record.createdAt || now, viewedAt: now };
  repos.set(record.repoId, next);
  persistRepos();
  return next;
}

function getRepo(repoId) {
  const cached = repos.get(repoId);
  if (cached) return cached;

  // The CLI may have saved this repository after this process started. Look at
  // the file before reporting "not found" — that is what made a fresh analysis
  // invisible to an already-running server.
  const found = readProjectsFile().find((record) => record.repoId === repoId);
  if (!found || !found.analysis) return null;
  if (deletedRepoIds.has(repoId)) return null;
  repos.set(repoId, found);
  return found;
}

function listRepos() {
  adoptExternalRecords();
  return Array.from(repos.values())
    .sort((a, b) => String(b.viewedAt).localeCompare(String(a.viewedAt)))
    .map(({ analysis, repoPath, ...record }) => ({
      ...record,
      repoName: analysis.repoName,
      repoUrl: analysis.repoUrl,
      description: analysis.summary?.description || '',
      fileCount: analysis.files?.length || 0,
      nodeCount: analysis.graph?.nodes?.length || 0,
    }));
}

function touchRepo(repoId) {
  const record = repos.get(repoId);
  if (!record) return null;
  record.viewedAt = new Date().toISOString();
  persistRepos();
  return record;
}

function deleteRepo(repoId) {
  // The record may live only on disk — another process saved it after we
  // started. Looking it up in memory alone made delete silently do nothing.
  const record = repos.get(repoId)
    || readProjectsFile().find((entry) => entry.repoId === repoId)
    || null;
  if (!record) return null;

  repos.delete(repoId);
  searchIndexes.delete(repoId);
  // Remember the deletion so the merge in persistRepos does not read it back
  // from a copy another process still has on disk.
  deletedRepoIds.add(repoId);
  persistRepos();
  if (record.repoPath) fs.rmSync(record.repoPath, { recursive: true, force: true });
  return record;
}

// ── Search Index management ─────────────────────────────────────────────

function setSearchIndex(repoId, index) {
  searchIndexes.set(repoId, index);
}

function getSearchIndex(repoId) {
  return searchIndexes.get(repoId) || null;
}

function deleteSearchIndex(repoId) {
  searchIndexes.delete(repoId);
}

module.exports = {
  completeJob,
  createJob,
  failJob,
  getJob,
  getRepo,
  getSearchIndex,
  listRepos,
  setSearchIndex,
  deleteSearchIndex,
  touchRepo,
  deleteRepo,
  saveRepo,
  updateJob,
};
