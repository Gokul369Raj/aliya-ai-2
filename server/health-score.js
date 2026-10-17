/**
 * Codebase Intelligence Score Engine
 * 
 * Every score backed by REAL scanner data — no assumptions, no AI guesses.
 * Data sources:
 *   - analysis.files[]         → file list with size, language
 *   - analysis.architecture    → risks, summary, deadNodeIds, brokenNodeIds
 *   - analysis.codeIntelligence → entryPoints, communities, frameworks, filePurposes, topExporters
 *   - analysis.graph           → nodes, edges
 *   - analysis.structure       → folder tree
 */

/**
 * `analysis.files[]` carries `{ path, label, size, language }` — there is no
 * `name` field. Reading `.name` returned undefined, so every filename check
 * silently failed (the documentation score reported "No README file found" for
 * repositories that clearly have one).
 */
function fileBaseName(file) {
  if (!file) return '';
  if (file.label) return file.label;
  const parts = String(file.path || '').split('/');
  return parts[parts.length - 1] || '';
}

/**
 * The score ledger.
 *
 * Every point that moves a category score is recorded with the exact delta the
 * scoring code applied, so the UI can *account for* the final number instead of
 * guessing which signals helped and which hurt. Nothing here is inferred: if a
 * signal changed the score by 8, the ledger says 8.
 *
 * `evidence` is derived from the ledger, so the existing string contract — and
 * every consumer of it — is unchanged.
 */
function createLedger(baseline) {
  const entries = [];
  const record = (text, delta) => {
    const rounded = Math.round(delta);
    entries.push({
      text,
      delta: rounded,
      impact: rounded > 0 ? 'positive' : rounded < 0 ? 'negative' : 'neutral',
    });
  };

  return {
    entries,
    credit(text, delta) { record(text, Math.abs(delta)); },
    penalty(text, delta) { record(text, -Math.abs(delta)); },
    note(text) { record(text, 0); },
    result() {
      const credits = entries.reduce((sum, entry) => sum + Math.max(0, entry.delta), 0);
      const penalties = entries.reduce((sum, entry) => sum + Math.min(0, entry.delta), 0);
      const rawScore = baseline + credits + penalties;
      const score = clamp(rawScore);
      return {
        score,
        grade: getGrade(score),
        evidence: entries.map((entry) => entry.text),
        breakdown: entries,
        baseline,
        credits,
        penalties,
        rawScore: Math.round(rawScore),
        // A category that ran past 0 or 100 was capped — say so rather than
        // letting the arithmetic look wrong.
        clamped: Math.round(rawScore) !== score,
      };
    },
  };
}

/* How the five categories combine into the overall number. Exposed in the
   payload so the UI can show the arithmetic instead of asserting it. */
const CATEGORY_WEIGHTS = {
  architecture: 0.25,
  quality: 0.25,
  security: 0.15,
  maintainability: 0.2,
  documentation: 0.15,
};

function analyzeHealthScore(analysis, architecture, codeIntel, commitHistory) {
  const arch = analyzeArchitecture(analysis, architecture, codeIntel);
  const quality = analyzeCodeQuality(analysis, architecture, codeIntel);
  const security = analyzeSecurity(analysis);
  const maintainability = analyzeMaintainability(analysis, architecture, codeIntel);
  const documentation = analyzeDocumentation(analysis);

  const scores = { architecture: arch, quality, security, maintainability, documentation };

  const contributions = Object.entries(CATEGORY_WEIGHTS).map(([key, weight]) => ({
    key,
    weight,
    score: scores[key].score,
    points: Math.round(scores[key].score * weight * 100) / 100,
  }));

  const overall = Math.round(
    contributions.reduce((sum, item) => sum + item.score * item.weight, 0),
  );

  return {
    overall,
    scores,
    weights: CATEGORY_WEIGHTS,
    contributions,
    generatedAt: Date.now(),
  };
}

