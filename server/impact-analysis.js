/**
 * impact-analysis.js — blast-radius and path tracing over the scanned graph.
 *
 * Both answers are computed from `analysis.graph`, which the scanner already
 * builds from real import statements. Nothing here re-parses source and nothing
 * is inferred: an edge either exists in the scan or it does not.
 *
 * The result always carries a `limitations` array. A blast radius that hides
 * what it could not see is worse than no blast radius at all — the reader has
 * no way to tell a complete answer from a partial one.
 */

const DEFAULT_MAX_DEPTH = 4
const MAX_COLLECTED_NODES = 600

function endpointId(value) {
  return typeof value === 'object' && value !== null ? value.id : value
}

/**
 * Build directed adjacency from the dependency edges only.
 *
 * `hierarchy` edges ("folder contains file") are deliberately excluded: a
 * folder does not break when a file changes, and including them would make
 * every result look catastrophic.
 */
function buildGraphIndex(analysis) {
  const nodeById = new Map()
  const dependsOn = new Map()
  const dependedBy = new Map()

  const nodes = analysis?.graph?.nodes || []
  const edges = analysis?.graph?.edges || []

  nodes.forEach((node) => {
    if (node?.id) nodeById.set(node.id, node)
  })

  let dependencyEdges = 0
  let hierarchyEdges = 0
  let semanticEdges = 0

  edges.forEach((edge) => {
    const source = endpointId(edge.source)
    const target = endpointId(edge.target)
    if (!source || !target || source === target) return

    if (edge.type === 'hierarchy') {
      hierarchyEdges += 1
      return
    }
    if (edge.type === 'dependency') dependencyEdges += 1
    else semanticEdges += 1

    if (!dependsOn.has(source)) dependsOn.set(source, new Set())
    dependsOn.get(source).add(target)

    if (!dependedBy.has(target)) dependedBy.set(target, new Set())
    dependedBy.get(target).add(source)
  })

  return { nodeById, dependsOn, dependedBy, dependencyEdges, hierarchyEdges, semanticEdges }
}

function describeNode(node, id) {
  if (!node) return { id, label: id, path: null, type: 'unknown' }
  return {
    id,
    label: node.label || node.path || id,
    path: node.path || (id.startsWith('file:') ? id.slice(5) : null),
    type: node.type || 'unknown',
  }
}

/** Breadth-first walk in one direction, grouped by depth. */
function walkLevels(adjacency, startId, maxDepth) {
  const levels = []
  const seen = new Set([startId])
  let frontier = [startId]
  let truncated = false

  for (let depth = 1; depth <= maxDepth && frontier.length; depth += 1) {
    const next = []
    for (const current of frontier) {
      const neighbours = adjacency.get(current)
      if (!neighbours) continue
      for (const neighbour of neighbours) {
        if (seen.has(neighbour)) continue
        seen.add(neighbour)
        next.push(neighbour)
        if (seen.size >= MAX_COLLECTED_NODES) {
          truncated = true
          break
        }
      }
      if (truncated) break
    }
    if (!next.length) break
    levels.push(next)
    frontier = next
    if (truncated) break
  }

  return { levels, truncated, total: seen.size - 1 }
}

/**
 * Who breaks if this node changes (upstream), and what it needs to run
 * (downstream).
 */
