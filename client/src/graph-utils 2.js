export const CATEGORY_COLORS = {
  frontend: '#0ea5e9',       // Deep Cyan
  backend: '#2563eb',        // Deep Royal Blue
  auth: '#8b5cf6',           // Deep Violet
  payment: '#10b981',        // Emerald Green
  database: '#ef4444',       // Deep Red
  config: '#eab308',         // Deep Yellow
  testing: '#f97316',        // Deep Orange
  api: '#06b6d4',            // Vibrant Cyan
  ui: '#14b8a6',             // Deep Teal
  utils: '#64748b',          // Slate Gray
  folder: '#334155',         // Dark Slate
  unknown: '#475569',        // Dark Gray
};

export const CATEGORY_LABELS = {
  frontend: 'Frontend',
  backend: 'Backend',
  auth: 'Authentication',
  payment: 'Payment Gateway',
  database: 'Database',
  config: 'Configuration',
  testing: 'Testing',
  api: 'API',
  ui: 'UI Components',
  utils: 'Utilities',
  folder: 'Folder',
  unknown: 'Other',
};

export const LANGUAGE_COLORS = {
  javascript: '#eab308', // Deep Yellow
  typescript: '#2563eb', // Deep Blue
  react: '#0ea5e9',      // Deep Cyan
  html: '#ea580c',       // Deep Orange
  css: '#8b5cf6',        // Deep Purple
  json: '#10b981',       // Emerald Green
  markdown: '#ef4444',   // Deep Red
  python: '#2563eb',     // Deep Blue
  java: '#dc2626',       // Deep Red
  go: '#06b6d4',         // Vibrant Cyan
  rust: '#ea580c',       // Deep Orange
  php: '#7c3aed',        // Deep Violet
  ruby: '#be123c',       // Deep Rose
  shell: '#15803d',      // Deep Green
  c: '#475569',          // Slate Gray
  'c++': '#1d4ed8',      // Royal Blue
  csharp: '#16a34a',     // Deep Green
  swift: '#ea580c',      // Deep Orange
  kotlin: '#7c3aed',     // Deep Purple
  scala: '#dc2626',      // Deep Red
  dart: '#0284c7',       // Sky Blue
  vue: '#14b8a6',        // Deep Teal
  angular: '#b91c1c',    // Deep Red
  svelte: '#ea580c',     // Deep Orange
  nextjs: '#d4d4d8',     // Deep Silver
  nuxtjs: '#10b981',     // Emerald Green
  unknown: '#64748b',    // Slate Gray
  folder: '#334155',     // Dark Slate
};

export const LANGUAGE_LABELS = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  react: 'React',
  html: 'HTML',
  css: 'CSS',
  json: 'JSON',
  markdown: 'Markdown',
  python: 'Python',
  java: 'Java',
  go: 'Go',
  rust: 'Rust',
  php: 'PHP',
  ruby: 'Ruby',
  shell: 'Shell',
  c: 'C',
  'c++': 'C++',
  csharp: 'C#',
  swift: 'Swift',
  kotlin: 'Kotlin',
  scala: 'Scala',
  dart: 'Dart',
  vue: 'Vue',
  angular: 'Angular',
  svelte: 'Svelte',
  nextjs: 'Next.js',
  nuxtjs: 'Nuxt.js',
  unknown: 'Other',
  folder: 'Folder',
};

export function getNodeLanguageLabel(node) {
  if (node.type === 'folder') return 'folder';

  const label = (node.label || '').toLowerCase();
  if (label.endsWith('.jsx') || label.endsWith('.tsx')) {
    return 'react';
  }
  if (label.endsWith('.vue')) {
    return 'vue';
  }
  if (label.endsWith('.svelte')) {
    return 'svelte';
  }

  if (node.language && LANGUAGE_COLORS[node.language]) {
    return node.language;
  }

  return 'unknown';
}

export function getNodeCategoryColor(node) {
  const catKey = getNodeCategoryLabel(node);
  return CATEGORY_COLORS[catKey] || CATEGORY_COLORS.unknown;
}

export function getNodeColor(node) {
  const langKey = getNodeLanguageLabel(node);
  return LANGUAGE_COLORS[langKey] || LANGUAGE_COLORS.unknown;
}

