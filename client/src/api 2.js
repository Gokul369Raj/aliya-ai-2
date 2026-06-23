async function request(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'Request failed');
  }

  return payload;
}

export function fetchModelCatalog() {
  return request('/api/ai/catalog');
}

export function startRepositoryAnalysis(repoUrl) {
  return request('/api/repos/analyze', {
    method: 'POST',
    body: JSON.stringify({ repoUrl }),
  });
}

export function fetchJob(jobId) {
  return request(`/api/jobs/${jobId}`);
}

export function fetchRepositoryFile(repoId, filePath) {
  const params = new URLSearchParams({ path: filePath });
  return request(`/api/repos/${repoId}/file?${params.toString()}`);
}

export function fetchCommitHistory(repoId, limit = 150) {
  const params = new URLSearchParams({ limit: String(limit) });
  return request(`/api/repos/${repoId}/commits?${params.toString()}`);
}

export function fetchRunFlow(repoId) {
  return request(`/api/repos/${repoId}/run-flow`);
}

export function askRepositoryQuestion(payload) {
  return request('/api/ai/ask', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
