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

export async function askRepositoryQuestion({
  repoId,
  provider,
  model,
  apiKey,
  question,
  selectedPath,
  focusedNodeIds,
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
    }),
  })
}
