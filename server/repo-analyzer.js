const fs = require('fs/promises');
const path = require('path');

const simpleGit = require('simple-git');
const { buildArchitectureIntelligence } = require('./architecture-intelligence');
const { buildCodeIntelligence } = require('./code-intelligence');

const {
  DEFAULT_VISIBLE_NODE_LIMIT,
  HARD_VISIBLE_NODE_LIMIT,
  IGNORED_DIRECTORY_NAMES,
  IGNORED_FILE_NAMES,
  IMPORTABLE_EXTENSIONS,
  MAX_SCANNED_FILES,
  MAX_TEXT_FILE_BYTES,
  REPOS_ROOT,
  TEXT_FILE_EXTENSIONS,
} = require('./constants');
const { buildSearchIndex } = require('./search-index');

const CODE_FILE_EXTENSIONS = new Set([
  '.c',
  '.cc',
  '.cpp',
  '.cs',
  '.go',
  '.java',
  '.js',
  '.jsx',
  '.kt',
  '.php',
  '.py',
  '.rb',
  '.rs',
  '.swift',
  '.ts',
  '.tsx',
]);

const IMPORTANT_FILE_NAMES = [
  'package.json',
  'README.md',
  'README',
  'tsconfig.json',
  'vite.config.js',
  'vite.config.ts',
  'next.config.js',
  'dockerfile',
  'docker-compose.yml',
  'pyproject.toml',
  'Cargo.toml',
  'go.mod',
];

function normalizePathSegments(value) {
  return value.split(path.sep).join('/');
}

function createRepoId() {
  return `repo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function slugFromRepoUrl(repoUrl) {
  const url = new URL(repoUrl);
  return url.pathname.replace(/^\/+/, '').replace(/\.git$/, '').replace(/[^\w/-]+/g, '-').replace(/\//g, '__');
}

function validateRepoUrl(repoUrl) {
  let parsed;
  try {
    parsed = new URL(repoUrl);
  } catch {
    throw new Error('Enter a valid GitHub repository URL.');
  }

  if (parsed.hostname !== 'github.com') {
    throw new Error('Aliya AI currently accepts GitHub repository URLs only.');
  }

  const [, owner, repo] = parsed.pathname.replace(/\.git$/, '').split('/');
  if (!owner || !repo) {
    throw new Error('Repository URL must look like https://github.com/owner/repo.');
  }

  return {
    owner,
    repo,
    normalizedUrl: `https://github.com/${owner}/${repo}.git`,
    displayUrl: `https://github.com/${owner}/${repo}`,
    repoName: repo,
  };
}

function languageFromPath(relativePath) {
  const ext = path.extname(relativePath).toLowerCase();
  const map = {
    '.c': 'c',
    '.cc': 'c++',
    '.cpp': 'c++',
    '.cs': 'csharp',
    '.css': 'css',
    '.dart': 'dart',
    '.go': 'go',
    '.graphql': 'graphql',
    '.html': 'html',
    '.java': 'java',
    '.js': 'javascript',
    '.json': 'json',
    '.jsx': 'javascript',
    '.kt': 'kotlin',
    '.md': 'markdown',
    '.php': 'php',
    '.py': 'python',
    '.rb': 'ruby',
    '.rs': 'rust',
    '.scala': 'scala',
    '.scss': 'css',
    '.sh': 'shell',
    '.sql': 'sql',
    '.svg': 'xml',
    '.swift': 'swift',
    '.svelte': 'svelte',
    '.toml': 'ini',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.vue': 'vue',
    '.xml': 'xml',
    '.yaml': 'yaml',
    '.yml': 'yaml',
  };

  return map[ext] || 'plaintext';
}

function clusterFromPath(relativePath) {
  const segments = relativePath.split('/').filter(Boolean);
  return segments[0] || 'root';
}

function shouldIgnoreEntry(entryName, isDirectory) {
  if (IGNORED_FILE_NAMES.has(entryName)) {
    return true;
  }

  if (isDirectory && IGNORED_DIRECTORY_NAMES.has(entryName)) {
    return true;
  }

  return false;
}

function isLikelyTextFile(relativePath) {
  const baseName = path.basename(relativePath);
  if (baseName === 'Dockerfile' || baseName === '.env' || baseName === 'Makefile') {
    return true;
  }
  return TEXT_FILE_EXTENSIONS.has(path.extname(relativePath).toLowerCase());
}

async function ensureDirectory(targetPath) {
  await fs.mkdir(targetPath, { recursive: true });
}

