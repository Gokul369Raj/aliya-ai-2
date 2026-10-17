const { analyzeHealthScore, analyzeGitIntelligence } = require('./health-score');
const fs = require('fs/promises');
const path = require('path');

const cors = require('cors');
const express = require('express');

const { askRepository, resolveSearchIndex } = require('./ai');
const { buildActionPrompt } = require('./action-prompts');
const { CLIENT_DIST, MAX_FILE_RESPONSE_BYTES } = require('./constants');
const { getModelCatalog } = require('./model-catalog');
const { analyzeRepository, getCommitHistory, getRunFlow, refreshArchitecture } = require('./repo-analyzer');
const {
  completeJob,
  createJob,
  failJob,
  getJob,
  getRepo,
  listRepos,
  setSearchIndex,
  touchRepo,
  deleteRepo,
  saveRepo,
  updateJob,
} = require('./store');

const app = express();
const PORT = Number(process.env.PORT || 3001);

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

/**
 * Bump whenever the architecture, risk or code-intelligence detectors change
 * meaningfully. Saved analyses carry the version they were produced with, so
 * older projects get recomputed from the local clone instead of showing stale
 * results.
 */
const ANALYSIS_ENGINE_VERSION = 10;

/**
 * Refresh architecture intelligence for analyses produced by an older flow
 * engine. Runs at most once per project per version.
 */
async function ensureFreshArchitecture(repoRecord) {
  const analysis = repoRecord?.analysis;
  if (!analysis) return analysis;
  if (analysis.analysisEngineVersion === ANALYSIS_ENGINE_VERSION) return analysis;

  try {
    const fresh = await refreshArchitecture(repoRecord.repoPath, analysis);
    if (!fresh) {
      analysis.analysisEngineVersion = ANALYSIS_ENGINE_VERSION;
      return analysis;
    }

    const architecture = fresh.architecture;
    analysis.flows = architecture.flows;
    // Mirror the exact shape repo-analyzer produces: the summary lives under
    // `architecture.summary`, and `analysis.summary.architecture` is a copy
    // kept for backwards compatibility.
    analysis.architecture = {
      summary: architecture.summary,
      risks: architecture.risks,
      deadNodeIds: architecture.deadNodeIds,
      brokenNodeIds: architecture.brokenNodeIds,
    };
    if (analysis.summary) {
      analysis.summary.architecture = architecture.summary;
    }
    if (fresh.codeIntelligence) {
      analysis.codeIntelligence = fresh.codeIntelligence;
    }
    // The UI renders `analysis.runFlow` and `analysis.summary.description`,
    // both of which are baked in at analysis time.
    if (fresh.runFlow) {
      analysis.runFlow = fresh.runFlow;
    }
    if (fresh.description && analysis.summary) {
      analysis.summary.description = fresh.description;
    }

    // Node annotations drive graph colouring, layer badges and risk markers.
    const annotations = architecture.nodeAnnotations || {};
    for (const node of analysis.graph?.nodes || []) {
      const annotation = annotations[node.id];
      if (!annotation) continue;
      node.roles = annotation.roles;
      node.layer = annotation.layer;
      node.status = annotation.status;
      node.riskCount = annotation.riskCount;
      node.riskLabels = annotation.riskLabels;
      node.architectureRole = annotation.architectureRole;
    }

    analysis.analysisEngineVersion = ANALYSIS_ENGINE_VERSION;
    touchRepo(repoRecord.repoId);
    console.log(`Refreshed architecture for ${analysis.repoName}`);
  } catch (error) {
    console.warn('Architecture refresh failed:', error.message);
  }

  return analysis;
}

/**
 * Commit history is intentionally not part of the stored analysis payload —
 * fetching it during the scan would slow analysis down. Resolve it on demand
 * for the git-based endpoints, deepening the shallow clone the first time.
 */
async function resolveCommitHistory(repoRecord) {
  const cached = repoRecord?.analysis?.commitHistory;
  if (Array.isArray(cached) && cached.length) {
    return cached;
  }
  if (!repoRecord?.repoPath) {
    return [];
  }
  try {
    const history = await getCommitHistory(repoRecord.repoPath, 150);
    return history?.commits || [];
  } catch (error) {
    console.warn('Unable to resolve commit history:', error.message);
    return [];
  }
}

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
      const { analysis, repoPath, searchIndex } = await analyzeRepository(repoUrl, reportProgress);
      analysis.analysisEngineVersion = ANALYSIS_ENGINE_VERSION;
      saveRepo({
        repoId: analysis.repoId,
        repoPath,
        analysis,
      });
      if (searchIndex) {
        setSearchIndex(analysis.repoId, searchIndex);
      }
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

