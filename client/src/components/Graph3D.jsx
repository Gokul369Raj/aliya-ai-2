import { useEffect, useMemo, useRef, useCallback, useState } from 'react'
import ForceGraph3D from 'react-force-graph-3d'
import SpriteText from 'three-spritetext'
import * as THREE from 'three'
import { Maximize, ZoomIn, ZoomOut, Target } from 'lucide-react'

// Edge specific palette
const EDGE_COLORS = {
  dependency: '#3b82f6', // Initial Blue
  hierarchy: '#3b82f6', // Initial Blue
  dimmed: '#18181b',
  linkedDependency: '#ef4444', // Red Highlight
  linkedHierarchy: '#ef4444', // Red Highlight
}

function getNodeColor(node) {
  if (typeof node?.color === 'string' && node.color.trim()) {
    return node.color
  }

  const language = typeof node?.language === 'string' ? node.language.toLowerCase() : ''
  if (language) {
    const fallbackByLanguage = {
      javascript: '#f59e0b',
      typescript: '#3b82f6',
      python: '#22c55e',
      css: '#ec4899',
      html: '#f97316',
      markdown: '#8b5cf6',
      json: '#10b981',
      yaml: '#14b8a6',
      shell: '#64748b',
      plaintext: '#94a3b8',
      unknown: '#6b7280',
    }

    if (fallbackByLanguage[language]) {
      return fallbackByLanguage[language]
    }
  }

  return '#60a5fa'
}

function getNodeId(nodeRef) {
  return typeof nodeRef === 'object' ? nodeRef?.id : nodeRef
}

function createSeededPositions(nodes) {
  const groups = new Map()

  nodes.forEach((node) => {
    const depthKey = Number.isFinite(node?.depth) ? node.depth : 0
    if (!groups.has(depthKey)) {
      groups.set(depthKey, [])
    }
    groups.get(depthKey).push(node)
  })

  const orderedDepths = [...groups.keys()].sort((left, right) => left - right)
  const depthMidpoint = (orderedDepths.length - 1) / 2
  const seeded = new Map()

  orderedDepths.forEach((depthKey, depthIndex) => {
    const nodesAtDepth = groups
      .get(depthKey)
      .slice()
      .sort((left, right) => {
        const importanceDelta = (right.importance || 0) - (left.importance || 0)
        if (importanceDelta !== 0) return importanceDelta
        return String(left.label || left.path || left.id).localeCompare(String(right.label || right.path || right.id))
      })

    const baseRadius = 28 + depthIndex * 32
    const verticalOffset = (depthIndex - depthMidpoint) * 36

    nodesAtDepth.forEach((node, index) => {
      const angle = (index / Math.max(nodesAtDepth.length, 1)) * Math.PI * 2
      const radius = baseRadius + (index % 5) * 8
      const x = Math.cos(angle) * radius
      const y = verticalOffset + (((index % 3) - 1) * 10)
      const z = ((index % 5) - 2) * (node.type === 'folder' ? 2 : 6)

      seeded.set(node.id, { x, y, z })
    })
  })

  return seeded
}

function centerPositions(nodes) {
  if (!nodes.length) return nodes

  const center = nodes.reduce((acc, node) => ({
    x: acc.x + (Number.isFinite(node.x) ? node.x : 0),
    y: acc.y + (Number.isFinite(node.y) ? node.y : 0),
    z: acc.z + (Number.isFinite(node.z) ? node.z : 0),
  }), { x: 0, y: 0, z: 0 })

  center.x /= nodes.length
  center.y /= nodes.length
  center.z /= nodes.length

  return nodes.map((node) => ({
    ...node,
    x: (Number.isFinite(node.x) ? node.x : 0) - center.x,
    y: (Number.isFinite(node.y) ? node.y : 0) - center.y,
    z: (Number.isFinite(node.z) ? node.z : 0) - center.z,
  }))
}

