import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph3D from 'react-force-graph-3d'
import SpriteText from 'three-spritetext'
import * as THREE from 'three'
import { Pause, Play, RotateCcw, Target, ZoomIn, ZoomOut } from 'lucide-react'

import { VIZ_PALETTE } from '../graph-utils'

// Every value clears 3:1 on the cream canvas — see VIZ_PALETTE in graph-utils.
const AUTHOR_COLORS = [
  VIZ_PALETTE.cyan,
  VIZ_PALETTE.amber,
  '#7c3aed',
  '#059669',
  VIZ_PALETTE.pink,
  VIZ_PALETTE.blue,
  VIZ_PALETTE.vermillion,
  VIZ_PALETTE.mauve,
]
const FILE_COLOR = '#8a8175'
const AUTHOR_NODE_COLOR = VIZ_PALETTE.teal
const LINK_COLORS = {
  changed: VIZ_PALETTE.amber,
  parent: '#0369a1',
  author: '#059669',
  // Fades toward the canvas instead of to near-black (#172033), which made a
  // de-emphasised link the most prominent thing on screen.
  dimmed: '#ded7cb',
}

function authorColor(author, indexMap) {
  const index = indexMap.get(author) || 0
  return AUTHOR_COLORS[index % AUTHOR_COLORS.length]
}

function shortFileName(path = '') {
  return path.split('/').pop() || path
}

function formatDate(value) {
  if (!value) return 'Unknown date'
  return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: '2-digit' }).format(new Date(value))
}

function buildCommitGraph(commits, authors) {
  const authorIndex = new Map(authors.map((author, index) => [author, index]))
  const orderedCommits = [...commits].sort((a, b) => new Date(a.date) - new Date(b.date))
  const zStep = 34
  const nodes = []
  const links = []
  const fileNodes = new Map()
  const fileNodeData = new Map()
  const authorNodes = new Map()

  orderedCommits.forEach((commit, index) => {
    const angle = index * 0.72
    const radius = 20 + Math.min(34, commit.filesChanged * 2.2)
    const z = (index - orderedCommits.length + 1) * zStep
    const laneOffset = ((index % 5) - 2) * 11
    const commitId = `commit:${commit.hash}`
    const color = authorColor(commit.author, authorIndex)

    nodes.push({
      id: commitId,
      kind: 'commit',
      label: commit.shortHash,
      color,
      size: Math.max(4, Math.min(15, 4 + commit.filesChanged * 1.4)),
      commit,
      fx: Math.cos(angle) * radius,
      fy: Math.sin(angle) * radius + laneOffset,
      fz: z,
    })

    if (!authorNodes.has(commit.author)) {
      const authorId = `author:${commit.author}`
      authorNodes.set(commit.author, authorId)
      nodes.push({
        id: authorId,
        kind: 'author',
        label: commit.author,
        color: AUTHOR_NODE_COLOR,
        size: 7,
        fx: Math.cos(angle + 0.5) * 52,
        fy: Math.sin(angle + 0.5) * 52 + laneOffset,
        fz: z + 16,
      })
    }
    links.push({ source: commitId, target: authorNodes.get(commit.author), type: 'author' })

    commit.changedFiles.forEach((filePath, fileIndex) => {
      if (!fileNodes.has(filePath)) {
        const fileId = `file:${filePath}`
        fileNodes.set(filePath, fileId)
        const fileAngle = angle + fileIndex * 0.21
        const fileNode = {
          id: fileId,
          kind: 'file',
          label: shortFileName(filePath),
          path: filePath,
          color: FILE_COLOR,
          size: 3.2,
          commits: [],
          fx: Math.cos(fileAngle) * 74,
          fy: Math.sin(fileAngle) * 74 + laneOffset,
          fz: z + ((fileIndex % 9) - 4) * 5,
        }
        nodes.push(fileNode)
        fileNodeData.set(filePath, fileNode)
      }
      fileNodeData.get(filePath)?.commits.push(commit)
      links.push({ source: commitId, target: fileNodes.get(filePath), type: 'changed' })
    })
  })

  const commitIds = new Set(orderedCommits.map((commit) => commit.hash))
  orderedCommits.forEach((commit, index) => {
    const fallbackParent = orderedCommits[index - 1]?.hash
    const parent = commit.parents.find((hash) => commitIds.has(hash)) || fallbackParent
    if (parent) {
      links.push({ source: `commit:${commit.hash}`, target: `commit:${parent}`, type: 'parent' })
    }
  })

  return { nodes, links, orderedCommits }
}

