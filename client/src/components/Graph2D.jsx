import { useEffect, useMemo, useRef, useCallback } from 'react'
import cytoscape from 'cytoscape'
import fcose from 'cytoscape-fcose'
import { Maximize, ZoomIn, ZoomOut, Target } from 'lucide-react'
import { VIZ_PALETTE } from '../graph-utils'
import { GraphNodeReadout } from './GraphNodeReadout'

cytoscape.use(fcose)

/* Structure is encoded in the shape, language in the colour:
     folder  → rounded square   file → circle   key module → diamond
   The legend in App.jsx explains the same key. */
function nodeShape(nodeType) {
  if (nodeType === 'folder') return 'round-rectangle'
  return nodeType === 'important' ? 'diamond' : 'ellipse'
}

function edgeClass(type) {
  if (type === 'dependency') return 'dependency'
  if (type === 'hierarchy') return 'hierarchy'
  return 'semantic'
}

export function Graph2D({
  graph,
  selectedNodeId,
  hoveredNodeId,
  onHover,
  onSelect,
}) {
  const containerRef = useRef(null)
  const cyRef = useRef(null)

  // The cytoscape instance must only be rebuilt when the graph itself changes,
  // so the callbacks are read through refs rather than listed as dependencies —
  // an inline handler in the parent would otherwise tear the graph down on
  // every render and reshuffle the layout.
  const onHoverRef = useRef(onHover)
  const onSelectRef = useRef(onSelect)
  useEffect(() => { onHoverRef.current = onHover }, [onHover])
  useEffect(() => { onSelectRef.current = onSelect }, [onSelect])

  const nodeById = useMemo(() => {
    const map = new Map()
    graph.nodes.forEach((node) => map.set(node.id, node))
    return map
  }, [graph])

  const connectionCounts = useMemo(() => {
    const counts = new Map()
    graph.edges.forEach((edge) => {
      counts.set(edge.source, (counts.get(edge.source) || 0) + 1)
      counts.set(edge.target, (counts.get(edge.target) || 0) + 1)
    })
    return counts
  }, [graph])

  // Initialize and update graph nodes/edges
  useEffect(() => {
    if (!containerRef.current || graph.nodes.length === 0) return

    const colorById = new Map()
    graph.nodes.forEach((node) => {
      colorById.set(node.id, node.color || VIZ_PALETTE.neutral)
    })

    const nodes = graph.nodes.map((node) => {
      // Important nodes read as the hubs of the map.
      const baseScale = node.type === 'important' ? 1.4 : 1.0
      const size = Math.max(12, (node.renderedSize || node.size || 12)) * baseScale
      return {
        data: {
          id: node.id,
          label: node.label,
          path: node.path || node.label,
          type: node.type,
          size,
          color: node.color || VIZ_PALETTE.neutral,
          shape: nodeShape(node.type),
        },
        classes: [node.type, node.status].filter(Boolean).join(' '),
      }
    })

    const edges = graph.edges.map((edge, index) => ({
      data: {
        id: `${edge.source}-${edge.target}-${index}`,
        source: edge.source,
        target: edge.target,
        type: edge.type,
        // Dependency edges inherit the *source* colour so a file's imports can
        // be traced by eye without hovering every one of them.
        color: colorById.get(edge.source) || VIZ_PALETTE.blue,
      },
      classes: edgeClass(edge.type),
    }))

    const cy = cytoscape({
      container: containerRef.current,
      minZoom: 0.15,
      maxZoom: 4,
      wheelSensitivity: 0.2,
      elements: [...nodes, ...edges],
      style: [
        {
          selector: 'node',
          style: {
            label: 'data(label)',
            'font-size': 10,
            'font-weight': 600,
            'font-family': 'JetBrains Mono, ui-monospace, monospace',
            color: '#111111',
            // Neo-brutalist labels: ink text on an opaque white pill with an
            // ink outline, matching the cards everywhere else in the app.
            'text-background-color': '#ffffff',
            'text-background-opacity': 1,
            'text-background-padding': 3,
            'text-border-width': 1,
            'text-border-color': '#111111',
            'text-border-opacity': 1,
            'text-valign': 'bottom',
            'text-margin-y': 4,
            'text-max-width': '92px',
            'text-wrap': 'ellipsis',
            'text-overflow-wrap': 'anywhere',
            // The single biggest readability win on a 300-node map: labels that
            // would render below 6px are dropped instead of smearing together.
            'min-zoomed-font-size': 6,
            width: 'data(size)',
            height: 'data(size)',
            shape: 'data(shape)',
            'background-color': 'data(color)',
            'background-opacity': 1,
            'border-width': 2,
            'border-color': '#111111',
            'border-opacity': 1,
            'z-index': 10,
          },
        },
        {
          selector: 'node.folder',
          style: { 'border-width': 2 },
        },
        {
          selector: 'node.important',
          style: { 'border-width': 3, 'z-index': 20 },
        },
        {
          // Dead code: dashed ink outline instead of a colour change, so the
          // language colour still reads.
          selector: 'node.dead',
          style: { 'border-style': 'dashed', 'border-color': '#57534a' },
        },
        {
          selector: 'node.broken',
          style: { 'border-color': '#b91c1c', 'border-width': 3, 'z-index': 22 },
        },
        {
          // Focus mode: everything outside the selected neighbourhood becomes a
          // ghost. Still present as context, impossible to confuse with the
          // thing you actually clicked.
          selector: 'node.dimmed',
          style: { opacity: 0.08, 'z-index': 1 },
        },
        {
          selector: 'node.linked',
          style: { 'border-width': 3, 'z-index': 18 },
        },
        {
          selector: 'node.selected',
          style: {
            'border-width': 3,
            'border-color': '#111111',
            'overlay-color': '#111111',
            'overlay-opacity': 0.14,
            'overlay-padding': 9,
            'z-index': 40,
          },
        },
        {
          selector: 'node.hovered',
          style: {
            'border-width': 3,
            'border-color': '#111111',
            'overlay-color': '#111111',
            'overlay-opacity': 0.08,
            'overlay-padding': 7,
            'z-index': 35,
          },
        },
        {
          selector: 'edge',
          style: {
            width: 1,
            'line-color': 'data(color)',
            'target-arrow-color': 'data(color)',
            'target-arrow-shape': 'triangle',
            'arrow-scale': 0.7,
            'curve-style': 'bezier',
            opacity: 0.4,
            'z-index': 2,
          },
        },
        {
          // "contains" — folder structure, not a real import. Kept faint and
          // arrow-less so the dependency graph stays the thing you read.
          selector: 'edge.hierarchy',
          style: {
            'line-style': 'dashed',
            'line-color': '#b8b0a2',
            'target-arrow-shape': 'none',
            width: 1,
            opacity: 0.5,
            'z-index': 1,
          },
        },
        {
          selector: 'edge.dependency',
          style: { 'line-style': 'solid', opacity: 0.5, 'z-index': 3 },
        },
        {
          selector: 'edge.semantic',
          style: { 'line-style': 'dotted', opacity: 0.45, 'z-index': 3 },
        },
        {
          // The traced neighbourhood is redrawn in ink so the path is
          // unmistakable against the coloured field.
          selector: 'edge.linked',
          style: {
            'line-color': '#111111',
            'target-arrow-color': '#111111',
            'line-style': 'solid',
            width: 2.4,
            opacity: 1,
            'arrow-scale': 1,
            'z-index': 30,
          },
        },
        {
          selector: 'edge.dimmed',
          style: { opacity: 0.04, 'z-index': 1 },
        },
      ],
    })

    cy.on('tap', 'node', (event) => {
      const node = event.target
      if (!node || typeof node.id !== 'function') return
      onSelectRef.current(node.id())
    })

    cy.on('mouseover', 'node', (event) => {
      const node = event.target
      if (!node || typeof node.id !== 'function') return
      onHoverRef.current(node.id())
    })

    cy.on('mouseout', 'node', () => {
      onHoverRef.current('')
    })

    cy.layout({
      name: 'fcose',
      animate: false,
      fit: true,
      padding: 46,
      // `randomize: false` keeps the map stable between renders — a layout that
      // reshuffles on every mount is impossible to build a mental model of.
      randomize: false,
      quality: 'default',
      // Reserving room for the label pills is what stops 300 names overlapping.
      nodeDimensionsIncludeLabels: true,
      nodeRepulsion: 12000,
      idealEdgeLength: (edge) => (edge.data('type') === 'dependency' ? 100 : 65),
      gravity: 0.22,
      nodeSeparation: 110,
      packComponents: true,
      tile: true,
      numIter: 800,
    }).run()

    cyRef.current = cy

    return () => {
      cy.destroy()
      cyRef.current = null
    }
  }, [graph])

  // Handle Selection and Hover States without rebuilding graph
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return

    cy.elements().removeClass('selected hovered dimmed linked')

    if (selectedNodeId) {
      const node = cy.getElementById(selectedNodeId)
      if (node.length) {
        node.addClass('selected')
        const neighbors = node.closedNeighborhood()
        neighbors.addClass('linked')
        cy.elements().difference(neighbors).addClass('dimmed')
      }
    }

    if (hoveredNodeId && hoveredNodeId !== selectedNodeId) {
      const node = cy.getElementById(hoveredNodeId)
      if (node.length) {
        node.addClass('hovered')
        if (!selectedNodeId) {
          // Highlight the neighbourhood without blacking out the rest.
          node.closedNeighborhood().addClass('linked')
        }
      }
    }
  }, [selectedNodeId, hoveredNodeId])

  const handleResetView = useCallback(() => {
    if (cyRef.current) cyRef.current.fit(null, 46)
  }, [])

  const handleZoomIn = useCallback(() => {
    if (cyRef.current) {
      cyRef.current.zoom({
        level: cyRef.current.zoom() * 1.3,
        renderedPosition: { x: cyRef.current.width() / 2, y: cyRef.current.height() / 2 }
      })
    }
  }, [])

  const handleZoomOut = useCallback(() => {
    if (cyRef.current) {
      cyRef.current.zoom({
        level: cyRef.current.zoom() * 0.7,
        renderedPosition: { x: cyRef.current.width() / 2, y: cyRef.current.height() / 2 }
      })
    }
  }, [])

  const handleFocusSelected = useCallback(() => {
    if (cyRef.current && selectedNodeId) {
      const node = cyRef.current.getElementById(selectedNodeId)
      if (node.length) {
        cyRef.current.animate({
          fit: { eles: node.closedNeighborhood(), padding: 60 },
          duration: 300
        })
      }
    }
  }, [selectedNodeId])

  const readoutNode = nodeById.get(hoveredNodeId) || nodeById.get(selectedNodeId)

  return (
    <div className="graph-2d-shell">
      <div ref={containerRef} className="graph-2d-canvas" />

      <GraphNodeReadout
        node={readoutNode}
        connectionCount={readoutNode ? connectionCounts.get(readoutNode.id) : undefined}
      />

      <div className="graph-controls" aria-label="Repository graph controls">
        {selectedNodeId && (
          <button
            onClick={handleFocusSelected}
            className="graph-control-btn"
            title="Focus selected neighbourhood"
            aria-label="Focus selected neighbourhood"
          >
            <Target size={14} />
          </button>
        )}
        <div className="graph-control-cluster">
          <button onClick={handleZoomIn} className="graph-control-btn border-right" title="Zoom in" aria-label="Zoom in">
            <ZoomIn size={14} />
          </button>
          <button onClick={handleResetView} className="graph-control-btn border-right" title="Fit graph to view" aria-label="Fit graph to view">
            <Maximize size={14} />
          </button>
          <button onClick={handleZoomOut} className="graph-control-btn" title="Zoom out" aria-label="Zoom out">
            <ZoomOut size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
