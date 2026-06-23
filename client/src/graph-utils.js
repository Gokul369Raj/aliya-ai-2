export const CATEGORY_COLORS = {
  frontend: '#0ea5e9',
  backend: '#2563eb',
  auth: '#8b5cf6',
  payment: '#10b981',
  database: '#ef4444',
  config: '#eab308',
  testing: '#f97316',
  api: '#06b6d4',
  ui: '#14b8a6',
  utils: '#64748b',
  folder: '#334155',
  unknown: '#475569',
}

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
}

export const LANGUAGE_COLORS = {
  javascript: '#eab308',
  typescript: '#2563eb',
  react: '#0ea5e9',
  html: '#ea580c',
  css: '#8b5cf6',
  json: '#10b981',
  markdown: '#ef4444',
  python: '#2563eb',
  java: '#dc2626',
  go: '#06b6d4',
  rust: '#ea580c',
  php: '#7c3aed',
  ruby: '#be123c',
  shell: '#15803d',
  c: '#475569',
  'c++': '#1d4ed8',
  csharp: '#16a34a',
  swift: '#ea580c',
  kotlin: '#7c3aed',
  scala: '#dc2626',
  dart: '#0284c7',
  vue: '#14b8a6',
  angular: '#b91c1c',
  svelte: '#ea580c',
  nextjs: '#d4d4d8',
  nuxtjs: '#10b981',
  unknown: '#64748b',
  folder: '#334155',
}

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
}

export function getNodeLanguageLabel(node) {
  if (node.type === 'folder') return 'folder'

  const label = (node.label || '').toLowerCase()
  if (label.endsWith('.jsx') || label.endsWith('.tsx')) {
    return 'react'
  }
  if (label.endsWith('.vue')) {
    return 'vue'
  }
  if (label.endsWith('.svelte')) {
    return 'svelte'
  }

  if (node.language && LANGUAGE_COLORS[node.language]) {
    return node.language
  }

  return 'unknown'
}

export function getNodeCategoryLabel(node) {
  if (node.type === 'folder') return 'folder'

  const path = (node.path || '').toLowerCase()
  const label = (node.label || '').toLowerCase()

  if (
    path.includes('auth')
    || path.includes('login')
    || path.includes('register')
    || label.includes('auth')
    || label.includes('login')
    || label.includes('register')
    || label.includes('session')
    || label.includes('jwt')
    || label.includes('token')
  ) {
    return 'auth'
  }

  if (
    path.includes('payment')
    || path.includes('stripe')
    || path.includes('paypal')
    || path.includes('razorpay')
    || label.includes('payment')
    || label.includes('stripe')
    || label.includes('paypal')
    || label.includes('checkout')
  ) {
    return 'payment'
  }

  if (
    path.includes('db')
    || path.includes('database')
    || path.includes('model')
    || path.includes('schema')
    || label.includes('db')
    || label.includes('database')
    || label.includes('model')
    || label.includes('schema')
    || label.includes('migration')
  ) {
    return 'database'
  }

  if (
    path.includes('api')
    || path.includes('route')
    || path.includes('endpoint')
    || label.includes('api')
    || label.includes('route')
    || label.includes('endpoint')
  ) {
    return 'api'
  }

  if (
    path.includes('test')
    || path.includes('spec')
    || path.includes('__tests__')
    || label.includes('.test.')
    || label.includes('.spec.')
  ) {
    return 'testing'
  }

  if (
    path.includes('component')
    || path.includes('components')
    || path.includes('ui')
    || label.endsWith('.jsx')
    || label.endsWith('.tsx')
    || label.endsWith('.vue')
    || label.endsWith('.svelte')
  ) {
    return 'ui'
  }

  if (
    label.startsWith('.')
    || label.includes('config')
    || label.includes('env')
    || label === 'package.json'
    || label === 'tsconfig.json'
    || label === 'webpack.config.js'
    || label === 'vite.config.js'
    || label === '.env'
    || label === '.gitignore'
  ) {
    return 'config'
  }

  const frontendPaths = ['src/', 'client/', 'public/', 'static/', 'views/']
  const frontendExts = ['.html', '.css', '.scss', '.less', '.jsx', '.tsx', '.vue', '.svelte']
  if (frontendPaths.some((prefix) => path.startsWith(prefix)) || frontendExts.some((extension) => label.endsWith(extension))) {
    return 'frontend'
  }

  const backendPaths = ['server/', 'api/', 'backend/', 'lib/', 'src/server/']
  const backendExts = ['.py', '.java', '.go', '.php', '.rb', '.rs', '.kt']
  if (backendPaths.some((prefix) => path.startsWith(prefix)) || backendExts.some((extension) => label.endsWith(extension))) {
    return 'backend'
  }

  if (
    path.includes('util')
    || path.includes('helper')
    || path.includes('common')
    || label.includes('util')
    || label.includes('helper')
  ) {
    return 'utils'
  }

  return 'unknown'
}

