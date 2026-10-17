import { useEffect, useMemo, useRef, useCallback, useState } from 'react'
import ForceGraph3D from 'react-force-graph-3d'
import SpriteText from 'three-spritetext'
import * as THREE from 'three'
import { Maximize, ZoomIn, ZoomOut, Target } from 'lucide-react'

import { VIZ_PALETTE, LANGUAGE_COLORS } from '../graph-utils'
import { GraphNodeReadout } from './GraphNodeReadout'

const CANVAS = '#f3eee7'
const INK = '#111111'

/* Edge palette. Two rules:
     • An import edge and a "folder contains file" edge must never look alike —
       one is the graph you actually read, the other is just scaffolding.
     • `dimmed` fades *toward* the paper canvas. A de-emphasised edge that is
       darker than a normal one draws more attention, not less. */
const EDGE_COLORS = {
  dependency: VIZ_PALETTE.blue,
  hierarchy: '#c9c2b4',
  semantic: VIZ_PALETTE.cyan,
  linked: '#111111',
  flow: VIZ_PALETTE.green,
  flowCurrent: VIZ_PALETTE.pink,
  dimmed: '#ded7cb',
}

/* ── Shared GPU resources ──────────────────────────────────────────────────
   Every node used to own its own geometry and two materials. On a 300-node
   graph that is 300 geometries and 600 materials — 600 shader compiles plus a
   transparency sort over the whole scene every frame, which is exactly what
   made the view stutter. Everything is cached and shared by key instead, and
   the emphasis pass only ever swaps a reference; it never mutates a material
   (mutating a shared material would recolour every node that shares it). */
const geometryCache = new Map()
const coreMaterialCache = new Map()
const ghostMaterialCache = new Map()

/* Outlines are keyed by state, so the whole graph needs six materials total
   instead of one per node. `dim` is the only transparent one. */
const OUTLINE_MATERIALS = {
  ink: new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }),
  flow: new THREE.MeshBasicMaterial({ color: EDGE_COLORS.flow, side: THREE.BackSide }),
  current: new THREE.MeshBasicMaterial({ color: EDGE_COLORS.flowCurrent, side: THREE.BackSide }),
  broken: new THREE.MeshBasicMaterial({ color: '#b91c1c', side: THREE.BackSide }),
  dead: new THREE.MeshBasicMaterial({ color: '#8a8175', side: THREE.BackSide }),
  dim: new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide, transparent: true, opacity: 0.05 }),
}

function shapeOf(node) {
  if (node?.type === 'folder') return 'folder'
  if (node?.type === 'important') return 'key'
  return 'file'
}

function getGeometry(shape, size) {
  // Sizes are rounded so near-identical nodes share one buffer.
  const key = `${shape}:${size.toFixed(1)}`
  let geometry = geometryCache.get(key)
  if (!geometry) {
    geometry = shape === 'folder'
      ? new THREE.BoxGeometry(size, size, size)
      : shape === 'key'
        ? new THREE.OctahedronGeometry(size)
        : new THREE.SphereGeometry(size, 12, 10)
    geometryCache.set(key, geometry)
  }
  return geometry
}

function getCoreMaterial(color) {
  let material = coreMaterialCache.get(color)
  if (!material) {
    // Lambert + flat shading: matte, faceted, cheap. MeshStandardMaterial was
    // glossy and several times the fragment cost for no visual gain here.
    material = new THREE.MeshLambertMaterial({ color, flatShading: true })
    coreMaterialCache.set(color, material)
  }
  return material
}

function getGhostMaterial(color) {
  let material = ghostMaterialCache.get(color)
  if (!material) {
    // The "blur": a barely-there tint of the node's own colour, so an
    // out-of-focus node reads as a ghost rather than simply vanishing.
    material = new THREE.MeshLambertMaterial({
      color,
      flatShading: true,
      transparent: true,
      opacity: 0.07,
      depthWrite: false,
    })
    ghostMaterialCache.set(color, material)
  }
  return material
}

function getNodeColor(node) {
  if (typeof node?.color === 'string' && node.color.trim()) {
    return node.color
  }
  const language = typeof node?.language === 'string' ? node.language.toLowerCase() : ''
  if (language && LANGUAGE_COLORS[language]) {
    return LANGUAGE_COLORS[language]
  }
  return VIZ_PALETTE.blue
}

function getNodeId(nodeRef) {
  return typeof nodeRef === 'object' ? nodeRef?.id : nodeRef
}