function analyzeImpact(analysis, nodeId, options = {}) {
  const maxDepth = Number.isInteger(options.maxDepth) && options.maxDepth > 0
    ? Math.min(options.maxDepth, 8)
    : DEFAULT_MAX_DEPTH

  const index = buildGraphIndex(analysis)
  if (!index.nodeById.has(nodeId)) {
    const error = new Error(`No node with id "${nodeId}" in this repository's graph.`)
    error.code = 'NODE_NOT_FOUND'
    throw error
  }

  const upstreamWalk = walkLevels(index.dependedBy, nodeId, maxDepth)
  const downstreamWalk = walkLevels(index.dependsOn, nodeId, maxDepth)

  const toLevels = (walk) => walk.levels.map((ids, position) => ({
    depth: position + 1,
    count: ids.length,
    nodes: ids.map((id) => describeNode(index.nodeById.get(id), id)),
  }))

  const upstream = toLevels(upstreamWalk)
  const downstream = toLevels(downstreamWalk)

  const directUpstream = upstream[0]?.count || 0
  const totalUpstream = upstreamWalk.total
  const totalDownstream = downstreamWalk.total

  // Risk is a shape judgement, not a score: how much of the graph sits on top
  // of this file, and how wide the first ring is.
  const graphSize = index.nodeById.size || 1
  const share = totalUpstream / graphSize
  let risk = 'low'
  if (directUpstream >= 12 || share >= 0.25) risk = 'high'
  else if (directUpstream >= 4 || share >= 0.08) risk = 'medium'

  const limitations = [
    'Computed from static import edges in the scan. Dynamic imports, runtime requires, and string-built module paths are not represented.',
    'Folder containment edges are excluded on purpose — a folder does not break when a file changes.',
  ]
  if (upstreamWalk.truncated || downstreamWalk.truncated) {
    limitations.push(`Traversal stopped at ${MAX_COLLECTED_NODES} nodes; the lists above are not exhaustive.`)
  }
  if (maxDepth < 8) {
    limitations.push(`Depth limited to ${maxDepth}. Dependants further away than that are not listed.`)
  }
  if (index.hierarchyEdges) {
    limitations.push(`${index.hierarchyEdges} hierarchy edge(s) were skipped; only ${index.dependencyEdges} dependency edge(s) and ${index.semanticEdges} semantic edge(s) were traversed.`)
  }

  return {
    target: describeNode(index.nodeById.get(nodeId), nodeId),
    risk,
    upstream: { direct: directUpstream, total: totalUpstream, levels: upstream },
    downstream: { direct: downstream[0]?.count || 0, total: totalDownstream, levels: downstream },
    graph: {
      nodes: index.nodeById.size,
      dependencyEdges: index.dependencyEdges,
      semanticEdges: index.semanticEdges,
      hierarchyEdges: index.hierarchyEdges,
    },
    maxDepth,
    limitations,
  }
}

/**
 * Shortest dependency path between two nodes. Direction is reported per hop so
 * the caller can tell "A imports B" from "B imports A".
 */
function tracePath(analysis, fromId, toId, options = {}) {
  const maxDepth = Number.isInteger(options.maxDepth) && options.maxDepth > 0
    ? Math.min(options.maxDepth, 12)
    : 10

  const index = buildGraphIndex(analysis)
  for (const id of [fromId, toId]) {
    if (!index.nodeById.has(id)) {
      const error = new Error(`No node with id "${id}" in this repository's graph.`)
      error.code = 'NODE_NOT_FOUND'
      throw error
    }
  }

  if (fromId === toId) {
    return { from: describeNode(index.nodeById.get(fromId), fromId), to: describeNode(index.nodeById.get(toId), toId), found: true, hops: 0, path: [], limitations: [] }
  }

  // Undirected BFS so a path is found regardless of which way the import runs;
  // each hop records its real direction.
  const previous = new Map()
  const seen = new Set([fromId])
  let frontier = [fromId]
  let found = false

  for (let depth = 0; depth < maxDepth && frontier.length && !found; depth += 1) {
    const next = []
    for (const current of frontier) {
      const neighbours = [
        ...(index.dependsOn.get(current) || []),
        ...(index.dependedBy.get(current) || []),
      ]
      for (const neighbour of neighbours) {
        if (seen.has(neighbour)) continue
        seen.add(neighbour)
        previous.set(neighbour, current)
        if (neighbour === toId) {
          found = true
          break
        }
        next.push(neighbour)
      }
      if (found) break
    }
    frontier = next
  }

  const limitations = [
    'Path follows import edges only; call-level relationships inside a file are not modelled.',
    'A missing path means no import chain was found within the depth limit — not that the two files are unrelated at runtime.',
  ]

  if (!found) {
    return {
      from: describeNode(index.nodeById.get(fromId), fromId),
      to: describeNode(index.nodeById.get(toId), toId),
      found: false,
      hops: null,
      path: [],
      maxDepth,
      limitations: [...limitations, `Searched ${maxDepth} hops; no chain found.`],
    }
  }

  const chain = []
  let cursor = toId
  while (cursor && cursor !== fromId) {
    chain.unshift(cursor)
    cursor = previous.get(cursor)
  }
  chain.unshift(fromId)

  const path = chain.map((id, position) => {
    const node = describeNode(index.nodeById.get(id), id)
    if (position === 0) return { ...node, direction: 'start' }
    const previousId = chain[position - 1]
    const forward = (index.dependsOn.get(previousId) || new Set()).has(id)
    return { ...node, direction: forward ? 'imports' : 'imported by' }
  })

  return {
    from: describeNode(index.nodeById.get(fromId), fromId),
    to: describeNode(index.nodeById.get(toId), toId),
    found: true,
    hops: chain.length - 1,
    path,
    limitations,
  }
}

module.exports = {
  analyzeImpact,
  tracePath,
  buildGraphIndex,
}