export function Graph3D({
  graph,
  selectedNodeId,
  hoveredNodeId,
  activeFlow,
  onHover,
  onSelect,
}) {
  const graphRef = useRef(null)
  const containerRef = useRef(null)
  const initialFitRef = useRef(false)
  const [isStable, setIsStable] = useState(false)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver(entries => {
      if (entries[0]) {
        setDimensions({
          width: entries[0].contentRect.width,
          height: entries[0].contentRect.height
        })
      }
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  const graphData = useMemo(() => {
    const seededPositions = createSeededPositions(graph.nodes)

    return {
      nodes: centerPositions(graph.nodes.map((node) => {
        const seeded = seededPositions.get(node.id) || { x: 0, y: 0, z: 0 }
        return {
          ...node,
          x: Number.isFinite(node.x) ? node.x : seeded.x,
          y: Number.isFinite(node.y) ? node.y : seeded.y,
          z: Number.isFinite(node.z) ? node.z : seeded.z,
        }
      })),
      links: graph.edges.map((edge) => ({ ...edge })),
    }
  }, [graph])

  const nodeObjectsRef = useRef(new Map())

  const selectionState = useMemo(() => {
    const linkedNodes = new Set()
    const linkedLinks = new Set()
    const linkedLinkKeys = new Set()

    if (!selectedNodeId) {
      return { linkedNodes, linkedLinks, linkedLinkKeys }
    }

    linkedNodes.add(selectedNodeId)

    graphData.links.forEach(link => {
      const srcId = getNodeId(link.source)
      const tgtId = getNodeId(link.target)

      if (srcId === selectedNodeId || tgtId === selectedNodeId) {
        linkedNodes.add(srcId)
        linkedNodes.add(tgtId)
        linkedLinks.add(link)
        linkedLinkKeys.add(`${srcId}->${tgtId}`)
        linkedLinkKeys.add(`${tgtId}->${srcId}`)
      }
    })

    return { linkedNodes, linkedLinks, linkedLinkKeys }
  }, [graphData, selectedNodeId])

  const flowState = useMemo(() => {
    const flowEdges = new Set()

    if (Array.isArray(activeFlow?.edgeKeys) && activeFlow.edgeKeys.length) {
      activeFlow.edgeKeys.forEach((edgeKey) => {
        flowEdges.add(edgeKey)
      })
    } else if (activeFlow?.nodes?.length > 1) {
      for (let index = 0; index < activeFlow.nodes.length - 1; index += 1) {
        const sourceId = activeFlow.nodes[index]
        const targetId = activeFlow.nodes[index + 1]
        flowEdges.add(`${sourceId}->${targetId}`)
        flowEdges.add(`${targetId}->${sourceId}`)
      }
    }

    return { flowEdges }
  }, [activeFlow])

  useEffect(() => {
    const instance = graphRef.current
    if (!instance) return

    const charge = instance.d3Force('charge')
    if (charge) {
      charge.strength(-64)
      charge.distanceMax(360)
    }

    const linkForce = instance.d3Force('link')
    if (linkForce) {
      linkForce.distance((link) => (link.type === 'dependency' ? 54 : 32))
      linkForce.strength((link) => (link.type === 'dependency' ? 0.16 : 0.52))
    }
  }, [graphData])

  useEffect(() => {
    // Add ultra-smooth damping to OrbitControls for lag-free trackpad scrolling
    const timer = setTimeout(() => {
      if (graphRef.current) {
        const controls = graphRef.current.controls()
        if (controls) {
          controls.enableDamping = true
          controls.dampingFactor = 0.15
          controls.zoomSpeed = 1.8
          controls.panSpeed = 1.2
        }
      }
    }, 200)
    return () => clearTimeout(timer)
  }, [dimensions.width, dimensions.height])

  useEffect(() => {
    initialFitRef.current = false
    setIsStable(false)
  }, [graphData.nodes.length])

  useEffect(() => {
    graphData.nodes.forEach(node => {
      const obj = nodeObjectsRef.current.get(node.id)
      if (!obj) return

      const mesh = obj.userData.coreMesh
      const label = obj.userData.labelSprite
      const glowMesh = obj.userData.glowMesh

      if (!mesh || !label || !glowMesh) return

      const isLinkedToSelected = selectedNodeId ? selectionState.linkedNodes.has(node.id) : false
      const isSelected = node.id === selectedNodeId
      const isHovered = node.id === hoveredNodeId
      const isBroken = node.status === 'broken'
      const isDead = node.status === 'dead'
      
      const isInFlow = activeFlow ? activeFlow.nodes.includes(node.id) : false
      const isCurrentFlowStep = activeFlow && activeFlow.currentIndex >= 0 && activeFlow.currentIndex < activeFlow.nodes.length 
        ? activeFlow.nodes[activeFlow.currentIndex] === node.id 
        : false

      const isDimmed = activeFlow ? !isInFlow : (selectedNodeId ? !isLinkedToSelected : false)
      const safeColor = getNodeColor(node)

      mesh.material.opacity = isDimmed ? 0.08 : (node.type === 'important' ? 1.0 : 0.92)
      
      const baseColorObj = mesh.userData.baseColor || new THREE.Color(safeColor)
      const dimmedColor = mesh.userData.dimmedColor || new THREE.Color('#111111')

      // Connected nodes and selected node should glow
      if (isCurrentFlowStep) {
        mesh.material.emissiveIntensity = 2.8
        mesh.material.emissive.setHex(0x00ffff)
        mesh.scale.set(1.55, 1.55, 1.55)
        glowMesh.material.color.setHex(0x22d3ee)
        glowMesh.material.opacity = 0.95
        glowMesh.scale.set(2.2, 2.2, 2.2)
      } else if (isInFlow) {
        mesh.material.emissiveIntensity = 1.35
        mesh.material.emissive.setHex(0x0ea5e9)
        mesh.scale.set(1.18, 1.18, 1.18)
        glowMesh.material.color.setHex(0x38bdf8)
        glowMesh.material.opacity = 0.52
        glowMesh.scale.set(1.6, 1.6, 1.6)
      } else if (isSelected || (selectedNodeId && isLinkedToSelected)) {
        mesh.material.emissiveIntensity = isSelected ? 2.1 : 1.2
        mesh.material.emissive.copy(baseColorObj)
        mesh.scale.set(isSelected ? 1.32 : 1.12, isSelected ? 1.32 : 1.12, isSelected ? 1.32 : 1.12)
        glowMesh.material.color.copy(baseColorObj)
        glowMesh.material.opacity = isSelected ? 0.82 : 0.42
        glowMesh.scale.set(isSelected ? 2.05 : 1.48, isSelected ? 2.05 : 1.48, isSelected ? 2.05 : 1.48)
      } else if (isHovered) {
        mesh.material.emissiveIntensity = 0.75
        mesh.material.emissive.copy(baseColorObj)
        mesh.scale.set(1.2, 1.2, 1.2)
        glowMesh.material.color.copy(baseColorObj)
        glowMesh.material.opacity = 0.26
        glowMesh.scale.set(1.42, 1.42, 1.42)
      } else if (isBroken) {
        mesh.material.emissiveIntensity = 1.25
        mesh.material.emissive.setHex(0xef4444)
        mesh.scale.set(1.08, 1.08, 1.08)
        glowMesh.material.color.setHex(0xef4444)
        glowMesh.material.opacity = 0.35
        glowMesh.scale.set(1.45, 1.45, 1.45)
      } else if (isDead) {
        mesh.material.emissiveIntensity = 0.04
        mesh.material.emissive.setHex(0x6b7280)
        mesh.scale.set(0.94, 0.94, 0.94)
        glowMesh.material.color.setHex(0x6b7280)
        glowMesh.material.opacity = 0.04
        glowMesh.scale.set(1.04, 1.04, 1.04)
      } else if (isDimmed) {
        mesh.material.emissiveIntensity = 0.02
        mesh.material.emissive.copy(dimmedColor)
        mesh.scale.set(0.96, 0.96, 0.96)
        glowMesh.material.color.copy(dimmedColor)
        glowMesh.material.opacity = 0.015
        glowMesh.scale.set(1, 1, 1)
      } else {
        mesh.material.emissiveIntensity = node.type === 'important' ? 0.3 : 0.12
        mesh.material.emissive.copy(baseColorObj)
        mesh.scale.set(1.0, 1.0, 1.0)
        glowMesh.material.color.copy(baseColorObj)
        glowMesh.material.opacity = node.type === 'important' ? 0.18 : 0.08
        glowMesh.scale.set(1.12, 1.12, 1.12)
      }
      
      if (label) {
        if (isCurrentFlowStep || isInFlow || isSelected || isHovered || (selectedNodeId && isLinkedToSelected)) {
          label.color = isCurrentFlowStep ? '#06b6d4' : '#ffffff'
        } else if (isBroken) {
          label.color = '#fca5a5'
        } else if (isDead) {
          label.color = '#9ca3af'
        } else if (isDimmed) {
          label.color = '#111111'
        } else {
          label.color = '#a1a1aa'
        }
      }
    })

    if (graphRef.current) {
      graphData.links.forEach(link => {
        const srcId = getNodeId(link.source)
        const tgtId = getNodeId(link.target)
        link._isLinked = selectedNodeId ? selectionState.linkedLinks.has(link) : false
        
        link._isFlowEdge = activeFlow ? flowState.flowEdges.has(`${srcId}->${tgtId}`) : false
        link._isDimmed = activeFlow ? !link._isFlowEdge : (selectedNodeId ? !selectionState.linkedLinks.has(link) : false)
        
        if (activeFlow && activeFlow.currentIndex >= 0 && activeFlow.currentIndex < activeFlow.nodes.length - 1) {
           const curr = activeFlow.nodes[activeFlow.currentIndex]
           const next = activeFlow.nodes[activeFlow.currentIndex + 1]
           link._isCurrentFlowEdge = (srcId === curr && tgtId === next) || (tgtId === curr && srcId === next)
        } else {
           link._isCurrentFlowEdge = false
        }
      })
    }
  }, [selectedNodeId, hoveredNodeId, graphData, activeFlow, selectionState, flowState])

  const buildNodeObject = useCallback((node) => {
    // Make important nodes slightly bigger
    const baseScale = node.type === 'important' ? 0.4 : 0.25
    const size = Math.max(2, (node.size || 10) * baseScale)
    const group = new THREE.Group()

    const geometry = node.type === 'folder'
      ? new THREE.BoxGeometry(size, size, size)
      : new THREE.SphereGeometry(size, 16, 16)

    // Use the color assigned from our color system
    const baseColor = getNodeColor(node)

    const material = new THREE.MeshStandardMaterial({
      color: baseColor,
      emissive: baseColor,
      emissiveIntensity: node.type === 'important' ? 0.3 : 0.1,
      transparent: true,
      opacity: node.type === 'important' ? 1.0 : 0.9,
      roughness: 0.3,
    })

    const mesh = new THREE.Mesh(geometry, material)
    mesh.userData.baseColor = new THREE.Color(baseColor)
    group.add(mesh)

    const labelText = node.status === 'dead'
      ? `${node.label || node.path} · unused`
      : node.status === 'broken'
        ? `${node.label || node.path} · risk`
        : (node.label || node.path)
    const label = new SpriteText(labelText)
    label.color = 'rgba(255, 255, 255, 0.95)'
    label.textHeight = node.type === 'important' ? 3.5 : 2.5
    label.backgroundColor = 'rgba(10, 10, 10, 0.7)'
    label.padding = 2
    label.borderRadius = 2
    label.position.set(0, size + 3.5, 0)
    group.add(label)

    const glowGeo = new THREE.SphereGeometry(size * 1.55, 16, 16)
    const glowMat = new THREE.MeshBasicMaterial({
      color: baseColor,
      transparent: true,
      opacity: node.type === 'important' ? 0.18 : 0.08,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const glowMesh = new THREE.Mesh(glowGeo, glowMat)
    group.add(glowMesh)

    group.userData.coreMesh = mesh
    group.userData.labelSprite = label
    group.userData.glowMesh = glowMesh

    nodeObjectsRef.current.set(node.id, group)
    mesh.userData.dimmedColor = new THREE.Color('#111111')
    return group
  }, [])

  const handleEngineStop = useCallback(() => {
    setIsStable(true)
    if (!initialFitRef.current && graphRef.current) {
      graphRef.current.zoomToFit(600, 30)
      initialFitRef.current = true
    }
  }, [])

  const handleResetView = useCallback(() => {
    if (graphRef.current) {
      graphRef.current.zoomToFit(800, 30)
    }
  }, [])

  const handleZoomIn = useCallback(() => {
    if (graphRef.current) {
      const camera = graphRef.current.camera()
      const direction = new THREE.Vector3()
      camera.getWorldDirection(direction)
      const dist = camera.position.length()
      const step = Math.max(50, dist * 0.4)
      const newPos = camera.position.clone().add(direction.multiplyScalar(step))
      graphRef.current.cameraPosition(newPos, null, 300)
    }
  }, [])

  const handleZoomOut = useCallback(() => {
    if (graphRef.current) {
      const camera = graphRef.current.camera()
      const direction = new THREE.Vector3()
      camera.getWorldDirection(direction)
      const dist = camera.position.length()
      const step = Math.max(50, dist * 0.4)
      const newPos = camera.position.clone().sub(direction.multiplyScalar(step))
      graphRef.current.cameraPosition(newPos, null, 300)
    }
  }, [])

  const handleFocusSelected = useCallback(() => {
    if (graphRef.current && selectedNodeId) {
      const targetNode = graphData.nodes.find(node => node.id === selectedNodeId)
      if (targetNode) {
        const distance = 120;
        const nodePos = new THREE.Vector3(targetNode.x || 0, targetNode.y || 0, targetNode.z || 0);
        const camPos = graphRef.current.camera().position.clone();

        let dir = new THREE.Vector3().subVectors(camPos, nodePos);
        if (dir.lengthSq() < 0.1) dir.set(0, 0, 1);
        dir.normalize();

        const newPos = nodePos.clone().add(dir.multiplyScalar(distance));
        graphRef.current.cameraPosition(newPos, targetNode, 1000);
      }
    }
  }, [selectedNodeId, graphData.nodes])

  useEffect(() => {
    // Camera Follow for Active Flow
    if (graphRef.current && activeFlow && activeFlow.currentIndex >= 0 && activeFlow.currentIndex < activeFlow.nodes.length) {
      const targetNodeId = activeFlow.nodes[activeFlow.currentIndex];
      const targetNode = graphData.nodes.find(node => node.id === targetNodeId);
      if (targetNode) {
        const distance = 90;
        const nodePos = new THREE.Vector3(targetNode.x || 0, targetNode.y || 0, targetNode.z || 0);
        
        // Cinematic camera angle: sweeping orbit around the architecture based on flow index
        const angle = (activeFlow.currentIndex * Math.PI) / 5; // Rotate 36 degrees per step
        const camPos = new THREE.Vector3(
          nodePos.x + Math.cos(angle) * distance, 
          nodePos.y - distance * 0.15, 
          nodePos.z + Math.sin(angle) * distance
        );
        
        // Slower, dramatic cinematic pan (2500ms)
        graphRef.current.cameraPosition(camPos, nodePos, 2500); 
      }
    }
  }, [activeFlow?.currentIndex, activeFlow?.nodes, graphData.nodes]);

  return (
    <div ref={containerRef} className="graph-shell">
      {dimensions.width > 0 && dimensions.height > 0 && (
        <ForceGraph3D
          className="graph-canvas"
          ref={graphRef}
          width={dimensions.width}
          height={dimensions.height}
          graphData={graphData}
          numDimensions={3}
          controlType="orbit"
          backgroundColor="#0a0a0a"
          nodeThreeObject={buildNodeObject}
          linkColor={(link) => {
            if (activeFlow) {
               if (link._isCurrentFlowEdge) return '#06b6d4';
               if (link._isFlowEdge) return '#0ea5e9';
               return EDGE_COLORS.dimmed;
            }
            if (link._isDimmed) return EDGE_COLORS.dimmed;
            if (link.type === 'dependency') return link._isLinked ? EDGE_COLORS.linkedDependency : EDGE_COLORS.dependency;
            return link._isLinked ? EDGE_COLORS.linkedHierarchy : EDGE_COLORS.hierarchy;
          }}
          linkOpacity={0.9}
          linkWidth={(link) => {
            if (activeFlow) return link._isCurrentFlowEdge ? 5.5 : (link._isFlowEdge ? 3 : 0.15)
            if (selectedNodeId) return link._isLinked ? 3.2 : 0.15
            return 0.8
          }}
          linkDirectionalParticles={link => {
            if (activeFlow) return link._isCurrentFlowEdge ? 6 : (link._isFlowEdge ? 3 : 1)
            if (selectedNodeId) return selectionState.linkedLinks.has(link) ? 5 : 1
            return 3
          }}
          linkDirectionalParticleSpeed={link => {
            if (activeFlow && link._isCurrentFlowEdge) return 0.015
            if (selectedNodeId && link._isLinked) return 0.01
            return 0.008
          }}
          linkDirectionalParticleWidth={link => {
            if (activeFlow && link._isCurrentFlowEdge) return 4.0
            if (selectedNodeId && link._isLinked) return 3.2
            return 2.0
          }}
          linkDirectionalParticleColor={() => '#06b6d4'}
          onNodeHover={(node) => {
            document.body.style.cursor = node ? 'pointer' : 'default'
            onHover(node?.id || '')
          }}
          onBackgroundClick={() => onSelect('')}
          onNodeClick={(node) => onSelect(node.id)}
          onNodeDrag={() => {
            graphRef.current?.d3ReheatSimulation()
          }}
          onNodeDragEnd={(node) => {
            node.fx = node.x
            node.fy = node.y
            node.fz = node.z
          }}
          cooldownTicks={120}
          warmupTicks={0}
          d3VelocityDecay={0.4}
          onEngineStop={handleEngineStop}
          showNavInfo={false}
          enablePointerInteraction
          nodeRelSize={2}
          enableNodeDrag
        />
      )}

      <div className="graph-controls" aria-label="Repository graph controls">
        {selectedNodeId && (
          <button
            onClick={handleFocusSelected}
            className="graph-control-btn"
            title="Focus Selected"
          >
            <Target size={14} />
          </button>
        )}
        <div className="graph-control-cluster">
          <button onClick={handleZoomIn} className="graph-control-btn border-right" title="Zoom In" aria-label="Zoom in">
            <ZoomIn size={14} />
          </button>
          <button onClick={handleResetView} className="graph-control-btn border-right" title="Reset View" aria-label="Reset view">
            <Maximize size={14} />
          </button>
          <button onClick={handleZoomOut} className="graph-control-btn" title="Zoom Out" aria-label="Zoom out">
            <ZoomOut size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
