const fs = require('fs/promises');
const path = require('path');

const cors = require('cors');
const express = require('express');

const { askRepository } = require('./ai');
const { CLIENT_DIST, MAX_FILE_RESPONSE_BYTES } = require('./constants');
const { getModelCatalog } = require('./model-catalog');
const { analyzeRepository, getCommitHistory, getRunFlow } = require('./repo-analyzer');
const {
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
} = require('./store');

const app = express();
const PORT = Number(process.env.PORT || 3000);

async function openBrowser(url) {
  try {
    const { default: open } = await import('open');
    await open(url);
  } catch {
    console.log('Unable to open the browser automatically.');
  }
}

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    name: 'Aliya AI',
    version: '1.0.0',
  });
});

app.get('/api/ai/catalog', (req, res) => {
  res.json(getModelCatalog());
});

app.post('/api/repos/analyze', async (req, res) => {
  const { repoUrl } = req.body || {};
  if (!repoUrl) {
    return res.status(400).json({ error: 'Repository URL is required.' });
  }

  const job = createJob();
  updateJob(job.id, {
    status: 'running',
    phase: 'queued',
    progress: 3,
    message: 'Queued for repository analysis',
  });

  void (async () => {
    try {
      const reportProgress = (phase, progress, message, details = {}) => {
        updateJob(job.id, {
          status: 'running',
          phase,
          progress: Math.max(0, Math.min(100, Number(progress) || 0)),
          message,
          details,
        });
      };

      reportProgress('cloning', 12, 'Preparing repository workspace');
      const { analysis, repoPath } = await analyzeRepository(repoUrl, reportProgress);
      saveRepo({
        repoId: analysis.repoId,
        repoPath,
        analysis,
      });
      completeJob(job.id, analysis);
    } catch (error) {
      console.error('Repository analysis failed:', error);
      failJob(job.id, error);
    }
  })();

  return res.status(202).json({ jobId: job.id });
});

app.get('/api/jobs/:jobId', (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found.' });
  }

  return res.json(job);
});

app.get('/api/repos', (req, res) => {
  return res.json({ projects: listRepos() });
});

app.get('/api/repos/:repoId', (req, res) => {
  const repoRecord = touchRepo(req.params.repoId);
  if (!repoRecord) return res.status(404).json({ error: 'Repository not found.' });
  return res.json(repoRecord.analysis);
});

app.delete('/api/repos/:repoId', (req, res) => {
  const repoRecord = deleteRepo(req.params.repoId);
  if (!repoRecord) return res.status(404).json({ error: 'Repository not found.' });
  return res.status(204).end();
});

app.get('/api/repos/:repoId/file', async (req, res) => {
  const repoRecord = getRepo(req.params.repoId);
  if (!repoRecord) {
    return res.status(404).json({ error: 'Repository not found.' });
  }

  const requestedPath = String(req.query.path || '');
  if (!requestedPath) {
    return res.status(400).json({ error: 'File path is required.' });
  }

  const absolutePath = path.resolve(repoRecord.repoPath, requestedPath);
  if (!absolutePath.startsWith(repoRecord.repoPath)) {
    return res.status(400).json({ error: 'Invalid file path.' });
  }

  try {
    const stats = await fs.stat(absolutePath);
    if (stats.size > MAX_FILE_RESPONSE_BYTES) {
      return res.json({
        path: requestedPath,
        truncated: true,
        content: 'File is too large to render in the editor panel. Narrow the graph or inspect the file locally.',
      });
    }

    const content = await fs.readFile(absolutePath, 'utf8');
    const fileMeta = repoRecord.analysis.files.find((file) => file.path === requestedPath);
    return res.json({
      path: requestedPath,
      language: fileMeta?.language || 'plaintext',
      content,
      truncated: false,
    });
  } catch (error) {
    return res.status(404).json({ error: 'Unable to read file contents.' });
  }
});

app.get('/api/repos/:repoId/commits', async (req, res) => {
  const repoRecord = getRepo(req.params.repoId);
  if (!repoRecord) {
    return res.status(404).json({ error: 'Repository not found.' });
  }

  try {
    const history = await getCommitHistory(repoRecord.repoPath, req.query.limit);
    return res.json(history);
  } catch (error) {
    console.error('Commit history failed:', error);
    return res.status(500).json({ error: error.message || 'Unable to read commit history.' });
  }
});

app.get('/api/repos/:repoId/run-flow', async (req, res) => {
  const repoRecord = getRepo(req.params.repoId);
  if (!repoRecord) {
    return res.status(404).json({ error: 'Repository not found.' });
  }

  try {
    const flow = await getRunFlow(repoRecord.repoPath);
    return res.json(flow);
  } catch (error) {
    console.error('Run flow failed:', error);
    return res.status(500).json({ error: error.message || 'Unable to generate run flow.' });
  }
});

app.post('/api/ai/ask', async (req, res) => {
  const {
    repoId,
    provider,
    model,
    apiKey,
    question,
    selectedPath,
    focusedNodeIds,
  } = req.body || {};

  if (!repoId || !question || !apiKey) {
    return res.status(400).json({ error: 'Repository, question, and API key are required.' });
  }

  try {
    const answer = await askRepository({
      repoId,
      provider,
      model,
      apiKey,
      question,
      selectedPath,
      focusedNodeIds,
    });

    return res.json({ answer });
  } catch (error) {
    console.error('AI request failed:', error);
    return res.status(500).json({ error: error.message || 'Failed to analyze repository with AI.' });
  }
});

app.use(express.static(CLIENT_DIST));

const sendClientIndex = async (res) => {
  try {
    await fs.access(path.join(CLIENT_DIST, 'index.html'));
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  } catch {
    res.status(500).send(
      'Client build not found. Run `npm run build` before starting the production server or publishing the package.',
    );
  }
};

app.get('/', async (req, res) => {
  await sendClientIndex(res);
});

app.get(/.*/, async (req, res) => {
  await sendClientIndex(res);
});

app.listen(PORT, async () => {
  console.log(`Aliya AI server running at http://localhost:${PORT}`);

  // Keep process alive for Node.js edge cases where server drops event loop
  setInterval(() => {}, 1000 * 60 * 60);

  if (!process.env.ALIYA_SKIP_OPEN && process.env.NODE_ENV !== 'development') {
    await openBrowser(`http://localhost:${PORT}`);
  }
});
