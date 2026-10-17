/**
 * ai.js — AI question-answering engine for Aliya AI
 *
 * Features:
 * - Adaptive output tokens based on question complexity
 * - Conversation memory for follow-up questions
 * - Smart context compression to save user tokens
 * - Multi-provider support with consistent interface
 */

const fs = require('fs/promises');
const path = require('path');

const { getDefaultModel } = require('./model-catalog');
const { getRepo, getSearchIndex, setSearchIndex } = require('./store');
const { buildSearchIndex } = require('./search-index');
const { buildEnhancedPrompt } = require('./ai-context');
const { detectQuestionType, calculateOutputTokens } = require('./token-manager');

// File contents are not persisted with the analysis payload, so a restart wipes
// the in-memory RAG index. Without it the model loses all retrieved files and
// verbatim code evidence. Rebuild it once per session from the local clone.
const MAX_INDEXABLE_FILE_BYTES = 400_000;

async function resolveSearchIndex(repoRecord) {
  const repoId = repoRecord?.repoId;
  if (!repoId) return null;

  const existing = getSearchIndex(repoId);
  if (existing) return existing;

  const files = repoRecord.analysis?.files || [];
  if (!files.length || !repoRecord.repoPath) return null;

  const hydrated = [];
  for (const file of files) {
    if (typeof file.size === 'number' && file.size > MAX_INDEXABLE_FILE_BYTES) continue;
    try {
      const content = await fs.readFile(path.resolve(repoRecord.repoPath, file.path), 'utf8');
      hydrated.push({ ...file, content });
    } catch {
      // Unreadable or binary file — skip it.
    }
  }

  if (!hydrated.length) return null;

  const rebuilt = buildSearchIndex(hydrated, repoRecord.analysis);
  setSearchIndex(repoId, rebuilt);
  return rebuilt;
}

