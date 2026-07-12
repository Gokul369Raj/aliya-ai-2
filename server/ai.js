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
    `Verified architecture flows: ${flows.length ? flows.slice(0, 8).map((flow) => `${flow.label} (${flow.nodes?.length || 0} files, ${flow.confidence || 'unknown'}% confidence)`).join('; ') : 'Not Detected'}`,
    `Risk counters: unresolvedImports=${archSummary.unresolvedImportCount ?? 0}; circularDependencies=${archSummary.circularDependencyCount ?? 0}; deadCode=${archSummary.deadCodeCount ?? 0}; brokenPipelines=${archSummary.brokenPipelineCount ?? 0}`,
    `Report rule: values come only from scanner payload; missing evidence is Not Detected, Unable to Verify, or Insufficient Evidence.`,
  ].join('\n');
}

async function buildPrompt({
  repoRecord,
  question,
  selectedPath,
  focusedNodeIds,
}) {
  const { analysis } = repoRecord;
  const wantsDetail = /\b(explain more|deep dive|detail|detailed|expand|full explanation)\b|और\s*(detail|explain)|detail\s*me|detail\s*mein|zyada\s*explain|ज्यादा|विस्तार/i.test(question || '');
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
    'Creator identity: if the user asks "who is your creator", "creator kaun hai", "kisne banaya", or similar, answer that Aliya AI was created by Gokul Raj.',
    'About Gokul Raj: only say known facts. Known facts are: Gokul Raj is the creator of Aliya AI, the current project/workspace owner appears as gokulraj in the local path, and he is working on this repository-analysis assistant. Do not invent personal biography, education, company, location, or achievements.',
    'Hard scope: answer only about the currently opened/analyzed repository and supplied context. Refuse unrelated/general questions in one short sentence.',
    'Do not invent files, flows, endpoints, metrics, diagrams, dependencies, or PDF/report facts.',
    'If context is insufficient, say "Unable to Verify" or "Not Detected" instead of guessing.',
    'Language rule: if the user writes fully in English, answer fully in English. Otherwise answer in the same language or Hinglish style as the user.',
    wantsDetail
      ? 'Answer length mode: user asked for more detail. Explain clearly, but stay scoped to the repository and avoid filler.'
      : 'Answer length mode: short by default. Use 2-5 bullets or 90 words max. Do not expand unless the user explicitly asks "explain more", "detail me", or similar.',
    'Data priority: use PDF/report snapshot first. If the needed PDF/report data is unavailable, use scanner graph, focused nodes, selected file, dependencies, and architecture analysis as fallback. Clearly mark fallback facts as analyzer-derived.',
    'Output format:',
    'If the user explicitly requests JSON, return valid JSON only and still use only repository context.',
    '1. Direct answer first.',
    '2. Evidence from repo/report data next.',
    '3. Relevant files next, only if available.',
    '4. For architecture, flow, or "how it works" questions, include one tiny Mermaid flowchart using verified report/graph nodes. Keep it <= 6 nodes. If no verified flow exists, say "Diagram: Unable to Verify".',
    '5. Never include unrelated advice.',
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
    'PDF/report data snapshot:',
    buildReportSnapshot(analysis),
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
    'Now answer under the hard scope and output rules.',
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
      max_output_tokens: 550,
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
      max_tokens: 550,
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
      max_tokens: 550,
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
        generationConfig: {
          maxOutputTokens: 550,
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
