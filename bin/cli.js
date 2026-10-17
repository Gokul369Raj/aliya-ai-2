#!/usr/bin/env node
/**
 * Aliya AI — command line entry point.
 *
 *   aliya-ai serve              start the local server + UI (default)
 *   aliya-ai analyze <repoUrl>  index a public GitHub repository
 *   aliya-ai list               list indexed repositories
 *   aliya-ai status [repoId]    show the index status of a repository
 *   aliya-ai clean [repoId]     delete a repository's cached clone + analysis
 *   aliya-ai prepare            install and build the web UI only
 *
 * Deliberately dependency-free: it has to run straight from `npx aliya-ai`
 * before anything else is installed.
 */
const path = require('path')
const fs = require('fs')
const { spawnSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const pkg = require(path.join(ROOT, 'package.json'))

const useColor = process.stdout.isTTY && !process.env.NO_COLOR
const paint = (code) => (text) => (useColor ? `\u001b[${code}m${text}\u001b[0m` : String(text))
const bold = paint('1')
const dim = paint('2')
const green = paint('32')
const red = paint('31')
const yellow = paint('33')

function line(text = '') {
  process.stdout.write(`${text}\n`)
}

function die(message) {
  process.stderr.write(`\n  ${red('✖')} ${message}\n\n`)
  process.exit(1)
}

function usage() {
  line('')
  line(`  ${bold('Aliya AI')} ${dim(`v${pkg.version}`)} — understand any GitHub repository`)
  line('')
  line(`  ${bold('Usage')}`)
  line('    aliya-ai serve                 start the local app and open it in your browser')
  line('    aliya-ai analyze <repoUrl>     index a public GitHub repository')
  line('    aliya-ai list                  list indexed repositories')
  line('    aliya-ai status [repoId]       show index status (defaults to the newest)')
  line("    aliya-ai clean [repoId]        delete a repository's clone and analysis")
  line('    aliya-ai impact <path> [repo]  what breaks if this file changes')
  line('    aliya-ai trace <a> <b> [repo]  shortest import chain between two files')
  line('    aliya-ai prepare               install and build the web UI only')
  line('')
  line(`  ${bold('Options')}`)
  line('    --port <n>      port for the local server (default 3001)')
  line('    --no-open       do not open the browser')
  line('    --help, -h      show this help')
  line('    --version, -v   print the version')
  line('')
  line(`  ${bold('Examples')}`)
  line('    npx aliya-ai@latest serve')
  line('    aliya-ai analyze https://github.com/owner/repo')
  line('')
}

function assertNodeVersion() {
  const major = Number(process.versions.node.split('.')[0])
  if (Number.isFinite(major) && major < 20) {
    die(`Aliya AI needs Node 20 or newer — you are on ${process.versions.node}.`)
  }
}

function runNpm(args, label, { strict = true } = {}) {
  const isWindows = process.platform === 'win32'

  // Node 20.12+ refuses to spawn a `.cmd` without a shell (the CVE-2024-27980
  // fix), so `npm.cmd` throws EINVAL on Windows unless `shell` is set. This is
  // what made `npm install` fail on Windows while working fine on macOS.
  const quoted = isWindows
    ? args.map((arg) => (/[\s"]/.test(arg) ? `"${arg}"` : arg))
    : args

  const result = spawnSync(isWindows ? 'npm.cmd' : 'npm', quoted, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: isWindows,
  })

  const message = result.error
    ? `${label} failed: ${result.error.message}`
    : result.status !== 0
      ? `${label} failed.`
      : null

  if (!message) return
  if (strict) die(message)
  throw new Error(message)
}

/**
 * A published package ships a prebuilt `client/dist`, so this is a no-op for
 * `npx aliya-ai serve`. A fresh git clone has neither the client modules nor a
 * build, and this fills both in — that is what makes `npm install && npm start`
 * enough on a clean machine.
 *
 * `strict: false` makes failures throw instead of exiting, so `postinstall` can
 * survive a failed build without taking the whole install down with it.
 */
function ensureFrontend({ quiet = false, strict = true } = {}) {
  if (process.env.ALIYA_SKIP_DEPS === '1') return

  const distIndex = path.join(ROOT, 'client', 'dist', 'index.html')
  const distAssets = path.join(ROOT, 'client', 'dist', 'assets')
  // `index.html` alone is not proof of a build — a half-finished one leaves the
  // HTML behind with no hashed bundle next to it.
  if (fs.existsSync(distIndex) && fs.existsSync(distAssets)) return

  const fail = (message) => {
    if (strict) die(message)
    throw new Error(message)
  }

  if (!quiet) line(dim('  • installing the web UI (one time, takes a minute)…'))
  if (!fs.existsSync(path.join(ROOT, 'client', 'node_modules'))) {
    runNpm(['install', '--prefix', 'client', '--no-audit', '--no-fund'], 'Client install', { strict })
  }
  runNpm(['run', 'build', '--prefix', 'client'], 'Client build', { strict })

  if (!fs.existsSync(distIndex) || !fs.existsSync(distAssets)) {
    fail('The web UI did not build. Run `npm run build` to see why.')
  }
}

function readFlag(argv, name, fallback) {
  const index = argv.indexOf(name)
  if (index === -1) return fallback
  const value = argv[index + 1]
  return value && !value.startsWith('-') ? value : fallback
}

function openStore() {
  return require(path.join(ROOT, 'server', 'store.js'))
}

function formatDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'unknown'
  return date.toISOString().slice(0, 16).replace('T', ' ')
}

/* ── serve ───────────────────────────────────────────────────────────────── */

function serve(argv) {
  ensureFrontend()

  const port = Number(readFlag(argv, '--port', process.env.PORT || 3001))
  if (!Number.isInteger(port) || port < 1 || port > 65535) die('--port must be a number between 1 and 65535.')
  process.env.PORT = String(port)
  if (argv.includes('--no-open')) process.env.ALIYA_SKIP_OPEN = '1'

  line('')
  line(`  ${bold('Aliya AI')} ${dim(`v${pkg.version}`)}`)
  line(`  ${green('→')} http://127.0.0.1:${port}`)
  line(dim('  Paste a public GitHub repository URL to begin. Ctrl+C to stop.'))
  line('')

  require(path.join(ROOT, 'server', 'index.js'))
}

/* ── analyze ─────────────────────────────────────────────────────────────── */

async function analyze(argv) {
  const target = argv.find((arg) => !arg.startsWith('-'))
  if (!target) die('Usage: aliya-ai analyze <https://github.com/owner/repo>')

  ensureFrontend()

  const { analyzeRepository } = require(path.join(ROOT, 'server', 'repo-analyzer.js'))
  const store = openStore()

  let lastMessage = ''
  let lastBucket = -1
  const report = (phase, progress, message) => {
    const pct = Math.max(0, Math.min(100, Math.round(progress)))
    const text = `${String(pct).padStart(3)}%  ${message || phase}`

    if (process.stdout.isTTY) {
      // One updating line in a terminal.
      if (text === lastMessage) return
      lastMessage = text
      process.stdout.write(`\r  ${text.padEnd(64)}`)
      return
    }

    // Piped output (CI, logs): git emits dozens of sub-percent ticks, so only
    // print when we cross a 10% bucket.
    const bucket = Math.floor(pct / 10)
    if (bucket === lastBucket) return
    lastBucket = bucket
    line(`  ${text}`)
  }

  line('')
  line(`  Analyzing ${bold(target)}`)
  line('')

  try {
    const { analysis, repoPath } = await analyzeRepository(target, report)
    store.saveRepo({ repoId: analysis.repoId, repoPath, analysis })
    if (process.stdout.isTTY) process.stdout.write('\r'.padEnd(70) + '\r')

    const files = analysis.summary?.fileCount || analysis.files?.length || 0
    const nodes = analysis.graph?.nodes?.length || 0
    const edges = analysis.graph?.edges?.length || 0
    line(`  ${green('✔')} ${bold(analysis.repoName)} indexed`)
    line(`    ${files} files · ${nodes} nodes · ${edges} edges`)
    line(`    ${dim('repo id:')} ${analysis.repoId}`)
    line('')
    line(`  Next: ${bold('aliya-ai serve')} and open the repository from Recent Projects.`)
    line('')
  } catch (error) {
    if (process.stdout.isTTY) process.stdout.write('\r'.padEnd(70) + '\r')
    die(error?.message || String(error))
  }
}

/* ── list / status / clean ───────────────────────────────────────────────── */

function list() {
  const repos = openStore().listRepos()
  if (!repos.length) {
    line('')
    line(dim('  No repositories indexed yet.'))
    line(`  Run ${bold('aliya-ai analyze https://github.com/owner/repo')} first.`)
    line('')
    return
  }

  line('')
  line(`  ${bold('Indexed repositories')} ${dim(`(${repos.length})`)}`)
  line('')
  repos.forEach((repo) => {
    const files = repo.fileCount ?? repo.analysis?.summary?.fileCount ?? '—'
    line(`  ${bold(repo.repoName || repo.repoId)}  ${dim(repo.repoId)}`)
    line(`    ${dim('files')} ${files}   ${dim('indexed')} ${formatDate(repo.createdAt || repo.updatedAt)}`)
  })
  line('')
}

function pickRepo(store, repoId) {
  if (repoId) {
    const repo = store.getRepo(repoId)
    if (!repo) die(`No indexed repository with id "${repoId}".`)
    return repo
  }
  const repos = store.listRepos()
  if (!repos.length) die('No repositories indexed yet. Run `aliya-ai analyze <repoUrl>` first.')
  return store.getRepo(repos[0].repoId) || repos[0]
}

function status(argv) {
  const store = openStore()
  const repo = pickRepo(store, argv.find((arg) => !arg.startsWith('-')))
  const analysis = repo.analysis || {}
  const summary = analysis.summary || {}

  line('')
  line(`  ${bold(analysis.repoName || repo.repoId)}`)
  line(`    ${dim('repo id')}       ${repo.repoId}`)
  line(`    ${dim('url')}           ${analysis.repoUrl || '—'}`)
  line(`    ${dim('indexed')}       ${formatDate(repo.createdAt || repo.updatedAt)}`)
  line(`    ${dim('files')}         ${summary.fileCount ?? analysis.files?.length ?? '—'}`)
  line(`    ${dim('folders')}       ${summary.folderCount ?? '—'}`)
  line(`    ${dim('graph')}         ${analysis.graph?.nodes?.length ?? 0} nodes / ${analysis.graph?.edges?.length ?? 0} edges`)
  line(`    ${dim('clone')}         ${repo.repoPath || '—'}`)
  const exists = repo.repoPath && fs.existsSync(repo.repoPath)
  line(`    ${dim('clone on disk')} ${exists ? green('yes') : yellow('no — re-analyze to restore')}`)
  line('')
}

function clean(argv) {
  const store = openStore()
  const repo = pickRepo(store, argv.find((arg) => !arg.startsWith('-')))
  const name = repo.analysis?.repoName || repo.repoId

  store.deleteRepo(repo.repoId)
  if (repo.repoPath && fs.existsSync(repo.repoPath)) {
    fs.rmSync(repo.repoPath, { recursive: true, force: true })
  }

  line('')
  line(`  ${green('✔')} Removed ${bold(name)} ${dim(`(${repo.repoId})`)}`)
  line('')
}

/* ── impact / trace ──────────────────────────────────────────────────────── */

/**
 * Resolve a path the user typed against the graph.
 *
 * A bare path was always assumed to be a file, so `aliya-ai impact src/components`
 * looked up `file:src/components` and reported "no such node" for a folder that
 * exists. Windows paths arrive with backslashes, and the graph stores forward
 * slashes, so normalise first.
 */
function resolveNodeId(repo, value) {
  const raw = String(value).replace(/\\/g, '/').replace(/^\.\//, '')
  if (/^(file|folder):/.test(raw)) return raw

  const ids = new Set((repo.analysis?.graph?.nodes || []).map((node) => node.id))
  if (ids.has(`file:${raw}`)) return `file:${raw}`
  if (ids.has(`folder:${raw}`)) return `folder:${raw}`
  // Neither exists — hand back the file form so the engine raises its normal error.
  return `file:${raw}`
}

function loadImpactEngine() {
  return require(path.join(ROOT, 'server', 'impact-analysis.js'))
}

function printLimitations(limitations) {
  if (!limitations?.length) return
  line('')
  line(`  ${dim('Limits of this answer')}`)
  limitations.forEach((item) => line(dim(`    · ${item}`)))
}

function impact(argv) {
  const positional = argv.filter((arg) => !arg.startsWith('-'))
  if (!positional[0]) die('Usage: aliya-ai impact <file path or node id> [repoId]')

  const store = openStore()
  const repo = pickRepo(store, positional[1])
  const { analyzeImpact } = loadImpactEngine()
  const depth = Number(readFlag(argv, '--depth', '4'))

  let result
  try {
    result = analyzeImpact(repo.analysis, resolveNodeId(repo, positional[0]), { maxDepth: depth })
  } catch (error) {
    if (error.code === 'NODE_NOT_FOUND') die(error.message)
    throw error
  }

  const label = result.target.path || result.target.id
  line('')
  line(`  ${bold(label)}`)
  line(`  ${dim('risk')} ${result.risk === 'high' ? red('high') : result.risk === 'medium' ? yellow('medium') : green('low')}`)
  line('')
  line(`  ${bold('Upstream')} ${dim(`— ${result.upstream.total} file(s) depend on this`)}`)
  if (!result.upstream.total) {
    line(dim('    nothing imports it'))
  } else {
    result.upstream.levels.forEach((level) => {
      line(`    ${dim(`depth ${level.depth}`)}  ${level.count} file(s)`)
      level.nodes.slice(0, 6).forEach((node) => line(dim(`      ${node.path || node.id}`)))
      if (level.count > 6) line(dim(`      … ${level.count - 6} more`))
    })
  }
  line('')
  line(`  ${bold('Downstream')} ${dim(`— this depends on ${result.downstream.total} file(s)`)}`)
  if (!result.downstream.total) {
    line(dim('    no outgoing imports'))
  } else {
    result.downstream.levels.forEach((level) => {
      line(`    ${dim(`depth ${level.depth}`)}  ${level.count} file(s)`)
      level.nodes.slice(0, 6).forEach((node) => line(dim(`      ${node.path || node.id}`)))
      if (level.count > 6) line(dim(`      … ${level.count - 6} more`))
    })
  }
  printLimitations(result.limitations)
  line('')
}

function trace(argv) {
  const positional = argv.filter((arg) => !arg.startsWith('-'))
  if (positional.length < 2) die('Usage: aliya-ai trace <from> <to> [repoId]')

  const store = openStore()
  const repo = pickRepo(store, positional[2])
  const { tracePath } = loadImpactEngine()

  let result
  try {
    result = tracePath(
      repo.analysis,
      resolveNodeId(repo, positional[0]),
      resolveNodeId(repo, positional[1]),
    )
  } catch (error) {
    if (error.code === 'NODE_NOT_FOUND') die(error.message)
    throw error
  }

  line('')
  if (!result.found) {
    line(`  ${yellow('No import chain found')} within ${result.maxDepth} hops.`)
    printLimitations(result.limitations)
    line('')
    return
  }

  line(`  ${bold(`${result.hops} hop(s)`)}`)
  line('')
  result.path.forEach((step, index) => {
    const prefix = index === 0 ? '  ' : `  ${dim('→')} `
    const direction = index === 0 ? '' : dim(`(${step.direction}) `)
    line(`${prefix}${direction}${step.path || step.id}`)
  })
  printLimitations(result.limitations)
  line('')
}

/* ── main ────────────────────────────────────────────────────────────────── */

async function main() {
  const argv = process.argv.slice(2)

  if (argv.includes('--help') || argv.includes('-h')) return usage()
  if (argv.includes('--version') || argv.includes('-v')) return line(pkg.version)

  assertNodeVersion()

  const command = argv[0] && !argv[0].startsWith('-') ? argv[0] : 'serve'
  const rest = command === argv[0] ? argv.slice(1) : argv

  switch (command) {
    case 'serve':
    case 'start':
      return serve(rest)
    case 'analyze':
    case 'index':
      return analyze(rest)
    case 'list':
    case 'ls':
      return list()
    case 'status':
      return status(rest)
    case 'clean':
    case 'rm':
      return clean(rest)
    case 'impact':
      return impact(rest)
    case 'trace':
      return trace(rest)
    case 'prepare':
      // Runs from `postinstall`. A failed UI build must never fail the whole
      // `npm install` — the user would be left with no dependencies at all.
      // `npm start` retries the build and reports the real error there.
      try {
        ensureFrontend({ quiet: true, strict: false })
      } catch (error) {
        line('')
        line(`  ${yellow('!')} The web UI could not be prepared: ${error.message}`)
        line(`    ${dim('Dependencies are installed. Run')} ${bold('npm start')} ${dim('to retry the build.')}`)
        line('')
      }
      return
    default:
      line(`\n  ${red('✖')} Unknown command "${command}".\n`)
      usage()
      process.exit(1)
  }
}

main().catch((error) => die(error?.stack || String(error)))