/**
 * Seed nodes on a Fibonacci sphere with hubs pulled toward the core.
 *
 * The old seeding stacked nodes in flat rings by depth, which read as a
 * spreadsheet. A golden-spiral sphere with an importance-weighted shell gives a
 * dense centre and a folded outer surface — once the force layout settles, the
 * connected files cluster into lobes and the whole thing reads like the
 * repository's brain rather than a disc.
 */
function createSeededPositions(nodes) {
  const count = nodes.length
  const golden = Math.PI * (3 - Math.sqrt(5))
  const maxImportance = Math.max(1, ...nodes.map((node) => node.importance || 0))
  const seeded = new Map()

  nodes.forEach((node, index) => {
    const t = count > 1 ? index / (count - 1) : 0.5
    const y = 1 - t * 2
    const ring = Math.sqrt(Math.max(0, 1 - y * y))
    const theta = golden * index

    const centrality = 1 - Math.min(1, (node.importance || 0) / maxImportance)
    const shell = 46 + centrality * 74

    seeded.set(node.id, {
      x: Math.cos(theta) * ring * shell,
      // Slightly squashed on Y — wider than tall, like the real thing.
      y: y * shell * 0.82,
      z: Math.sin(theta) * ring * shell,
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

/** A dot grid matching the 2D canvas, so the two views share one surface. */
function makeDotGridTexture() {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#111111'
  ctx.beginPath()
  ctx.arc(size / 2, size / 2, 2.4, 0, Math.PI * 2)
  ctx.fill()
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  return texture
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
  const decorationsRef = useRef(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  // Bumped once the node objects actually exist, so the emphasis/label pass has
  // something to write to. react-force-graph creates node objects during its own
  // commit, which lands *after* the first run of that effect — without this the
  // 3D view renders with every label hidden until the user first hovers a node.
  const [paintTick, setPaintTick] = useState(0)

  const onHoverRef = useRef(onHover)
  const onSelectRef = useRef(onSelect)
  useEffect(() => { onHoverRef.current = onHover }, [onHover])
  useEffect(() => { onSelectRef.current = onSelect }, [onSelect])

  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        setDimensions({
          width: entries[0].contentRect.width,
          height: entries[0].contentRect.height,
        })
      }
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  const graphData = useMemo(() => {
    const seeded = createSeededPositions(graph.nodes)
    return {
      // Always seed from scratch: a deterministic start is what makes the
      // settled shape recognisable between visits.
      nodes: centerPositions(graph.nodes.map((node) => {
        const position = seeded.get(node.id) || { x: 0, y: 0, z: 0 }
        return { ...node, x: position.x, y: position.y, z: position.z }
      })),
      links: graph.edges.map((edge) => ({ ...edge })),
    }
  }, [graph])

  const nodeObjectsRef = useRef(new Map())

  const nodeById = useMemo(() => {
    const map = new Map()
    graph.nodes.forEach((node) => map.set(node.id, node))
    return map
  }, [graph])

  const connectionCounts = useMemo(() => {
    const counts = new Map()
    graph.edges.forEach((edge) => {
      const source = getNodeId(edge.source)
      const target = getNodeId(edge.target)
      counts.set(source, (counts.get(source) || 0) + 1)
      counts.set(target, (counts.get(target) || 0) + 1)
    })
    return counts
  }, [graph])

  const selectionState = useMemo(() => {
    const linkedNodes = new Set()
    const linkedLinks = new Set()
    if (!selectedNodeId) return { linkedNodes, linkedLinks }

    // Focus means: this node, the files it talks to, and nothing else.
    linkedNodes.add(selectedNodeId)
    graphData.links.forEach((link) => {
      const sourceId = getNodeId(link.source)
      const targetId = getNodeId(link.target)
      if (sourceId === selectedNodeId || targetId === selectedNodeId) {
        linkedNodes.add(sourceId)
        linkedNodes.add(targetId)
        linkedLinks.add(link)
      }
    })
    return { linkedNodes, linkedLinks }
  }, [graphData, selectedNodeId])

  const flowState = useMemo(() => {
    const flowEdges = new Set()
    if (Array.isArray(activeFlow?.edgeKeys) && activeFlow.edgeKeys.length) {
      activeFlow.edgeKeys.forEach((key) => flowEdges.add(key))
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

  /**
   * Frame the camera from the real node bounds at a three-quarter angle.
   * Derived from `graphData` rather than `getGraphBbox()` so it does not depend
   * on a library method being present.
   */
  const frameCamera = useCallback((animate = 700) => {
    const instance = graphRef.current
    if (!instance || !graphData.nodes.length) return null

    const xs = graphData.nodes.map((node) => node.x || 0)
    const ys = graphData.nodes.map((node) => node.y || 0)
    const zs = graphData.nodes.map((node) => node.z || 0)
    const min = (values) => Math.min(...values)
    const max = (values) => Math.max(...values)

    const centre = new THREE.Vector3(
      (min(xs) + max(xs)) / 2,
      (min(ys) + max(ys)) / 2,
      (min(zs) + max(zs)) / 2,
    )
    const radius = Math.max(
      (max(xs) - min(xs)) / 2,
      (max(ys) - min(ys)) / 2,
      (max(zs) - min(zs)) / 2,
    ) || 40

    const fov = (instance.camera().fov || 50) * (Math.PI / 180)
    const distance = ((radius * 1.18) / Math.tan(fov / 2)) * 1.04
    // Unit vector, so the offset length really is `distance`.
    const direction = new THREE.Vector3(0.6, 0.42, 0.68).normalize()
    const position = centre.clone().add(direction.multiplyScalar(distance))

    instance.cameraPosition(position, centre, animate)

    // Fog measured from the camera, so the depth cue is scale-independent.
    const scene = instance.scene()
    if (scene) {
      scene.fog = new THREE.Fog(CANVAS, distance * 0.95, distance * 2.5)
    }

    return { centre, radius, distance }
  }, [graphData])

  /** Dot-grid floor plus one key light. Rebuilt whenever the graph changes. */
  const buildDecorations = useCallback((bounds) => {
    const instance = graphRef.current
    if (!instance || !bounds) return
    const scene = instance.scene()
    if (!scene) return

    const previous = decorationsRef.current
    if (previous) {
      if (previous.floor) {
        scene.remove(previous.floor)
        previous.floor.geometry.dispose()
        previous.floor.material.map?.dispose()
        previous.floor.material.dispose()
      }
      previous.lights?.forEach((light) => scene.remove(light))
      decorationsRef.current = null
    }

    const span = Math.max(bounds.radius, 60)
    const gridSize = span * 8

    const texture = makeDotGridTexture()
    texture.repeat.set(gridSize / 26, gridSize / 26)
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(gridSize, gridSize),
      // depthWrite false means the floor can never hide a node that drifts
      // below it — it only ever reads as a surface behind the graph.
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.5, depthWrite: false }),
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.y = bounds.centre.y - span * 1.35
    scene.add(floor)

    // Rebalance the default lighting: keep the brightness, add direction, so
    // the flat-shaded facets actually read as solid shapes.
    scene.traverse((object) => {
      if (object.isAmbientLight) object.intensity = 1.5
    })
    const key = new THREE.DirectionalLight(0xffffff, 1.3)
    key.position.set(
      bounds.centre.x + span * 0.9,
      bounds.centre.y + span * 1.3,
      bounds.centre.z + span * 0.7,
    )
    scene.add(key)

    decorationsRef.current = { floor, lights: [key] }
  }, [])

  useEffect(() => {
    const instance = graphRef.current
    if (!instance) return

    const charge = instance.d3Force('charge')
    if (charge) {
      // Softer repulsion than a standard force graph: the goal is one dense
      // mass with lobes, not a sparse field with a few far-flung strays.
      charge.strength(-38)
      charge.distanceMax(260)
    }

    const linkForce = instance.d3Force('link')
    if (linkForce) {
      linkForce.distance((link) => (link.type === 'dependency' ? 46 : 26))
      linkForce.strength((link) => (link.type === 'dependency' ? 0.22 : 0.6))
    }
  }, [graphData])

  useEffect(() => {
    // Cap the pixel ratio: on a Retina display the default 2x doubles the
    // fragment work for a difference nobody can see, and that is the single
    // biggest cause of a stuttering camera.
    const timer = setTimeout(() => {
      const instance = graphRef.current
      if (!instance) return
      try {
        const renderer = instance.renderer?.()
        if (renderer) renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
      } catch {
        /* older builds do not expose the renderer — the default ratio is fine */
      }
      const controls = instance.controls()
      if (controls) {
        controls.enableDamping = true
        // Lower damping = longer glide, which is what "smooth" feels like.
        controls.dampingFactor = 0.075
        controls.rotateSpeed = 0.7
        controls.zoomSpeed = 1.4
        controls.panSpeed = 1.0
      }
    }, 200)
    return () => clearTimeout(timer)
  }, [dimensions.width, dimensions.height])

  useEffect(() => {
    initialFitRef.current = false
  }, [graphData.nodes.length])

  useEffect(() => {
    // Paint emphasis once the node objects exist, and guarantee a framing even
    // if `onEngineStop` never fires.
    const paint = setTimeout(() => setPaintTick((tick) => tick + 1), 60)
    const frame = setTimeout(() => {
      if (initialFitRef.current) return
      const bounds = frameCamera(700)
      buildDecorations(bounds)
      initialFitRef.current = true
    }, 1500)
    return () => {
      clearTimeout(paint)
      clearTimeout(frame)
    }
  }, [graphData, frameCamera, buildDecorations])

  useEffect(() => {
    graphData.nodes.forEach((node) => {
      const object = nodeObjectsRef.current.get(node.id)
      if (!object) return

      const mesh = object.userData.coreMesh
      const label = object.userData.labelSprite
      const outline = object.userData.outlineMesh
      if (!mesh || !label || !outline) return

      const isLinkedToSelected = selectedNodeId ? selectionState.linkedNodes.has(node.id) : false
      const isSelected = node.id === selectedNodeId
      const isHovered = node.id === hoveredNodeId
      const isBroken = node.status === 'broken'
      const isDead = node.status === 'dead'

      const isInFlow = activeFlow ? activeFlow.nodes.includes(node.id) : false
      const isCurrentFlowStep = activeFlow && activeFlow.currentIndex >= 0 && activeFlow.currentIndex < activeFlow.nodes.length
        ? activeFlow.nodes[activeFlow.currentIndex] === node.id
        : false

      // Focus mode: with something selected, everything outside the
      // neighbourhood becomes a ghost. That is the whole point of clicking.
      const isFocused = selectedNodeId ? !isLinkedToSelected : false
      const isDimmed = activeFlow ? !isInFlow : isFocused

      const color = getNodeColor(node)

      let coreScale = 1
      let outlineScale = 1.13
      let outlineMaterial = OUTLINE_MATERIALS.ink

      if (isCurrentFlowStep) {
        coreScale = 1.42; outlineScale = 1.44; outlineMaterial = OUTLINE_MATERIALS.current
      } else if (isInFlow) {
        coreScale = 1.16; outlineScale = 1.32; outlineMaterial = OUTLINE_MATERIALS.flow
      } else if (isSelected) {
        coreScale = 1.3; outlineScale = 1.4
      } else if (isHovered) {
        coreScale = 1.16; outlineScale = 1.3
      } else if (selectedNodeId && isLinkedToSelected) {
        coreScale = 1.08; outlineScale = 1.22
      } else if (isBroken) {
        coreScale = 1.06; outlineScale = 1.22; outlineMaterial = OUTLINE_MATERIALS.broken
      } else if (isDead) {
        coreScale = 0.92; outlineScale = 1.08; outlineMaterial = OUTLINE_MATERIALS.dead
      } else if (isDimmed) {
        coreScale = 0.88; outlineScale = 1.02; outlineMaterial = OUTLINE_MATERIALS.dim
      } else if (node.type === 'important') {
        outlineScale = 1.18
      }

      // Reference swaps only — never mutate, these materials are shared.
      mesh.material = isDimmed ? getGhostMaterial(color) : getCoreMaterial(color)
      mesh.scale.set(coreScale, coreScale, coreScale)
      outline.material = outlineMaterial
      outline.scale.set(outlineScale, outlineScale, outlineScale)

      // Name what carries structure, what has a problem, and whatever is being
      // pointed at or selected. A focused-out node says nothing.
      label.visible = !isDimmed && Boolean(
        isCurrentFlowStep
        || isInFlow
        || isSelected
        || isHovered
        || (selectedNodeId && isLinkedToSelected)
        || isBroken
        || isDead
        || node.type === 'important'
        || node.type === 'folder',
      )

      if (isCurrentFlowStep) {
        label.color = EDGE_COLORS.flowCurrent
      } else if (isBroken) {
        label.color = '#b91c1c'
      } else if (isDead) {
        label.color = '#8a8175'
      } else {
        label.color = INK
      }
    })

    graphData.links.forEach((link) => {
      const sourceId = getNodeId(link.source)
      const targetId = getNodeId(link.target)
      link._isLinked = selectedNodeId ? selectionState.linkedLinks.has(link) : false
      link._isFlowEdge = activeFlow ? flowState.flowEdges.has(`${sourceId}->${targetId}`) : false
      link._isDimmed = activeFlow
        ? !link._isFlowEdge
        : (selectedNodeId ? !link._isLinked : false)

      if (activeFlow && activeFlow.currentIndex >= 0 && activeFlow.currentIndex < activeFlow.nodes.length - 1) {
        const current = activeFlow.nodes[activeFlow.currentIndex]
        const next = activeFlow.nodes[activeFlow.currentIndex + 1]
        link._isCurrentFlowEdge = (sourceId === current && targetId === next) || (targetId === current && sourceId === next)
      } else {
        link._isCurrentFlowEdge = false
      }
    })
  }, [selectedNodeId, hoveredNodeId, graphData, activeFlow, selectionState, flowState, paintTick])

  const buildNodeObject = useCallback((node) => {
    const baseScale = node.type === 'important' ? 0.4 : 0.25
    const size = Math.max(2.4, (node.size || 10) * baseScale)
    const shape = shapeOf(node)
    const color = getNodeColor(node)

    const group = new THREE.Group()

    const mesh = new THREE.Mesh(getGeometry(shape, size), getCoreMaterial(color))
    group.add(mesh)

    // Ink outline: the same buffer drawn back-faces-only at a slightly larger
    // scale. Reuses the slot the old additive "glow" sphere occupied, so the
    // object count per node is unchanged from before.
    const outline = new THREE.Mesh(getGeometry(shape, size), OUTLINE_MATERIALS.ink)
    outline.scale.setScalar(1.13)
    group.add(outline)

    const labelText = node.status === 'dead'
      ? `${node.label || node.path} · unused`
      : node.status === 'broken'
        ? `${node.label || node.path} · risk`
        : (node.label || node.path)

    const label = new SpriteText(labelText)
    label.color = INK
    label.textHeight = node.type === 'important' ? 3.6 : 2.9
    label.fontWeight = '600'
    label.backgroundColor = 'rgba(255, 255, 255, 0.96)'
    label.borderColor = INK
    label.borderWidth = 0.6
    label.borderRadius = 0
    label.padding = 2
    label.position.set(0, size + 3.6, 0)
    label.visible = false
    group.add(label)

    group.userData.coreMesh = mesh
    group.userData.labelSprite = label
    group.userData.outlineMesh = outline

    nodeObjectsRef.current.set(node.id, group)
    return group
  }, [])

  const handleEngineStop = useCallback(() => {
    setPaintTick((tick) => tick + 1)
    if (!initialFitRef.current) {
      const bounds = frameCamera(600)
      buildDecorations(bounds)
      initialFitRef.current = true
    }
  }, [frameCamera, buildDecorations])

  const handleResetView = useCallback(() => {
    frameCamera(700)
  }, [frameCamera])

  const handleZoomIn = useCallback(() => {
    if (graphRef.current) {
      const camera = graphRef.current.camera()
      const direction = new THREE.Vector3()
      camera.getWorldDirection(direction)
      const step = Math.max(50, camera.position.length() * 0.4)
      graphRef.current.cameraPosition(camera.position.clone().add(direction.multiplyScalar(step)), null, 260)
    }
  }, [])

  const handleZoomOut = useCallback(() => {
    if (graphRef.current) {
      const camera = graphRef.current.camera()
      const direction = new THREE.Vector3()
      camera.getWorldDirection(direction)
      const step = Math.max(50, camera.position.length() * 0.4)
      graphRef.current.cameraPosition(camera.position.clone().sub(direction.multiplyScalar(step)), null, 260)
    }
  }, [])

  const handleFocusSelected = useCallback(() => {
    if (!graphRef.current || !selectedNodeId) return
    const target = graphData.nodes.find((node) => node.id === selectedNodeId)
    if (!target) return
    const nodePosition = new THREE.Vector3(target.x || 0, target.y || 0, target.z || 0)
    const cameraPosition = graphRef.current.camera().position.clone()
    const direction = new THREE.Vector3().subVectors(cameraPosition, nodePosition)
    if (direction.lengthSq() < 0.1) direction.set(0, 0, 1)
    direction.normalize()
    graphRef.current.cameraPosition(nodePosition.clone().add(direction.multiplyScalar(130)), target, 700)
  }, [selectedNodeId, graphData.nodes])

  // Clean up scene decorations on unmount.
  useEffect(() => () => {
    const instance = graphRef.current
    const decorations = decorationsRef.current
    if (!instance || !decorations) return
    const scene = instance.scene?.()
    if (!scene) return
    if (decorations.floor) scene.remove(decorations.floor)
    decorations.lights?.forEach((light) => scene.remove(light))
  }, [])

  const readoutNode = nodeById.get(hoveredNodeId) || nodeById.get(selectedNodeId)

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
          backgroundColor={CANVAS}
          nodeThreeObject={buildNodeObject}
          linkColor={(link) => {
            if (activeFlow) {
              if (link._isCurrentFlowEdge) return EDGE_COLORS.flowCurrent
              if (link._isFlowEdge) return EDGE_COLORS.flow
              return EDGE_COLORS.dimmed
            }
            if (link._isDimmed) return EDGE_COLORS.dimmed
            if (link._isLinked) return EDGE_COLORS.linked
            if (link.type === 'dependency') return EDGE_COLORS.dependency
            if (link.type === 'hierarchy') return EDGE_COLORS.hierarchy
            return EDGE_COLORS.semantic
          }}
          linkOpacity={(link) => {
            if (activeFlow) return link._isFlowEdge ? 0.95 : 0.02
            // Focus mode: the rest of the graph becomes a whisper.
            if (link._isDimmed) return 0.025
            if (link._isLinked) return 1
            return link.type === 'hierarchy' ? 0.24 : 0.55
          }}
          linkWidth={(link) => {
            if (activeFlow) return link._isCurrentFlowEdge ? 4 : (link._isFlowEdge ? 2 : 0.1)
            if (selectedNodeId) return link._isLinked ? 2.6 : 0.1
            return link.type === 'hierarchy' ? 0.4 : 0.8
          }}
          // Import direction is the most useful fact in the graph, so dependency
          // edges carry an arrowhead. A folder does not "depend" on its files.
          linkDirectionalArrowLength={(link) => (link.type === 'dependency' ? 3.6 : 0)}
          linkDirectionalArrowRelPos={1}
          linkDirectionalArrowColor={(link) => (link._isLinked ? EDGE_COLORS.linked : EDGE_COLORS.dependency)}
          linkDirectionalParticles={(link) => {
            // Particles are a highlight, not decoration. Streaming dots on all
            // 400 links was both unreadable and the biggest frame cost here.
            if (activeFlow) return link._isCurrentFlowEdge ? 5 : (link._isFlowEdge ? 3 : 0)
            if (selectedNodeId && link._isLinked) return 4
            return 0
          }}
          linkDirectionalParticleSpeed={() => 0.012}
          linkDirectionalParticleWidth={(link) => (link._isCurrentFlowEdge ? 3.4 : 2.4)}
          linkDirectionalParticleColor={(link) => (link._isCurrentFlowEdge ? EDGE_COLORS.flowCurrent : EDGE_COLORS.linked)}
          onNodeHover={(node) => {
            document.body.style.cursor = node ? 'pointer' : 'default'
            onHoverRef.current(node?.id || '')
          }}
          onBackgroundClick={() => onSelectRef.current('')}
          onNodeClick={(node) => onSelectRef.current(node.id)}
          onNodeDrag={() => {
            graphRef.current?.d3ReheatSimulation()
          }}
          onNodeDragEnd={(node) => {
            node.fx = node.x
            node.fy = node.y
            node.fz = node.z
          }}
          cooldownTicks={140}
          warmupTicks={12}
          d3VelocityDecay={0.45}
          onEngineStop={handleEngineStop}
          showNavInfo={false}
          enablePointerInteraction
          nodeRelSize={2}
          enableNodeDrag
        />
      )}

      <GraphNodeReadout
        node={readoutNode}
        connectionCount={readoutNode ? connectionCounts.get(readoutNode.id) : undefined}
      />

      <div className="graph-controls" aria-label="Repository graph controls">
        {selectedNodeId && (
          <button
            onClick={handleFocusSelected}
            className="graph-control-btn"
            title="Focus the selected node"
            aria-label="Focus the selected node"
          >
            <Target size={14} />
          </button>
        )}
        <div className="graph-control-cluster">
          <button onClick={handleZoomIn} className="graph-control-btn border-right" title="Zoom in" aria-label="Zoom in">
            <ZoomIn size={14} />
          </button>
          <button onClick={handleResetView} className="graph-control-btn border-right" title="Reset view" aria-label="Reset view">
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
