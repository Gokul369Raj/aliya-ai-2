const fs = require('fs/promises');
const path = require('path');

const { getDefaultModel } = require('./model-catalog');
const { getRepo } = require('./store');

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

function buildFocusedSection(analysis, focusedNodeIds) {
  if (!focusedNodeIds?.length) {
    return '';
  }

  const focusedNodes = analysis.graph.nodes
    .filter((node) => focusedNodeIds.includes(node.id))
    .slice(0, 18)
    .map((node) => `${node.label} (${node.path || node.id})`);

  if (!focusedNodes.length) {
    return '';
  }

  return `Focused graph nodes:\n${focusedNodes.map((item) => `- ${item}`).join('\n')}`;
}

async function buildPrompt({
  repoRecord,
  question,
  selectedPath,
  focusedNodeIds,
}) {
  const { analysis } = repoRecord;
  const selectedFile = await loadSelectedFile(repoRecord, selectedPath);
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
    'Answer using only the supplied repository context. Be precise, architectural, and practical.',
    'If context is insufficient, say what is uncertain instead of inventing details.',
    'Prefer concise markdown with short sections.',
    '',
    `Repository: ${analysis.repoName}`,
    `Repository URL: ${analysis.repoUrl}`,
    `Branch snapshot: ${analysis.branch}`,
    '',
    'Repository summary:',
    analysis.summary.narrative,
    '',
    'Language mix:',
    analysis.summary.languageBreakdown.map((item) => `- ${item.language}: ${item.count} files`).join('\n') || '- Unknown',
    '',
    'Important files:',
    importantFiles || '- None detected',
    '',
    'External dependencies:',
    topDependencies || '- None detected',
    '',
    'Graph metrics:',
    `- Nodes: ${analysis.graph.nodes.length}`,
    `- Edges: ${analysis.graph.edges.length}`,
    `- Dependency edges: ${analysis.summary.dependencyEdgeCount}`,
    `- Folder count: ${analysis.summary.folderCount}`,
    `- File count: ${analysis.summary.fileCount}`,
    '',
    buildFocusedSection(analysis, focusedNodeIds),
    selectedPath ? `Selected file: ${selectedPath}` : '',
    selectedFile ? `Selected file contents:\n\`\`\`\n${selectedFile}\n\`\`\`` : '',
    '',
    `User question: ${question}`,
    '',
    'Structure your answer around: project purpose, architecture, important flows, relevant files, and direct answer to the question.',
  ]
    .filter(Boolean)
    .join('\n');
}

async function callOpenAI({ apiKey, model, prompt }) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: prompt,
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message || 'OpenAI request failed');
  }

  return payload.output_text || 'No response text returned.';
}

async function callOpenAICompatible({ apiKey, model, prompt, baseUrl, providerLabel, extraHeaders = {} }) {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...extraHeaders,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.message || `${providerLabel} request failed`);
  }

  return payload?.choices?.[0]?.message?.content?.trim() || 'No response text returned.';
}

async function callAnthropic({ apiKey, model, prompt }) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
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

async function callGemini({ apiKey, model, prompt }) {
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
}) {
  const repoRecord = getRepo(repoId);
  if (!repoRecord) {
    throw new Error('Repository analysis not found. Analyze a repository first.');
  }

  const resolvedProvider = provider || 'openai';
  const resolvedModel = model || getDefaultModel(resolvedProvider);
  const prompt = await buildPrompt({
    repoRecord,
    question,
    selectedPath,
    focusedNodeIds,
  });

  if (resolvedProvider === 'gemini') {
    return callGemini({ apiKey, model: resolvedModel, prompt });
  }

  if (resolvedProvider === 'anthropic') {
    return callAnthropic({ apiKey, model: resolvedModel, prompt });
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
    });
  }

  if (resolvedProvider === 'xai') {
    return callOpenAICompatible({
      apiKey,
      model: resolvedModel,
      prompt,
      baseUrl: 'https://api.x.ai/v1',
      providerLabel: 'xAI',
    });
  }

  if (resolvedProvider === 'deepseek') {
    return callOpenAICompatible({
      apiKey,
      model: resolvedModel,
      prompt,
      baseUrl: 'https://api.deepseek.com',
      providerLabel: 'DeepSeek',
    });
  }

  if (resolvedProvider === 'mistral') {
    return callOpenAICompatible({
      apiKey,
      model: resolvedModel,
      prompt,
      baseUrl: 'https://api.mistral.ai/v1',
      providerLabel: 'Mistral',
    });
  }

  if (resolvedProvider === 'groq') {
    return callOpenAICompatible({
      apiKey,
      model: resolvedModel,
      prompt,
      baseUrl: 'https://api.groq.com/openai/v1',
      providerLabel: 'Groq',
    });
  }

  if (resolvedProvider === 'perplexity') {
    return callOpenAICompatible({
      apiKey,
      model: resolvedModel,
      prompt,
      baseUrl: 'https://api.perplexity.ai',
      providerLabel: 'Perplexity',
    });
  }

  return callOpenAI({ apiKey, model: resolvedModel, prompt });
}

module.exports = {
  askRepository,
};
