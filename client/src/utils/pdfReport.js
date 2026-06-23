import { CATEGORY_COLORS, CATEGORY_LABELS, LANGUAGE_LABELS, getNodeCategoryLabel, getNodeLanguageLabel } from '../graph-utils'

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN = 42
const THEME = {
  bg: '#070708',
  panel: '#111114',
  panelAlt: '#17171b',
  border: '#2a2a31',
  text: '#f4f4f5',
  muted: '#a1a1aa',
  cyan: '#5bc0de',
  blue: '#3b82f6',
  violet: '#8b5cf6',
  emerald: '#10b981',
  amber: '#f59e0b',
  pink: '#ec4899',
  red: '#ef4444',
}

const CHART_COLORS = [THEME.cyan, THEME.violet, THEME.emerald, THEME.amber, THEME.pink, THEME.blue, '#14b8a6', '#f97316']

function cleanText(value = '') {
  return String(value)
    .normalize('NFKD')
    .replace(/[^\x20-\x7E\n]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function escapePdfText(value = '') {
  return cleanText(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function hexToRgb(hex = '#999999') {
  const normalized = String(hex).replace('#', '').trim()
  const value = normalized.length === 3
    ? normalized.split('').map((part) => part + part).join('')
    : normalized.padEnd(6, '9').slice(0, 6)
  const intValue = Number.parseInt(value, 16)
  if (!Number.isFinite(intValue)) return [0.6, 0.6, 0.6]
  return [
    ((intValue >> 16) & 255) / 255,
    ((intValue >> 8) & 255) / 255,
    (intValue & 255) / 255,
  ]
}

function formatDate(value) {
  if (!value) return 'Unknown'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return cleanText(value)
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' })
}

function formatBytes(size = 0) {
  const value = Number(size) || 0
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function wrapText(text, maxChars) {
  const words = cleanText(text).split(' ').filter(Boolean)
  const lines = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length > maxChars && current) {
      lines.push(current)
      current = word
    } else {
      current = next
    }
  }
  if (current) lines.push(current)
  return lines
}

class PdfReport {
  constructor(title) {
    this.title = title
    this.pages = []
    this.current = []
    this.y = MARGIN
    this.addPage()
  }

  addPage() {
    if (this.current.length) this.pages.push(this.current.join('\n'))
    this.current = []
    this.y = MARGIN
    this.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, THEME.bg, THEME.bg)
    const pageNumber = this.pages.length + 1
    this.text('ALIYA AI', MARGIN, 24, 8, THEME.cyan, 'F2')
    this.text('REPOSITORY INTELLIGENCE', MARGIN + 50, 24, 7, THEME.muted, 'F1')
    this.text(String(pageNumber).padStart(2, '0'), PAGE_WIDTH - MARGIN - 12, PAGE_HEIGHT - 22, 8, THEME.muted, 'F2')
    this.line(MARGIN, PAGE_HEIGHT - 34, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 34, THEME.border, 0.6)
    this.y = 54
  }

  ensureSpace(height) {
    if (this.y + height > PAGE_HEIGHT - MARGIN) this.addPage()
  }

  raw(command) {
    this.current.push(command)
  }

  topY(y) {
    return PAGE_HEIGHT - y
  }

  setFill(color) {
    const [r, g, b] = hexToRgb(color)
    this.raw(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg`)
  }

  setStroke(color) {
    const [r, g, b] = hexToRgb(color)
    this.raw(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} RG`)
  }

  text(value, x, y, size = 10, color = THEME.text, font = 'F1') {
    this.setFill(color)
    this.raw(`BT /${font} ${size} Tf ${x.toFixed(2)} ${this.topY(y).toFixed(2)} Td (${escapePdfText(value)}) Tj ET`)
  }

  paragraph(value, x, maxWidthChars, size = 10, color = THEME.muted, lineHeight = size + 5) {
    const lines = wrapText(value, maxWidthChars)
    this.ensureSpace(lines.length * lineHeight + 4)
    for (const line of lines) {
      this.text(line, x, this.y, size, color)
      this.y += lineHeight
    }
    this.y += 4
  }

  heading(value, level = 1) {
    const size = level === 1 ? 21 : 13
    const color = level === 1 ? THEME.text : THEME.cyan
    this.ensureSpace(size + 16)
    this.text(value, MARGIN, this.y, size, color, 'F2')
    this.y += size + 10
    if (level === 1) {
      this.line(MARGIN, this.y, PAGE_WIDTH - MARGIN, this.y, THEME.border, 1)
      this.y += 14
    }
  }

  line(x1, y1, x2, y2, color = '#d4d4d8', width = 1) {
    this.setStroke(color)
    this.raw(`${width.toFixed(2)} w ${x1.toFixed(2)} ${this.topY(y1).toFixed(2)} m ${x2.toFixed(2)} ${this.topY(y2).toFixed(2)} l S`)
  }

  rect(x, y, width, height, fill = THEME.panel, stroke = THEME.border) {
    this.setFill(fill)
    this.setStroke(stroke)
    this.raw(`${x.toFixed(2)} ${this.topY(y + height).toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re B`)
  }

  circle(x, y, radius, fill = '#60a5fa', stroke = '#111827', width = 1) {
    const c = radius * 0.5522847498
    const cy = this.topY(y)
    this.setFill(fill)
    this.setStroke(stroke)
    this.raw(`${width.toFixed(2)} w ${(x + radius).toFixed(2)} ${cy.toFixed(2)} m ${(x + radius).toFixed(2)} ${(cy + c).toFixed(2)} ${(x + c).toFixed(2)} ${(cy + radius).toFixed(2)} ${x.toFixed(2)} ${(cy + radius).toFixed(2)} c ${(x - c).toFixed(2)} ${(cy + radius).toFixed(2)} ${(x - radius).toFixed(2)} ${(cy + c).toFixed(2)} ${(x - radius).toFixed(2)} ${cy.toFixed(2)} c ${(x - radius).toFixed(2)} ${(cy - c).toFixed(2)} ${(x - c).toFixed(2)} ${(cy - radius).toFixed(2)} ${x.toFixed(2)} ${(cy - radius).toFixed(2)} c ${(x + c).toFixed(2)} ${(cy - radius).toFixed(2)} ${(x + radius).toFixed(2)} ${(cy - c).toFixed(2)} ${(x + radius).toFixed(2)} ${cy.toFixed(2)} c B`)
  }

  polygon(points, fill, stroke = fill, width = 0.5) {
    if (!points.length) return
    this.setFill(fill)
    this.setStroke(stroke)
    const [first, ...rest] = points
    const commands = [`${width.toFixed(2)} w ${first.x.toFixed(2)} ${this.topY(first.y).toFixed(2)} m`]
    rest.forEach((point) => commands.push(`${point.x.toFixed(2)} ${this.topY(point.y).toFixed(2)} l`))
    commands.push('h B')
    this.raw(commands.join(' '))
  }

  donut(values, centerX, centerY, radius, innerRadius = radius * 0.52) {
    const total = values.reduce((sum, item) => sum + Math.max(0, Number(item.value) || 0), 0) || 1
    let start = -Math.PI / 2
    values.forEach((item, index) => {
      const sweep = (Math.max(0, Number(item.value) || 0) / total) * Math.PI * 2
      const segments = Math.max(4, Math.ceil(sweep / (Math.PI / 18)))
      const points = [{ x: centerX, y: centerY }]
      for (let step = 0; step <= segments; step += 1) {
        const angle = start + (sweep * step) / segments
        points.push({ x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius })
      }
      this.polygon(points, item.color || CHART_COLORS[index % CHART_COLORS.length], THEME.bg, 0.35)
      start += sweep
    })
    this.circle(centerX, centerY, innerRadius, THEME.panel, THEME.panel, 0)
  }

  bar(x, y, width, height, ratio, color = THEME.cyan) {
    this.rect(x, y, width, height, THEME.panelAlt, THEME.panelAlt)
    this.rect(x, y, Math.max(2, width * Math.max(0, Math.min(1, ratio))), height, color, color)
  }

  metricCard(label, value, x, y, width) {
    this.rect(x, y, width, 54, THEME.panel, THEME.border)
    this.rect(x, y, 3, 54, THEME.cyan, THEME.cyan)
    this.text(label.toUpperCase(), x + 12, y + 17, 7, THEME.muted, 'F2')
    this.text(value, x + 12, y + 39, 17, THEME.text, 'F2')
  }

  finalize() {
    if (this.current.length) {
      this.pages.push(this.current.join('\n'))
      this.current = []
    }

    const objects = []
    const addObject = (content) => {
      objects.push(content)
      return objects.length
    }

    const fontId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
    const boldFontId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>')
    const monoFontId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>')
    const pageIds = []

    for (const pageContent of this.pages) {
      const contentId = addObject(`<< /Length ${pageContent.length} >>\nstream\n${pageContent}\nendstream`)
      const pageId = addObject(`<< /Type /Page /Parent 0 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${boldFontId} 0 R /F3 ${monoFontId} 0 R >> >> /Contents ${contentId} 0 R >>`)
      pageIds.push(pageId)
    }

    const pagesId = addObject(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`)
    for (const pageId of pageIds) {
      objects[pageId - 1] = objects[pageId - 1].replace('/Parent 0 0 R', `/Parent ${pagesId} 0 R`)
    }
    const catalogId = addObject(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`)

    let pdf = '%PDF-1.4\n'
    const offsets = [0]
    objects.forEach((object, index) => {
      offsets.push(pdf.length)
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
    })
    const xrefOffset = pdf.length
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
    offsets.slice(1).forEach((offset) => {
      pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
    })
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
    return new Blob([pdf], { type: 'application/pdf' })
  }
}

function getLanguageBreakdown(analysis) {
  if (analysis?.summary?.languageBreakdown?.length) return analysis.summary.languageBreakdown
  const counts = new Map()
  for (const file of analysis?.files || []) {
    const language = file.language || 'unknown'
    counts.set(language, (counts.get(language) || 0) + 1)
  }
  return [...counts.entries()]
    .map(([language, count]) => ({ language, count }))
    .sort((left, right) => right.count - left.count)
}

function selectGraphNodes(analysis, limit = 70) {
  return [...(analysis?.graph?.nodes || [])]
    .filter((node) => node.type !== 'folder')
    .sort((left, right) => ((right.importance || 0) + (right.riskCount || 0) * 3) - ((left.importance || 0) + (left.riskCount || 0) * 3))
    .slice(0, limit)
}

function buildRadialPositions(nodes, x, y, width, height) {
  const centerX = x + width / 2
  const centerY = y + height / 2
  const positions = new Map()
  const rings = Math.max(1, Math.ceil(Math.sqrt(nodes.length / 6)))
  nodes.forEach((node, index) => {
    const ring = Math.min(rings, Math.floor(Math.sqrt(index / 6)) + 1)
    const ringItems = Math.max(8, ring * 12)
    const angle = ((index % ringItems) / ringItems) * Math.PI * 2 + ring * 0.35
    const radiusX = (width * 0.12) + (ring / rings) * (width * 0.36)
    const radiusY = (height * 0.10) + (ring / rings) * (height * 0.34)
    positions.set(node.id, {
      x: centerX + Math.cos(angle) * radiusX,
      y: centerY + Math.sin(angle) * radiusY,
    })
  })
  return positions
}

function drawGraph(pdf, analysis) {
  pdf.addPage()
  pdf.heading('Repository Graph Atlas', 1)
  pdf.paragraph('A static intelligence map of the most important files and their strongest repository relationships. Cyan and blue links represent dependency-heavy paths; muted links preserve structural context.', MARGIN, 92, 9)
  const x = MARGIN
  const y = pdf.y
  const width = PAGE_WIDTH - MARGIN * 2
  const height = 500
  pdf.ensureSpace(height + 38)
  pdf.rect(x, y, width, height, '#09090b', THEME.border)

  const nodes = selectGraphNodes(analysis, 80)
  const ids = new Set(nodes.map((node) => node.id))
  const edges = (analysis?.graph?.edges || [])
    .map((edge) => ({
      source: typeof edge.source === 'object' ? edge.source.id : edge.source,
      target: typeof edge.target === 'object' ? edge.target.id : edge.target,
      type: edge.type,
    }))
    .filter((edge) => ids.has(edge.source) && ids.has(edge.target))
    .slice(0, 130)
  const positions = buildRadialPositions(nodes, x + 14, y + 18, width - 28, height - 42)

  for (const edge of edges) {
    const source = positions.get(edge.source)
    const target = positions.get(edge.target)
    if (!source || !target) continue
    pdf.line(source.x, source.y, target.x, target.y, edge.type === 'dependency' ? THEME.cyan : '#3f3f46', edge.type === 'dependency' ? 0.8 : 0.4)
  }

  nodes.forEach((node, index) => {
    const point = positions.get(node.id)
    const language = getNodeLanguageLabel(node)
    const color = node.color || CATEGORY_COLORS[getNodeCategoryLabel(node)] || '#60a5fa'
    const radius = Math.max(3.5, Math.min(9, (node.size || 8) / 2.2))
    pdf.circle(point.x, point.y, radius, color, THEME.bg, 0.7)
    if (index < 18) {
      pdf.text(node.label, point.x + radius + 2, point.y + 3, 6.5, THEME.text, 'F2')
      pdf.text(LANGUAGE_LABELS[language] || language, point.x + radius + 2, point.y + 11, 5.5, THEME.muted)
    }
  })

  pdf.y += height + 16
  pdf.paragraph(`Snapshot coverage: ${nodes.length} priority file nodes and ${edges.length} dependency or semantic links. Node size follows repository importance and detected risk weight.`, MARGIN, 92, 9, THEME.muted)
}

function drawLanguageInsights(pdf, analysis) {
  pdf.addPage()
  pdf.heading('Language Intelligence', 1)
  pdf.paragraph('Language composition shows where implementation effort is concentrated. The chart and bars use file counts so the view remains comparable across repositories.', MARGIN, 92, 9)
  const languages = getLanguageBreakdown(analysis).slice(0, 10)
  const total = languages.reduce((sum, item) => sum + (Number(item.count) || 0), 0) || 1
  const donutValues = languages.map((item, index) => ({ value: item.count, color: CHART_COLORS[index % CHART_COLORS.length] }))
  pdf.rect(MARGIN, pdf.y, 220, 240, THEME.panel, THEME.border)
  pdf.donut(donutValues, MARGIN + 110, pdf.y + 116, 76, 40)
  pdf.text(String(total), MARGIN + 91, pdf.y + 112, 18, THEME.text, 'F2')
  pdf.text('FILES', MARGIN + 96, pdf.y + 128, 7, THEME.muted, 'F2')
  const legendX = MARGIN + 242
  const maxCount = Math.max(1, ...languages.map((item) => Number(item.count) || 0))
  languages.forEach((item, index) => {
    const rowY = pdf.y + index * 28
    const language = item.language || item.label || 'unknown'
    const color = CHART_COLORS[index % CHART_COLORS.length]
    pdf.text(LANGUAGE_LABELS[language] || language, legendX, rowY + 8, 9, color, 'F2')
    pdf.text(`${item.count} files - ${Math.round((item.count / total) * 100)}%`, PAGE_WIDTH - MARGIN - 92, rowY + 8, 7, THEME.muted)
    pdf.bar(legendX, rowY + 14, 225, 7, item.count / maxCount, color)
  })
  pdf.y += 286
  pdf.heading('Composition Signals', 2)
  const lead = languages[0]
  const second = languages[1]
  pdf.paragraph(`Primary language: ${LANGUAGE_LABELS[lead?.language] || lead?.language || 'unknown'} with ${lead?.count || 0} files. ${second ? `Secondary concentration: ${LANGUAGE_LABELS[second.language] || second.language} with ${second.count} files.` : ''} The repository uses ${languages.length} detected language groups in this report.`, MARGIN, 92, 10, THEME.text)
}

function drawArchitectureOverview(pdf, analysis) {
  pdf.addPage()
  pdf.heading('Architecture Overview', 1)
  const arch = analysis?.architecture?.summary || analysis?.summary?.architecture || {}

  pdf.paragraph(analysis?.summary?.architecture?.overview || analysis?.summary?.narrative || 'Architecture intelligence is generated from repository files, semantic links, detected layers, and pipeline risks.', MARGIN, 92, 9)

  const cardW = (PAGE_WIDTH - MARGIN * 2 - 24) / 3
  pdf.metricCard('Architecture nodes', String(arch.nodeCount || analysis?.graph?.nodes?.length || 0), MARGIN, pdf.y, cardW)
  pdf.metricCard('Dead code', String(arch.deadCodeCount || 0), MARGIN + cardW + 12, pdf.y, cardW)
  pdf.metricCard('Broken paths', String(arch.brokenPipelineCount || 0), MARGIN + (cardW + 12) * 2, pdf.y, cardW)
  pdf.y += 76

  pdf.heading('Layer Distribution', 2)
  const layerEntries = Object.entries(arch.layerSummary || {}).sort((a, b) => b[1] - a[1]).slice(0, 16)
  if (!layerEntries.length) {
    pdf.paragraph('No layer breakdown available.', MARGIN, 90, 10)
  } else {
    const maxLayer = Math.max(1, ...layerEntries.map(([, count]) => count))
    layerEntries.slice(0, 10).forEach(([layer, count], index) => {
      pdf.ensureSpace(27)
      const color = CATEGORY_COLORS[layer] || CHART_COLORS[index % CHART_COLORS.length]
      pdf.text(CATEGORY_LABELS[layer] || layer, MARGIN, pdf.y + 7, 9, color, 'F2')
      pdf.text(`${count}`, PAGE_WIDTH - MARGIN - 18, pdf.y + 7, 8, THEME.text, 'F2')
      pdf.bar(MARGIN + 105, pdf.y, 340, 9, count / maxLayer, color)
      pdf.y += 25
    })
  }

  pdf.y += 8
  pdf.heading('System Path Diagram', 2)
  const pathLayers = layerEntries.slice(0, 5)
  const boxW = 88
  const gap = 14
  pathLayers.forEach(([layer, count], index) => {
    const x = MARGIN + index * (boxW + gap)
    pdf.rect(x, pdf.y, boxW, 54, THEME.panel, CATEGORY_COLORS[layer] || CHART_COLORS[index])
    pdf.text(CATEGORY_LABELS[layer] || layer, x + 8, pdf.y + 20, 8, CATEGORY_COLORS[layer] || CHART_COLORS[index], 'F2')
    pdf.text(`${count} nodes`, x + 8, pdf.y + 37, 7, THEME.muted)
    if (index < pathLayers.length - 1) {
      pdf.line(x + boxW, pdf.y + 27, x + boxW + gap, pdf.y + 27, THEME.cyan, 1.4)
    }
  })
}

function drawArchitectureFlow(pdf, analysis, activeArchitectureFlow) {
  pdf.addPage()
  pdf.heading('Architecture Flow Map', 1)
  const flows = analysis?.flows?.available || []
  const selectedFlow = activeArchitectureFlow || flows[0]

  if (selectedFlow) {
    pdf.paragraph(`${selectedFlow.label || selectedFlow.type || 'Architecture Flow'} - ${selectedFlow.summary || `${selectedFlow.nodes?.length || 0} nodes across ${selectedFlow.layers?.length || 0} layers.`}`, MARGIN, 92, 10, THEME.text)
    ;(selectedFlow.stages || []).slice(0, 12).forEach((stage, index) => {
      pdf.ensureSpace(55)
      const color = CATEGORY_COLORS[stage.layer] || CHART_COLORS[index % CHART_COLORS.length]
      const nodeY = pdf.y
      pdf.circle(MARGIN + 18, nodeY + 18, 12, color, THEME.bg, 1)
      pdf.text(String(index + 1), MARGIN + 14, nodeY + 21, 8, THEME.bg, 'F2')
      pdf.rect(MARGIN + 42, nodeY, PAGE_WIDTH - MARGIN * 2 - 42, 40, THEME.panel, THEME.border)
      pdf.text(stage.label || stage.nodeId, MARGIN + 54, nodeY + 16, 9, THEME.text, 'F2')
      pdf.text(`${CATEGORY_LABELS[stage.layer] || stage.layer || 'layer'} / ${stage.path || ''}`, MARGIN + 54, nodeY + 30, 7, color, 'F3')
      if (index < Math.min(11, (selectedFlow.stages || []).length - 1)) pdf.line(MARGIN + 18, nodeY + 30, MARGIN + 18, nodeY + 52, THEME.cyan, 1)
      pdf.y += 53
    })
  } else {
    pdf.paragraph('No architecture flow metadata available.', MARGIN, 90, 10)
  }
}

function drawCommits(pdf, commitHistory) {
  pdf.addPage()
  pdf.heading('Commit Intelligence', 1)

  if (!commitHistory?.commits?.length) {
    pdf.paragraph('Commit history was not available for this report.', MARGIN, 90, 10)
    return
  }

  const commits = commitHistory.commits
  const authors = commitHistory.authors || []
  const files = commitHistory.files || []
  const totalFilesChanged = commits.reduce((sum, commit) => sum + (commit.filesChanged || 0), 0)
  const cardW = (PAGE_WIDTH - MARGIN * 2 - 24) / 3
  pdf.metricCard('Commits', String(commits.length), MARGIN, pdf.y, cardW)
  pdf.metricCard('Authors', String(authors.length), MARGIN + cardW + 12, pdf.y, cardW)
  pdf.metricCard('Changed files', String(files.length), MARGIN + (cardW + 12) * 2, pdf.y, cardW)
  pdf.y += 68
  pdf.paragraph(`Analytics are generated from the latest ${commits.length} commits. The graph contains ${totalFilesChanged} file-change events across ${authors.length} contributors.`, MARGIN, 92, 10)

  pdf.heading('Change Intensity', 2)
  const recent = commits.slice(0, 24).reverse()
  const chartY = pdf.y + 120
  const chartH = 110
  const barW = (PAGE_WIDTH - MARGIN * 2) / Math.max(1, recent.length)
  const maxChanges = Math.max(1, ...recent.map((commit) => commit.filesChanged || 0))
  recent.forEach((commit, index) => {
    const height = ((commit.filesChanged || 0) / maxChanges) * chartH
    pdf.rect(MARGIN + index * barW, chartY - height, Math.max(2, barW - 2), height, CHART_COLORS[index % CHART_COLORS.length], CHART_COLORS[index % CHART_COLORS.length])
  })
  pdf.line(MARGIN, chartY, PAGE_WIDTH - MARGIN, chartY, THEME.border, 0.8)
  pdf.y = chartY + 32

  pdf.heading('Contributor Distribution', 2)
  const authorCounts = new Map()
  commits.forEach((commit) => authorCounts.set(commit.author || 'Unknown', (authorCounts.get(commit.author || 'Unknown') || 0) + 1))
  const authorRows = [...authorCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
  const maxAuthor = Math.max(1, ...authorRows.map(([, count]) => count))
  authorRows.forEach(([author, count], index) => {
    pdf.text(author, MARGIN, pdf.y + 7, 8, CHART_COLORS[index % CHART_COLORS.length], 'F2')
    pdf.bar(MARGIN + 130, pdf.y, 300, 9, count / maxAuthor, CHART_COLORS[index % CHART_COLORS.length])
    pdf.text(String(count), PAGE_WIDTH - MARGIN - 18, pdf.y + 7, 8, THEME.text, 'F2')
    pdf.y += 24
  })

  pdf.addPage()
  pdf.heading('Recent Commit Timeline', 1)
  commits.slice(0, 18).forEach((commit, index) => {
    pdf.ensureSpace(38)
    const color = CHART_COLORS[index % CHART_COLORS.length]
    pdf.circle(MARGIN + 8, pdf.y + 7, 4, color, color, 0)
    if (index < Math.min(17, commits.length - 1)) pdf.line(MARGIN + 8, pdf.y + 12, MARGIN + 8, pdf.y + 35, THEME.border, 1)
    pdf.text(`${commit.shortHash || cleanText(commit.hash).slice(0, 7)}  ${commit.message || 'No message'}`, MARGIN + 24, pdf.y + 5, 9, THEME.text, 'F2')
    pdf.text(`${commit.author || 'Unknown'} / ${formatDate(commit.date)} / ${commit.filesChanged || 0} files`, MARGIN + 24, pdf.y + 20, 7, color)
    pdf.y += 36
  })
}

function drawStats(pdf, analysis) {
  pdf.addPage()
  pdf.heading('Repository Inventory', 1)
  const files = analysis?.files || []
  const totalSize = files.reduce((sum, file) => sum + (file.size || 0), 0)
  const languages = getLanguageBreakdown(analysis)

  pdf.metricCard('Folders', String(analysis?.summary?.folderCount || 0), MARGIN, pdf.y, 112)
  pdf.metricCard('Files', String(analysis?.summary?.fileCount || files.length), MARGIN + 124, pdf.y, 112)
  pdf.metricCard('Languages', String(languages.length), MARGIN + 248, pdf.y, 112)
  pdf.metricCard('Code size', formatBytes(totalSize), MARGIN + 372, pdf.y, 112)
  pdf.y += 70

  pdf.heading('Folder Distribution', 2)
  const folders = (analysis?.summary?.topFolders || []).slice(0, 14)
  const maxFolder = Math.max(1, ...folders.map((folder) => folder.fileCount || folder.count || 0))
  folders.forEach((folder, index) => {
    const count = folder.fileCount || folder.count || 0
    const color = CHART_COLORS[index % CHART_COLORS.length]
    pdf.ensureSpace(28)
    pdf.text(folder.path || folder.label || 'folder', MARGIN, pdf.y + 7, 8, color, 'F2')
    pdf.bar(MARGIN + 190, pdf.y, 270, 9, count / maxFolder, color)
    pdf.text(String(count), PAGE_WIDTH - MARGIN - 18, pdf.y + 7, 8, THEME.text, 'F2')
    pdf.y += 25
  })

  pdf.addPage()
  pdf.heading('Important Files and Hotspots', 1)
  const importantFiles = (analysis?.summary?.importantFiles || []).slice(0, 20)
  const maxScore = Math.max(1, ...importantFiles.map((file) => file.score || 1))
  importantFiles.forEach((file, index) => {
    pdf.ensureSpace(34)
    const color = CHART_COLORS[index % CHART_COLORS.length]
    pdf.text(file.path || file.label || file, MARGIN, pdf.y + 7, 8, THEME.text, 'F3')
    pdf.text(file.reason || 'repository hotspot', MARGIN, pdf.y + 21, 7, color)
    pdf.bar(PAGE_WIDTH - MARGIN - 120, pdf.y + 8, 90, 7, (file.score || 1) / maxScore, color)
    pdf.text(String(file.score || ''), PAGE_WIDTH - MARGIN - 24, pdf.y + 14, 7, THEME.muted, 'F2')
    pdf.y += 32
  })
}

function drawRiskDashboard(pdf, analysis) {
  pdf.addPage()
  pdf.heading('Quality and Risk Dashboard', 1)
  const arch = analysis?.architecture?.summary || analysis?.summary?.architecture || {}
  const risks = [
    ['Dead code', arch.deadCodeCount || 0, THEME.red],
    ['Broken pipelines', arch.brokenPipelineCount || 0, THEME.amber],
    ['Unresolved imports', arch.unresolvedImportCount || 0, THEME.violet],
    ['Unmatched APIs', arch.unmatchedApiCount || 0, THEME.pink],
    ['Circular dependencies', arch.circularDependencyCount || 0, THEME.cyan],
  ]
  const maxRisk = Math.max(1, ...risks.map(([, count]) => count))
  risks.forEach(([label, count, color], index) => {
    const y = pdf.y + index * 68
    pdf.rect(MARGIN, y, PAGE_WIDTH - MARGIN * 2, 52, THEME.panel, THEME.border)
    pdf.rect(MARGIN, y, 5, 52, color, color)
    pdf.text(label, MARGIN + 18, y + 20, 10, color, 'F2')
    pdf.text(String(count), PAGE_WIDTH - MARGIN - 34, y + 22, 18, THEME.text, 'F2')
    pdf.bar(MARGIN + 18, y + 33, 380, 6, count / maxRisk, color)
  })
  pdf.y += risks.length * 68 + 18
  pdf.heading('Interpretation', 2)
  const totalRisk = risks.reduce((sum, [, count]) => sum + count, 0)
  pdf.paragraph(totalRisk ? `The analysis detected ${totalRisk} architecture-level risk signals. Review red and amber categories first, then validate imports, API contracts, and dependency cycles.` : 'No architecture-level risk signals were detected in the current scan. Continue validating runtime behavior with tests and production telemetry.', MARGIN, 92, 10, totalRisk ? THEME.amber : THEME.emerald)
}

function drawAppendix(pdf, analysis, commitHistory) {
  pdf.addPage()
  pdf.heading('Technical Appendix', 1)
  const rows = [
    ['Repository', analysis.repoName || 'Repository'],
    ['Source', analysis.repoUrl || 'Local repository'],
    ['Branch', analysis.branch || 'default'],
    ['Scanned', formatDate(analysis.scannedAt)],
    ['Graph nodes', String(analysis.graph?.nodes?.length || 0)],
    ['Graph edges', String(analysis.graph?.edges?.length || 0)],
    ['Dependency edges', String(analysis.summary?.dependencyEdgeCount || 0)],
    ['Semantic edges', String(analysis.summary?.semanticEdgeCount || 0)],
    ['External dependencies', String(analysis.summary?.externalDependencies?.length || 0)],
    ['Commit sample', String(commitHistory?.commits?.length || 0)],
  ]
  rows.forEach(([label, value], index) => {
    const y = pdf.y + index * 34
    pdf.rect(MARGIN, y, 155, 27, index % 2 ? THEME.panelAlt : THEME.panel, THEME.border)
    pdf.rect(MARGIN + 155, y, PAGE_WIDTH - MARGIN * 2 - 155, 27, index % 2 ? THEME.panelAlt : THEME.panel, THEME.border)
    pdf.text(label.toUpperCase(), MARGIN + 10, y + 17, 7, CHART_COLORS[index % CHART_COLORS.length], 'F2')
    pdf.text(value, MARGIN + 167, y + 17, 8, THEME.text, 'F3')
  })
  pdf.y += rows.length * 34 + 26
  pdf.heading('Report Scope', 2)
  pdf.paragraph('This document is a static snapshot generated from Aliya AI repository analysis. Interactive node inspection, live graph navigation, AI summaries, and filtering remain available inside the application.', MARGIN, 92, 9, THEME.muted)
}

export function generateRepositoryPdfReport({ analysis, commitHistory, activeArchitectureFlow }) {
  if (!analysis) throw new Error('Repository analysis is required')

  const pdf = new PdfReport(`${analysis.repoName || 'Repository'} Report`)
  const languages = getLanguageBreakdown(analysis)
  const graph = analysis.graph || { nodes: [], edges: [] }

  pdf.text('REPOSITORY INTELLIGENCE REPORT', MARGIN, 92, 9, THEME.cyan, 'F2')
  pdf.text(analysis.repoName || 'Repository', MARGIN, 134, 30, THEME.text, 'F2')
  pdf.y = 164
  pdf.paragraph(analysis.summary?.description || analysis.summary?.narrative || analysis.repoUrl || 'Repository analysis report.', MARGIN, 76, 11, THEME.muted, 17)
  pdf.rect(MARGIN, 230, PAGE_WIDTH - MARGIN * 2, 4, THEME.cyan, THEME.cyan)
  pdf.y = 270

  const cardW = (PAGE_WIDTH - MARGIN * 2 - 24) / 3
  pdf.metricCard('Graph nodes', String(graph.nodes?.length || 0), MARGIN, pdf.y, cardW)
  pdf.metricCard('Graph edges', String(graph.edges?.length || 0), MARGIN + cardW + 12, pdf.y, cardW)
  pdf.metricCard('Languages', String(languages.length), MARGIN + (cardW + 12) * 2, pdf.y, cardW)
  pdf.y += 68
  pdf.metricCard('Folders', String(analysis.summary?.folderCount || 0), MARGIN, pdf.y, cardW)
  pdf.metricCard('Files', String(analysis.summary?.fileCount || analysis.files?.length || 0), MARGIN + cardW + 12, pdf.y, cardW)
  pdf.metricCard('Commits', String(commitHistory?.commits?.length || 0), MARGIN + (cardW + 12) * 2, pdf.y, cardW)
  pdf.y += 78

  pdf.heading('Executive Summary', 2)
  pdf.paragraph(analysis.summary?.narrative || 'No narrative summary available.', MARGIN, 92, 10, THEME.text)

  const coverDonut = languages.slice(0, 6).map((item, index) => ({ value: item.count, color: CHART_COLORS[index] }))
  if (coverDonut.length) {
    pdf.donut(coverDonut, PAGE_WIDTH - MARGIN - 62, 690, 42, 23)
    pdf.text('MIX', PAGE_WIDTH - MARGIN - 72, 694, 8, THEME.text, 'F2')
  }

  drawGraph(pdf, analysis)
  drawLanguageInsights(pdf, analysis)
  drawArchitectureOverview(pdf, analysis)
  drawArchitectureFlow(pdf, analysis, activeArchitectureFlow)
  drawCommits(pdf, commitHistory)
  drawStats(pdf, analysis)
  drawRiskDashboard(pdf, analysis)
  drawAppendix(pdf, analysis, commitHistory)

  return pdf.finalize()
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
