import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import cytoscape from 'cytoscape'
import fcose from 'cytoscape-fcose'
import { Expand, RotateCcw, Shrink, Target, ZoomIn, ZoomOut } from 'lucide-react'
import { CATEGORY_COLORS, CATEGORY_LABELS, getNodeCategoryLabel } from '../graph-utils'

cytoscape.use(fcose)

const LAYER_ORDER = [
  'frontend',
  'ui',
  'routing',
  'middleware',
  'api',
  'controller',
  'backend',
  'auth',
  'service',
  'database',
  'cache',
  'response',
  'state',
  'errors',
  'infrastructure',
  'config',
  'utils',
  'unknown',
]

const FLOW_CATEGORY_HINTS = {
  full: ['frontend', 'ui', 'routing', 'middleware', 'api', 'controller', 'backend', 'auth', 'service', 'database', 'cache', 'response', 'state', 'errors', 'infrastructure', 'config', 'utils'],
  auth: ['frontend', 'ui', 'routing', 'middleware', 'api', 'controller', 'auth', 'service', 'database', 'cache', 'response', 'state', 'errors'],
  api: ['frontend', 'ui', 'routing', 'middleware', 'api', 'controller', 'backend', 'service', 'database', 'cache', 'response', 'errors', 'infrastructure'],
  db: ['api', 'controller', 'middleware', 'backend', 'service', 'database', 'cache', 'response', 'errors', 'infrastructure', 'state'],
  state: ['frontend', 'ui', 'state', 'api', 'controller', 'service', 'response', 'cache'],
  routing: ['frontend', 'ui', 'routing', 'middleware', 'api', 'controller', 'backend', 'response', 'errors'],
  component: ['frontend', 'ui', 'state', 'api', 'controller', 'utils'],
  startup: ['config', 'backend', 'routing', 'middleware', 'api', 'controller', 'service', 'database', 'cache'],
}

const BASE_NODE_LIMIT = 40
const EXPANSION_BATCH = 8
const MAX_EXPANDED_NODES = 140
const MAX_RENDERED_EDGES = 220
const COLUMN_WIDTH = 312
const COLUMN_GAP = 160
const NODE_WIDTH = 272
const NODE_HEIGHT = 164
const NODE_GAP = 30
const COLUMN_PADDING_TOP = 120
const COLUMN_PADDING_BOTTOM = 140
const WORLD_PADDING_X = 180
const WORLD_PADDING_Y = 100
const MIN_SCALE = 0.12
const MAX_SCALE = 4.5
const ZOOM_STEP = 1.18

function getNodeId(nodeRef) {
  return typeof nodeRef === 'object' ? nodeRef?.id : nodeRef
}