async function cloneRepository({ repoUrl, repoCachePath, reportProgress }) {
  await ensureDirectory(REPOS_ROOT);
  await fs.rm(repoCachePath, { recursive: true, force: true });

  reportProgress('cloning', 18, 'Cloning repository', {
    cloneProgress: 0,
    cloneStage: 'Preparing repository',
  });
  let currentProgress = 18;
  let currentCloneProgress = 0;
  const fakeTimer = setInterval(() => {
    if (currentProgress < 28) {
      currentProgress += 0.4;
      currentCloneProgress = Math.min(12, currentCloneProgress + 1);
      reportProgress('cloning', currentProgress, 'Enumerating objects...', {
        cloneProgress: currentCloneProgress,
        cloneStage: 'Enumerating objects',
      });
    }
  }, 300);

  const git = simpleGit({
    progress({ method, stage, progress }) {
      clearInterval(fakeTimer);
      let overallProgress = 0;
      if (stage === 'receiving') overallProgress = 10 + (progress * 0.7);
      else if (stage === 'resolving') overallProgress = 80 + (progress * 0.2);
      else overallProgress = progress * 0.1;
      
      const mappedProgress = 18 + (overallProgress * 26) / 100;
      currentProgress = mappedProgress;
      currentCloneProgress = Math.max(currentCloneProgress, Math.round(overallProgress));
      
      let stageLabel = 'Cloning repository';
      if (stage === 'receiving') stageLabel = 'Receiving objects';
      else if (stage === 'resolving') stageLabel = 'Resolving deltas';
      else if (typeof stage === 'string' && stage.startsWith('remote:')) stageLabel = 'Compressing objects';
      
      reportProgress('cloning', mappedProgress, stageLabel, {
        cloneProgress: currentCloneProgress,
        cloneStage: stageLabel,
        gitStage: stage || method || 'clone',
      });
    }
  });
  
  try {
    await git.clone(repoUrl, repoCachePath, ['--depth', '1', '--progress']);
    reportProgress('cloning', 44, 'Repository cloned', {
      cloneProgress: 100,
      cloneStage: 'Repository cloned',
    });
  } finally {
    clearInterval(fakeTimer);
  }
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function addExternalDependencies(target, manifestPath, manifest) {
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    const deps = manifest?.[section];
    if (!deps || typeof deps !== 'object') {
      continue;
    }

    for (const [name, version] of Object.entries(deps)) {
      const existing = target.get(name);
      if (!existing) {
        target.set(name, {
          name,
          version,
          declaredIn: [manifestPath],
        });
        continue;
      }

      if (!existing.declaredIn.includes(manifestPath)) {
        existing.declaredIn.push(manifestPath);
      }
    }
  }
}

function extractImportSpecifiers(content) {
  const specifiers = new Set();
  const patterns = [
    /import\s+[^'"]*?from\s+['"]([^'"]+)['"]/g,
    /export\s+[^'"]*?from\s+['"]([^'"]+)['"]/g,
    /require\(\s*['"]([^'"]+)['"]\s*\)/g,
    /import\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      specifiers.add(match[1]);
    }
  }

  return [...specifiers];
}

function resolveModuleTarget(fromRelativePath, specifier, fileIndex) {
  if (!specifier) {
    return null;
  }

  if (specifier.startsWith('.')) {
    const baseDir = path.posix.dirname(fromRelativePath);
    const joined = path.posix.normalize(path.posix.join(baseDir, specifier));
    const candidates = IMPORTABLE_EXTENSIONS.flatMap((ext) => [
      `${joined}${ext}`,
      path.posix.join(joined, `index${ext}`),
    ]);

    return candidates.find((candidate) => fileIndex.has(candidate)) || null;
  }

  if (specifier.startsWith('/')) {
    const joined = path.posix.normalize(specifier.slice(1));
    const candidates = IMPORTABLE_EXTENSIONS.flatMap((ext) => [
      `${joined}${ext}`,
      path.posix.join(joined, `index${ext}`),
    ]);

    return candidates.find((candidate) => fileIndex.has(candidate)) || null;
  }

  return null;
}

function createFolderNode(relativePath, repoName) {
  const label = relativePath ? path.posix.basename(relativePath) : repoName;
  return {
    id: `folder:${relativePath || '.'}`,
    label,
    path: relativePath,
    type: 'folder',
    group: clusterFromPath(relativePath),
    depth: relativePath ? relativePath.split('/').length : 0,
  };
}

function createFileNode(file, score, isImportant) {
  return {
    id: `file:${file.path}`,
    label: path.posix.basename(file.path),
    path: file.path,
    type: isImportant ? 'important' : 'file',
    group: clusterFromPath(file.path),
    depth: file.depth,
    language: file.language,
    importance: score,
  };
}

