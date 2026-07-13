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

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function statusText(value) {
  if (value === null || value === undefined || value === '') return 'Unable to Verify'
  return String(value)
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return 'Unable to Verify'
  return `${value.toFixed(value < 10 && value > 0 ? 1 : 0)}%`
}

function getPath(file) {
  return typeof file === 'string' ? file : file?.path || ''
}

function getFileName(filePath) {
  return filePath.split('/').filter(Boolean).pop() || filePath || 'Unknown'
}

function pathMatches(filePath, patterns) {
  const normalized = String(filePath || '').toLowerCase()
  return patterns.some((pattern) => pattern.test(normalized))
}

function classifyFile(file) {
  const filePath = getPath(file)
  const lowerPath = filePath.toLowerCase()
  const name = getFileName(lowerPath)
  const ext = name.includes('.') ? `.${name.split('.').pop()}` : ''
  const test = pathMatches(lowerPath, [
    /(^|\/)(__tests__|tests?|spec|e2e|cypress|playwright)(\/|$)/,
    /\.(test|spec)\.[a-z0-9]+$/,
  ])
  const documentation = pathMatches(lowerPath, [
    /(^|\/)(docs?|documentation|guides?)(\/|$)/,
    /(^|\/)readme(\.|$)/,
    /\.(md|mdx|rst|adoc|txt)$/,
  ])
  const generated = pathMatches(lowerPath, [
    /(^|\/)(dist|build|coverage|generated|\.cache|cache)(\/|$)/,
    /\.min\.(js|css)$/,
    /(^|\/).*generated\.[a-z0-9]+$/,
    /(^|\/)(package-lock|yarn\.lock|pnpm-lock)\.yaml?$/,
  ])
  const config = pathMatches(lowerPath, [
    /(^|\/)(package|tsconfig|vite\.config|next\.config|webpack\.config|rollup\.config|eslint\.config|babel\.config)\.[a-z0-9]+$/,
    /(^|\/)(dockerfile|docker-compose\.ya?ml|makefile|\.env.example|\.gitignore)$/,
    /\.(json|ya?ml|toml|ini|config\.[a-z0-9]+)$/,
  ])
  const asset = /\.(png|jpe?g|gif|svg|webp|ico|mp4|mp3|wav|woff2?|ttf|otf|pdf)$/.test(lowerPath)
  const source = !test && !documentation && !generated && !asset && !config

  return { ext, test, documentation, generated, config, asset, source }
}

function getLanguageBreakdown(analysis) {
  const files = asArray(analysis?.files)
  const totals = new Map()
  for (const file of files) {
    const language = file.language || 'unknown'
    const current = totals.get(language) || { language, count: 0, bytes: 0 }
    current.count += 1
    current.bytes += Number(file.size) || 0
    totals.set(language, current)
  }
  return [...totals.values()].sort((left, right) => right.count - left.count)
}

function buildGraphStats(analysis) {
  const nodes = asArray(analysis?.graph?.nodes)
  const edges = asArray(analysis?.graph?.edges)
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const stats = new Map(nodes.map((node) => [node.id, {
    id: node.id,
    node,
    in: 0,
    out: 0,
    degree: 0,
    dependencyOut: 0,
    dependencyIn: 0,
  }]))

  for (const rawEdge of edges) {
    const source = typeof rawEdge.source === 'object' ? rawEdge.source?.id : rawEdge.source
    const target = typeof rawEdge.target === 'object' ? rawEdge.target?.id : rawEdge.target
    if (!source || !target) continue
    const sourceStats = stats.get(source)
    const targetStats = stats.get(target)
    if (sourceStats) {
      sourceStats.out += 1
      sourceStats.degree += 1
      if (rawEdge.type === 'dependency') sourceStats.dependencyOut += 1
    }
    if (targetStats) {
      targetStats.in += 1
      targetStats.degree += 1
      if (rawEdge.type === 'dependency') targetStats.dependencyIn += 1
    }
  }

  const fileStats = [...stats.values()].filter((item) => item.node?.type !== 'folder')
  return {
    nodes,
    edges,
    nodeById,
    fileStats,
    mostConnected: [...fileStats].sort((a, b) => b.degree - a.degree).slice(0, 12),
    fanIn: [...fileStats].sort((a, b) => b.in - a.in).slice(0, 12),
    fanOut: [...fileStats].sort((a, b) => b.out - a.out).slice(0, 12),
    dependencyHeavy: [...fileStats].sort((a, b) => b.dependencyOut - a.dependencyOut).slice(0, 12),
  }
}