export function getNodeCategoryLabel(node) {
  if (node.type === 'folder') return 'folder';

  const path = (node.path || '').toLowerCase();
  const label = (node.label || '').toLowerCase();

  // Authentication
  if (path.includes('auth') || path.includes('login') || path.includes('register') ||
    label.includes('auth') || label.includes('login') || label.includes('register') ||
    label.includes('session') || label.includes('jwt') || label.includes('token')) {
    return 'auth';
  }

  // Payment Gateway
  if (path.includes('payment') || path.includes('stripe') || path.includes('paypal') ||
    path.includes('razorpay') || label.includes('payment') || label.includes('stripe') ||
    label.includes('paypal') || label.includes('checkout')) {
    return 'payment';
  }

  // Database
  if (path.includes('db') || path.includes('database') || path.includes('model') ||
    path.includes('schema') || label.includes('db') || label.includes('database') ||
    label.includes('model') || label.includes('schema') || label.includes('migration')) {
    return 'database';
  }

  // API
  if (path.includes('api') || path.includes('route') || path.includes('endpoint') ||
    label.includes('api') || label.includes('route') || label.includes('endpoint')) {
    return 'api';
  }

  // Testing
  if (path.includes('test') || path.includes('spec') || path.includes('__tests__') ||
    label.includes('.test.') || label.includes('.spec.')) {
    return 'testing';
  }

  // UI Components
  if (path.includes('component') || path.includes('components') || path.includes('ui') ||
    label.endsWith('.jsx') || label.endsWith('.tsx') || label.endsWith('.vue') ||
    label.endsWith('.svelte')) {
    return 'ui';
  }

  // Config
  if (label.startsWith('.') || label.includes('config') || label.includes('env') ||
    label === 'package.json' || label === 'tsconfig.json' || label === 'webpack.config.js' ||
    label === 'vite.config.js' || label === '.env' || label === '.gitignore') {
    return 'config';
  }

  // Frontend
  const frontendPaths = ['src/', 'client/', 'public/', 'static/', 'views/'];
  const frontendExts = ['.html', '.css', '.scss', '.less', '.jsx', '.tsx', '.vue', '.svelte'];
  if (frontendPaths.some(p => path.startsWith(p)) ||
    frontendExts.some(e => label.endsWith(e))) {
    return 'frontend';
  }

  // Backend
  const backendPaths = ['server/', 'api/', 'backend/', 'lib/', 'src/server/'];
  const backendExts = ['.py', '.java', '.go', '.php', '.rb', '.rs', '.kt'];
  if (backendPaths.some(p => path.startsWith(p)) ||
    backendExts.some(e => label.endsWith(e))) {
    return 'backend';
  }

  // Utils
  if (path.includes('util') || path.includes('helper') || path.includes('common') ||
    label.includes('util') || label.includes('helper')) {
    return 'utils';
  }

  return 'unknown';
}

function addNodeAndAncestors(nodeId, nodesById, included) {
  const node = nodesById.get(nodeId);
  if (!node) return;

  included.add(nodeId);
  if (!node.path) {
    included.add('folder:.');
    return;
  }

  const segments = node.path.split('/');
  if (node.type !== 'folder') segments.pop();

  let current = '';
  included.add('folder:.');
  for (const segment of segments) {
    current = current ? `${current}/${segment}` : segment;
    included.add(`folder:${current}`);
  }
}

function sortNodesForVisibility(nodes) {
  return [...nodes].sort((left, right) => (right.importance || 0) - (left.importance || 0));
}

export function buildVisibleGraph(analysis, { limit, search, extraSeedNodes = [] }) {
  if (!analysis) {
    return { nodes: [], edges: [], hiddenNodeCount: 0, languages: [] };
  }

  const normalizedLimit = Math.max(90, Math.min(limit, 420));
  const allNodes = analysis.graph.nodes;
  const nodesById = new Map(allNodes.map((node) => [node.id, node]));
  const adjacency = analysis.graph.adjacency || {};
  const defaultSeed = analysis.graph.defaultVisibleNodeIds || [];
  const included = new Set();
  const searchLower = (search || '').trim().toLowerCase();

  for (const nodeId of defaultSeed.slice(0, normalizedLimit)) {
    addNodeAndAncestors(nodeId, nodesById, included);
  }

  for (const nodeId of extraSeedNodes) {
    addNodeAndAncestors(nodeId, nodesById, included);
  }

  if (searchLower) {
    const matchingNodes = allNodes.filter((node) => {
      const target = `${node.label} ${node.path || ''}`.toLowerCase();
      return target.includes(searchLower);
    });

    for (const node of matchingNodes.slice(0, 40)) {
      addNodeAndAncestors(node.id, nodesById, included);
      for (const neighborId of adjacency[node.id] || []) {
        addNodeAndAncestors(neighborId, nodesById, included);
      }
    }
  }

  if (included.size < normalizedLimit) {
    const rankedNodes = sortNodesForVisibility(allNodes.filter((node) => node.type !== 'folder'));
    for (const node of rankedNodes) {
      addNodeAndAncestors(node.id, nodesById, included);
      if (included.size >= normalizedLimit) break;
    }
  }

  const activeLanguages = new Set();
  const visibleNodes = allNodes
    .filter((node) => included.has(node.id))
    .map((node) => {
      const color = getNodeColor(node);
      const langKey = getNodeLanguageLabel(node);
      if (langKey !== 'folder') activeLanguages.add(langKey);
      return { ...node, color };
    });

  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
  const visibleEdges = analysis.graph.edges
    .filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target))
    .map(edge => ({ ...edge }));

  return {
    nodes: visibleNodes,
    edges: visibleEdges,
    hiddenNodeCount: Math.max(0, allNodes.length - visibleNodes.length),
    languages: Array.from(activeLanguages).sort(),
  };
}

export function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function phaseLabel(phase) {
  const labels = {
    queued: 'Queued',
    cloning: 'Cloning',
    parsing: 'Parsing',
    'building-graph': 'Building graph',
    complete: 'Ready',
    error: 'Error',
  };
  return labels[phase] || phase;
}