export function getNodeCategoryColor(node) {
  const categoryKey = getNodeCategoryLabel(node)
  return CATEGORY_COLORS[categoryKey] || CATEGORY_COLORS.unknown
}

export function getNodeColor(node) {
  const languageKey = getNodeLanguageLabel(node)
  return LANGUAGE_COLORS[languageKey] || LANGUAGE_COLORS.unknown
}

function addNodeAndAncestors(nodeId, nodesById, included) {
  const node = nodesById.get(nodeId)
  if (!node) return

  included.add(nodeId)
  if (!node.path) {
    included.add('folder:.')
    return
  }

  const segments = node.path.split('/')
  if (node.type !== 'folder') segments.pop()

  let current = ''
  included.add('folder:.')
  for (const segment of segments) {
    current = current ? `${current}/${segment}` : segment
    included.add(`folder:${current}`)
  }
}

function sortNodesForVisibility(nodes) {
  return [...nodes].sort((left, right) => (right.importance || 0) - (left.importance || 0))
}

export function buildVisibleGraph(analysis, { limit, search, extraSeedNodes = [] } = {}) {
  if (!analysis) {
    return { nodes: [], edges: [], hiddenNodeCount: 0, languages: [] }
  }

  const normalizedLimit = Math.max(90, Math.min(Number(limit) || 300, 420))
  const allNodes = analysis.graph.nodes || []
  const nodesById = new Map(allNodes.map((node) => [node.id, node]))
  const adjacency = analysis.graph.adjacency || {}
  const defaultSeed = analysis.graph.defaultVisibleNodeIds || []
  const included = new Set()
  const searchLower = String(search || '').trim().toLowerCase()

  for (const nodeId of defaultSeed.slice(0, normalizedLimit)) {
    addNodeAndAncestors(nodeId, nodesById, included)
  }

  for (const nodeId of extraSeedNodes) {
    if (nodeId) addNodeAndAncestors(nodeId, nodesById, included)
  }

  if (searchLower) {
    const matchingNodes = allNodes.filter((node) => {
      const target = `${node.label || ''} ${node.path || ''}`.toLowerCase()
      return target.includes(searchLower)
    })

    for (const node of matchingNodes.slice(0, 40)) {
      addNodeAndAncestors(node.id, nodesById, included)
      for (const neighborId of adjacency[node.id] || []) {
        addNodeAndAncestors(neighborId, nodesById, included)
      }
    }
  }

  if (included.size < normalizedLimit) {
    const rankedNodes = sortNodesForVisibility(allNodes.filter((node) => node.type !== 'folder'))
    for (const node of rankedNodes) {
      addNodeAndAncestors(node.id, nodesById, included)
      if (included.size >= normalizedLimit) break
    }
  }

  const activeLanguages = new Set()
  const visibleNodes = allNodes
    .filter((node) => included.has(node.id))
    .map((node) => {
      const color = getNodeColor(node)
      const languageKey = getNodeLanguageLabel(node)
      if (languageKey !== 'folder') activeLanguages.add(languageKey)
      return { ...node, color }
    })

  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id))
  const visibleEdges = (analysis.graph.edges || [])
    .filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target))
    .map((edge) => ({ ...edge }))

  return {
    nodes: visibleNodes,
    edges: visibleEdges,
    hiddenNodeCount: Math.max(0, allNodes.length - visibleNodes.length),
    languages: Array.from(activeLanguages).sort(),
  }
}

export function phaseLabel(phase) {
  const labels = {
    queued: 'Queued',
    cloning: 'Cloning',
    parsing: 'Parsing',
    'building-graph': 'Building graph',
    complete: 'Ready',
    error: 'Error',
  }
  return labels[phase] || phase
}

export function formatBytes(bytes = 0) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
