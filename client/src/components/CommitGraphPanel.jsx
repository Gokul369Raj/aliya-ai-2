import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowUpRight,
  Box,
  Calendar,
  Copy,
  Check,
  GitBranch,
  GitCommitHorizontal,
  GitMerge,
  Info,
  Layers,
  ListFilter,
  RotateCcw,
  Search,
  Users,
} from 'lucide-react'

import { CommitHistory3D } from './CommitHistory3D'
import { VIZ_PALETTE } from '../graph-utils'

const AUTHOR_PALETTE = [
  VIZ_PALETTE.cyan, VIZ_PALETTE.violet, VIZ_PALETTE.ochre, '#059669', VIZ_PALETTE.pink,
  VIZ_PALETTE.blue, VIZ_PALETTE.vermillion, VIZ_PALETTE.mauve, '#15803d', '#0369a1',
]

const ROW_HEIGHT = 30
const LANE_WIDTH = 20
const PAD_LEFT = 22
const PAD_RIGHT = 14
const PAD_TOP = 22
const MAX_LANES = 9

function authorColor(author, indexMap) {
  const index = indexMap.get(author) ?? 0
  return AUTHOR_PALETTE[index % AUTHOR_PALETTE.length]
}

function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || '?'
}

function formatDate(value) {
  if (!value) return 'Unknown'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: '2-digit' }).format(date)
}

function formatRelative(value) {
  if (!value) return ''
  const then = new Date(value).getTime()
  if (Number.isNaN(then)) return ''
  const diff = Date.now() - then
  const day = 86_400_000
  if (diff < 3_600_000) return `${Math.max(1, Math.round(diff / 60_000))}m ago`
  if (diff < day) return `${Math.round(diff / 3_600_000)}h ago`
  if (diff < day * 30) return `${Math.round(diff / day)}d ago`
  if (diff < day * 365) return `${Math.round(diff / (day * 30))}mo ago`
  return `${Math.round(diff / (day * 365))}y ago`
}

/**
 * Assign each commit a lane (column) using a git-graph style sweep.
 * Commits arrive newest → oldest, so each lane holds the hash it is
 * waiting to draw next.
 */
function computeLayout(commits) {
  const laneHashes = []
  const nodeByHash = new Map()
  const rows = []
  let maxLane = 0

  const freeLane = () => {
    const index = laneHashes.indexOf(null)
    if (index !== -1) return index
    laneHashes.push(null)
    return laneHashes.length - 1
  }

  commits.forEach((commit, row) => {
    let lane = laneHashes.indexOf(commit.hash)
    if (lane === -1) lane = freeLane()

    laneHashes.forEach((hash, index) => {
      if (index !== lane && hash === commit.hash) laneHashes[index] = null
    })

    const parents = (commit.parents || []).filter(Boolean)
    laneHashes[lane] = parents[0] || null

    const mergeLanes = []
    for (let index = 1; index < parents.length; index += 1) {
      const parent = parents[index]
      let target = laneHashes.indexOf(parent)
      if (target === -1) target = freeLane()
      laneHashes[target] = parent
      mergeLanes.push({ lane: target, hash: parent })
    }

    nodeByHash.set(commit.hash, { row, lane })
    rows.push({ commit, row, lane, mergeLanes, isMerge: parents.length > 1 })
    maxLane = Math.max(maxLane, lane, ...mergeLanes.map((item) => item.lane))
  })

  return { rows, nodeByHash, laneCount: maxLane + 1 }
}

