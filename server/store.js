const fs = require('fs');
const path = require('path');

const { STORAGE_ROOT } = require('./constants');

const jobs = new Map();
const repos = new Map();
const PROJECTS_FILE = path.join(STORAGE_ROOT, 'projects.json');

function persistRepos() {
  fs.mkdirSync(STORAGE_ROOT, { recursive: true });
  const records = Array.from(repos.values());
  const temporaryFile = `${PROJECTS_FILE}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(records), 'utf8');
  fs.renameSync(temporaryFile, PROJECTS_FILE);
}

function restoreRepos() {
  try {
    const records = JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8'));
    if (!Array.isArray(records)) return;
    for (const record of records) {
      if (record?.repoId && record?.analysis && fs.existsSync(record.repoPath)) {
        repos.set(record.repoId, record);
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn('Unable to restore recent projects:', error.message);
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
  return repos.get(repoId) || null;
}

function listRepos() {
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
  const record = repos.get(repoId);
  if (!record) return null;
  repos.delete(repoId);
  persistRepos();
  fs.rmSync(record.repoPath, { recursive: true, force: true });
  return record;
}

module.exports = {
  completeJob,
  createJob,
  failJob,
  getJob,
  getRepo,
  listRepos,
  touchRepo,
  deleteRepo,
  saveRepo,
  updateJob,
};