function analyzeArchitecture(analysis, architecture, codeIntel) {
  const ledger = createLedger(50);
  const files = analysis.files || [];
  const risks = architecture.risks || [];
  const brokenIds = architecture.brokenNodeIds || [];

  // 1. File organization — how many distinct folders
  const folderSet = new Set();
  files.forEach(f => {
    const parts = f.path.split('/');
    if (parts.length > 1) folderSet.add(parts[0]);
  });
  const rootFolders = folderSet.size;
  if (rootFolders >= 4) {
    ledger.credit(`${rootFolders} root folders — well-organized project structure`, 15);
  } else if (rootFolders >= 2) {
    ledger.credit(`${rootFolders} root folders — basic structure separation`, 8);
  } else {
    ledger.note(`Only ${rootFolders} root folder — flat structure`);
  }

  // 2. Circular dependencies
  const circRisk = risks.filter(r => r.kind === 'circular-dependency');
  if (circRisk.length === 0) {
    ledger.credit('No circular dependencies detected', 12);
  } else {
    ledger.penalty(`${circRisk.length} circular dependency/dependencies found`, circRisk.length * 5);
  }

  // 3. Entry points — module boundaries. Judged relative to codebase size: a
  //    fixed "more than 8 is too many" threshold is meaningless for a project
  //    with hundreds of functions (and event handlers are legitimate entry
  //    points in a UI codebase).
  const entryPointCount = codeIntel?.totalEntryPoints ?? (codeIntel?.entryPoints || []).length;
  const functionCount = codeIntel?.totalFunctions || 0;
  if (entryPointCount === 0) {
    ledger.note('No entry points detected');
  } else if (!functionCount) {
    ledger.credit(`${entryPointCount} entry points detected`, 5);
  } else {
    const ratio = entryPointCount / functionCount;
    const summary = `${entryPointCount} of ${functionCount} functions look like entry points`;
    if (ratio <= 0.1) {
      ledger.credit(`${summary} — clear module boundaries`, 10);
    } else if (ratio <= 0.3) {
      ledger.credit(`${summary} — reasonable public surface`, 6);
    } else {
      ledger.credit(`${summary} — broad public surface`, 2);
    }
  }

  // 4. Dead code — risks with kind=dead-code
  const deadRisks = risks.filter(r => r.kind === 'dead-code');
  if (deadRisks.length === 0) {
    ledger.credit('No dead code detected', 10);
  } else {
    ledger.penalty(`${deadRisks.length} dead code instance(s) detected`, Math.min(deadRisks.length * 2, 12));
  }

  // 5. Broken imports
  const brokenRisks = risks.filter(r => r.kind === 'unresolved-import');
  if (brokenRisks.length === 0 && brokenIds.length === 0) {
    ledger.credit('All imports resolve correctly', 8);
  } else {
    const total = brokenRisks.length + brokenIds.length;
    ledger.penalty(`${total} broken import(s) — build may fail`, Math.min(total * 4, 15));
  }

  // 6. Isolated auth (security-sensitive architecture issue)
  const authRisks = risks.filter(r => r.kind === 'isolated-auth');
  if (authRisks.length > 0) {
    ledger.penalty(`${authRisks.length} isolated auth pattern(s) detected`, 5);
  }

  // 7. Communal clusters — files that work together
  const communities = codeIntel?.communities || [];
  if (communities.length >= 2) {
    ledger.credit(`${communities.length} functional clusters — modular architecture`, 5);
  }

  return ledger.result();
}