export function CommitGraphPanel({ history, repoUrl = '' }) {
  const [view, setView] = useState('lanes')
  const [authorFilter, setAuthorFilter] = useState('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [fileFilter, setFileFilter] = useState('')
  const [textFilter, setTextFilter] = useState('')
  const [selectedHash, setSelectedHash] = useState('')
  const [copiedHash, setCopiedHash] = useState('')
  const listRef = useRef(null)

  const commits = history?.commits || []
  const authors = history?.authors || []

  const authorIndex = useMemo(
    () => new Map(authors.map((author, index) => [author, index])),
    [authors],
  )

  const filtered = useMemo(() => {
    const fileQuery = fileFilter.trim().toLowerCase()
    const textQuery = textFilter.trim().toLowerCase()
    const from = fromDate ? new Date(fromDate).getTime() : null
    const to = toDate ? new Date(`${toDate}T23:59:59`).getTime() : null

    return commits.filter((commit) => {
      const time = new Date(commit.date).getTime()
      if (from !== null && time < from) return false
      if (to !== null && time > to) return false
      if (authorFilter !== 'all' && commit.author !== authorFilter) return false
      if (fileQuery && !commit.changedFiles.some((file) => file.toLowerCase().includes(fileQuery))) return false
      if (textQuery) {
        const haystack = `${commit.message || ''} ${commit.shortHash || ''} ${commit.author || ''}`.toLowerCase()
        if (!haystack.includes(textQuery)) return false
      }
      return true
    })
  }, [commits, authorFilter, fromDate, toDate, fileFilter, textFilter])

  const layout = useMemo(() => computeLayout(filtered), [filtered])
  const { rows, nodeByHash, laneCount } = layout

  const stats = useMemo(() => {
    if (!filtered.length) {
      return { count: 0, authors: 0, merges: 0, files: 0, span: '—', topFiles: [] }
    }
    const fileCounts = new Map()
    let merges = 0
    filtered.forEach((commit) => {
      if ((commit.parents || []).length > 1) merges += 1
      commit.changedFiles.forEach((file) => fileCounts.set(file, (fileCounts.get(file) || 0) + 1))
    })
    const dates = filtered.map((commit) => new Date(commit.date).getTime()).filter(Number.isFinite)
    const span = dates.length
      ? `${formatDate(Math.min(...dates))} → ${formatDate(Math.max(...dates))}`
      : '—'
    return {
      count: filtered.length,
      authors: new Set(filtered.map((commit) => commit.author)).size,
      merges,
      files: fileCounts.size,
      span,
      topFiles: [...fileCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6),
    }
  }, [filtered])

  const selectedRow = useMemo(
    () => rows.find((row) => row.commit.hash === selectedHash) || null,
    [rows, selectedHash],
  )

  useEffect(() => {
    if (selectedHash && !nodeByHash.has(selectedHash)) setSelectedHash('')
  }, [nodeByHash, selectedHash])

  const graphWidth = Math.min(MAX_LANES, Math.max(1, laneCount)) * LANE_WIDTH + PAD_LEFT + PAD_RIGHT
  const totalHeight = rows.length * ROW_HEIGHT + PAD_TOP + 12

  const xOf = useCallback((lane) => PAD_LEFT + lane * LANE_WIDTH, [])
  const yOf = useCallback((row) => PAD_TOP + row * ROW_HEIGHT, [])

  const copyHash = useCallback(async (hash) => {
    try {
      await window.navigator.clipboard.writeText(hash)
      setCopiedHash(hash)
      window.setTimeout(() => setCopiedHash(''), 1400)
    } catch {
      // Clipboard unavailable.
    }
  }, [])

  const resetFilters = useCallback(() => {
    setAuthorFilter('all')
    setFromDate('')
    setToDate('')
    setFileFilter('')
    setTextFilter('')
  }, [])

  const activeFilters = [authorFilter !== 'all', fromDate, toDate, fileFilter.trim(), textFilter.trim()]
    .filter(Boolean).length

  if (!commits.length) {
    return <div className="empty-state"><p>No commit history found for this repository.</p></div>
  }

  return (
    <div className="commit-panel">
      <header className="commit-panel-header">
        <div className="commit-stat-grid">
          <div className="commit-stat">
            <span className="commit-stat-icon"><GitCommitHorizontal size={14} /></span>
            <div><strong>{stats.count}</strong><span>commits</span></div>
          </div>
          <div className="commit-stat">
            <span className="commit-stat-icon"><Users size={14} /></span>
            <div><strong>{stats.authors}</strong><span>authors</span></div>
          </div>
          <div className="commit-stat">
            <span className="commit-stat-icon"><GitMerge size={14} /></span>
            <div><strong>{stats.merges}</strong><span>merges</span></div>
          </div>
          <div className="commit-stat">
            <span className="commit-stat-icon"><Layers size={14} /></span>
            <div><strong>{stats.files}</strong><span>files touched</span></div>
          </div>
          <div className="commit-stat wide">
            <span className="commit-stat-icon"><Calendar size={14} /></span>
            <div><strong>{stats.span}</strong><span>range</span></div>
          </div>
        </div>

        <div className="commit-view-toggle">
          <button
            type="button"
            className={view === 'lanes' ? 'active' : ''}
            onClick={() => setView('lanes')}
            title="Branch lane view"
          >
            <GitBranch size={13} /> Lanes
          </button>
          <button
            type="button"
            className={view === '3d' ? 'active' : ''}
            onClick={() => setView('3d')}
            title="3D force graph view"
          >
            <Box size={13} /> 3D
          </button>
        </div>
      </header>

      {view === '3d' ? (
        <div className="commit-panel-3d">
          <CommitHistory3D history={{ ...history, commits: filtered }} />
        </div>
      ) : (
        <>
          {history?.shallow && commits.length < 30 && (
            <div className="commit-notice">
              <Info size={13} />
              <span>
                Showing {commits.length} commit{commits.length === 1 ? '' : 's'} from a shallow clone.
                Deeper history is fetched on demand when the network is available.
              </span>
            </div>
          )}
          <div className="commit-toolbar">
            <label className="commit-field">
              <Users size={13} />
              <select value={authorFilter} onChange={(event) => setAuthorFilter(event.target.value)}>
                <option value="all">All authors</option>
                {authors.map((author) => <option key={author} value={author}>{author}</option>)}
              </select>
            </label>
            <label className="commit-field">
              <Search size={13} />
              <input
                value={textFilter}
                onChange={(event) => setTextFilter(event.target.value)}
                placeholder="Search messages, hashes…"
              />
            </label>
            <label className="commit-field">
              <ListFilter size={13} />
              <input
                value={fileFilter}
                onChange={(event) => setFileFilter(event.target.value)}
                placeholder="Filter by file…"
              />
            </label>
            <label className="commit-field date">
              <Calendar size={13} />
              <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} aria-label="From date" />
            </label>
            <label className="commit-field date">
              <span className="commit-field-dash">→</span>
              <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} aria-label="To date" />
            </label>
            {activeFilters > 0 && (
              <button type="button" className="commit-reset" onClick={resetFilters}>
                <RotateCcw size={12} /> Clear ({activeFilters})
              </button>
            )}
          </div>

          <div className="commit-panel-body">
            <div className="commit-lane-scroll" ref={listRef}>
              {rows.length === 0 ? (
                <div className="commit-empty">No commits match the current filters.</div>
              ) : (
                <div className="commit-lane-inner" style={{ minHeight: totalHeight }}>
                  <svg
                    className="commit-lane-svg"
                    width={graphWidth}
                    height={totalHeight}
                    viewBox={`0 0 ${graphWidth} ${totalHeight}`}
                    aria-hidden="true"
                  >
                    {rows.map((row) => {
                      const from = { x: xOf(row.lane), y: yOf(row.row) }
                      const parents = (row.commit.parents || []).filter(Boolean)
                      const paths = []

                      parents.forEach((parentHash, parentIndex) => {
                        const parentNode = nodeByHash.get(parentHash)
                        const color = authorColor(row.commit.author, authorIndex)
                        if (!parentNode) {
                          // Parent outside the loaded window — draw a short stub.
                          paths.push(
                            <line
                              key={`${row.commit.hash}-stub-${parentHash}`}
                              x1={from.x}
                              y1={from.y}
                              x2={from.x}
                              y2={from.y + ROW_HEIGHT * 0.7}
                              stroke={color}
                              strokeWidth={1.4}
                              strokeOpacity={0.32}
                              strokeDasharray="2 3"
                            />,
                          )
                          return
                        }
                        const to = { x: xOf(parentNode.lane), y: yOf(parentNode.row) }
                        const isMergeEdge = parentIndex > 0 || row.isMerge
                        paths.push(
                          <path
                            key={`${row.commit.hash}-${parentHash}`}
                            d={
                              from.x === to.x
                                ? `M ${from.x} ${from.y} L ${to.x} ${to.y}`
                                : `M ${from.x} ${from.y} C ${from.x} ${(from.y + to.y) / 2}, ${to.x} ${(from.y + to.y) / 2}, ${to.x} ${to.y}`
                            }
                            fill="none"
                            stroke={color}
                            strokeWidth={isMergeEdge ? 1.5 : 2}
                            strokeOpacity={selectedHash && selectedHash !== row.commit.hash && selectedHash !== parentHash ? 0.28 : 0.78}
                            strokeLinecap="round"
                          />,
                        )
                      })

                      const isSelected = selectedHash === row.commit.hash
                      const isRelated = selectedHash
                        && !isSelected
                        && (row.commit.parents || []).includes(selectedHash)

                      return (
                        <g key={`edges-${row.commit.hash}`}>
                          {paths}
                          {isSelected && (
                            <circle cx={from.x} cy={from.y} r={9} fill="none" stroke="#0b6b2c" strokeWidth={1.4} strokeOpacity={0.7} />
                          )}
                          <circle
                            cx={from.x}
                            cy={from.y}
                            r={isSelected ? 5.4 : isRelated ? 4.6 : 4}
                            fill={isSelected ? '#111111' : authorColor(row.commit.author, authorIndex)}
                            stroke="#f3eee7"
                            strokeWidth={1.4}
                          />
                          {row.isMerge && (
                            <circle cx={from.x} cy={from.y} r={7.6} fill="none" stroke={authorColor(row.commit.author, authorIndex)} strokeWidth={1.2} strokeOpacity={0.6} />
                          )}
                        </g>
                      )
                    })}
                  </svg>

                  <div className="commit-lane-rows" style={{ height: totalHeight }}>
                    {rows.map((row) => {
                      const isSelected = selectedHash === row.commit.hash
                      const color = authorColor(row.commit.author, authorIndex)
                      return (
                        <button
                          type="button"
                          key={row.commit.hash}
                          className={`commit-lane-row ${isSelected ? 'is-selected' : ''}`}
                          style={{ height: ROW_HEIGHT }}
                          onClick={() => setSelectedHash(isSelected ? '' : row.commit.hash)}
                          title={row.commit.message}
                        >
                          <span className="commit-row-author-dot" style={{ background: color }} />
                          <span className="commit-row-main">
                            <span className="commit-row-message">{row.commit.message || '(no message)'}</span>
                            <span className="commit-row-meta">
                              <em>{row.commit.author}</em>
                              <i>·</i>
                              <span>{formatRelative(row.commit.date)}</span>
                              <i>·</i>
                              <span>{row.commit.filesChanged} file{row.commit.filesChanged === 1 ? '' : 's'}</span>
                              {row.isMerge && (<><i>·</i><span className="commit-row-merge">merge</span></>)}
                            </span>
                          </span>
                          <code className="commit-row-hash">{row.commit.shortHash}</code>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            <aside className="commit-inspector">
              {selectedRow ? (
                <>
                  <div className="commit-inspector-head">
                    <span className="commit-inspector-avatar" style={{ background: authorColor(selectedRow.commit.author, authorIndex) }}>
                      {initials(selectedRow.commit.author)}
                    </span>
                    <div>
                      <strong>{selectedRow.commit.author}</strong>
                      <span>{formatDate(selectedRow.commit.date)}</span>
                    </div>
                  </div>

                  <p className="commit-inspector-message">{selectedRow.commit.message || '(no message)'}</p>

                  <div className="commit-inspector-hash">
                    <code>{selectedRow.commit.hash}</code>
                    <button type="button" onClick={() => copyHash(selectedRow.commit.hash)} title="Copy full hash">
                      {copiedHash === selectedRow.commit.hash ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                  </div>

                  <div className="commit-inspector-meta">
                    <span><strong>{selectedRow.commit.filesChanged}</strong> files changed</span>
                    <span><strong>{(selectedRow.commit.parents || []).length}</strong> parent{(selectedRow.commit.parents || []).length === 1 ? '' : 's'}</span>
                  </div>

                  {repoUrl && (
                    <a
                      className="commit-inspector-link"
                      href={`${repoUrl.replace(/\.git$/, '')}/commit/${selectedRow.commit.hash}`}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      View on GitHub <ArrowUpRight size={12} />
                    </a>
                  )}

                  <div className="commit-inspector-section">
                    <span className="commit-inspector-label">Changed files</span>
                    <div className="commit-inspector-files">
                      {selectedRow.commit.changedFiles.slice(0, 24).map((file) => (
                        <code key={file} title={file}>{file}</code>
                      ))}
                      {selectedRow.commit.changedFiles.length > 24 && (
                        <em>+{selectedRow.commit.changedFiles.length - 24} more</em>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="commit-inspector-empty">
                    <GitCommitHorizontal size={18} />
                    <p>Select a commit</p>
                    <span>Click any row to inspect its message, author and changed files.</span>
                  </div>
                  {stats.topFiles.length > 0 && (
                    <div className="commit-inspector-section">
                      <span className="commit-inspector-label">Most changed files</span>
                      <div className="commit-hotfiles">
                        {stats.topFiles.map(([file, count]) => (
                          <div key={file}>
                            <code title={file}>{file}</code>
                            <span>{count}×</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </aside>
          </div>
        </>
      )}
    </div>
  )
}

export default CommitGraphPanel
