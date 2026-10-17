/**
 * Generates the PDF report for a stored project and dumps every text string it
 * contains, so the rendered values can be checked against the analysis payload.
 *
 * Usage: node test-pdf-report.js <repoName> [--grep=Needle] [--write=/tmp/out.pdf]
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ROOT = path.resolve(import.meta.dirname, '.')
const { generateRepositoryPdfReport } = await import('/tmp/pdfreport-bundle.mjs')
const { refreshArchitecture, getCommitHistory } = require(path.join(ROOT, 'server/repo-analyzer.js'))

const args = process.argv.slice(2)
const repoName = args.find((a) => !a.startsWith('--'))
// Re-runs the current analyzer over the local clone before rendering, so the
// PDF reflects today's detector rather than the payload stored at scan time.
const wantsRefresh = args.includes('--refresh')
// Fetches real git history so the Git Analytics section renders with data
// instead of "Unable to Verify". Requires a network call to deepen the clone.
const wantsCommits = args.includes('--commits')
const grepArg = args.find((a) => a.startsWith('--grep='))
const writeArg = args.find((a) => a.startsWith('--write='))

const projects = JSON.parse(fs.readFileSync(path.join(ROOT, '.aliya-ai/projects.json'), 'utf8'))
const list = Array.isArray(projects) ? projects : projects.projects || []
const record = list
  .filter((p) => !repoName || p.analysis?.repoName === repoName)
  .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0]

if (!record) {
  console.error(`No stored project${repoName ? ` named ${repoName}` : ''} found`)
  process.exit(1)
}

const analysis = record.analysis
console.log(`# repo=${analysis.repoName} created=${record.createdAt} engine=${analysis.analysisEngineVersion || analysis.flowEngineVersion}`)

if (wantsRefresh) {
  const fresh = await refreshArchitecture(record.repoPath, analysis)
  if (!fresh) {
    console.error('# refresh produced nothing — using the stored payload')
  } else {
    const architecture = fresh.architecture
    analysis.flows = architecture.flows
    analysis.architecture = {
      summary: architecture.summary,
      risks: architecture.risks,
      deadNodeIds: architecture.deadNodeIds,
      brokenNodeIds: architecture.brokenNodeIds,
    }
    if (analysis.summary) analysis.summary.architecture = architecture.summary
    console.log(`# refreshed in-memory: flows=${analysis.flows?.available?.length || 0} risks=${analysis.architecture.risks.length}`)
  }
}

let commitHistory = null
if (wantsCommits) {
  try {
    commitHistory = await getCommitHistory(record.repoPath, 60)
    console.log(`# commits=${commitHistory?.commits?.length || 0} authors=${commitHistory?.authors?.length || 0}`)
  } catch (error) {
    console.log(`# commit fetch failed: ${String(error?.message || error).slice(0, 120)}`)
  }
}

const blob = generateRepositoryPdfReport({ analysis, commitHistory, activeArchitectureFlow: null })
const buf = Buffer.from(await blob.arrayBuffer())
if (writeArg) {
  fs.writeFileSync(writeArg.split('=')[1], buf)
  console.log(`# wrote ${buf.length} bytes to ${writeArg.split('=')[1]}`)
}

const raw = buf.toString('latin1')
const strings = []
const re = /\(((?:\\.|[^()\\])*)\)\s*Tj/g
let m
while ((m = re.exec(raw)) !== null) {
  strings.push(m[1].replace(/\\([()\\])/g, '$1'))
}

console.log(`# bytes=${buf.length} strings=${strings.length}`)

const needle = grepArg ? grepArg.slice('--grep='.length) : null
if (needle) {
  strings.forEach((s, i) => {
    if (s.includes(needle)) console.log(`${String(i).padStart(4)}  ${s}`)
  })
} else {
  strings.forEach((s, i) => console.log(`${String(i).padStart(4)}  ${s}`))
}
