# Aliya AI

**Google Maps for codebases** — point it at any public GitHub repository and get a 3D graph
you can read, an AI that answers from the real code, and a blast radius for every file.

Aliya AI is a local-first developer tool. It clones the repository to your machine, parses it
locally, and never sends your source anywhere. The only network call it makes is the one you
configure yourself, with your own model key.

---

## Quick start

Pick whichever fits — all three end up on the same local app.

### One command, nothing to install

```bash
npx aliya-ai@latest serve
```

### Install it globally

```bash
npm install -g aliya-ai
aliya-ai serve
```

### From source

```bash
git clone https://github.com/Gokul369Raj/aliya-ai-2.git
cd aliya-ai-2
npm install     # installs the server, then installs and builds the web UI
npm start       # opens the app
```

`npm install` runs a `prepare` step that installs the client and builds it, so there is no
second `cd client && npm install` dance. If a build is already present (the npm package ships
one), that step is skipped.

**Requirements:** Node **20+** and **git** on your `PATH`.

### Windows

The commands above are identical in **PowerShell**, **Command Prompt** and **Git Bash** — there
are no Unix-only flags anywhere. Install two things first:

1. **Node 20+** — [nodejs.org](https://nodejs.org) (the `.msi` installer). Check with `node -v`.
2. **Git for Windows** — [git-scm.com/download/win](https://git-scm.com/download/win). Keep the
   default *"Git from the command line and also from 3rd-party software"* option, otherwise
   `git` is not on `PATH` and the clone step fails.

```powershell
git clone https://github.com/Gokul369Raj/aliya-ai-2.git
cd aliya-ai-2
npm install
npm start
```

`npm start` opens the app at <http://127.0.0.1:3001>. If Windows Firewall asks, allow Node on
**private networks** only — the server binds to localhost and is not exposed.

What is handled for Windows specifically:

- npm is invoked through a shell (`npm.cmd` cannot be spawned directly on Node 20.12+).
- The port-in-use check uses `netstat` on Windows and `lsof` on macOS/Linux.
- `.gitattributes` forces LF for source files, so a Windows checkout behaves like a macOS one.
- A failed UI build during `npm install` does not abort the install — `npm start` retries it.

---

## CLI

```
aliya-ai serve                 start the local app and open it in the browser
aliya-ai analyze <repoUrl>     index a public GitHub repository from the terminal
aliya-ai list                  list indexed repositories
aliya-ai status [repoId]       show index status (defaults to the newest)
aliya-ai clean [repoId]        delete a repository's clone and analysis
aliya-ai impact <path> [repo]  what breaks if this file changes
aliya-ai trace <a> <b> [repo]  shortest import chain between two files
aliya-ai prepare               install and build the web UI only
```

`serve` accepts `--port 3001` and `--no-open`. `impact` accepts `--depth <n>` (default 4).

```bash
$ aliya-ai impact src/domain/result.ts

  src/domain/result.ts
  risk high

  Upstream — 599 file(s) depend on this
    depth 1  261 file(s)
      src/adb/AdbCommand.ts
      src/adb/AdbProvider.ts
      …

  Limits of this answer
    · Computed from static import edges. Dynamic imports and string-built
      module paths are not represented.
    · Folder containment edges are excluded on purpose.
```

---

## What it does

### 2D and 3D graphs you can actually read

The layout is deterministic, so the map is the same shape every time you open it. The 3D view
seeds nodes on a Fibonacci sphere with hubs pulled toward the core — once the force layout
settles, connected files cluster into lobes and the whole thing reads like the repository's
brain rather than a flat disc.

Encoding is stated, not guessed:

| Channel | Meaning |
|---|---|
| **Colour** | Language (or category, when the filter type is switched) |
| **Shape** | `folder` → rounded square · `file` → circle · `important` → diamond |
| **Edge** | solid + arrowhead = **imports** · faint dashed = **contains** · dotted = semantic |

**Focus mode.** Click any node and everything outside it and its direct neighbours fades to a
ghost and loses its label. "Show me only this and what it touches" is the point of clicking.

### AI that answers from the code, and says what it couldn't check

Bring your own OpenAI, Anthropic, Gemini, DeepSeek, OpenRouter or OpenAI-compatible key. It is
sent per request and never stored on the server.

Answers stream in as they are generated, and every answer ends with two lines:

- **Verified from** — the exact files and symbols the answer rests on
- **Not verified** — what was not or could not be checked

The prompt is assembled from the scanned graph, the file inventory and verbatim code excerpts,
budgeted per question type (~15k characters for a 2,200-file repository). If the evidence is
not there, the assistant says `Not Detected` / `Unable to Verify` rather than guessing.

### Impact and trace

`impact` walks the dependency graph upstream and downstream, grouped by depth, and reports the
risk shape. `trace` finds the shortest import chain between two files and states the direction
of every hop. Both are pure graph computations over edges the scanner already found — no
re-parsing, and every result carries the list of things it does not cover.

### Health score that accounts for itself

Architecture, code quality, security, maintainability and documentation are each scored by a
**ledger**: every signal records the exact delta it applied. The panel shows the weighted-mean
arithmetic, per-category earned/lost chips, and for the open category a line like:

```
starts at 50 · +26 earned · −97 lost · = 0 · ran past the scale, capped at 0
```

Nothing is inferred on the client — if a signal cost 8 points, the server said so.

### Architecture and flows

Detected layers and execution flows, rendered as a layered walkthrough. A flow only appears
when the repository actually has that capability: authentication, payments, caching, queues and
websockets show up only if a dependency, a code signature or a naming convention proves them,
and each flow reports how it was proven plus the files it covers.

### Commit graph

A branch-lane view with author colours, merges, filters (author, message, file, date range) and
a commit inspector. Deeper history is fetched on demand the first time.

### PDF report

A full repository intelligence report, generated client-side and readable in the built-in
viewer or downloadable.

### File inspector

Click any node to open it in a built-in Monaco editor.

---

## How it works

```
GitHub URL
   │  git clone --depth 1
   ▼
local clone ──► scan (files, languages, imports)
   │
   ├─► graph (nodes + edges)  ──► 2D / 3D view, impact, trace
   ├─► search index (RAG)     ──► AI context
   ├─► architecture flows     ──► layered walkthrough
   └─► health + git signals   ──► scored panels
```

Commit history is **not** stored in the analysis payload — it is deepened lazily
(`git fetch --deepen --filter=blob:none`) the first time you open the commit graph, so the
initial scan stays fast.

---

## Data and privacy

- Everything lives in `.aliya-ai/` next to the checkout (gitignored). Repositories are cloned
  there and analyses are stored in `projects.json`.
- Set `ALIYA_STORAGE_ROOT=/some/path` to keep that workspace somewhere else — a mounted volume,
  for instance.
- **Your API key is never written to disk by the server.** It travels with the request and is
  used for that call only.
- Only **public GitHub repositories** are supported. Private repositories would need GitHub
  OAuth, which is not implemented.
- The app is local-first by design: it is a Node server that clones to disk, so it does not run
  on serverless platforms (Vercel/Netlify functions have no persistent filesystem and a short
  timeout). Run it on a machine with a disk.

---

## Development

```bash
npm run dev      # server + client with hot reload
npm run lint     # lint the client (must stay clean)
npm run build    # production build into client/dist
npm start        # serve the built client
```

### Tests

Ad-hoc checks live at the repo root and run directly with Node:

```bash
node test-theme-contrast.js --assert               # every colour clears its WCAG floor
node test-health-score.js                          # scores are backed by real scanner fields
node test-chat-markdown.js                         # chat markdown renderer
node test-store-merge.js                           # projects.json survives concurrent processes
node test-prompt-quality.js [repoId] ["question"]  # the AI prompt is well-formed
node test-pdf-report.mjs --write=out.pdf           # generate a report and inspect it
node test-architecture-flows.js --assert           # flows are real, never invented
node test-architecture-flows.js <repoPath> [name]  # report every flow for a clone
```

`test-theme-contrast.js` is the design gate: it reads the CSS and the palette module and fails
if any text or graphic colour drops below its floor, if a dimmed state is darker than an active
one, or if the brand neon green is used as a category fill.

---

## Design

One theme, everywhere: neo-brutalism. 2px ink borders, hard offset shadows, zero radius, pure
white cards on warm paper, butter-yellow hover. The PDF report carries its own copy of the same
rules because it writes raw PDF operators.

See [`DESIGN.md`](DESIGN.md) for the full map, the palette contract and the graph legibility
rules.

---

## License

MIT