function analyzeCodeQuality(analysis, architecture, codeIntel) {
  const ledger = createLedger(50);
  const files = analysis.files || [];
  const risks = architecture.risks || [];

  // 1. Language variety
  const langs = {};
  files.forEach(f => { if (f.language) langs[f.language] = (langs[f.language] || 0) + 1; });
  const langEntries = Object.entries(langs);
  if (langEntries.length > 0) {
    const topLangs = langEntries.sort((a, b) => b[1] - a[1]).slice(0, 3).map(([l, c]) => `${l}(${c})`);
    ledger.credit(`${langEntries.length} language(s): ${topLangs.join(', ')}`, 5);
  }

  // 2. Function count — more functions = better decomposition
  const totalFuncs = codeIntel?.totalFunctions || 0;
  const totalClasses = codeIntel?.totalClasses || 0;
  const totalRoutes = codeIntel?.totalRoutes || 0;
  if (totalFuncs > 0) {
    ledger.credit(`${totalFuncs} function(s) detected`, 5);
  }
  if (totalClasses > 0) {
    ledger.credit(`${totalClasses} class(es) with structured OOP`, 3);
  }
  if (totalRoutes > 0) {
    ledger.credit(`${totalRoutes} API route(s) defined`, 2);
  }

  // 3. Call relationships — more calls = better interconnected code
  const callRels = codeIntel?.totalCallRelationships || 0;
  if (callRels > 0) {
    ledger.credit(`${callRels} call relationship(s) between functions`, 3);
  }

  // 4. Dead code penalty
  const deadRisks = risks.filter(r => r.kind === 'dead-code');
  if (deadRisks.length > 0) {
    ledger.penalty(`${deadRisks.length} dead code instance(s) — unused functions`, Math.min(deadRisks.length * 4, 15));
  }

  // 5. Large files (>50KB) — harder to maintain
  const largeFiles = files.filter(f => f.size && f.size > 50000);
  if (largeFiles.length > 0) {
    ledger.penalty(`${largeFiles.length} file(s) over 50KB — consider splitting`, Math.min(largeFiles.length * 2, 8));
  } else {
    ledger.note('No oversized files detected');
  }

  // 6. Top exporters — files with many exports
  const topExports = codeIntel?.topExporters || [];
  if (topExports.length > 0) {
    ledger.credit(`${topExports.length} high-export file(s) — clear module boundaries`, 3);
  }

  return ledger.result();
}

function analyzeSecurity(analysis) {
  const ledger = createLedger(70);
  const files = analysis.files || [];

  // Template/sample files are meant to be committed and carry no secrets.
  // Treating `.env.example` as sensitive both penalised and rewarded the same
  // file, which made the security score incoherent.
  const isTemplateFile = (filePath = '') => /\.(example|sample|template|dist|default)$/i.test(filePath);

  // 1. Sensitive files in repo
  const secretFiles = files.filter(f =>
    /\.(env|pem|key|secret|credential)/i.test(f.path) && !isTemplateFile(f.path)
  );
  if (secretFiles.length > 0) {
    ledger.penalty(`Sensitive file(s) in repo: ${secretFiles.map(f => f.path).join(', ')}`, secretFiles.length * 8);
  }

  // 2. .env files — should be gitignored
  const envFiles = files.filter(f => /\.env$/i.test(f.path) || /\.env\./i.test(f.path))
    .filter(f => !isTemplateFile(f.path));
  if (envFiles.length > 0) {
    ledger.penalty(`${envFiles.length} .env file(s) in repo — ensure they're in .gitignore`, 10);
  }

  // 3. Config files present (good practice)
  const configFiles = files.filter(f =>
    /(\.eslintrc|\.prettierrc|tsconfig|jest\.config|\.env\.example)/i.test(f.path)
  );
  if (configFiles.length > 0) {
    ledger.credit(`${configFiles.length} config file(s) for code quality enforcement`, 5);
  }

  // 4. Lock files (deterministic builds)
  const lockFiles = files.filter(f => /(package-lock|yarn\.lock|pnpm-lock)/i.test(f.path));
  if (lockFiles.length > 0) {
    ledger.credit('Lock file present for deterministic dependency resolution', 5);
  }

  // 5. .gitignore present
  const gitignore = files.find(f => fileBaseName(f) === '.gitignore');
  if (gitignore) {
    ledger.credit('.gitignore file present', 3);
  }

  if (ledger.entries.length === 0) {
    ledger.note('No security-specific files detected — basic default score applied');
  }

  return ledger.result();
}