function scoreNode(node) {
  return (node?.importance || 0) + ((node?.riskCount || 0) * 2) + (node?.type === 'important' ? 8 : 0)
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function sortByPriority(nodes, flowStageMap, adjacency) {
  return [...nodes].sort((left, right) => {
    const leftStage = flowStageMap.get(left.id)?.sourceIndex ?? Number.MAX_SAFE_INTEGER
    const rightStage = flowStageMap.get(right.id)?.sourceIndex ?? Number.MAX_SAFE_INTEGER
    if (leftStage !== rightStage) return leftStage - rightStage
    const outboundDelta = (adjacency[right.id] || []).length - (adjacency[left.id] || []).length
    if (outboundDelta !== 0) return outboundDelta
    return scoreNode(right) - scoreNode(left)
  })
}

function buildExpandedFlow(activeFlow, analysis, expandedNodes) {
  if (!activeFlow || !analysis?.graph?.nodes?.length) return null

  const nodes = analysis.graph.nodes
  const edges = analysis.graph.edges || []
  const adjacency = analysis.graph.adjacency || {}
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const flowStageMap = new Map((activeFlow.stages || []).map((stage, index) => [stage.nodeId, { ...stage, sourceIndex: index }]))
  const relevantCategories = new Set([
    ...(activeFlow.layers || []),
    ...(FLOW_CATEGORY_HINTS[activeFlow.id] || []),
  ])

  const included = new Set(activeFlow.nodes)
  const queue = [...activeFlow.nodes]

  while (queue.length && included.size < BASE_NODE_LIMIT) {
    const currentId = queue.shift()
    const neighbors = (adjacency[currentId] || [])
      .map((neighborId) => nodesById.get(neighborId))
      .filter(Boolean)
      .filter((node) => node.type !== 'folder')
      .filter((node) => relevantCategories.has(getNodeCategoryLabel(node)) || flowStageMap.has(node.id))
      .sort((left, right) => scoreNode(right) - scoreNode(left))

    for (const neighbor of neighbors) {
      if (included.has(neighbor.id)) continue
      included.add(neighbor.id)
      queue.push(neighbor.id)
      if (included.size >= BASE_NODE_LIMIT) break
    }
  }

  for (const expandedId of expandedNodes) {
    if (included.size >= MAX_EXPANDED_NODES) break
    const neighbors = (adjacency[expandedId] || [])
      .map((neighborId) => nodesById.get(neighborId))
      .filter(Boolean)
      .filter((node) => node.type !== 'folder')
      .filter((node) => relevantCategories.has(getNodeCategoryLabel(node)) || flowStageMap.has(node.id))
      .sort((left, right) => scoreNode(right) - scoreNode(left))

    let added = 0
    for (const neighbor of neighbors) {
      if (included.has(neighbor.id)) continue
      included.add(neighbor.id)
      added += 1
      if (added >= EXPANSION_BATCH || included.size >= MAX_EXPANDED_NODES) break
    }
  }

  const visibleNodes = [...included]
    .map((nodeId) => nodesById.get(nodeId))
    .filter(Boolean)

  const visibleIds = new Set(visibleNodes.map((node) => node.id))
  const visibleEdges = edges
    .filter((edge) => edge.type !== 'hierarchy')
    .filter((edge) => visibleIds.has(getNodeId(edge.source)) && visibleIds.has(getNodeId(edge.target)))
    .sort((left, right) => {
      const leftSource = getNodeId(left.source)
      const leftTarget = getNodeId(left.target)
      const rightSource = getNodeId(right.source)
      const rightTarget = getNodeId(right.target)
      const leftFlowScore = (flowStageMap.has(leftSource) ? 2 : 0) + (flowStageMap.has(leftTarget) ? 2 : 0)
      const rightFlowScore = (flowStageMap.has(rightSource) ? 2 : 0) + (flowStageMap.has(rightTarget) ? 2 : 0)
      if (leftFlowScore !== rightFlowScore) return rightFlowScore - leftFlowScore
      return (scoreNode(nodesById.get(rightSource)) + scoreNode(nodesById.get(rightTarget))) - (scoreNode(nodesById.get(leftSource)) + scoreNode(nodesById.get(leftTarget)))
    })
    .slice(0, MAX_RENDERED_EDGES)
    .map((edge) => ({
      ...edge,
      source: getNodeId(edge.source),
      target: getNodeId(edge.target),
    }))

  const orderedLayers = LAYER_ORDER.filter((layer) =>
    visibleNodes.some((node) => (flowStageMap.get(node.id)?.layer || getNodeCategoryLabel(node)) === layer)
  )

  const layeredNodes = orderedLayers.map((layer) => {
    const layerNodes = sortByPriority(
      visibleNodes
        .filter((node) => (flowStageMap.get(node.id)?.layer || getNodeCategoryLabel(node)) === layer)
        .map((node) => {
          const stage = flowStageMap.get(node.id)
          const hiddenNeighborCount = (adjacency[node.id] || []).filter((neighborId) => !visibleIds.has(neighborId)).length
          return {
            ...node,
            layer,
            stageIndex: stage?.sourceIndex ?? -1,
            stageSummary: stage?.summary || `${node.label} participates in the ${CATEGORY_LABELS[layer] || layer} layer.`,
            architectureRole: stage?.architectureRole || node.architectureRole || CATEGORY_LABELS[layer] || layer,
            dependencyCount: stage?.dependencyCount ?? (adjacency[node.id] || []).length,
            outboundCalls: stage?.outboundCalls ?? (adjacency[node.id] || []).length,
            riskCount: stage?.riskCount ?? node.riskCount ?? 0,
            hiddenNeighborCount,
          }
        }),
      flowStageMap,
      adjacency,
    )

    return { layer, nodes: layerNodes }
  }).filter((layerGroup) => layerGroup.nodes.length)

  return {
    ...activeFlow,
    visibleNodes,
    visibleEdges,
    layeredNodes,
    orderedLayers,
    expandedNodeCount: visibleNodes.length,
  }
}

function buildActiveChain(stageNodes = []) {
  const activeEdges = new Set()
  for (let index = 0; index < stageNodes.length - 1; index += 1) {
    activeEdges.add(`${stageNodes[index]}->${stageNodes[index + 1]}`)
  }
  return activeEdges
}

function buildLayout(expandedFlow, filteredLayers) {
  if (!expandedFlow || !filteredLayers.length) return null

  const layerIndex = new Map(filteredLayers.map((group, index) => [group.layer, index]))
  const nodesById = new Map(filteredLayers.flatMap((group) => group.nodes.map((node) => [node.id, node])))
  const stageLookup = new Map((expandedFlow.stages || []).map((stage, index) => [stage.nodeId, index]))
  const nodeLayouts = new Map()
  const columnMeta = []
  const stageStride = NODE_HEIGHT + NODE_GAP + 48

  filteredLayers.forEach((group, index) => {
    const x = WORLD_PADDING_X + index * (COLUMN_WIDTH + COLUMN_GAP)
    const primaryNodes = group.nodes.filter((node) => node.stageIndex >= 0)
    const contextualNodes = group.nodes.filter((node) => node.stageIndex < 0)

    const anchors = []
    let cursorY = COLUMN_PADDING_TOP

    for (const node of primaryNodes) {
      const preferredY = COLUMN_PADDING_TOP + stageLookup.get(node.id) * stageStride
      cursorY = Math.max(cursorY, preferredY)
      anchors.push({ node, y: cursorY })
      cursorY += NODE_HEIGHT + NODE_GAP
    }

    const contextualStartY = Math.max(cursorY + 24, COLUMN_PADDING_TOP + primaryNodes.length * 52)
    contextualNodes.forEach((node, contextualIndex) => {
      anchors.push({
        node,
        y: contextualStartY + contextualIndex * (NODE_HEIGHT + NODE_GAP),
      })
    })

    let columnHeight = 0
    anchors.forEach(({ node, y }) => {
      nodeLayouts.set(node.id, {
        id: node.id,
        x,
        y,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        columnIndex: index,
        layer: group.layer,
      })
      columnHeight = Math.max(columnHeight, y + NODE_HEIGHT)
    })

    columnMeta.push({
      layer: group.layer,
      x,
      y: 28,
      width: COLUMN_WIDTH,
      height: Math.max(columnHeight + COLUMN_PADDING_BOTTOM, 360),
      index,
    })
  })

  const worldWidth = columnMeta.length
    ? columnMeta[columnMeta.length - 1].x + COLUMN_WIDTH + WORLD_PADDING_X
    : 0
  const worldHeight = columnMeta.length
    ? Math.max(...columnMeta.map((column) => column.height)) + WORLD_PADDING_Y
    : 0

  const outboundCounters = new Map()
  const inboundCounters = new Map()
  const channelOffsets = new Map()

  const edgeLayouts = expandedFlow.visibleEdges
    .filter((edge) => nodeLayouts.has(edge.source) && nodeLayouts.has(edge.target))
    .map((edge, index) => {
      const sourceBox = nodeLayouts.get(edge.source)
      const targetBox = nodeLayouts.get(edge.target)
      const sourceNode = nodesById.get(edge.source)
      const targetNode = nodesById.get(edge.target)
      const sourceStage = stageLookup.get(edge.source)
      const targetStage = stageLookup.get(edge.target)
      const sourceLayerIndex = layerIndex.get(sourceBox.layer) ?? sourceBox.columnIndex
      const targetLayerIndex = layerIndex.get(targetBox.layer) ?? targetBox.columnIndex
      const direction = targetLayerIndex >= sourceLayerIndex ? 'forward' : 'return'
      const edgeKey = `${edge.source}->${edge.target}`
      const bundleKey = `${Math.min(sourceLayerIndex, targetLayerIndex)}:${Math.max(sourceLayerIndex, targetLayerIndex)}:${direction}`

      const outboundKey = `${edge.source}:${direction}`
      const inboundKey = `${edge.target}:${direction}`
      const outIndex = outboundCounters.get(outboundKey) || 0
      const inIndex = inboundCounters.get(inboundKey) || 0
      outboundCounters.set(outboundKey, outIndex + 1)
      inboundCounters.set(inboundKey, inIndex + 1)

      const channelIndex = channelOffsets.get(bundleKey) || 0
      channelOffsets.set(bundleKey, channelIndex + 1)

      const sourceY = sourceBox.y + 28 + outIndex * 16
      const targetY = targetBox.y + 28 + inIndex * 16
      const sourceAnchorX = direction === 'forward' ? sourceBox.x + sourceBox.width : sourceBox.x
      const targetAnchorX = direction === 'forward' ? targetBox.x : targetBox.x + targetBox.width
      const stem = 26 + Math.abs(outIndex - inIndex) * 4
      const laneSide = direction === 'forward' ? 1 : -1
      const laneBaseX = direction === 'forward'
        ? sourceBox.x + sourceBox.width + 36 + (channelIndex % 3) * 22
        : sourceBox.x - 36 - (channelIndex % 3) * 22
      const laneX = direction === 'forward'
        ? Math.min(laneBaseX, targetAnchorX - 56)
        : Math.max(laneBaseX, targetAnchorX + 56)
      const midpointX = (sourceAnchorX + targetAnchorX) / 2
      const sameColumn = sourceLayerIndex === targetLayerIndex
      const baseColor = CATEGORY_COLORS[targetNode?.layer || targetBox.layer] || CATEGORY_COLORS.unknown

      let d
      if (sameColumn) {
        const loopX = sourceBox.x + sourceBox.width + 74 + (channelIndex % 4) * 20
        const controlY = sourceY < targetY ? targetY - 42 : targetY + 42
        d = [
          `M ${sourceBox.x + sourceBox.width} ${sourceY}`,
          `C ${loopX} ${sourceY}, ${loopX} ${controlY}, ${midpointX} ${controlY}`,
          `S ${targetBox.x + sourceBox.width} ${targetY}, ${targetBox.x + sourceBox.width} ${targetY}`,
          `L ${targetBox.x + sourceBox.width - 18} ${targetY}`,
        ].join(' ')
      } else {
        d = [
          `M ${sourceAnchorX} ${sourceY}`,
          `L ${sourceAnchorX + stem * laneSide} ${sourceY}`,
          `C ${laneX} ${sourceY}, ${laneX} ${sourceY}, ${laneX} ${(sourceY + targetY) / 2}`,
          `S ${laneX} ${targetY}, ${targetAnchorX - stem * laneSide} ${targetY}`,
          `L ${targetAnchorX} ${targetY}`,
        ].join(' ')
      }

      return {
        id: `${edge.source}-${edge.target}-${index}`,
        edge,
        edgeKey,
        sourceNode,
        targetNode,
        sourceStage,
        targetStage,
        direction,
        bundleKey,
        d,
        color: baseColor,
        laneX,
      }
    })

  return {
    nodeLayouts,
    edgeLayouts,
    columnMeta,
    worldWidth,
    worldHeight,
  }
}

export function LayeredFlowView({
  analysis,
  activeFlow,
  onHover,
  onSelect,
}) {
  const rootRef = useRef(null)
  const containerRef = useRef(null)
  const cyRef = useRef(null)
  const [selectedLocalNodeId, setSelectedLocalNodeId] = useState('')
  const [isGraphFullscreen, setIsGraphFullscreen] = useState(false)

  const expandedFlow = useMemo(
    () => buildExpandedFlow(activeFlow, analysis, new Set()),
    [
      activeFlow?.id,
      activeFlow?.nodes,
      activeFlow?.stages,
      activeFlow?.layers,
      activeFlow?.edgeKeys,
      analysis,
    ],
  )

  const currentFlowNodeId = activeFlow?.nodes?.[activeFlow?.currentIndex] || ''
  const focusNodeId = activeFlow?.isPlaybackActive ? currentFlowNodeId : ''

  useEffect(() => {
    if (!containerRef.current || !expandedFlow?.visibleNodes?.length) return

    const stageIndexByNode = new Map((activeFlow?.stages || []).map((stage, index) => [stage.nodeId, index]))
    const nodes = expandedFlow.visibleNodes.map((node) => {
      const layer = stageIndexByNode.has(node.id)
        ? activeFlow.stages[stageIndexByNode.get(node.id)]?.layer
        : getNodeCategoryLabel(node)
      const isPrimary = stageIndexByNode.has(node.id)
      const size = Math.max(18, Math.min(44, (node.renderedSize || node.size || 14) * (isPrimary ? 1.35 : 1)))

      return {
        data: {
          id: node.id,
          label: node.label,
          path: node.path || node.label,
          layer,
          size,
          color: CATEGORY_COLORS[layer] || node.color || CATEGORY_COLORS.unknown,
          stage: stageIndexByNode.get(node.id),
        },
        classes: `${isPrimary ? 'primary-flow' : 'context-node'} ${node.type || ''}`,
      }
    })

    const edges = expandedFlow.visibleEdges.map((edge, index) => ({
      data: {
        id: `${edge.source}-${edge.target}-${index}`,
        source: edge.source,
        target: edge.target,
        flowEdge: activeFlow?.edgeKeys?.includes(`${edge.source}->${edge.target}`),
      },
      classes: activeFlow?.edgeKeys?.includes(`${edge.source}->${edge.target}`) ? 'flow-edge' : 'context-edge',
    }))

    const cy = cytoscape({
      container: containerRef.current,
      minZoom: 0.18,
      maxZoom: 3.5,
      wheelSensitivity: 0.22,
      elements: [...nodes, ...edges],
      style: [
        {
          selector: 'node',
          style: {
            label: 'data(label)',
            width: 'data(size)',
            height: 'data(size)',
            shape: 'ellipse',
            color: '#d4d4d8',
            'font-size': 10,
            'text-background-color': '#08080a',
            'text-background-opacity': 0.9,
            'text-background-padding': 2,
            'text-valign': 'bottom',
            'text-margin-y': 5,
            'background-color': 'data(color)',
            'border-width': 1,
            'border-color': '#27272a',
          },
        },
        {
          selector: 'node.primary-flow',
          style: {
            'border-width': 2,
            'border-color': '#ffffff',
            'shadow-blur': 12,
            'shadow-color': 'data(color)',
            'shadow-opacity': 0.45,
          },
        },
        {
          selector: 'node.current',
          style: {
            'border-width': 4,
            'border-color': '#67e8f9',
            color: '#ffffff',
            'font-size': 12,
            'shadow-blur': 26,
            'shadow-color': '#67e8f9',
            'shadow-opacity': 0.85,
          },
        },
        {
          selector: 'node.selected',
          style: {
            'border-width': 4,
            'border-color': '#ffffff',
            color: '#ffffff',
          },
        },
        {
          selector: 'node.hovered',
          style: {
            'border-width': 3,
            'border-color': '#ffffff',
          },
        },
        {
          selector: 'node.dimmed',
          style: { opacity: 0.12 },
        },
        {
          selector: 'edge',
          style: {
            width: 1.1,
            'line-color': '#3b82f6',
            'target-arrow-color': '#3b82f6',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            opacity: 0.45,
          },
        },
        {
          selector: 'edge.flow-edge',
          style: {
            width: 2,
            'line-color': '#67e8f9',
            'target-arrow-color': '#67e8f9',
            opacity: 0.8,
          },
        },
        {
          selector: 'edge.linked',
          style: {
            width: 2.8,
            'line-color': '#ef4444',
            'target-arrow-color': '#ef4444',
            opacity: 0.95,
          },
        },
        {
          selector: 'edge.dimmed',
          style: { opacity: 0.08 },
        },
      ],
    })

    cy.on('tap', 'node', (event) => {
      const nodeId = event.target.id()
      setSelectedLocalNodeId((current) => (current === nodeId ? '' : nodeId))
      onSelect(nodeId)
    })

    cy.on('mouseover', 'node', (event) => {
      onHover(event.target.id())
    })

    cy.on('mouseout', 'node', () => {
      onHover('')
    })

    cy.layout({
      name: 'fcose',
      animate: false,
      fit: true,
      padding: 52,
      nodeRepulsion: 9000,
      idealEdgeLength: (edge) => (edge.data('flowEdge') ? 70 : 95),
      gravity: 0.18,
      numIter: 1000,
      randomize: true,
    }).run()

    cyRef.current = cy

    return () => {
      cy.destroy()
      cyRef.current = null
    }
  }, [activeFlow?.edgeKeys, activeFlow?.id, activeFlow?.stages, expandedFlow, onHover, onSelect])

  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return

    cy.elements().removeClass('current selected hovered dimmed linked')

    if (currentFlowNodeId) {
      cy.getElementById(currentFlowNodeId).addClass('current')
    }

    const primaryFocus = focusNodeId || selectedLocalNodeId

    if (primaryFocus) {
      const node = cy.getElementById(primaryFocus)
      if (node.length) {
        const neighborhood = focusNodeId ? node.closedNeighborhood() : node
        node.addClass('selected')
        neighborhood.addClass('linked')
        cy.elements().difference(neighborhood).addClass('dimmed')
        cy.animate({ fit: { eles: focusNodeId ? neighborhood : node.closedNeighborhood(), padding: 96 }, duration: 260 })
      }
    }
  }, [currentFlowNodeId, focusNodeId, selectedLocalNodeId])

  const resetView = useCallback(() => {
    cyRef.current?.fit(null, 52)
  }, [])

  const zoomBy = useCallback((factor) => {
    const cy = cyRef.current
    if (!cy) return
    cy.zoom({
      level: cy.zoom() * factor,
      renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
    })
  }, [])

  const focusCurrent = useCallback(() => {
    const cy = cyRef.current
    if (!cy || !currentFlowNodeId) return
    const node = cy.getElementById(currentFlowNodeId)
    if (node.length) cy.animate({ fit: { eles: node.closedNeighborhood(), padding: 90 }, duration: 260 })
  }, [currentFlowNodeId])

  useEffect(() => {
    const handleFullscreenChange = () => {
      const fullscreen = document.fullscreenElement === rootRef.current
      setIsGraphFullscreen(fullscreen)
      window.requestAnimationFrame(() => {
        cyRef.current?.resize()
        cyRef.current?.fit(null, 52)
      })
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const toggleGraphFullscreen = useCallback(async () => {
    if (document.fullscreenElement === rootRef.current) {
      await document.exitFullscreen()
      return
    }

    await rootRef.current?.requestFullscreen()
  }, [])

  return (
    <div ref={rootRef} className="architecture-simple-graph">
      <div className="architecture-simple-toolbar">
        <div>
          <strong>{expandedFlow?.label || 'Architecture Graph'}</strong>
          <span>{expandedFlow?.expandedNodeCount || 0} nodes · simple 2D graph</span>
        </div>
      </div>
      <div className="architecture-simple-actions" aria-label="Architecture graph controls">
        {currentFlowNodeId && (
          <button className="graph-control-btn" onClick={focusCurrent} title="Focus Current Step">
            <Target size={15} />
            <span>Focus</span>
          </button>
        )}
        <button className="graph-control-btn" onClick={() => zoomBy(1.25)} title="Zoom In" aria-label="Zoom in" disabled={!expandedFlow?.visibleNodes?.length}>
          <ZoomIn size={15} />
          <span>Zoom In</span>
        </button>
        <button className="graph-control-btn" onClick={() => zoomBy(0.75)} title="Zoom Out" aria-label="Zoom out" disabled={!expandedFlow?.visibleNodes?.length}>
          <ZoomOut size={15} />
          <span>Zoom Out</span>
        </button>
        <button className="graph-control-btn" onClick={resetView} title="Reset View" aria-label="Reset view" disabled={!expandedFlow?.visibleNodes?.length}>
          <RotateCcw size={15} />
          <span>Reset</span>
        </button>
        <button
          className="graph-control-btn"
          onClick={toggleGraphFullscreen}
          title={isGraphFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          aria-label={isGraphFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        >
          {isGraphFullscreen ? <Shrink size={15} /> : <Expand size={15} />}
          <span>{isGraphFullscreen ? 'Exit' : 'Fullscreen'}</span>
        </button>
      </div>
      {expandedFlow?.visibleNodes?.length ? (
        <div ref={containerRef} className="architecture-simple-canvas" />
      ) : (
        <div className="empty-state"><p>Select a flow to view architecture graph.</p></div>
      )}
    </div>
  )
}