function scoreFile(file, inbound, outbound) {
  let score = 8;
  const baseName = path.posix.basename(file.path);
  const lowerBase = baseName.toLowerCase();

  if (IMPORTANT_FILE_NAMES.includes(baseName) || IMPORTANT_FILE_NAMES.includes(lowerBase)) {
    score += 26;
  }

  if (/^(index|main|app|server|router|layout|page|config)\./i.test(baseName)) {
    score += 12;
  }

  if (file.path.startsWith('src/')) {
    score += 4;
  }

  if (CODE_FILE_EXTENSIONS.has(path.extname(file.path).toLowerCase())) {
    score += 4;
  }

  score += Math.min(inbound * 3, 24);
  score += Math.min(outbound * 2, 16);
  score += Math.min(Math.round(file.size / 16_000), 10);
  score += Math.max(0, 4 - file.depth);

  return score;
}

function createNarrative(repoName, rootManifest, rootReadme, languageBreakdown, topFolders) {
  const dependencyNames = Object.keys(rootManifest?.dependencies || {});
  const devDependencyNames = Object.keys(rootManifest?.devDependencies || {});
  const dominantLanguages = languageBreakdown.slice(0, 3).map((item) => item.language);
  const folderList = topFolders.slice(0, 4).map((folder) => folder.path || repoName).join(', ');
  const readmeLine = rootReadme
    ?.split('\n')
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('#'))
    || '';

  const parts = [
    `${repoName} is a ${dominantLanguages.length ? dominantLanguages.join(', ') : 'multi-language'} repository.`,
    folderList ? `The main code gravity sits around ${folderList}.` : '',
    dependencyNames.length
      ? `Primary runtime packages include ${dependencyNames.slice(0, 8).join(', ')}.`
      : '',
    devDependencyNames.length
      ? `Development tooling includes ${devDependencyNames.slice(0, 6).join(', ')}.`
      : '',
    readmeLine ? `README context: ${readmeLine}` : '',
  ];

  return parts.filter(Boolean).join(' ');
}

function rankFolders(files, repoName) {
  const map = new Map();

  for (const file of files) {
    const folderPath = path.posix.dirname(file.path);
    const key = folderPath === '.' ? '' : folderPath;
    const current = map.get(key) || { path: key, fileCount: 0 };
    current.fileCount += 1;
    map.set(key, current);
  }

  return [...map.values()]
    .sort((left, right) => right.fileCount - left.fileCount)
    .slice(0, 10)
    .map((folder) => ({
      ...folder,
      label: folder.path || repoName,
    }));
}

async function scanRepository(repoPath, repoName, reportProgress) {
  const files = [];
  const folderNodes = [];
  const externalDependencies = new Map();
  let rootManifest = null;
  let rootReadme = '';

  async function walk(absolutePath, relativePath = '') {
    if (files.length >= MAX_SCANNED_FILES) {
      return {
        name: relativePath ? path.posix.basename(relativePath) : repoName,
        path: relativePath,
        type: 'folder',
        truncated: true,
        children: [],
      };
    }

    const entries = await fs.readdir(absolutePath, { withFileTypes: true });
    const sortedEntries = entries
      .filter((entry) => !shouldIgnoreEntry(entry.name, entry.isDirectory()))
      .sort((left, right) => {
        if (left.isDirectory() && !right.isDirectory()) {
          return -1;
        }
        if (!left.isDirectory() && right.isDirectory()) {
          return 1;
        }
        return left.name.localeCompare(right.name);
      });

    const folderNode = {
      name: relativePath ? path.posix.basename(relativePath) : repoName,
      path: relativePath,
      type: 'folder',
      children: [],
    };

    folderNodes.push(createFolderNode(relativePath, repoName));

    for (const entry of sortedEntries) {
      if (files.length >= MAX_SCANNED_FILES) {
        folderNode.truncated = true;
        break;
      }

      const nextAbsolutePath = path.join(absolutePath, entry.name);
      const nextRelativePath = normalizePathSegments(path.join(relativePath, entry.name));

      if (entry.isDirectory()) {
        folderNode.children.push(await walk(nextAbsolutePath, nextRelativePath));
        continue;
      }

      const stats = await fs.stat(nextAbsolutePath);
      const fileRecord = {
        path: nextRelativePath,
        label: entry.name,
        size: stats.size,
        depth: nextRelativePath.split('/').length,
        language: languageFromPath(nextRelativePath),
      };

      if (isLikelyTextFile(nextRelativePath) && stats.size <= MAX_TEXT_FILE_BYTES) {
        try {
          fileRecord.content = await fs.readFile(nextAbsolutePath, 'utf8');
        } catch {
          fileRecord.content = '';
        }
      }

      if (entry.name === 'package.json' && fileRecord.content) {
        const manifest = parseJson(fileRecord.content);
        if (manifest) {
          addExternalDependencies(externalDependencies, nextRelativePath, manifest);
          if (!relativePath) {
            rootManifest = manifest;
          }
        }
      }

      if (!rootReadme && /^README(\.md)?$/i.test(entry.name) && fileRecord.content) {
        rootReadme = fileRecord.content;
      }

      files.push(fileRecord);
      folderNode.children.push({
        name: entry.name,
        path: nextRelativePath,
        type: 'file',
        size: stats.size,
      });
    }

    return folderNode;
  }

  reportProgress('parsing', 44, 'Reading folder structure');
  const structure = await walk(repoPath);

  return {
    externalDependencies,
    files,
    folderNodes,
    rootManifest,
    rootReadme,
    structure,
  };
}