function clipText(text, maxChars) {
  if (!text || text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}\n... truncated ...`;
}

async function loadSelectedFile(repoRecord, selectedPath) {
  if (!repoRecord || !selectedPath) {
    return null;
  }

  const absolutePath = path.resolve(repoRecord.repoPath, selectedPath);
  if (!absolutePath.startsWith(repoRecord.repoPath)) {
    return null;
  }

  try {
    const content = await fs.readFile(absolutePath, 'utf8');
    return clipText(content, 12_000);
  } catch {
    return null;
  }
}

function buildReportSnapshot(analysis) {
  const flows = analysis.flows?.available || [];
  const archSummary = analysis.architecture?.summary || {};
  const layerSummary = archSummary.layerSummary || {};
  const topLayers = Object.entries(layerSummary)
    .sort(([, left], [, right]) => right - left)
    .slice(0, 8)
    .map(([layer, count]) => `${layer}:${count}`)
    .join(', ');

  return [
    `PDF/report facts available: repo=${analysis.repoName}; files=${analysis.summary.fileCount}; folders=${analysis.summary.folderCount}; graphNodes=${analysis.graph.nodes.length}; graphEdges=${analysis.graph.edges.length}`,
    `Architecture layers: ${topLayers || 'Unable to Verify'}`,
    `Verified architecture flows: ${flows.length ? flows.slice(0, 8).map((flow) => `${flow.label} (${flow.nodes?.length || 0} files, ${flow.confidence || 'unknown'}% confidence, ${flow.strength || 'structural'})`).join('; ') : 'Not Detected'}`,
    `Flows NOT listed above do not exist in this repository — never describe an authentication, payment, websocket, caching or queue flow unless it appears in that list.`,    `Risk counters: unresolvedImports=${archSummary.unresolvedImportCount ?? 0}; circularDependencies=${archSummary.circularDependencyCount ?? 0}; deadCode=${archSummary.deadCodeCount ?? 0}; brokenPipelines=${archSummary.brokenPipelineCount ?? 0}`,
    `Report rule: values come only from scanner payload; missing evidence is Not Detected, Unable to Verify, or Insufficient Evidence.`,
  ].join('\n');
}

// Legacy prompt builder (kept as fallback)
function buildLegacyPrompt({ repoRecord, question, selectedPath, focusedNodeIds }) {
  const { analysis } = repoRecord;
  const wantsDetail = /\b(explain more|deep dive|detail|detailed|expand|full explanation)\b|और\s*(detail|explain)|detail\s*me|detail\s*mein|zyada\s*explain|ज्यादा|विस्तार/i.test(question || '');
  const importantFiles = analysis.summary.importantFiles
    .slice(0, 12)
    .map((file) => `- ${file.path} (${file.reason})`)
    .join('\n');
  const topDependencies = analysis.summary.externalDependencies
    .slice(0, 20)
    .map((dependency) => `- ${dependency.name}${dependency.version ? `@${dependency.version}` : ''}`)
    .join('\n');

  return [
    'You are Aliya AI, a senior repository analysis assistant.',
    'Creator identity: if the user asks "who is your creator", "creator kaun hai", "kisne banaya", or similar, answer that Aliya AI was created by Gokul Raj.',
    'Hard scope: answer only about the currently opened/analyzed repository and supplied context. Refuse unrelated/general questions in one short sentence.',
    'Do not invent files, flows, endpoints, metrics, diagrams, dependencies, or PDF/report facts.',
    'If context is insufficient, say "Unable to Verify" or "Not Detected" instead of guessing.',
    wantsDetail
      ? 'Answer length mode: user asked for more detail. Explain clearly, but stay scoped to the repository and avoid filler.'
      : 'Answer length mode: short by default. Use 2-5 bullets or 90 words max. Do not expand unless the user explicitly asks.',
    `Repository: ${analysis.repoName}`,
    `Repository URL: ${analysis.repoUrl}`,
    'Repository summary:',
    analysis.summary.narrative,
    'Language mix:',
    analysis.summary.languageBreakdown.map((item) => `- ${item.language}: ${item.count} files`).join('\n') || '- Unknown',
    'Important files:',
    importantFiles || '- None detected',
    'External dependencies:',
    topDependencies || '- None detected',
    'PDF/report data snapshot:',
    buildReportSnapshot(analysis),
    `User question: ${question}`,
    'Now answer under the hard scope and output rules.',
  ]
    .filter(Boolean)
    .join('\n');
}

async function callOpenAI({ apiKey, model, prompt, maxTokens = 550 }) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: prompt,
      max_output_tokens: maxTokens,
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message || 'OpenAI request failed');
  }

  return payload.output_text || 'No response text returned.';
}

async function callOpenAICompatible({ apiKey, model, prompt, baseUrl, providerLabel, extraHeaders = {}, maxTokens = 550 }) {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...extraHeaders,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.message || `${providerLabel} request failed`);
  }

  return payload?.choices?.[0]?.message?.content?.trim() || 'No response text returned.';
}

async function callAnthropic({ apiKey, model, prompt, maxTokens = 550 }) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message || 'Anthropic request failed');
  }

  const text = payload?.content?.map((part) => part.text).filter(Boolean).join('\n').trim();
  return text || 'No response text returned.';
}

async function callGemini({ apiKey, model, prompt, maxTokens = 550 }) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          maxOutputTokens: maxTokens,
        },
      }),
    },
  );

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message || 'Gemini request failed');
  }

  const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text).join('\n').trim();
  return text || 'No response text returned.';
}

async function askRepository({
  repoId,
  provider,
  model,
  apiKey,
  question,
  selectedPath,
  focusedNodeIds,
  conversationMessages, // NEW: previous conversation for follow-up context
}) {
  const repoRecord = getRepo(repoId);
  if (!repoRecord) {
    throw new Error('Repository analysis not found. Analyze a repository first.');
  }

  const resolvedProvider = provider || 'openai';
  const resolvedModel = model || getDefaultModel(resolvedProvider);

  // Detect question type for adaptive tokens
  const qType = detectQuestionType(question);
  const outputTokens = calculateOutputTokens(qType, resolvedProvider, resolvedModel);

  // Get search index for RAG retrieval (rebuilding it if the server restarted)
  const searchIdx = await resolveSearchIndex(repoRecord);

  // Build enhanced prompt using RAG context with conversation memory
  let prompt;
  try {
    prompt = await buildEnhancedPrompt({
      repoRecord: { ...repoRecord, provider: resolvedProvider, model: resolvedModel },
      question,
      selectedPath,
      focusedNodeIds,
      searchIdx,
      wantsDetail: qType.wantsDetail,
      conversationMessages,
    });
  } catch (err) {
    // Fallback to legacy prompt if enhanced builder fails
    console.warn('Enhanced prompt builder failed, using legacy:', err.message);
    prompt = buildLegacyPrompt({ repoRecord, question, selectedPath, focusedNodeIds });
  }

  // Call the appropriate provider with adaptive output tokens
  if (resolvedProvider === 'gemini') {
    return callGemini({ apiKey, model: resolvedModel, prompt, maxTokens: outputTokens });
  }

  if (resolvedProvider === 'anthropic') {
    return callAnthropic({ apiKey, model: resolvedModel, prompt, maxTokens: outputTokens });
  }

  if (resolvedProvider === 'openrouter') {
    return callOpenAICompatible({
      apiKey,
      model: resolvedModel,
      prompt,
      baseUrl: 'https://openrouter.ai/api/v1',
      providerLabel: 'OpenRouter',
      extraHeaders: {
        'HTTP-Referer': 'http://localhost',
        'X-Title': 'Aliya AI',
      },
      maxTokens: outputTokens,
    });
  }

  if (resolvedProvider === 'xai') {
    return callOpenAICompatible({
      apiKey,
      model: resolvedModel,
      prompt,
      baseUrl: 'https://api.x.ai/v1',
      providerLabel: 'xAI',
      maxTokens: outputTokens,
    });
  }

  if (resolvedProvider === 'deepseek') {
    return callOpenAICompatible({
      apiKey,
      model: resolvedModel,
      prompt,
      baseUrl: 'https://api.deepseek.com',
      providerLabel: 'DeepSeek',
      maxTokens: outputTokens,
    });
  }

  if (resolvedProvider === 'mistral') {
    return callOpenAICompatible({
      apiKey,
      model: resolvedModel,
      prompt,
      baseUrl: 'https://api.mistral.ai/v1',
      providerLabel: 'Mistral',
      maxTokens: outputTokens,
    });
  }

  if (resolvedProvider === 'groq') {
    return callOpenAICompatible({
      apiKey,
      model: resolvedModel,
      prompt,
      baseUrl: 'https://api.groq.com/openai/v1',
      providerLabel: 'Groq',
      maxTokens: outputTokens,
    });
  }

  if (resolvedProvider === 'perplexity') {
    return callOpenAICompatible({
      apiKey,
      model: resolvedModel,
      prompt,
      baseUrl: 'https://api.perplexity.ai',
      providerLabel: 'Perplexity',
      maxTokens: outputTokens,
    });
  }

  return callOpenAI({ apiKey, model: resolvedModel, prompt, maxTokens: outputTokens });
}

/* ── Streaming ─────────────────────────────────────────────────────────────
   Same prompt, same provider call, but the text is forwarded as it arrives so
   the panel fills in instead of sitting blank for ten seconds. The prompt is
   built by the same builders `askRepository` uses — only the transport differs,
   so a streamed answer and a buffered one cost identical tokens. */

/** Yield the `data:` payload of each SSE frame in a fetch body. */
async function* readSseFrames(response) {
  if (!response.body) throw new Error('This provider did not return a stream.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        for (const rawLine of frame.split('\n')) {
          const line = rawLine.trim();
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (payload) yield payload;
        }
        boundary = buffer.indexOf('\n\n');
      }
    }
  } finally {
    reader.releaseLock?.();
  }
}

async function* streamOpenAIResponses({ apiKey, model, prompt, maxTokens }) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, input: prompt, max_output_tokens: maxTokens, stream: true }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error?.message || 'OpenAI request failed');
  }

  for await (const data of readSseFrames(response)) {
    if (data === '[DONE]') return;
    let event;
    try { event = JSON.parse(data); } catch { continue; }
    if (event.type === 'response.output_text.delta' && event.delta) yield event.delta;
    else if (event.type === 'response.completed') return;
    else if (event.type === 'error') throw new Error(event.message || 'OpenAI stream failed');
  }
}

async function* streamOpenAICompatible({ apiKey, model, prompt, baseUrl, providerLabel, extraHeaders = {}, maxTokens }) {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...extraHeaders,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      stream: true,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error?.message || payload?.message || `${providerLabel} request failed`);
  }

  for await (const data of readSseFrames(response)) {
    if (data === '[DONE]') return;
    let event;
    try { event = JSON.parse(data); } catch { continue; }
    const delta = event?.choices?.[0]?.delta?.content;
    if (delta) yield delta;
  }
}

async function* streamAnthropic({ apiKey, model, prompt, maxTokens }) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      stream: true,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error?.message || 'Anthropic request failed');
  }

  for await (const data of readSseFrames(response)) {
    let event;
    try { event = JSON.parse(data); } catch { continue; }
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta' && event.delta.text) {
      yield event.delta.text;
    } else if (event.type === 'error') {
      throw new Error(event.error?.message || 'Anthropic stream failed');
    }
  }
}

async function* streamGemini({ apiKey, model, prompt, maxTokens }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens },
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error?.message || 'Gemini request failed');
  }

  for await (const data of readSseFrames(response)) {
    let event;
    try { event = JSON.parse(data); } catch { continue; }
    const parts = event?.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.text) yield part.text;
    }
  }
}

/**
 * Build the prompt exactly as `askRepository` does, then hand it to a streaming
 * provider call. Returns an async generator of text deltas.
 */
async function streamRepositoryAnswer({
  repoId,
  provider,
  model,
  apiKey,
  question,
  selectedPath,
  focusedNodeIds,
  conversationMessages,
}) {
  const repoRecord = getRepo(repoId);
  if (!repoRecord) {
    throw new Error('Repository analysis not found. Analyze a repository first.');
  }

  const resolvedProvider = provider || 'openai';
  const resolvedModel = model || getDefaultModel(resolvedProvider);

  const qType = detectQuestionType(question);
  const outputTokens = calculateOutputTokens(qType, resolvedProvider, resolvedModel);
  const searchIdx = await resolveSearchIndex(repoRecord);

  let prompt;
  try {
    prompt = await buildEnhancedPrompt({
      repoRecord: { ...repoRecord, provider: resolvedProvider, model: resolvedModel },
      question,
      selectedPath,
      focusedNodeIds,
      searchIdx,
      wantsDetail: qType.wantsDetail,
      conversationMessages,
    });
  } catch (error) {
    console.warn('Enhanced prompt builder failed, using legacy:', error.message);
    prompt = buildLegacyPrompt({ repoRecord, question, selectedPath, focusedNodeIds });
  }

  const shared = { apiKey, model: resolvedModel, prompt, maxTokens: outputTokens };

  if (resolvedProvider === 'gemini') return streamGemini(shared);
  if (resolvedProvider === 'anthropic') return streamAnthropic(shared);
  if (resolvedProvider === 'openrouter') {
    return streamOpenAICompatible({
      ...shared,
      baseUrl: 'https://openrouter.ai/api/v1',
      providerLabel: 'OpenRouter',
      extraHeaders: { 'HTTP-Referer': 'https://aliya.ai', 'X-Title': 'Aliya AI' },
    });
  }
  if (resolvedProvider === 'deepseek') {
    return streamOpenAICompatible({ ...shared, baseUrl: 'https://api.deepseek.com', providerLabel: 'DeepSeek' });
  }
  if (resolvedProvider === 'custom') {
    return streamOpenAICompatible({
      ...shared,
      baseUrl: process.env.ALIYA_CUSTOM_BASE_URL || 'http://localhost:11434/v1',
      providerLabel: 'Custom endpoint',
    });
  }

  return streamOpenAIResponses(shared);
}

module.exports = {
  askRepository,
  resolveSearchIndex,
  streamRepositoryAnswer,
};