function selectGraphNodes(analysis, limit = 70) {
  return [...asArray(analysis?.graph?.nodes)]
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

function drawTable(pdf, headers, rows, widths) {
  const maxWidth = PAGE_WIDTH - MARGIN * 2
  const rawTotal = widths.reduce((sum, width) => sum + width, 0)
  const scaledWidths = rawTotal > maxWidth ? widths.map((width) => (width / rawTotal) * maxWidth) : widths
  const totalWidth = scaledWidths.reduce((sum, width) => sum + width, 0)
  const startX = MARGIN
  pdf.ensureSpace(32)
  pdf.rect(startX, pdf.y, totalWidth, 24, THEME.panelAlt, THEME.border)
  let cursorX = startX
  headers.forEach((header, index) => {
    pdf.text(header, cursorX + 6, pdf.y + 15, 6.5, THEME.cyan, 'F2')
    cursorX += scaledWidths[index]
  })
  pdf.y += 24

  rows.forEach((row, rowIndex) => {
    pdf.ensureSpace(25)
    pdf.rect(startX, pdf.y, totalWidth, 24, rowIndex % 2 ? '#101014' : THEME.panel, THEME.border)
    cursorX = startX
    row.forEach((cell, cellIndex) => {
      const width = scaledWidths[cellIndex]
      const text = cleanText(statusText(cell))
      const maxChars = Math.max(8, Math.floor(width / 4.6))
      const clipped = text.length > maxChars ? `${text.slice(0, Math.max(0, maxChars - 3))}...` : text
      pdf.text(clipped, cursorX + 6, pdf.y + 15, 6.7, cellIndex === 0 ? THEME.text : THEME.muted, cellIndex === 0 ? 'F2' : 'F1')
      cursorX += width
    })
    pdf.y += 24
  })
  pdf.y += 12
}

function drawEvidenceList(pdf, title, rows, emptyMessage = 'Not Detected') {
  pdf.heading(title, 2)
  if (!rows.length) {
    pdf.paragraph(emptyMessage, MARGIN, 92, 9, THEME.muted)
    return
  }
  rows.slice(0, 14).forEach((row, index) => {
    pdf.ensureSpace(42)
    const color = row.color || CHART_COLORS[index % CHART_COLORS.length]
    pdf.rect(MARGIN, pdf.y, PAGE_WIDTH - MARGIN * 2, 34, THEME.panel, THEME.border)
    pdf.rect(MARGIN, pdf.y, 4, 34, color, color)
    pdf.text(row.title || 'Signal', MARGIN + 12, pdf.y + 13, 8, THEME.text, 'F2')
    pdf.text(row.detail || row.evidence || 'Evidence unavailable', MARGIN + 12, pdf.y + 26, 6.5, color)
    if (row.value !== undefined) pdf.text(String(row.value), PAGE_WIDTH - MARGIN - 42, pdf.y + 19, 11, THEME.text, 'F2')
    pdf.y += 40
  })
}

function drawRankedList(pdf, title, rankedRows, metricKey) {
  pdf.heading(title, 2)
  const rows = rankedRows
    .filter((item) => (Number(item[metricKey]) || 0) > 0)
    .slice(0, 8)
    .map((item) => [
      item.node?.path || item.node?.label || item.id,
      String(item[metricKey] || 0),
      item.node?.layer || item.node?.language || 'scanner graph',
    ])
  drawTable(pdf, ['File', 'Value', 'Evidence'], rows, [300, 54, 138])
}

function buildInventory(analysis) {
  const files = asArray(analysis?.files)
  const classified = files.map((file) => ({ file, ...classifyFile(file) }))
  const count = files.length || 1
  const folders = new Set()
  files.forEach((file) => {
    const parts = getPath(file).split('/').filter(Boolean)
    for (let index = 1; index < parts.length; index += 1) {
      folders.add(parts.slice(0, index).join('/'))
    }
  })
  const byExt = new Map()
  classified.forEach((item) => {
    const ext = item.ext || 'none'
    byExt.set(ext, (byExt.get(ext) || 0) + 1)
  })

  return {
    files,
    classified,
    fileCount: files.length,
    folderCount: analysis?.summary?.folderCount ?? folders.size,
    packages: asArray(analysis?.summary?.externalDependencies),
    languages: getLanguageBreakdown(analysis),
    totalSize: files.reduce((sum, file) => sum + (Number(file.size) || 0), 0),
    assets: classified.filter((item) => item.asset),
    configs: classified.filter((item) => item.config),
    docs: classified.filter((item) => item.documentation),
    tests: classified.filter((item) => item.test),
    generated: classified.filter((item) => item.generated),
    sources: classified.filter((item) => item.source),
    generatedPercent: (classified.filter((item) => item.generated).length / count) * 100,
    testPercent: (classified.filter((item) => item.test).length / count) * 100,
    documentationPercent: (classified.filter((item) => item.documentation).length / count) * 100,
    extensions: [...byExt.entries()].sort((a, b) => b[1] - a[1]),
    largestFiles: [...files].sort((a, b) => (Number(b.size) || 0) - (Number(a.size) || 0)).slice(0, 12),
  }
}

function getRisks(analysis) {
  return asArray(analysis?.architecture?.risks)
}

function riskRows(analysis, kind) {
  return getRisks(analysis)
    .filter((risk) => risk.kind === kind)
    .map((risk) => ({
      title: risk.fileId?.replace(/^file:/, '') || 'Unknown file',
      detail: risk.message || kind,
      value: risk.severity || 'Detected',
      color: risk.severity === 'high' ? THEME.red : THEME.amber,
    }))
}

function drawGraph(pdf, analysis) {
  pdf.addPage()
  pdf.heading('Repository Graph Atlas', 1)
  pdf.paragraph('A static map generated only from repository graph nodes and edges collected by the scanner. No semantic edges are invented in this report.', MARGIN, 92, 9)
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
  pdf.paragraph(`Snapshot coverage: ${nodes.length} priority file nodes and ${edges.length} scanner-provided links. Node size follows scanner importance and detected risk weight.`, MARGIN, 92, 9, THEME.muted)

  const graphStats = buildGraphStats(analysis)
  drawRankedList(pdf, 'Most Connected Files', graphStats.mostConnected, 'degree')
  drawRankedList(pdf, 'Highest Fan-In', graphStats.fanIn, 'in')
  drawRankedList(pdf, 'Highest Fan-Out', graphStats.fanOut, 'out')
  drawRankedList(pdf, 'Highest Dependency Files', graphStats.dependencyHeavy, 'dependencyOut')
}

function drawLanguageInsights(pdf, analysis) {
  pdf.addPage()
  pdf.heading('Language Intelligence', 1)
  pdf.paragraph('Language composition is computed from scanner file records after ignored directories have already been excluded by repository analysis. LOC, comment lines, blank lines, and source lines are not displayed unless verified in the analysis payload.', MARGIN, 92, 9)
  const languages = getLanguageBreakdown(analysis).slice(0, 10)
  const total = languages.reduce((sum, item) => sum + (Number(item.count) || 0), 0) || 1
  const totalBytes = languages.reduce((sum, item) => sum + (Number(item.bytes) || 0), 0) || 1
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
  pdf.heading('Verified Language Table', 2)
  drawTable(pdf, ['Language', 'File %', 'Files', 'Bytes', 'LOC', 'Comments', 'Blank', 'Source'], languages.slice(0, 12).map((item) => [
    LANGUAGE_LABELS[item.language] || item.language || 'unknown',
    formatPercent((item.count / total) * 100),
    String(item.count),
    formatBytes(item.bytes),
    'Unable to Verify',
    'Unable to Verify',
    'Unable to Verify',
    'Unable to Verify',
  ]), [96, 54, 38, 64, 62, 68, 52, 62])
  pdf.heading('Composition Signals', 2)
  const lead = languages[0]
  const second = languages[1]
  const inventory = buildInventory(analysis)
  pdf.paragraph(`Largest language by file count: ${LANGUAGE_LABELS[lead?.language] || lead?.language || 'Not Detected'} (${lead?.count || 0} files, ${formatBytes(lead?.bytes || 0)}). ${second ? `Second largest: ${LANGUAGE_LABELS[second.language] || second.language} (${second.count} files).` : ''} Generated code: ${formatPercent(inventory.generatedPercent)}. Test code: ${formatPercent(inventory.testPercent)}. Documentation: ${formatPercent(inventory.documentationPercent)}. Byte share for all languages totals ${formatBytes(totalBytes)}.`, MARGIN, 92, 10, THEME.text)
}

function drawArchitectureOverview(pdf, analysis) {
  pdf.addPage()
  pdf.heading('Architecture Overview', 1)
  const arch = analysis?.architecture?.summary || analysis?.summary?.architecture || {}

  pdf.paragraph('Architecture is reported only from scanner-detected file roles, layers, imports, and semantic edges. Domain modules such as auth, payment, cache, or database appear only when matching files or roles exist in the analyzed repository.', MARGIN, 92, 9)

  const cardW = (PAGE_WIDTH - MARGIN * 2 - 24) / 3
  pdf.metricCard('Architecture nodes', String(arch.nodeCount || analysis?.graph?.nodes?.length || 0), MARGIN, pdf.y, cardW)
  pdf.metricCard('Dead code', String(arch.deadCodeCount || 0), MARGIN + cardW + 12, pdf.y, cardW)
  pdf.metricCard('Broken signals', String(arch.brokenPipelineCount || 0), MARGIN + (cardW + 12) * 2, pdf.y, cardW)
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
  pdf.heading('Detected Architecture Roles', 2)
  const roleRows = Object.entries(arch.layerSummary || {})
    .sort((a, b) => b[1] - a[1])
    .map(([layer, count]) => [CATEGORY_LABELS[layer] || layer, String(count), 'Detected from file paths, imports, and scanner role inference'])
  drawTable(pdf, ['Role / Layer', 'Files', 'Evidence'], roleRows.slice(0, 12), [130, 50, 312])

  pdf.heading('System Path Diagram', 2)
  const pathLayers = layerEntries.slice(0, 5)
  if (!pathLayers.length) {
    pdf.paragraph('Insufficient Evidence: no scanner layer distribution was available.', MARGIN, 92, 9)
    return
  }
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

function drawDependencyGraph(pdf, analysis, activeArchitectureFlow) {
  pdf.addPage()
  pdf.heading('Architecture Flow Evidence', 1)
  const flows = analysis?.flows?.available || []
  const orderedFlows = activeArchitectureFlow
    ? [activeArchitectureFlow, ...flows.filter((flow) => flow.id !== activeArchitectureFlow.id)]
    : flows

  if (orderedFlows.length) {
    pdf.paragraph('Only flows emitted by the repository analyzer are included. Missing authentication, payment, cache, queue, API, or framework flows are intentionally omitted instead of inferred.', MARGIN, 92, 9, THEME.text)
    orderedFlows.slice(0, 8).forEach((flow, flowIndex) => {
      pdf.ensureSpace(126)
      if (flowIndex > 0) pdf.y += 8
      pdf.heading(flow.label || flow.type || 'Architecture Flow', 2)
      drawTable(pdf, ['Signal', 'Value'], [
        ['Confidence', flow.confidence != null ? `${flow.confidence}%` : 'Unable to Verify'],
        ['Entry Point', flow.entryPoint?.path || flow.stages?.[0]?.path || 'Unable to Verify'],
        ['Exit Point', flow.exitPoint?.path || flow.stages?.[flow.stages.length - 1]?.path || 'Unable to Verify'],
        ['Framework', flow.framework || 'Unable to Verify'],
        ['Verification', asArray(flow.verification).join(', ') || 'Insufficient Evidence'],
      ], [120, 372])
      pdf.paragraph(flow.explanation || flow.summary || 'Insufficient Evidence: explanation unavailable.', MARGIN, 92, 9, THEME.muted)

      const evidenceText = asArray(flow.evidence).slice(0, 8).join(' / ') || 'Insufficient Evidence'
      pdf.paragraph(`Evidence: ${evidenceText}`, MARGIN, 92, 8, THEME.cyan)
      pdf.paragraph(`Source files: ${asArray(flow.sourceFiles).slice(0, 8).join(' / ') || 'Unable to Verify'}`, MARGIN, 92, 8, THEME.muted)

      pdf.heading('Execution Sequence', 3)
      ;(flow.stages || []).slice(0, 10).forEach((stage, index) => {
      pdf.ensureSpace(55)
      const color = CATEGORY_COLORS[stage.layer] || CHART_COLORS[index % CHART_COLORS.length]
      const nodeY = pdf.y
      pdf.circle(MARGIN + 18, nodeY + 18, 12, color, THEME.bg, 1)
      pdf.text(String(index + 1), MARGIN + 14, nodeY + 21, 8, THEME.bg, 'F2')
      pdf.rect(MARGIN + 42, nodeY, PAGE_WIDTH - MARGIN * 2 - 42, 40, THEME.panel, THEME.border)
      pdf.text(stage.label || stage.nodeId, MARGIN + 54, nodeY + 16, 9, THEME.text, 'F2')
        pdf.text(`${CATEGORY_LABELS[stage.layer] || stage.layer || 'layer'} / ${stage.path || ''}${stage.lineNumber ? ` / line ${stage.lineNumber}` : ''}`, MARGIN + 54, nodeY + 30, 7, color, 'F3')
        if (index < Math.min(9, (flow.stages || []).length - 1)) pdf.line(MARGIN + 18, nodeY + 30, MARGIN + 18, nodeY + 52, THEME.cyan, 1)
      pdf.y += 53
    })
    })
  } else {
    pdf.paragraph('Flow Not Detected: no architecture flow had enough source-code evidence to verify a real execution path.', MARGIN, 90, 10)
  }
}

function drawApiReport(pdf, analysis) {
  pdf.addPage()
  pdf.heading('API Report', 1)
  const apiFlow = asArray(analysis?.flows?.available).find((flow) => flow.id === 'api')
  const apiStages = asArray(apiFlow?.stages)
  if (!apiStages.length) {
    pdf.paragraph('No API Endpoints Detected', MARGIN, 92, 11, THEME.text)
    pdf.paragraph('Endpoint-level method, route, handler, middleware, validation, and source line data are not present in the current repository analysis payload. The report does not infer endpoint counts from file names.', MARGIN, 92, 9, THEME.muted)
    return
  }

  pdf.paragraph('The scanner detected API-related files or call paths. Endpoint-level route tables are shown only when concrete route metadata is present in the analysis payload.', MARGIN, 92, 9)
  drawTable(pdf, ['HTTP Method', 'Route', 'Handler', 'Source File', 'Middleware', 'Validation', 'Confidence'], apiStages.slice(0, 16).map((stage) => [
    'Unable to Verify',
    'Unable to Verify',
    stage.label || 'Unable to Verify',
    stage.path || 'Unable to Verify',
    'Unable to Verify',
    'Unable to Verify',
    'Medium: API role detected, endpoint details unavailable',
  ]), [58, 70, 78, 130, 70, 70, 116])
}

function drawExecutiveSummary(pdf, analysis) {
  pdf.addPage()
  pdf.heading('Executive Summary', 1)
  const summary = analysis?.summary || {}
  pdf.paragraph(summary.description || summary.narrative || 'Insufficient Evidence: no README or manifest-derived description was available in the analysis payload.', MARGIN, 92, 10, THEME.text)

  const evidenceRows = [
    ['Repository purpose', summary.description ? 'README / manifest-derived description available' : 'Unable to Verify'],
    ['Primary source of truth', 'scanner analysis payload'],
    ['Architecture confidence', analysis?.architecture?.summary ? 'Architecture scanner summary available' : 'Insufficient Evidence'],
    ['Graph confidence', analysis?.graph?.edges?.length ? 'Import and semantic graph edges available' : 'Insufficient Evidence'],
    ['Commit confidence', 'Commit analytics require fetched git history sample'],
  ]
  drawTable(pdf, ['Signal', 'Evidence'], evidenceRows, [170, 322])
}

function drawRepositoryStatistics(pdf, analysis, commitHistory) {
  pdf.addPage()
  pdf.heading('Repository Statistics', 1)
  const inventory = buildInventory(analysis)
  const graph = analysis?.graph || { nodes: [], edges: [] }
  const dependencyEdges = asArray(graph.edges).filter((edge) => edge.type === 'dependency').length
  const semanticEdges = asArray(graph.edges).filter((edge) => edge.type && edge.type !== 'dependency' && edge.type !== 'hierarchy').length
  const cardW = (PAGE_WIDTH - MARGIN * 2 - 24) / 3

  pdf.metricCard('Files', String(inventory.fileCount), MARGIN, pdf.y, cardW)
  pdf.metricCard('Folders', String(inventory.folderCount), MARGIN + cardW + 12, pdf.y, cardW)
  pdf.metricCard('Languages', String(inventory.languages.length), MARGIN + (cardW + 12) * 2, pdf.y, cardW)
  pdf.y += 68
  pdf.metricCard('Graph nodes', String(asArray(graph.nodes).length), MARGIN, pdf.y, cardW)
  pdf.metricCard('Graph edges', String(asArray(graph.edges).length), MARGIN + cardW + 12, pdf.y, cardW)
  pdf.metricCard('Commits', String(commitHistory?.commits?.length || 0), MARGIN + (cardW + 12) * 2, pdf.y, cardW)
  pdf.y += 76

  drawTable(pdf, ['Metric', 'Value', 'Evidence'], [
    ['Dependency edges', String(dependencyEdges), 'scanner graph edge type'],
    ['Semantic edges', String(semanticEdges), 'architecture scanner semantic edges'],
    ['External dependencies', String(inventory.packages.length), 'manifest dependency sections'],
    ['Code size', formatBytes(inventory.totalSize), 'filesystem stat captured by scanner'],
    ['Largest file', inventory.largestFiles[0]?.path || 'Not Detected', inventory.largestFiles[0] ? formatBytes(inventory.largestFiles[0].size || 0) : 'No file inventory'],
    ['Largest language', inventory.languages[0]?.language ? (LANGUAGE_LABELS[inventory.languages[0].language] || inventory.languages[0].language) : 'Not Detected', 'grouped from scanner language tags'],
  ], [160, 160, 172])
}

function drawDeadCodeReport(pdf, analysis) {
  pdf.addPage()
  pdf.heading('Dead Code Report', 1)
  const deadRows = riskRows(analysis, 'dead-code')
  if (!deadRows.length) {
    pdf.paragraph('No dead code entries were verified by the current scanner output.', MARGIN, 92, 10, THEME.emerald)
    pdf.paragraph('The report does not mark code as dead unless the analyzer emits a dead-code risk based on graph isolation evidence.', MARGIN, 92, 9)
    return
  }
  pdf.paragraph('Dead-code entries below are scanner risk records. Function/class names and line numbers are marked unavailable when not included in the analysis payload.', MARGIN, 92, 9)
  drawTable(pdf, ['File', 'Function/Class', 'Line', 'Reason', 'Confidence', 'References'], deadRows.map((row) => [
    row.title,
    'Unable to Verify',
    'Unable to Verify',
    row.detail,
    row.value === 'high' ? 'High' : 'Medium',
    'Graph isolation evidence',
  ]), [132, 76, 42, 132, 58, 92])
}

function drawBrokenImportReport(pdf, analysis) {
  pdf.addPage()
  pdf.heading('Broken Import Report', 1)
  const brokenRows = riskRows(analysis, 'unresolved-import')
  if (!brokenRows.length) {
    pdf.paragraph('No unresolved relative imports were detected in the current scanner output.', MARGIN, 92, 10, THEME.emerald)
    return
  }
  drawTable(pdf, ['File', 'Line', 'Missing Module', 'Import Statement', 'Reason', 'Suggested Fix'], brokenRows.map((row) => [
    row.title,
    'Unable to Verify',
    row.detail.replace(/^Unresolved module:\s*/i, ''),
    'Unable to Verify',
    row.detail,
    'Verify path, extension, alias config, or missing file',
  ]), [126, 38, 86, 104, 120, 118])
}

function drawCommits(pdf, commitHistory) {
  pdf.addPage()
  pdf.heading('Git Analytics', 1)

  if (!commitHistory?.commits?.length) {
    pdf.paragraph('Unable to Verify: commit history was not available for this report.', MARGIN, 90, 10)
    return
  }

  const commits = commitHistory.commits
  const authors = commitHistory.authors || []
  const files = commitHistory.files || []
  const totalFilesChanged = commits.reduce((sum, commit) => sum + (commit.filesChanged || 0), 0)
  const fileChurn = new Map()
  commits.forEach((commit) => {
    asArray(commit.changedFiles).forEach((filePath) => fileChurn.set(filePath, (fileChurn.get(filePath) || 0) + 1))
  })
  const churnRows = [...fileChurn.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
  const cardW = (PAGE_WIDTH - MARGIN * 2 - 24) / 3
  pdf.metricCard('Commits', String(commits.length), MARGIN, pdf.y, cardW)
  pdf.metricCard('Authors', String(authors.length), MARGIN + cardW + 12, pdf.y, cardW)
  pdf.metricCard('Changed files', String(files.length), MARGIN + (cardW + 12) * 2, pdf.y, cardW)
  pdf.y += 68
  pdf.paragraph(`Analytics are generated from the latest ${commits.length} commits returned by git log. The report observed ${totalFilesChanged} file-change events across ${authors.length} contributors. Bus factor and ownership are reported only from this commit sample.`, MARGIN, 92, 10)

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

  pdf.heading('Most Changed Files', 2)
  drawTable(pdf, ['File', 'Commits Touching File', 'Evidence'], churnRows.map(([filePath, count]) => [
    filePath,
    String(count),
    `Observed in latest ${commits.length} commits`,
  ]), [260, 90, 150])

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
  const inventory = buildInventory(analysis)
  const languages = inventory.languages

  pdf.metricCard('Folders', String(inventory.folderCount), MARGIN, pdf.y, 112)
  pdf.metricCard('Files', String(inventory.fileCount), MARGIN + 124, pdf.y, 112)
  pdf.metricCard('Languages', String(languages.length), MARGIN + 248, pdf.y, 112)
  pdf.metricCard('Code size', formatBytes(inventory.totalSize), MARGIN + 372, pdf.y, 112)
  pdf.y += 70

  drawTable(pdf, ['Category', 'Count', 'Evidence'], [
    ['Packages', String(inventory.packages.length), 'package.json dependency sections collected by scanner'],
    ['Modules / graph nodes', String(asArray(analysis?.graph?.nodes).filter((node) => node.type !== 'folder').length), 'scanner graph file nodes'],
    ['Assets', String(inventory.assets.length), 'path extension classification'],
    ['Configuration files', String(inventory.configs.length), 'path/name classification'],
    ['Documentation files', String(inventory.docs.length), 'path/name classification'],
    ['Test files', String(inventory.tests.length), 'path/name classification'],
    ['Generated files', String(inventory.generated.length), 'path/name classification'],
  ], [160, 64, 268])

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
  pdf.heading('Hotspots', 1)
  const importantFiles = (analysis?.summary?.importantFiles || []).slice(0, 20)
  const maxScore = Math.max(1, ...importantFiles.map((file) => file.score || 1))
  pdf.paragraph('Hotspots combine scanner importance scores, graph connectivity, file size, and available commit churn. No complexity score is displayed unless measured by the analyzer.', MARGIN, 92, 9)
  importantFiles.forEach((file, index) => {
    pdf.ensureSpace(34)
    const color = CHART_COLORS[index % CHART_COLORS.length]
    pdf.text(file.path || file.label || file, MARGIN, pdf.y + 7, 8, THEME.text, 'F3')
    pdf.text(file.reason || 'repository hotspot', MARGIN, pdf.y + 21, 7, color)
    pdf.bar(PAGE_WIDTH - MARGIN - 120, pdf.y + 8, 90, 7, (file.score || 1) / maxScore, color)
    pdf.text(String(file.score || ''), PAGE_WIDTH - MARGIN - 24, pdf.y + 14, 7, THEME.muted, 'F2')
    pdf.y += 32
  })

  pdf.heading('Largest Files', 2)
  drawTable(pdf, ['File', 'Size', 'Evidence'], inventory.largestFiles.map((file) => [
    file.path,
    formatBytes(file.size || 0),
    'filesystem stat captured during scan',
  ]), [300, 70, 120])
}

function drawQualityDashboard(pdf, analysis) {
  pdf.addPage()
  pdf.heading('Quality Dashboard', 1)
  const arch = analysis?.architecture?.summary || analysis?.summary?.architecture || {}
  const qualityRows = [
    ['Dead Code', arch.deadCodeCount ?? 0, 'architecture risk records', 'Medium-High'],
    ['Broken Imports', arch.unresolvedImportCount ?? 0, 'unresolved relative import records', 'High'],
    ['Broken Exports', 'Unable to Verify', 'export resolution not exposed in analysis payload', 'Unknown'],
    ['Circular Dependencies', arch.circularDependencyCount ?? 0, 'architecture cycle risk records', 'High'],
    ['Unused Dependencies', 'Unable to Verify', 'package usage graph not exposed in analysis payload', 'Unknown'],
    ['Outdated Dependencies', 'Unable to Verify', 'registry version lookup not performed', 'Unknown'],
    ['Duplicate Code', 'Unable to Verify', 'token clone analysis not performed', 'Unknown'],
    ['Large Functions', 'Unable to Verify', 'function AST spans not exposed in analysis payload', 'Unknown'],
    ['Large Classes', 'Unable to Verify', 'class AST spans not exposed in analysis payload', 'Unknown'],
    ['Security Warnings', 'Unable to Verify', 'security scanner output not present', 'Unknown'],
    ['License Issues', 'Unable to Verify', 'license policy scan not present', 'Unknown'],
    ['Missing Tests', 'Unable to Verify', 'coverage/test mapping not present', 'Unknown'],
    ['Missing Documentation', 'Unable to Verify', 'symbol documentation scan not present', 'Unknown'],
  ]
  drawTable(pdf, ['Metric', 'Value', 'Evidence', 'Severity'], qualityRows, [126, 74, 230, 62])
}

function drawRiskDashboard(pdf, analysis) {
  pdf.addPage()
  pdf.heading('Risk Dashboard', 1)
  const risks = getRisks(analysis)
  const grouped = new Map()
  risks.forEach((risk) => grouped.set(risk.kind, (grouped.get(risk.kind) || 0) + 1))
  const rows = [...grouped.entries()].sort((a, b) => b[1] - a[1])
  if (!rows.length) {
    pdf.paragraph('No risk records were emitted by the repository analyzer.', MARGIN, 92, 10, THEME.emerald)
    pdf.paragraph('This does not prove the repository has no risk; it means the current evidence set did not contain reportable risks.', MARGIN, 92, 9)
    return
  }
  const maxRisk = Math.max(1, ...rows.map(([, count]) => count))
  rows.slice(0, 9).forEach(([label, count], index) => {
    const color = label.includes('unresolved') || label.includes('circular') ? THEME.red : CHART_COLORS[index % CHART_COLORS.length]
    const y = pdf.y + index * 68
    pdf.rect(MARGIN, y, PAGE_WIDTH - MARGIN * 2, 52, THEME.panel, THEME.border)
    pdf.rect(MARGIN, y, 5, 52, color, color)
    pdf.text(label, MARGIN + 18, y + 20, 10, color, 'F2')
    pdf.text(String(count), PAGE_WIDTH - MARGIN - 34, y + 22, 18, THEME.text, 'F2')
    pdf.bar(MARGIN + 18, y + 33, 380, 6, count / maxRisk, color)
  })
  pdf.y += Math.min(rows.length, 9) * 68 + 18
  drawEvidenceList(pdf, 'Risk Evidence', risks.map((risk) => ({
    title: risk.kind || 'risk',
    detail: `${risk.fileId?.replace(/^file:/, '') || 'Unknown file'} - ${risk.message || 'No message'}`,
    value: risk.severity || 'Detected',
    color: risk.severity === 'high' ? THEME.red : THEME.amber,
  })), 'No risk records available.')
}

function drawPipelineReport(pdf, analysis) {
  pdf.addPage()
  pdf.heading('Pipeline Report', 1)
  const files = asArray(analysis?.files)
  const pipelinePatterns = [
    { label: 'GitHub Actions', pattern: /(^|\/)\.github\/workflows\/[^/]+\.ya?ml$/i },
    { label: 'GitLab CI', pattern: /(^|\/)\.gitlab-ci\.ya?ml$/i },
    { label: 'Azure DevOps', pattern: /(^|\/)azure-pipelines\.ya?ml$/i },
    { label: 'Jenkins', pattern: /(^|\/)jenkinsfile$/i },
    { label: 'CircleCI', pattern: /(^|\/)\.circleci\/config\.ya?ml$/i },
    { label: 'Bitbucket Pipelines', pattern: /(^|\/)bitbucket-pipelines\.ya?ml$/i },
    { label: 'Drone', pattern: /(^|\/)\.drone\.ya?ml$/i },
    { label: 'Tekton', pattern: /(^|\/)(tekton|\.tekton)\//i },
    { label: 'Argo', pattern: /(^|\/)(argo|argocd|\.argo)\//i },
  ]
  const detected = []
  for (const file of files) {
    const filePath = getPath(file)
    const match = pipelinePatterns.find((item) => item.pattern.test(filePath))
    if (match) detected.push({ provider: match.label, filePath })
  }

  if (!detected.length) {
    pdf.paragraph('No CI/CD Pipeline Detected', MARGIN, 92, 11, THEME.text)
    pdf.paragraph('This is based only on pipeline configuration file paths present in the scanner file inventory. The report does not infer pipeline usage from README text or repository naming.', MARGIN, 92, 9)
    return
  }

  drawTable(pdf, ['Pipeline', 'Source File', 'Evidence', 'Confidence'], detected.map((item) => [
    item.provider,
    item.filePath,
    'known CI/CD config path detected',
    'High',
  ]), [110, 220, 122, 60])
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
  pdf.paragraph('This document is a static snapshot generated from Aliya AI repository analysis. It deliberately avoids fabricated metrics. Values not present in the scanner payload are marked Unable to Verify, Not Detected, Insufficient Evidence, or Needs Manual Review.', MARGIN, 92, 9, THEME.muted)

  pdf.heading('Methodology', 2)
  drawTable(pdf, ['Area', 'Method', 'Confidence Rule'], [
    ['Language', 'scanner file inventory grouped by language', 'High for file count and bytes; LOC unavailable'],
    ['Graph Atlas', 'scanner graph nodes and edges', 'High for listed nodes/edges'],
    ['Architecture', 'scanner role/layer/risk summary', 'Medium unless source evidence is explicitly listed'],
    ['API', 'API flow metadata when present', 'No endpoint counts inferred without route metadata'],
    ['Dead Code', 'architecture risk records only', 'No function/class dead-code claims without analyzer evidence'],
    ['Broken Imports', 'unresolved relative import risk records', 'Line/import statement unavailable unless scanner exposes it'],
    ['Git', 'latest git log sample fetched by backend', 'Limited to requested commit sample'],
    ['Pipeline', 'known CI/CD config path detection', 'High for config presence, not runtime behavior'],
  ], [90, 230, 172])

  pdf.heading('Confidence Scores', 2)
  drawTable(pdf, ['Signal', 'Confidence', 'Reason'], [
    ['Repository inventory', 'High', 'filesystem metadata from scanner'],
    ['Language file share', 'High', 'language tags from scanner file records'],
    ['Language LOC', 'Unable to Verify', 'line counts are not included in current payload'],
    ['Graph fan-in / fan-out', 'High', 'computed from scanner graph edges'],
    ['Endpoint route table', 'Unable to Verify', 'route metadata is not exposed in PDF input'],
    ['Security warnings', 'Unable to Verify', 'security scanner output is not present'],
  ], [150, 90, 252])
}

export function generateRepositoryPdfReport({ analysis, commitHistory, activeArchitectureFlow }) {
  if (!analysis) throw new Error('Repository analysis is required')

  const pdf = new PdfReport(`${analysis.repoName || 'Repository'} Report`)
  const languages = getLanguageBreakdown(analysis)
  const graph = analysis.graph || { nodes: [], edges: [] }
  const inventory = buildInventory(analysis)

  pdf.text('REPOSITORY INTELLIGENCE REPORT', MARGIN, 92, 9, THEME.cyan, 'F2')
  pdf.text(analysis.repoName || 'Repository', MARGIN, 134, 30, THEME.text, 'F2')
  pdf.y = 164
  pdf.paragraph(analysis.summary?.description || analysis.summary?.narrative || analysis.repoUrl || 'Repository analysis report. Unsupported metrics are explicitly marked instead of inferred.', MARGIN, 76, 11, THEME.muted, 17)
  pdf.rect(MARGIN, 230, PAGE_WIDTH - MARGIN * 2, 4, THEME.cyan, THEME.cyan)
  pdf.y = 270

  const cardW = (PAGE_WIDTH - MARGIN * 2 - 24) / 3
  pdf.metricCard('Graph nodes', String(graph.nodes?.length || 0), MARGIN, pdf.y, cardW)
  pdf.metricCard('Graph edges', String(graph.edges?.length || 0), MARGIN + cardW + 12, pdf.y, cardW)
  pdf.metricCard('Languages', String(languages.length), MARGIN + (cardW + 12) * 2, pdf.y, cardW)
  pdf.y += 68
  pdf.metricCard('Folders', String(inventory.folderCount), MARGIN, pdf.y, cardW)
  pdf.metricCard('Files', String(inventory.fileCount), MARGIN + cardW + 12, pdf.y, cardW)
  pdf.metricCard('Commits', String(commitHistory?.commits?.length || 0), MARGIN + (cardW + 12) * 2, pdf.y, cardW)
  pdf.y += 78

  pdf.heading('Evidence Standard', 2)
  pdf.paragraph('Every displayed number is derived from the repository analysis payload, graph edges, file inventory, manifest dependencies, or fetched git history. Missing evidence is shown as Not Detected, Unable to Verify, Insufficient Evidence, or Needs Manual Review.', MARGIN, 92, 9, THEME.text)

  const coverDonut = languages.slice(0, 6).map((item, index) => ({ value: item.count, color: CHART_COLORS[index] }))
  if (coverDonut.length) {
    pdf.donut(coverDonut, PAGE_WIDTH - MARGIN - 62, 690, 42, 23)
    pdf.text('MIX', PAGE_WIDTH - MARGIN - 72, 694, 8, THEME.text, 'F2')
  }

  drawExecutiveSummary(pdf, analysis)
  drawRepositoryStatistics(pdf, analysis, commitHistory)
  drawLanguageInsights(pdf, analysis)
  drawGraph(pdf, analysis)
  drawArchitectureOverview(pdf, analysis)
  drawDependencyGraph(pdf, analysis, activeArchitectureFlow)
  drawApiReport(pdf, analysis)
  drawDeadCodeReport(pdf, analysis)
  drawBrokenImportReport(pdf, analysis)
  drawPipelineReport(pdf, analysis)
  drawCommits(pdf, commitHistory)
  drawStats(pdf, analysis)
  drawQualityDashboard(pdf, analysis)
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
