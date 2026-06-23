import { useEffect, useRef, useCallback } from 'react'
import cytoscape from 'cytoscape'
import fcose from 'cytoscape-fcose'
import { Maximize, ZoomIn, ZoomOut, Target } from 'lucide-react'

cytoscape.use(fcose)

function nodeShape(nodeType) {
  if (nodeType === 'folder') return 'round-rectangle'
  return nodeType === 'important' ? 'diamond' : 'ellipse'
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

  // Initialize and update graph nodes/edges
  useEffect(() => {
    if (!containerRef.current || graph.nodes.length === 0) return

    const nodes = graph.nodes.map((node) => {
      // Make important nodes larger
      const baseScale = node.type === 'important' ? 1.4 : 1.0;
      const size = Math.max(12, (node.renderedSize || node.size || 12)) * baseScale;
      return {
        data: {
          id: node.id,
          label: node.label,
          path: node.path || node.label,
          type: node.type,
          size: size,
          color: node.color || '#ededed',
          shape: nodeShape(node.type),
          // Important nodes have slight glow via shadow
          shadowBlur: node.type === 'important' ? 12 : 0,
          shadowOpacity: node.type === 'important' ? 0.6 : 0,
        },
        classes: node.type,
      }
    })

    const edges = graph.edges.map((edge, index) => ({
      data: {
        id: `${edge.source}-${edge.target}-${index}`,
        source: edge.source,
        target: edge.target,
        type: edge.type,
      },
      classes: edge.type,
    }))

    const cy = cytoscape({
      container: containerRef.current,
      minZoom: 0.2,
      maxZoom: 3,
      wheelSensitivity: 0.2,
      elements: [...nodes, ...edges],
      style: [
        {
          selector: 'node',
          style: {
            label: 'data(label)',
            'font-size': 10,
            color: '#a1a1aa',
            'text-background-color': '#0a0a0a',
            'text-background-opacity': 1,
            'text-background-padding': 2,
            'text-valign': 'bottom',
            'text-margin-y': 4,
            width: 'data(size)',
            height: 'data(size)',
            shape: 'data(shape)',
            'background-color': 'data(color)',
            'border-width': 1,
            'border-color': '#2a2a2a',
            'shadow-blur': 'data(shadowBlur)',
            'shadow-color': 'data(color)',
            'shadow-opacity': 'data(shadowOpacity)',
          },
        },
        {
          selector: 'node.dimmed',
          style: { opacity: 0.2 },
        },
        {
          selector: 'node.selected',
          style: {
            'border-width': 2,
            'border-color': '#ffffff',
            color: '#ffffff',
          },
        },
        {
          selector: 'node.hovered',
          style: {
            'border-width': 2,
            'border-color': '#ffffff',
          },
        },
        {
          selector: 'edge',
          style: {
            width: 1,
            'line-color': '#3b82f6', // Initial Blue
            'target-arrow-color': '#3b82f6',
            'curve-style': 'bezier',
            opacity: 0.6,
          },
        },
        {
          selector: 'edge.dependency',
          style: {
            'line-style': 'dashed',
            'line-color': '#3b82f6', // Initial Blue
            'target-arrow-color': '#3b82f6',
          },
        },
        {
          selector: 'edge.linked',
          style: {
            width: 2,
            opacity: 0.9,
          },
        },
        {
          selector: 'edge.linked.dependency',
          style: {
            'line-color': '#ef4444', // Red Highlight
            'target-arrow-color': '#ef4444',
          },
        },
        {
          selector: 'edge.linked:not(.dependency)',
          style: {
            'line-color': '#ef4444', // Red Highlight
            'target-arrow-color': '#ef4444',
          },
        },
        {
          selector: 'edge.dimmed',
          style: { opacity: 0.15 },
        }
      ],
    })

    cy.on('tap', 'node', (event) => {
      const node = event.target
      if (!node || typeof node.id !== 'function') return
      onSelect(node.id())
    })
    
    cy.on('mouseover', 'node', (event) => {
      const node = event.target
      if (!node || typeof node.id !== 'function') return
      onHover(node.id())
    })
    
    cy.on('mouseout', 'node', () => {
      onHover('')
    })

    cy.layout({
      name: 'fcose',
      animate: false,
      fit: true,
      padding: 40,
      nodeRepulsion: 8000,
      idealEdgeLength: (edge) => (edge.data('type') === 'dependency' ? 80 : 50),
      gravity: 0.2,
      numIter: 1000,
      randomize: true,
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
          // Add soft highlight to neighbors without dimming the rest completely
          node.closedNeighborhood().addClass('linked')
        }
      }
    }
  }, [selectedNodeId, hoveredNodeId])

  const handleResetView = useCallback(() => {
    if (cyRef.current) cyRef.current.fit(null, 40)
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
          fit: { eles: node.closedNeighborhood(), padding: 50 },
          duration: 300
        })
      }
    }
  }, [selectedNodeId])

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', background: 'transparent' }} />
      <div style={{
        position: 'absolute',
        bottom: '16px',
        right: '16px',
        display: 'flex',
        gap: '8px',
        zIndex: 10,
      }}>
        {selectedNodeId && (
          <button 
            onClick={handleFocusSelected}
            className="graph-control-btn"
            title="Focus Selected"
          >
            <Target size={14} />
          </button>
        )}
        <div style={{ display: 'flex', background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}>
          <button onClick={handleZoomIn} className="graph-control-btn border-right" title="Zoom In">
            <ZoomIn size={14} />
          </button>
          <button onClick={handleResetView} className="graph-control-btn border-right" title="Reset View">
            <Maximize size={14} />
          </button>
          <button onClick={handleZoomOut} className="graph-control-btn" title="Zoom Out">
            <ZoomOut size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
