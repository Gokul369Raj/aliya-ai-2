async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(payload?.error || 'Request failed')
  }

  return payload
}

export async function fetchModelCatalog() {
  return requestJson('/api/ai/catalog')
}

export async function startRepositoryAnalysis(repoUrl) {
  return requestJson('/api/repos/analyze', {
    method: 'POST',
    body: JSON.stringify({ repoUrl }),
  })
}

export async function fetchJob(jobId) {
  return requestJson(`/api/jobs/${encodeURIComponent(jobId)}`)
}

export async function fetchRecentProjects() {
  return requestJson('/api/repos')
}

export async function fetchRepository(repoId) {
  return requestJson(`/api/repos/${encodeURIComponent(repoId)}`)
}

export async function deleteRepository(repoId) {
  const response = await fetch(`/api/repos/${encodeURIComponent(repoId)}`, { method: 'DELETE' })
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new Error(payload?.error || 'Could not delete project')
  }
}

export async function fetchRepositoryFile(repoId, filePath) {
  const query = new URLSearchParams({ path: filePath })
  return requestJson(`/api/repos/${encodeURIComponent(repoId)}/file?${query.toString()}`)
}

export async function fetchCommitHistory(repoId, limit = 150) {
  const query = new URLSearchParams({ limit: String(limit) })
  return requestJson(`/api/repos/${encodeURIComponent(repoId)}/commits?${query.toString()}`)
}

export async function searchRepository(repoId, query, options = {}) {
  const params = new URLSearchParams({ q: query })
  if (options.limit) params.set('limit', String(options.limit))
  if (options.content) params.set('content', 'true')
  return requestJson(`/api/repos/${encodeURIComponent(repoId)}/search?${params.toString()}`)
}

export async function askRepositoryQuestion({
  repoId,
  provider,
  model,
  apiKey,
  question,
  selectedPath,
  focusedNodeIds,
  conversationHistory, // NEW: last N messages for follow-up context
}) {
  return requestJson('/api/ai/ask', {
    method: 'POST',
    body: JSON.stringify({
      repoId,
      provider,
      model,
      apiKey,
      question,
      selectedPath,
      focusedNodeIds,
      conversationHistory,
    }),
  })
}

/**
 * Stream an answer over Server-Sent Events.
 *
 * `onDelta(chunk, fullText)` fires for every chunk so the caller can render the
 * answer as it arrives; the promise resolves with the complete text. The token
 * cost is identical to `askRepositoryQuestion` — only the transport differs.
 * Callers should still keep the buffered call as a fallback: a proxy that
 * buffers or a provider that refuses to stream should degrade to a slow answer,
 * not an error.
 */
export async function askRepositoryQuestionStream(payload, { onDelta, signal } = {}) {
  const response = await fetch('/api/ai/ask/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  })

  if (!response.ok || !response.body) {
    throw new Error('Streaming is unavailable')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let text = ''

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let boundary = buffer.indexOf('\n\n')
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)

        for (const rawLine of frame.split('\n')) {
          const line = rawLine.trim()
          if (!line.startsWith('data:')) continue

          let event
          try {
            event = JSON.parse(line.slice(5).trim())
          } catch {
            continue
          }

          if (event.type === 'delta' && event.text) {
            text += event.text
            onDelta?.(event.text, text)
          } else if (event.type === 'error') {
            throw new Error(event.error || 'Streaming failed')
          } else if (event.type === 'done' && typeof event.text === 'string') {
            text = event.text
          }
        }

        boundary = buffer.indexOf('\n\n')
      }
    }
  } finally {
    reader.releaseLock?.()
  }

  if (!text.trim()) throw new Error('The model returned an empty answer')
  return text
}

export async function performAction({
  repoId,
  provider,
  model,
  apiKey,
  action,
  filePath,
  fileContent,
  nodeData,
  conversationHistory,
}) {
  return requestJson('/api/ai/action', {
    method: 'POST',
    body: JSON.stringify({
      repoId,
      provider,
      model,
      apiKey,
      action,
      filePath,
      fileContent,
      nodeData,
      conversationHistory,
    }),
  })
}

export async function getHealthScore(repoId) {
  const resp = await requestJson(`/api/repos/${encodeURIComponent(repoId)}/health`);
  if (resp.error) throw new Error(resp.error);
  return resp;
}

export async function getGitIntelligence(repoId) {
  const resp = await requestJson(`/api/repos/${encodeURIComponent(repoId)}/git-intelligence`);
  if (resp.error) throw new Error(resp.error);
  return resp;
}