app.get('/api/repos/:repoId', async (req, res) => {
  const repoRecord = touchRepo(req.params.repoId);
  if (!repoRecord) return res.status(404).json({ error: 'Repository not found.' });
  await ensureFreshArchitecture(repoRecord);
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

app.get('/api/repos/:repoId/search', async (req, res) => {
  const repoRecord = getRepo(req.params.repoId);
  if (!repoRecord) {
    return res.status(404).json({ error: 'Repository not found.' });
  }

  const query = String(req.query.q || '').trim();
  if (!query) {
    return res.status(400).json({ error: 'Search query is required.' });
  }

  try {
    const searchIdx = await resolveSearchIndex(repoRecord);
    if (!searchIdx) {
      return res.json({ results: [], message: 'Search index not available.' });
    }

    const { searchIndex } = require('./search-index');
    const maxResults = Math.min(20, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const results = searchIndex(searchIdx, query, {
      maxResults,
      includeContent: req.query.content === 'true',
      analysis: repoRecord.analysis,
    });

    return res.json({ query, results, total: results.length });
  } catch (error) {
    console.error('Repository search failed:', error);
    return res.status(500).json({ error: error.message || 'Search failed.' });
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


app.post('/api/ai/action', async (req, res) => {
  const { repoId, provider, model, apiKey, action, filePath, fileContent, nodeData, conversationHistory } = req.body || {};

  if (!repoId || !action || !filePath || !apiKey) {
    return res.status(400).json({ error: 'Repository, action, file path, and API key are required.' });
  }

  try {
    const repoRecord = getRepo(repoId);
    if (!repoRecord) {
      return res.status(404).json({ error: 'Repository not found.' });
    }

    await ensureFreshArchitecture(repoRecord);
    const analysis = repoRecord.analysis;
    
    // Get code intelligence for this file
    const codeIntel = analysis?.codeIntelligence || {};
    const fileIntel = {
      functions: (codeIntel.functionNodes || []).filter(f => f.filePath === filePath),
      classes: (codeIntel.classNodes || []).filter(c => c.filePath === filePath),
      routes: (codeIntel.routeNodes || []).filter(r => r.filePath === filePath),
    };

    // Build focused prompt
    const prompt = buildActionPrompt({
      action,
      filePath,
      fileContent: fileContent || '',
      nodeData: nodeData || {},
      codeIntel: fileIntel,
      analysis,
    });

    // For dependency action with pre-computed data, skip AI if simple
    if (action === 'dependency' && !fileIntel.functions.length && !fileIntel.routes.length) {
      const { getFileDependencies, getFileDependents } = require('./action-prompts');
      const deps = getFileDependencies(filePath, analysis);
      const dependents = getFileDependents(filePath, analysis);
      if (deps.length === 0 && dependents.length === 0) {
        return res.json({ answer: 'This file has no dependencies and nothing depends on it.' });
      }
    }

    const answer = await askRepository({
      repoId,
      provider,
      model,
      apiKey,
      question: prompt,
      selectedPath: filePath,
      focusedNodeIds: [`file:${filePath}`],
      conversationMessages: conversationHistory || [],
    });

    return res.json({ answer });
  } catch (error) {
    console.error('Action request failed:', error);
    return res.status(500).json({ error: error.message || 'Failed to perform action.' });
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
    conversationHistory, // NEW: last N messages for follow-up context
  } = req.body || {};

  if (!repoId || !question || !apiKey) {
    return res.status(400).json({ error: 'Repository, question, and API key are required.' });
  }

  try {
    // Make sure the model sees current flows, not a stale analysis.
    const repoRecord = getRepo(repoId);
    if (repoRecord) await ensureFreshArchitecture(repoRecord);

    const answer = await askRepository({
      repoId,
      provider,
      model,
      apiKey,
      question,
      selectedPath,
      focusedNodeIds,
      conversationMessages: conversationHistory || [],
    });

    return res.json({ answer });
  } catch (error) {
    console.error('AI request failed:', error);
    return res.status(500).json({ error: error.message || 'Failed to analyze repository with AI.' });
  }
});



// ── Streaming AI Endpoint ──
// Same prompt and provider as /api/ai/ask, but the text is forwarded as Server-
// Sent Events so the panel fills in progressively instead of sitting blank.
// Token cost is identical — only the transport differs.
const { streamRepositoryAnswer } = require('./ai');

app.post('/api/ai/ask/stream', async (req, res) => {
  const {
    repoId,
    provider,
    model,
    apiKey,
    question,
    selectedPath,
    focusedNodeIds,
    conversationHistory,
  } = req.body || {};

  if (!repoId || !question || !apiKey) {
    return res.status(400).json({ error: 'Repository, question, and API key are required.' });
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  // Stops nginx and friends from buffering the stream into one blob.
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const send = (payload) => {
    if (res.writableEnded) return;
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  // Ack immediately so the "reading the codebase" state does not look frozen
  // while the prompt is still being assembled.
  send({ type: 'start' });

  try {
    const repoRecord = getRepo(repoId);
    if (repoRecord) await ensureFreshArchitecture(repoRecord);

    const stream = await streamRepositoryAnswer({
      repoId,
      provider,
      model,
      apiKey,
      question,
      selectedPath,
      focusedNodeIds,
      conversationMessages: conversationHistory || [],
    });

    let text = '';
    for await (const delta of stream) {
      if (!delta) continue;
      text += delta;
      send({ type: 'delta', text: delta });
    }

    send({ type: 'done', text });
  } catch (error) {
    console.error('AI stream failed:', error);
    send({ type: 'error', error: error.message || 'Failed to stream an answer.' });
  } finally {
    if (!res.writableEnded) res.end();
  }
});

// ── Health Score Endpoint ──
app.get('/api/repos/:repoId/health', async (req, res) => {
  const repoRecord = getRepo(req.params.repoId);
  if (!repoRecord) {
    return res.status(404).json({ error: 'Repository not found.' });
  }

  try {
    const analysis = repoRecord.analysis;
    await ensureFreshArchitecture(repoRecord);
    const architecture = analysis?.architecture || {};
    const codeIntel = analysis?.codeIntelligence || {};
    // Commit history is not stored in the analysis payload (it would slow the
    // scan down) — fetch it on demand so git metrics are actually populated.
    const gitHistory = await resolveCommitHistory(repoRecord);

    const healthScore = analyzeHealthScore(analysis, architecture, codeIntel, gitHistory);
    return res.json(healthScore);
  } catch (error) {
    console.error('Health score failed:', error);
    return res.status(500).json({ error: error.message || 'Failed to compute health score.' });
  }
});

// ── Impact / Trace Endpoints ──
// Blast radius for one node, and the shortest import chain between two nodes.
// Both are pure graph computations over the scanned edges — no re-parsing, no
// inference. `server/impact-analysis.js` documents what each result does and
// does not cover, and every response carries that list.
const { analyzeImpact, tracePath } = require('./impact-analysis');

app.get('/api/repos/:repoId/impact', (req, res) => {
  const repoRecord = getRepo(req.params.repoId);
  if (!repoRecord) {
    return res.status(404).json({ error: 'Repository not found.' });
  }

  const nodeId = String(req.query.nodeId || '').trim();
  if (!nodeId) {
    return res.status(400).json({ error: 'nodeId query parameter is required.' });
  }

  try {
    const depth = Number(req.query.depth);
    const impact = analyzeImpact(repoRecord.analysis, nodeId, {
      maxDepth: Number.isInteger(depth) && depth > 0 ? depth : undefined,
    });
    return res.json(impact);
  } catch (error) {
    if (error.code === 'NODE_NOT_FOUND') {
      return res.status(404).json({ error: error.message });
    }
    console.error('Impact analysis failed:', error);
    return res.status(500).json({ error: error.message || 'Failed to compute impact.' });
  }
});

app.get('/api/repos/:repoId/trace', (req, res) => {
  const repoRecord = getRepo(req.params.repoId);
  if (!repoRecord) {
    return res.status(404).json({ error: 'Repository not found.' });
  }

  const from = String(req.query.from || '').trim();
  const to = String(req.query.to || '').trim();
  if (!from || !to) {
    return res.status(400).json({ error: 'Both "from" and "to" query parameters are required.' });
  }

  try {
    return res.json(tracePath(repoRecord.analysis, from, to));
  } catch (error) {
    if (error.code === 'NODE_NOT_FOUND') {
      return res.status(404).json({ error: error.message });
    }
    console.error('Trace failed:', error);
    return res.status(500).json({ error: error.message || 'Failed to trace a path.' });
  }
});

// ── Git Intelligence Endpoint ──
app.get('/api/repos/:repoId/git-intelligence', async (req, res) => {
  const repoRecord = getRepo(req.params.repoId);
  if (!repoRecord) {
    return res.status(404).json({ error: 'Repository not found.' });
  }

  try {
    const analysis = repoRecord.analysis;
    await ensureFreshArchitecture(repoRecord);
    const gitHistory = await resolveCommitHistory(repoRecord);

    const gitIntel = analyzeGitIntelligence(gitHistory, analysis);
    return res.json(gitIntel);
  } catch (error) {
    console.error('Git intelligence failed:', error);
    return res.status(500).json({ error: error.message || 'Failed to compute git intelligence.' });
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