function analyzeMaintainability(analysis, architecture, codeIntel) {
  const ledger = createLedger(50);
  const files = analysis.files || [];
  const risks = architecture.risks || [];

  // 1. Folder structure depth
  const folderSet = new Set();
  files.forEach(f => {
    const parts = f.path.split('/');
    for (let i = 1; i < parts.length; i++) {
      folderSet.add(parts.slice(0, i).join('/'));
    }
  });
  if (folderSet.size > 3) {
    ledger.credit(`${folderSet.size} directories — organized file structure`, 10);
  }

  // 2. Dead code
  const deadRisks = risks.filter(r => r.kind === 'dead-code');
  if (deadRisks.length === 0) {
    ledger.credit('No dead code detected', 10);
  } else {
    ledger.penalty(`${deadRisks.length} dead code instance(s) need cleanup`, Math.min(deadRisks.length * 3, 12));
  }

  // 3. Broken imports
  const brokenRisks = risks.filter(r => r.kind === 'unresolved-import');
  const brokenIds = architecture.brokenNodeIds || [];
  const totalBroken = brokenRisks.length + brokenIds.length;
  if (totalBroken === 0) {
    ledger.credit('All imports resolve correctly', 10);
  } else {
    ledger.penalty(`${totalBroken} broken import(s) — code won't compile`, Math.min(totalBroken * 4, 15));
  }

  // 4. Framework usage (modern tooling = easier to maintain)
  const frameworks = codeIntel?.frameworks || [];
  if (frameworks.length > 0) {
    ledger.credit(`Framework(s): ${frameworks.join(', ')}`, 5);
  }

  // 5. Community clusters
  const communities = codeIntel?.communities || [];
  if (communities.length > 1) {
    ledger.credit(`${communities.length} functional clusters — modular architecture`, 5);
  }

  // 6. File size consistency — check standard deviation
  const sizes = files.filter(f => f.size > 0).map(f => f.size);
  if (sizes.length > 0) {
    const maxFile = Math.max(...sizes);
    const minFile = Math.min(...sizes);
    if (maxFile / (minFile || 1) < 100) {
      ledger.credit('Reasonable file size distribution', 3);
    }
  }

  return ledger.result();
}

function analyzeDocumentation(analysis) {
  const ledger = createLedger(30);
  const files = analysis.files || [];

  // 1. README — a root README is ideal, a nested one still counts
  const readmes = files.filter(f => /^readme(\.[a-z]+)?$/i.test(fileBaseName(f)));
  const rootReadme = readmes.find(f => !String(f.path).includes('/'));
  const readme = rootReadme || readmes[0];
  if (readme) {
    ledger.credit(`README found: ${readme.path} (${formatBytes(readme.size)})`, 25);
  } else {
    ledger.note('No README file found');
  }

  // 2. Docs folder / markdown files
  const docFiles = files.filter(f =>
    /(^docs?\/|\/docs?\/|\.md$|\.mdx$|CHANGELOG|CONTRIBUTING|LICENSE)/i.test(f.path)
  );
  if (docFiles.length > 0) {
    ledger.credit(`${docFiles.length} documentation file(s) found`, Math.min(docFiles.length * 5, 20));
  }

  // 3. LICENSE
  const license = files.find(f => /^license(\.[a-z]+)?$/i.test(fileBaseName(f)));
  if (license) {
    ledger.credit('LICENSE file present', 10);
  }

  // 4. TypeScript — types serve as documentation
  const tsFiles = files.filter(f => /\.(ts|tsx|d\.ts)$/i.test(f.path));
  if (tsFiles.length > 0) {
    ledger.credit('TypeScript detected — type annotations serve as documentation', 5);
  }

  // 5. Source files
  const srcFiles = files.filter(f => /\.(js|ts|jsx|tsx|py)$/i.test(f.path));
  if (srcFiles.length > 0) {
    ledger.credit(`${srcFiles.length} source file(s) — review comments for inline docs`, 5);
  }

  // 6. Config files (tells how to run)
  const configFiles = files.filter(f =>
    /^(package\.json|\.gitignore|dockerfile|docker-compose|makefile)/i.test(fileBaseName(f))
  );
  if (configFiles.length > 0) {
    ledger.credit(`${configFiles.length} config file(s) — project setup documented`, 3);
  }

  return ledger.result();
}

/**
 * Git Intelligence — analyze commit patterns from real git data
 */