function extractProjectDescription(readme, repoName, narrative) {
  if (!readme) return narrative;

  // Remove badges, links, and images which often appear at the top.
  // Link TEXT is part of the sentence, so keep it and drop only the URL —
  // deleting the whole link turned "refer to the [README](…) for setup" into
  // "refer to the  for setup".
  const cleanReadme = readme
    .replace(/\[!\[.*?\]\(.*?\)\]\(.*?\)/g, '') // Badge images
    .replace(/!\[.*?\]\(.*?\)/g, '') // Images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // Links → keep the visible text
    .replace(/<[^>]*>/g, ' ') // HTML tags
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  // Find the first paragraph that isn't a heading
  for (let i = 0; i < cleanReadme.length; i++) {
    const line = cleanReadme[i];
    if (line.startsWith('#')) continue;
    
    // Take up to 3 paragraphs or 500 characters
    let description = line;
    let count = 1;
    for (let j = i + 1; j < cleanReadme.length && count < 3; j++) {
      if (cleanReadme[j].startsWith('#')) break;
      description += ' ' + cleanReadme[j];
      count++;
    }
    
    if (description.length > 20) {
      return description.slice(0, 600).trim() + (description.length > 600 ? '...' : '');
    }
  }

  return narrative;
}

function buildGraph({ files, folderNodes, structure, externalDependencies, rootManifest, rootReadme, repoName }) {
  const fileIndex = new Set(files.map((file) => file.path));
  const inbound = new Map();
  const outbound = new Map();
  const edgeKeySet = new Set();
  const edges = [];
  const architecture = buildArchitectureIntelligence(files, repoName);
  const codeIntelligence = buildCodeIntelligence(files);
  const nodeAnnotations = architecture.nodeAnnotations || {};

  const pushEdge = (source, target, type) => {
    const key = `${source}|${target}|${type}`;
    if (edgeKeySet.has(key)) {
      return;
    }
    edgeKeySet.add(key);
    edges.push({ source, target, type });
  };

  for (const folder of folderNodes) {
    if (!folder.path) {
      continue;
    }

    const parent = path.posix.dirname(folder.path);
    pushEdge(`folder:${parent === '.' ? '.' : parent}`, folder.id, 'hierarchy');
  }

  for (const file of files) {
    const parent = path.posix.dirname(file.path);
    pushEdge(`folder:${parent === '.' ? '.' : parent}`, `file:${file.path}`, 'hierarchy');

    const specifiers = file.content ? extractImportSpecifiers(file.content) : [];
    outbound.set(file.path, specifiers.length);

    for (const specifier of specifiers) {
      const resolvedTarget = resolveModuleTarget(file.path, specifier, fileIndex);
      if (!resolvedTarget || resolvedTarget === file.path) {
        continue;
      }

      inbound.set(resolvedTarget, (inbound.get(resolvedTarget) || 0) + 1);
      pushEdge(`file:${file.path}`, `file:${resolvedTarget}`, 'dependency');
    }
  }

  for (const semanticEdge of architecture.semanticEdges || []) {
    pushEdge(semanticEdge.source, semanticEdge.target, semanticEdge.type);
  }

  const fileNodes = files.map((file) => {
    const score = scoreFile(file, inbound.get(file.path) || 0, outbound.get(file.path) || 0);
    const important = score >= 32;
    const annotation = nodeAnnotations[`file:${file.path}`] || {};
    return {
      ...createFileNode(file, score, important),
      size: important ? Math.min(34, 12 + score / 2.2) : Math.min(20, 6 + score / 4.5),
      score,
      layer: annotation.layer || null,
      roles: annotation.roles || [],
      status: annotation.status || 'healthy',
      riskCount: annotation.riskCount || 0,
      riskLabels: annotation.riskLabels || [],
      architectureRole: annotation.architectureRole || '',
      reason: important
        ? IMPORTANT_FILE_NAMES.includes(path.posix.basename(file.path)) || /^(index|main|app|server|router|layout|page|config)\./i.test(path.posix.basename(file.path))
          ? 'entry/config hotspot'
          : 'high graph centrality'
        : '',
    };
  });

  const sizedFolderNodes = folderNodes.map((folder) => {
    const childCount = files.filter((file) => {
      if (!folder.path) {
        return !file.path.includes('/');
      }

      return file.path.startsWith(`${folder.path}/`);
    }).length;

    return {
      ...folder,
      size: Math.min(22, 8 + Math.sqrt(childCount || 1) * 2.4),
      importance: childCount + (folder.path ? Math.max(0, 8 - folder.depth) : 12),
    };
  });

  const nodes = [...sizedFolderNodes, ...fileNodes];
  const adjacency = Object.fromEntries(nodes.map((node) => [node.id, []]));

  for (const edge of edges) {
    adjacency[edge.source]?.push(edge.target);
    adjacency[edge.target]?.push(edge.source);
  }

  const importantFiles = fileNodes
    .filter((node) => node.type === 'important')
    .sort((left, right) => right.score - left.score)
    .slice(0, 18)
    .map((node) => ({
      path: node.path,
      label: node.label,
      score: node.score,
      reason: node.reason || 'important repository node',
    }));

  const languageMap = new Map();
  for (const file of files) {
    languageMap.set(file.language, (languageMap.get(file.language) || 0) + 1);
  }

  const languageBreakdown = [...languageMap.entries()]
    .map(([language, count]) => ({ language, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 10);

  const topFolders = rankFolders(files, repoName);
  const externalDependencyList = [...externalDependencies.values()]
    .sort((left, right) => left.name.localeCompare(right.name));

  const visibleSeed = new Set(['folder:.']);
  const rankedFolders = [...sizedFolderNodes].sort((left, right) => right.importance - left.importance);
  const rankedFiles = [...fileNodes].sort((left, right) => right.score - left.score);

  for (const folder of rankedFolders.slice(0, 40)) {
    visibleSeed.add(folder.id);
  }
  for (const file of rankedFiles.slice(0, DEFAULT_VISIBLE_NODE_LIMIT)) {
    visibleSeed.add(file.id);
    const parent = path.posix.dirname(file.path);
    visibleSeed.add(`folder:${parent === '.' ? '.' : parent}`);
  }

  const defaultVisibleNodeIds = [...visibleSeed].slice(0, HARD_VISIBLE_NODE_LIMIT);

  const narrative = createNarrative(repoName, rootManifest, rootReadme, languageBreakdown, topFolders);

  return {
    codeIntelligence: codeIntelligence.summary,
    graph: {
      nodes: nodes.map((node) => ({
        id: node.id,
        label: node.label,
        path: node.path,
        type: node.type,
        size: node.size,
        group: node.group,
        depth: node.depth,
        language: node.language || null,
        importance: node.importance || node.score || 0,
        layer: node.layer || null,
        roles: node.roles || [],
        status: node.status || 'healthy',
        riskCount: node.riskCount || 0,
        riskLabels: node.riskLabels || [],
        architectureRole: node.architectureRole || '',
      })),
      edges,
      adjacency,
      defaultVisibleNodeIds,
    },
    flows: architecture.flows,
    architecture: {
      summary: architecture.summary,
      risks: architecture.risks,
      deadNodeIds: architecture.deadNodeIds,
      brokenNodeIds: architecture.brokenNodeIds,
    },
    structure,
    files: files.map((file) => ({
      path: file.path,
      label: file.label,
      size: file.size,
      language: file.language,
    })),
    summary: {
      dependencyEdgeCount: edges.filter((edge) => edge.type === 'dependency').length,
      semanticEdgeCount: edges.filter((edge) => edge.type !== 'dependency' && edge.type !== 'hierarchy').length,
      externalDependencies: externalDependencyList,
      fileCount: files.length,
      folderCount: folderNodes.length,
      importantFiles,
      languageBreakdown,
      narrative,
      description: extractProjectDescription(rootReadme, repoName, narrative),
      topFolders,
      architecture: architecture.summary,
    },
  };
}

async function analyzeRepository(repoUrl, reportProgress) {
  const validated = validateRepoUrl(repoUrl);
  const repoId = createRepoId();
  const repoCachePath = path.join(REPOS_ROOT, `${slugFromRepoUrl(validated.displayUrl)}__${repoId}`);

  await cloneRepository({
    repoUrl: validated.normalizedUrl,
    repoCachePath,
    reportProgress,
  });

  const git = simpleGit(repoCachePath);
  const branch = (await git.branch()).current || 'HEAD';

  const scanResult = await scanRepository(repoCachePath, validated.repoName, reportProgress);
  reportProgress('building-graph', 78, 'Building graph model');

  const analysis = buildGraph({
    ...scanResult,
    repoName: validated.repoName,
  });

  reportProgress('building-graph', 94, 'Building search index for RAG');
  
  // Build search index for RAG (TF-IDF keyword scoring + file signatures)
  const searchIdx = buildSearchIndex(scanResult.files, analysis);
  
  reportProgress('building-graph', 97, 'Finalizing repository model');
  
  const runFlow = await getRunFlow(repoCachePath);

  return {
    analysis: {
      repoId,
      repoName: validated.repoName,
      repoUrl: validated.displayUrl,
      branch,
      scannedAt: new Date().toISOString(),
      runFlow,
      ...analysis,
    },
    repoPath: repoCachePath,
    searchIndex: searchIdx,
  };
}

function parseGitLogRecord(record) {
  const lines = record.split('\n').filter(Boolean);
  if (!lines.length) return null;

  const [hash, parents = '', author = 'Unknown', email = '', date = '', subject = ''] = lines[0].split('\x1f');
  if (!hash) return null;

  const changedFiles = Array.from(new Set(
    lines.slice(1)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !line.includes(' => ')),
  )).slice(0, 80);

  return {
    hash,
    shortHash: hash.slice(0, 7),
    parents: parents ? parents.split(' ').filter(Boolean) : [],
    author,
    email,
    date,
    message: subject,
    changedFiles,
    filesChanged: changedFiles.length,
  };
}

// Repos we already tried (and failed) to deepen — avoids hammering the network
// with a slow fetch every time the commit graph is opened while offline.
const deepenAttempts = new Map();
const DEEPEN_COOLDOWN_MS = 5 * 60 * 1000;
const DEEPEN_FETCH_TIMEOUT_MS = 45_000;

/**
 * Repositories are cloned with `--depth 1` so the initial scan stays fast.
 * That leaves only one commit locally, which makes the commit graph useless.
 * When commit history is requested we lazily deepen the clone — fetching only
 * commits and trees (no blobs) where the server supports partial clone.
 */
async function ensureCommitDepth(repoPath, limit) {
  try {
    const shallowPath = path.join(repoPath, '.git', 'shallow');
    const isShallow = await fs
      .access(shallowPath)
      .then(() => true)
      .catch(() => false);

    const git = simpleGit(repoPath);
    const localCount = await git
      .raw(['rev-list', '--count', 'HEAD'])
      .then((value) => Number(String(value).trim()) || 0)
      .catch(() => 0);

    if (!isShallow || localCount >= limit) {
      deepenAttempts.delete(repoPath);
      return { deepened: false, shallow: isShallow, count: localCount };
    }

    const lastAttempt = deepenAttempts.get(repoPath) || 0;
    if (Date.now() - lastAttempt < DEEPEN_COOLDOWN_MS) {
      return { deepened: false, shallow: true, count: localCount };
    }
    deepenAttempts.set(repoPath, Date.now());

    const deepenBy = Math.max(1, limit - localCount);
    const fetchGit = simpleGit(repoPath, { timeout: { block: DEEPEN_FETCH_TIMEOUT_MS } });
    try {
      // Blobless fetch keeps the transfer small — we only need commit metadata.
      await fetchGit.raw(['fetch', '--deepen', String(deepenBy), '--filter=blob:none', '--no-tags']);
    } catch {
      await fetchGit.raw(['fetch', '--deepen', String(deepenBy), '--no-tags']);
    }

    const nextCount = await git
      .raw(['rev-list', '--count', 'HEAD'])
      .then((value) => Number(String(value).trim()) || 0)
      .catch(() => localCount);

    if (nextCount >= limit) deepenAttempts.delete(repoPath);
    return { deepened: nextCount > localCount, shallow: nextCount < limit, count: nextCount };
  } catch {
    return { deepened: false, shallow: true, count: 0 };
  }
}

async function getCommitHistory(repoPath, limit = 150) {
  const safeLimit = Math.max(1, Math.min(150, Number(limit) || 150));
  const depth = await ensureCommitDepth(repoPath, safeLimit);
  const git = simpleGit(repoPath);
  const output = await git.raw([
    'log',
    `--max-count=${safeLimit}`,
    '--date=iso-strict',
    '--name-only',
    '--pretty=format:%x1e%H%x1f%P%x1f%an%x1f%ae%x1f%aI%x1f%s',
  ]);

  const commits = output
    .split('\x1e')
    .map((record) => record.trim())
    .filter(Boolean)
    .map(parseGitLogRecord)
    .filter(Boolean);

  const authors = Array.from(new Set(commits.map((commit) => commit.author))).sort();
  const files = Array.from(new Set(commits.flatMap((commit) => commit.changedFiles))).sort();

  return {
    limit: safeLimit,
    commits,
    authors,
    files,
    shallow: Boolean(depth?.shallow),
    availableCommits: depth?.count || commits.length,
    deepened: Boolean(depth?.deepened),
    generatedAt: new Date().toISOString(),
  };
}

async function readRepositoryReadme(repoPath) {
  const entries = await fs.readdir(repoPath, { withFileTypes: true });
  const readmeEntry = entries.find((entry) => entry.isFile() && /^README(\.(md|markdown|txt))?$/i.test(entry.name));
  if (!readmeEntry) {
    return '';
  }

  return fs.readFile(path.join(repoPath, readmeEntry.name), 'utf8');
}

function stripMarkdown(text) {
  return text
    .replace(/[`*_>#-]+/g, ' ')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function labelForCommand(command) {
  const lower = command.toLowerCase();

  if (/git\s+clone/.test(lower)) return 'Clone the repository';

  // Include the target so three navigation steps do not all read
  // "Navigate to project folder".
  if (/^(cd|pushd)\s+/.test(lower)) {
    const target = command
      .replace(/^(cd|pushd)\s+/i, '')
      .replace(/^["']|["']$/g, '')
      .trim();
    if (!target || /^\.\.(\/|\\|$)/.test(target)) return 'Go back up a level';
    return `Navigate into ${target}`;
  }

  // Name the package so multiple installs stay distinguishable.
  const namedInstall = command.match(/^(npm|pnpm|yarn)\s+(?:install|i|add)\s+(?:-g\s+|--global\s+)?(.+)$/i);
  if (namedInstall) {
    const isGlobal = /(^|\s)(-g|--global)(\s|$)/i.test(command);
    return `Install ${namedInstall[2].trim()}${isGlobal ? ' globally' : ''}`;
  }

  if (/(npm|pnpm|yarn)\s+(install|i)\b/.test(lower) || /pip\s+install|bundle\s+install|composer\s+install|cargo\s+build|go\s+mod\s+download/.test(lower)) return 'Install dependencies';
  if (/cp\s+.*\.env|\.env|export\s+\w+=/.test(lower)) return 'Configure environment variables';
  if (/(npm|pnpm|yarn)\s+run\s+(dev|serve)|npm\s+start|pnpm\s+start|yarn\s+start|vite|next\s+dev|node\s+.*server|python\s+.*app|flask\s+run|uvicorn|docker\s+compose\s+up|docker-compose\s+up/.test(lower)) return 'Run the application';
  if (/open\s+http|localhost|127\.0\.0\.1/.test(lower)) return 'Open in browser';
  return 'Run setup command';
}

function labelForText(line) {
  const lower = line.toLowerCase();
  if (/clone|download/.test(lower) && /repo|repository|project/.test(lower)) return 'Clone the repository';
  if (/cd |navigate|project folder|directory/.test(lower)) return 'Navigate to project folder';
  if (/install|dependencies|requirements/.test(lower)) return 'Install dependencies';
  if (/env|environment|api key|configure|config/.test(lower)) return 'Configure environment variables';
  if (/run|start|serve|dev server|launch/.test(lower)) return 'Run the application';
  if (/browser|localhost|open http/.test(lower)) return 'Open in browser';
  return stripMarkdown(line).replace(/[.:]$/, '');
}

function extractRunFlowFromReadme(readme) {
  if (!readme || !readme.trim()) {
    return null;
  }

  const setupHeadings = /^(#{1,4})\s*.*\b(getting started|installation|install|setup|quick start|usage|running|development|local development|run locally)\b/i;
  const stopHeading = /^#{1,4}\s+/;
  const lines = readme.split(/\r?\n/);
  const relevant = [];
  let inRelevantSection = false;
  let hasRelevantHeading = false;
  let inFence = false;
  let setupHeadingLevel = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const headingMatch = line.match(/^(#{1,4})\s+/);
    if (setupHeadings.test(line) && (!hasRelevantHeading || (headingMatch?.[1]?.length || 2) <= setupHeadingLevel)) {
      inRelevantSection = true;
      hasRelevantHeading = true;
      setupHeadingLevel = headingMatch?.[1]?.length || 2;
      continue;
    }

    if (hasRelevantHeading && headingMatch && headingMatch[1].length <= setupHeadingLevel && !setupHeadings.test(line)) {
      inRelevantSection = false;
    }

    if (inRelevantSection) {
      relevant.push(rawLine);
    }
  }

  const candidateLines = (hasRelevantHeading ? relevant : lines).slice(0, hasRelevantHeading ? 240 : 180);
  const steps = [];
  const seen = new Set();

  const pushStep = (title, command = '', source = '') => {
    const cleanTitle = stripMarkdown(title);
    const cleanCommand = command.trim().replace(/^\$\s*/, '');
    if (!cleanTitle || cleanTitle.length > 90) return;
    const key = `${cleanTitle}|${cleanCommand}`;
    if (seen.has(key)) return;
    seen.add(key);
    steps.push({
      id: `step-${steps.length + 1}`,
      title: cleanTitle,
      command: cleanCommand,
      source: stripMarkdown(source || command || title),
    });
  };

  for (const rawLine of candidateLines) {
    const line = rawLine.trim();
    if (/^```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (!line || /^!\[|^\[!|^<!--/.test(line)) continue;

    const commandCandidate = line.replace(/^\s*([$>]|[-*]\s*)\s*/, '').trim();
    const isCommand = /^(git\s+clone|cd\s+|npm\s+|pnpm\s+|yarn\s+|pip\s+|python\s+|node\s+|docker\s+|docker-compose\s+|cp\s+|export\s+|composer\s+|bundle\s+|cargo\s+|go\s+|flask\s+|uvicorn\s+)/i.test(commandCandidate);
    if (inFence && isCommand) {
      pushStep(labelForCommand(commandCandidate), commandCandidate, rawLine);
      continue;
    }

    if (/^(?:[-*]\s+|\d+\.)/.test(line) && /(clone|install|npm|pnpm|yarn|pip|docker|run|start|serve|localhost|env|configure|setup|cd\s+)/i.test(line)) {
      const inlineCommand = line.match(/`([^`]+)`/)?.[1] || '';
      pushStep(labelForText(line), inlineCommand, rawLine);
      continue;
    }

    if (/(open|visit|go to).*(localhost|127\.0\.0\.1|http:\/\/)/i.test(line)) {
      const inlineCommand = line.match(/`([^`]+)`/)?.[1] || '';
      pushStep('Open in browser', inlineCommand, rawLine);
    }
  }

  const actionable = steps.filter((step) => step.command || /(clone|navigate|install|configure|run|open)/i.test(step.title));
  const finalSteps = actionable.slice(0, 8);

  if (finalSteps.length < 1) {
    return null;
  }

  return {
    steps: finalSteps,
    stepTitles: finalSteps.map((step) => step.title),
    prompt: [
      'Extract only actionable setup/run steps from README.md.',
      'Ignore descriptions, badges, links, theory, and feature lists.',
      'Keep clone, navigate, install dependencies, configure environment, run commands, and browser open steps.',
      'Return JSON: [{"title":"Short step","command":"optional command"}].',
    ].join(' '),
  };
}

async function getRunFlow(repoPath) {
  const readme = await readRepositoryReadme(repoPath);
  const flow = extractRunFlowFromReadme(readme);
  if (!flow) {
    return { steps: [], stepTitles: [], prompt: '', found: false };
  }
  return { ...flow, found: true };
}

/**
 * Read source files from a local clone in the shape the architecture detector
 * expects. Used to recompute architecture without re-cloning the repository.
 */
async function readSourceFiles(rootPath) {
  const files = [];

  const walk = async (dir, relative) => {
    if (files.length >= MAX_SCANNED_FILES) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (files.length >= MAX_SCANNED_FILES) return;
      if (IGNORED_DIRECTORY_NAMES.has(entry.name) || IGNORED_FILE_NAMES.has(entry.name)) continue;

      const nextRelative = normalizePathSegments(path.join(relative, entry.name));
      const absolute = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await walk(absolute, nextRelative);
        continue;
      }
      if (!isLikelyTextFile(nextRelative)) continue;

      let stats;
      try {
        stats = await fs.stat(absolute);
      } catch {
        continue;
      }
      if (stats.size > MAX_TEXT_FILE_BYTES) continue;

      let content = '';
      try {
        content = await fs.readFile(absolute, 'utf8');
      } catch {
        continue;
      }

      files.push({
        path: nextRelative,
        content,
        size: stats.size,
        language: languageFromPath(nextRelative),
      });
    }
  };

  await walk(rootPath, '');
  return files;
}

/**
 * Recompute architecture and code intelligence for an already-analyzed
 * repository.
 *
 * Both are computed once, at analysis time, so a saved project keeps whatever
 * the detectors produced back then. When they improve, older projects would keep
 * reporting stale results. Re-reading the local clone lets the server refresh
 * them in place — no re-clone, no full re-analysis.
 */
async function refreshArchitecture(repoPath, analysis) {
  if (!repoPath || !analysis) return null;
  const files = await readSourceFiles(repoPath);
  if (!files.length) return null;

  const readme = await readRepositoryReadme(repoPath);
  const runFlow = extractRunFlowFromReadme(readme);

  return {
    architecture: buildArchitectureIntelligence(files, analysis.repoName),
    codeIntelligence: buildCodeIntelligence(files).summary,
    runFlow: runFlow
      ? { ...runFlow, found: true }
      : { steps: [], stepTitles: [], prompt: '', found: false },
    description: extractProjectDescription(readme, analysis.repoName, analysis.summary?.narrative || ''),
  };
}

module.exports = {
  analyzeRepository,
  getCommitHistory,
  getRunFlow,
  refreshArchitecture,
};