export function CommitHistory3D({ history }) {
  const graphRef = useRef(null)
  const containerRef = useRef(null)
  const objectRefs = useRef(new Map())
  const [selectedId, setSelectedId] = useState('')
  const [hoveredNode, setHoveredNode] = useState(null)
  const [authorFilter, setAuthorFilter] = useState('all')
  const [fileFilter, setFileFilter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [isPlaying, setIsPlaying] = useState(false)
  const [playIndex, setPlayIndex] = useState(0)
  const [autoRotate, setAutoRotate] = useState(false)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

  useEffect(() => {
    if (!containerRef.current) return

    const observer = new ResizeObserver((entries) => {
      if (!entries[0]) return
      setDimensions({
        width: entries[0].contentRect.width,
        height: entries[0].contentRect.height,
      })
    })

    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  const filteredCommits = useMemo(() => {
    return (history?.commits || []).filter((commit) => {
      const time = new Date(commit.date).getTime()
      const fromOk = !fromDate || time >= new Date(fromDate).getTime()
      const toOk = !toDate || time <= new Date(`${toDate}T23:59:59`).getTime()
      const authorOk = authorFilter === 'all' || commit.author === authorFilter
      const fileOk = !fileFilter.trim() || commit.changedFiles.some((file) => file.toLowerCase().includes(fileFilter.trim().toLowerCase()))
      return fromOk && toOk && authorOk && fileOk
    })
  }, [history, authorFilter, fileFilter, fromDate, toDate])

  const graphData = useMemo(() => {
    const playable = isPlaying ? filteredCommits.slice(0, Math.max(1, playIndex + 1)) : filteredCommits
    return buildCommitGraph(playable, history?.authors || [])
  }, [filteredCommits, history, isPlaying, playIndex])

  useEffect(() => {
    setPlayIndex(0)
    setIsPlaying(false)
    setSelectedId('')
  }, [filteredCommits.length])

  useEffect(() => {
    if (!isPlaying) return
    if (playIndex >= filteredCommits.length - 1) {
      setIsPlaying(false)
      return
    }
    const timer = window.setTimeout(() => setPlayIndex((current) => current + 1), 650)
    return () => window.clearTimeout(timer)
  }, [isPlaying, playIndex, filteredCommits.length])

  useEffect(() => {
    const instance = graphRef.current
    if (!instance) return

    const charge = instance.d3Force('charge')
    if (charge) charge.strength(-26).distanceMax(180)

    const link = instance.d3Force('link')
    if (link) {
      link.distance((edge) => (edge.type === 'parent' ? 24 : edge.type === 'author' ? 30 : 18))
      link.strength((edge) => (edge.type === 'parent' ? 0.88 : 0.38))
    }

    const timer = window.setTimeout(() => {
      instance.zoomToFit(500, 48)
      instance.cameraPosition(
        { x: 180, y: 110, z: 290 },
        { x: 0, y: 0, z: -Math.max(80, graphData.orderedCommits.length * 10) },
        700,
      )
    }, 250)

    return () => window.clearTimeout(timer)
  }, [graphData, dimensions.width, dimensions.height])

  useEffect(() => {
    const controls = graphRef.current?.controls?.()
    if (!controls) return

    controls.enableDamping = true
    controls.dampingFactor = 0.12
    controls.rotateSpeed = 1.15
    controls.zoomSpeed = 0.9
    controls.panSpeed = 0.75
  }, [graphData.nodes.length, dimensions.width, dimensions.height])

  useEffect(() => {
    const controls = graphRef.current?.controls?.()
    if (!controls) return

    controls.autoRotate = autoRotate
    controls.autoRotateSpeed = 1.4

    if (typeof controls.update !== 'function') return
    let frameId
    const tick = () => {
      controls.update()
      frameId = window.requestAnimationFrame(tick)
    }
    if (autoRotate) tick()
    return () => window.cancelAnimationFrame(frameId)
  }, [autoRotate])

  useEffect(() => {
    const activeId = selectedId
    const linked = new Set(activeId ? [activeId] : [])
    const linkedEdges = new Set()

    if (activeId) {
      graphData.links.forEach((link) => {
        const source = link.source.id || link.source
        const target = link.target.id || link.target
        if (source === activeId || target === activeId) {
          linked.add(source)
          linked.add(target)
          linkedEdges.add(link)
        }
      })
    }

    graphData.nodes.forEach((node) => {
      const group = objectRefs.current.get(node.id)
      if (!group?.userData?.mesh) return
      const { mesh, label } = group.userData
      const isActive = activeId && linked.has(node.id)
      const isDimmed = activeId && !isActive
      const isHovered = !activeId && hoveredNode?.id === node.id
      mesh.material.opacity = isDimmed ? 0.12 : 0.96
      mesh.material.emissiveIntensity = isActive || isHovered ? 0.72 : 0.24
      group.scale.setScalar(node.id === activeId ? 1.35 : isActive || isHovered ? 1.16 : 1)
      if (label) label.color = isDimmed ? '#8a8175' : '#140206'
    })

    graphData.links.forEach((link) => {
      link._active = activeId ? linkedEdges.has(link) : false
      link._dimmed = activeId ? !linkedEdges.has(link) : false
    })
  }, [graphData, hoveredNode, selectedId])

  const buildNodeObject = useCallback((node) => {
    const group = new THREE.Group()
    const geometry = node.kind === 'file'
      ? new THREE.SphereGeometry(node.size, 12, 12)
      : node.kind === 'author'
        ? new THREE.OctahedronGeometry(node.size, 0)
        : new THREE.SphereGeometry(node.size, 20, 20)

    const material = new THREE.MeshStandardMaterial({
      color: node.color,
      emissive: node.color,
      emissiveIntensity: 0.24,
      roughness: 0.34,
      transparent: true,
      opacity: 0.96,
    })
    const mesh = new THREE.Mesh(geometry, material)
    group.add(mesh)

    const label = new SpriteText(node.label)
    label.color = '#140206'
    label.textHeight = node.kind === 'commit' ? 2.8 : 2.2
    label.position.set(0, node.size + 3, 0)
    group.add(label)

    group.userData = { mesh, label }
    objectRefs.current.set(node.id, group)
    return group
  }, [])

  const selectedNode = useMemo(() => graphData.nodes.find((node) => node.id === selectedId), [graphData.nodes, selectedId])
  const detailNode = selectedNode || hoveredNode

  const resetView = useCallback(() => {
    graphRef.current?.zoomToFit(500, 42)
  }, [])

  const handleZoomIn = useCallback(() => {
    if (!graphRef.current) return
    const camera = graphRef.current.camera()
    const direction = new THREE.Vector3()
    camera.getWorldDirection(direction)
    const dist = camera.position.length()
    const step = Math.max(40, dist * 0.3)
    const nextPosition = camera.position.clone().add(direction.multiplyScalar(step))
    graphRef.current.cameraPosition(nextPosition, null, 300)
  }, [])

  const handleZoomOut = useCallback(() => {
    if (!graphRef.current) return
    const camera = graphRef.current.camera()
    const direction = new THREE.Vector3()
    camera.getWorldDirection(direction)
    const dist = camera.position.length()
    const step = Math.max(40, dist * 0.3)
    const nextPosition = camera.position.clone().sub(direction.multiplyScalar(step))
    graphRef.current.cameraPosition(nextPosition, null, 300)
  }, [])

  const handleFocusSelected = useCallback(() => {
    if (graphRef.current && selectedNode) {
      const distance = Math.max(70, (selectedNode.size || 8) * 10)
      const nodeDist = Math.hypot(selectedNode.x || 0, selectedNode.y || 0, selectedNode.z || 0) || 1
      const ratio = 1 + distance / nodeDist
      graphRef.current.cameraPosition(
        {
          x: (selectedNode.x || 0) * ratio,
          y: (selectedNode.y || 0) * ratio,
          z: (selectedNode.z || 0) * ratio,
        },
        selectedNode,
        600,
      )
    }
  }, [selectedNode])

  const togglePlay = useCallback(() => {
    if (playIndex >= filteredCommits.length - 1) setPlayIndex(0)
    setSelectedId('')
    setIsPlaying((current) => !current)
  }, [filteredCommits.length, playIndex])

  if (!history?.commits?.length) {
    return <div className="empty-state"><p>No commit history found for this repository.</p></div>
  }

  return (
    <div ref={containerRef} className="commit-graph-shell">
      <div className="commit-filters">
        <select value={authorFilter} onChange={(event) => setAuthorFilter(event.target.value)}>
          <option value="all">All authors</option>
          {history.authors.map((author) => <option key={author} value={author}>{author}</option>)}
        </select>
        <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} aria-label="From date" />
        <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} aria-label="To date" />
        <input value={fileFilter} onChange={(event) => setFileFilter(event.target.value)} placeholder="Filter file..." />
      </div>

      {dimensions.width > 0 && dimensions.height > 0 && (
        <ForceGraph3D
          ref={graphRef}
          width={dimensions.width}
          height={dimensions.height}
          graphData={{ nodes: graphData.nodes, links: graphData.links }}
          backgroundColor="#f3eee7"
          nodeThreeObject={buildNodeObject}
          linkColor={(link) => (link._dimmed ? LINK_COLORS.dimmed : LINK_COLORS[link.type])}
          linkWidth={(link) => (link._active ? 2.4 : link.type === 'parent' ? 1.25 : 0.8)}
          linkOpacity={0.78}
          linkDirectionalParticles={(link) => (link._active || isPlaying || (autoRotate && link.type === 'parent') ? 2 : 0)}
          linkDirectionalParticleColor={(link) => LINK_COLORS[link.type]}
          linkDirectionalParticleWidth={2}
          linkDirectionalParticleSpeed={0.01}
          onNodeHover={(node) => {
            document.body.style.cursor = node ? 'pointer' : 'default'
            setHoveredNode(node || null)
          }}
          onNodeClick={(node) => setSelectedId(node?.id || '')}
          onBackgroundClick={() => setSelectedId('')}
          cooldownTicks={90}
          cooldownTime={2600}
          d3VelocityDecay={0.42}
          numDimensions={3}
          showNavInfo={false}
          enablePointerInteraction
        />
      )}

      <div className="commit-controls">
        {selectedId && (
          <button className="graph-control-btn" onClick={handleFocusSelected} title="Focus Selected">
            <Target size={14} />
          </button>
        )}
        <button className={`graph-control-btn ${autoRotate ? 'is-active' : ''}`} onClick={() => setAutoRotate((current) => !current)} title={autoRotate ? 'Pause Rotation' : 'Auto Rotate'}>
          {autoRotate ? <Pause size={14} /> : <Play size={14} />}
          <span>{autoRotate ? 'Pause' : 'Auto Rotate'}</span>
        </button>
        <button className={`graph-control-btn ${isPlaying ? 'is-active' : ''}`} onClick={togglePlay} title="Play History">
          {isPlaying ? <Pause size={14} /> : <Play size={14} />}
          <span>{isPlaying ? 'Pause' : 'Play History'}</span>
        </button>
        <button className="graph-control-btn" onClick={handleZoomIn} title="Zoom In">
          <ZoomIn size={14} />
        </button>
        <button className="graph-control-btn" onClick={resetView} title="Reset View">
          <RotateCcw size={14} />
          <span>Reset View</span>
        </button>
        <button className="graph-control-btn" onClick={handleZoomOut} title="Zoom Out">
          <ZoomOut size={14} />
        </button>
      </div>

      <div className="commit-timeline">
        <span>{isPlaying ? playIndex + 1 : filteredCommits.length}</span>
        <div><i style={{ width: `${filteredCommits.length ? ((isPlaying ? playIndex + 1 : filteredCommits.length) / filteredCommits.length) * 100 : 0}%` }} /></div>
        <span>{filteredCommits.length} commits</span>
      </div>

      {detailNode && (
        <div className="commit-detail">
          {detailNode.kind === 'commit' ? (
            <>
              <strong>{detailNode.commit.message || detailNode.commit.shortHash}</strong>
              <span>{detailNode.commit.author} · {formatDate(detailNode.commit.date)} · {detailNode.commit.filesChanged} files</span>
              <p>{detailNode.commit.shortHash}</p>
            </>
          ) : detailNode.kind === 'file' ? (
            <>
              <strong>{detailNode.path}</strong>
              <span>{detailNode.commits?.length || 0} commits touched this file</span>
              <div className="commit-file-history">
                {(detailNode.commits || [])
                  .slice()
                  .sort((a, b) => new Date(b.date) - new Date(a.date))
                  .slice(0, 8)
                  .map((commit) => (
                    <p key={commit.hash}>
                      <b>{formatDate(commit.date)}</b>
                      <span>{commit.author}</span>
                      <em>{commit.message || commit.shortHash}</em>
                    </p>
                  ))}
              </div>
            </>
          ) : (
            <>
              <strong>{detailNode.label}</strong>
              <span>Contributor</span>
            </>
          )}
        </div>
      )}
    </div>
  )
}
