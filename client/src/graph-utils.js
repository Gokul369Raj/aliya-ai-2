/**
 * Data-visualisation palette.
 *
 * Rules this palette was built to satisfy (see DESIGN.md):
 *  1. Every colour clears **3:1** contrast against the cream canvas `#f3eee7`,
 *     so a node or a bar is visible as a shape, not just a tint. Most clear
 *     4.5:1, which means they are also safe as text.
 *  2. Hues are spread and stay distinguishable under the common forms of
 *     colour-vision deficiency (deuteranopia / protanopia / tritanopia), which
 *     rules out the usual red-vs-green pairings.
 *  3. Green and pink are the brand accents, so they lead the palette — but as
 *     *darkened* variants. The brand neon green `#0cb531` only reaches 2.37:1
 *     on cream and must never be used as a data fill.
 *
 * The standard Okabe-Ito / ColorBrewer values are tuned for a white page and
 * several of them fall below 3:1 here, so the hues were kept and re-tuned
 * darker rather than copied verbatim.
 *
 * Verified by `test-theme-contrast.js` — run it before changing a value.
 */
export const VIZ_PALETTE = {
  green: '#0a7d24',
  pink: '#c81e4a',
  blue: '#1f6fb2',
  indigo: '#332288',
  teal: '#0f766e',
  // amber / vermillion / neutral are also used as *label text* (layer chips in
  // Flow Explorer), not only as graph fills, so they carry the 4.5:1 text
  // floor rather than the 3:1 graphics one.
  amber: '#a34e0a',
  vermillion: '#b03a0b',
  violet: '#6d28d9',
  plum: '#882255',
  slate: '#334155',
  cyan: '#0e7490',
  olive: '#5f6212',
  mauve: '#a21caf',
  rust: '#92400e',
  navy: '#1e3a8a',
  wine: '#9f1239',
  ochre: '#a16207',
  ochreDeep: '#8a6209',
  amberDeep: '#9a4a08',
  neutral: '#6b665d',
  // Canvas-aware greys for de-emphasised states — they fade *toward* the cream
  // canvas rather than to near-black.
  dimEdge: '#ded7cb',
  dimLabel: '#8a8175',
}

/**
 * Vivid fills for graph **nodes**.
 *
 * A node is a large shape with an ink outline, not a label, so it carries the
 * 3:1 graphics floor — not the 4.5:1 text floor that VIZ_PALETTE exists to
 * satisfy. That difference is the whole reason this second table exists: the
 * text-safe palette is deliberately dark, and dark fills read as mud once the
 * graph is drawn on paper.
 *
 * **Never use these for text.** Labels, chips and the flow-explorer layer name
 * stay on VIZ_PALETTE / CATEGORY_COLORS.
 */
export const VIZ_NODE_PALETTE = {
  orange: '#c2410c',
  blue: '#2563eb',
  cyan: '#0891b2',
  violet: '#7c3aed',
  green: '#15803d',
  slate: '#475569',
  indigo: '#4338ca',
  pink: '#db2777',
  teal: '#0d9488',
  red: '#dc2626',
  rust: '#b45309',
  magenta: '#a21caf',
  crimson: '#be185d',
  olive: '#4d7c0f',
  steel: '#64748b',
  navy: '#1d4ed8',
  wine: '#9f1239',
  sky: '#0284c7',
  charcoal: '#334155',
  grey: '#6b7280',
  folder: '#64748b',
}

export const CATEGORY_COLORS = {
  frontend: VIZ_PALETTE.blue,
  backend: VIZ_PALETTE.indigo,
  auth: VIZ_PALETTE.violet,
  payment: VIZ_PALETTE.green,
  database: VIZ_PALETTE.vermillion,
  config: VIZ_PALETTE.amber,
  testing: VIZ_PALETTE.olive,
  api: VIZ_PALETTE.cyan,
  ui: VIZ_PALETTE.teal,
  utils: '#5e5850',
  folder: '#475569',
  unknown: VIZ_PALETTE.neutral,
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

/**
 * The same category hues as CATEGORY_COLORS, but taken from the vivid node
 * table. `CATEGORY_COLORS` is also painted as *label text* (FlowExplorerPanel,
 * the PDF), so it must stay dark; node fills do not have that constraint.
 * Use this for anything that colours a shape, and CATEGORY_COLORS for text.
 */
export const CATEGORY_NODE_COLORS = {
  frontend: VIZ_NODE_PALETTE.blue,
  backend: VIZ_NODE_PALETTE.indigo,
  auth: VIZ_NODE_PALETTE.violet,
  payment: VIZ_NODE_PALETTE.green,
  database: VIZ_NODE_PALETTE.red,
  config: VIZ_NODE_PALETTE.rust,
  testing: VIZ_NODE_PALETTE.olive,
  api: VIZ_NODE_PALETTE.cyan,
  ui: VIZ_NODE_PALETTE.teal,
  utils: VIZ_NODE_PALETTE.steel,
  folder: VIZ_NODE_PALETTE.folder,
  unknown: VIZ_NODE_PALETTE.grey,
}

// Node fills — the vivid table. Same 3:1 graphics contract as VIZ_NODE_PALETTE.
export const LANGUAGE_COLORS = {
  javascript: VIZ_NODE_PALETTE.orange,
  typescript: VIZ_NODE_PALETTE.blue,
  react: VIZ_NODE_PALETTE.cyan,
  html: VIZ_NODE_PALETTE.red,
  css: VIZ_NODE_PALETTE.violet,
  json: VIZ_NODE_PALETTE.green,
  markdown: VIZ_NODE_PALETTE.slate,
  python: VIZ_NODE_PALETTE.indigo,
  java: VIZ_NODE_PALETTE.pink,
  go: VIZ_NODE_PALETTE.teal,
  rust: VIZ_NODE_PALETTE.rust,
  php: VIZ_NODE_PALETTE.magenta,
  ruby: VIZ_NODE_PALETTE.crimson,
  shell: VIZ_NODE_PALETTE.olive,
  c: VIZ_NODE_PALETTE.steel,
  'c++': VIZ_NODE_PALETTE.navy,
  csharp: VIZ_NODE_PALETTE.green,
  swift: VIZ_NODE_PALETTE.orange,
  kotlin: VIZ_NODE_PALETTE.violet,
  scala: VIZ_NODE_PALETTE.wine,
  dart: VIZ_NODE_PALETTE.sky,
  vue: VIZ_NODE_PALETTE.teal,
  angular: VIZ_NODE_PALETTE.red,
  svelte: VIZ_NODE_PALETTE.orange,
  nextjs: VIZ_NODE_PALETTE.charcoal,
  nuxtjs: VIZ_NODE_PALETTE.green,
  unknown: VIZ_NODE_PALETTE.grey,
  folder: VIZ_NODE_PALETTE.folder,
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
  return CATEGORY_NODE_COLORS[categoryKey] || CATEGORY_NODE_COLORS.unknown
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