/**
 * Normalize a commit's changed-file list.
 *
 * The analyzer emits `changedFiles` (an array of path strings), but earlier call
 * sites here read `commit.files` (an array of `{ file }` / `{ path }` objects).
 * That mismatch silently produced zero file data, which made every source file
 * look "abandoned" and left the risky/churn lists empty. Accept both shapes.
 */
function getCommitFiles(commit) {
  const raw = Array.isArray(commit?.changedFiles) && commit.changedFiles.length
    ? commit.changedFiles
    : Array.isArray(commit?.files)
      ? commit.files
      : [];

  return raw
    .map((entry) => (typeof entry === 'string' ? entry : entry?.file || entry?.path))
    .filter(Boolean);
}

function analyzeGitIntelligence(gitHistory, analysis) {
  const commits = gitHistory || [];
  const files = analysis.files || [];

  // File change frequency
  const fileChanges = {};
  const fileAuthors = {};
  commits.forEach(commit => {
    getCommitFiles(commit).forEach(p => {
      fileChanges[p] = (fileChanges[p] || 0) + 1;
      if (commit.author) {
        if (!fileAuthors[p]) fileAuthors[p] = new Set();
        fileAuthors[p].add(commit.author);
      }
    });
  });

  // Sort by change frequency
  const mostChangedFiles = Object.entries(fileChanges)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([path, changes]) => ({
      path,
      changes,
      contributors: fileAuthors[path] ? fileAuthors[path].size : 0,
      risk: changes > 20 ? 'high' : changes > 10 ? 'medium' : 'low',
    }));

  // Risky files
  const riskyFiles = mostChangedFiles
    .filter(f => f.risk === 'high' || f.contributors > 2)
    .map(f => ({
      ...f,
      reason: f.risk === 'high'
        ? `Changed ${f.changes} times — high churn`
        : `${f.contributors} contributors — shared ownership risk`,
    }));

  // Stale files — present in the repo but untouched within the analysed window.
  const changedFiles = new Set(Object.keys(fileChanges));
  const abandonedFiles = files
    .filter(f => !changedFiles.has(f.path) && /\.(js|ts|jsx|tsx|py|go|rs)$/i.test(f.path))
    .sort((a, b) => (b.size || 0) - (a.size || 0))
    .slice(0, 12)
    .map(f => ({ path: f.path, size: f.size || 0 }));

  // Contributor summary
  const contributorStats = {};
  commits.forEach(commit => {
    const author = commit.author || 'Unknown';
    if (!contributorStats[author]) {
      contributorStats[author] = { commits: 0, files: new Set() };
    }
    contributorStats[author].commits++;
    getCommitFiles(commit).forEach(p => {
      contributorStats[author].files.add(p);
    });
  });

  const contributors = Object.entries(contributorStats)
    .map(([name, stats]) => ({
      name,
      commits: stats.commits,
      filesChanged: stats.files.size,
    }))
    .sort((a, b) => b.commits - a.commits);

  // Recent activity
  const recentCommits = commits.slice(0, 10).map(c => ({
    hash: c.hash || c.sha || '',
    message: c.message || '',
    author: c.author || '',
    date: c.date || '',
    filesChanged: getCommitFiles(c).length,
  }));

  // Monthly activity
  const monthlyActivity = {};
  commits.forEach(c => {
    const d = new Date(c.date);
    if (!isNaN(d.getTime())) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthlyActivity[key] = (monthlyActivity[key] || 0) + 1;
    }
  });

  return {
    totalCommits: commits.length,
    mostChangedFiles,
    riskyFiles,
    abandonedFiles,
    contributors,
    recentCommits,
    monthlyActivity,
    generatedAt: Date.now(),
  };
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function clamp(val, min = 0, max = 100) {
  return Math.max(min, Math.min(max, val));
}

function getGrade(score) {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B+';
  if (score >= 60) return 'B';
  if (score >= 50) return 'C+';
  if (score >= 40) return 'C';
  if (score >= 30) return 'D';
  return 'F';
}

module.exports = {
  analyzeHealthScore,
  analyzeGitIntelligence,
};
