/**
 * ai-context.js — Structured AI context builder with token budget management
 *
 * Assembles rich, compressed context for LLM prompts using:
 * - Token budget allocation per section (saves user tokens)
 * - Question-type adaptive context assembly
 * - Smart truncation that preserves the most relevant data
 * - Mermaid diagram data for architecture/flow questions
 * - Conversation memory for follow-up questions
 */

const { searchIndex, buildDependencyMap, buildArchitectureSummary, buildFileTree, extractFileSignatures } = require('./search-index');
const {
  detectQuestionType,
  buildContextBudget,
  compressToTokenBudget,
  buildConversationContext,
  calculateOutputTokens,
} = require('./token-manager');
const fs = require('fs/promises');
const path = require('path');

function clipText(text, maxChars) {
  if (!text || text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n... truncated ...`;
}

async function loadFileContent(repoPath, filePath) {
  const absolutePath = path.resolve(repoPath, filePath);
  try {
    return await fs.readFile(absolutePath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Extract a compact, high-signal excerpt from a source file.
 * Skips license/comment preambles and long import walls so the snippet
 * lands on real logic the model can quote.
 */
function buildEvidenceSnippet(content, filePath, maxChars = 1700) {
  if (!content) return '';
  const lines = content.split('\n');

  let start = 0;
  const isCommentish = (line) => {
    const trimmed = line.trim();
    if (!trimmed) return true;
    if (/^(\/\/|\*|\/\*|#|"""|''')/.test(trimmed) && trimmed.length < 100) return true;
    if (/^(import|from|require|use|package|#include)\b/.test(trimmed)) return true;
    return false;
  };
  while (start < lines.length && start < 40 && isCommentish(lines[start])) start += 1;

  const body = lines.slice(start, start + 70).join('\n').trim();
  const text = body || content;
  return clipText(text, maxChars);
}

/**
 * Build a comprehensive, token-budgeted context for the AI.
 * Adapts content based on question type to maximize relevance while minimizing token usage.
 */
async function buildRichContext({
  repoRecord,
  question,
  selectedPath,
  focusedNodeIds,
  searchIdx,
  conversationMessages,
}) {
  const { analysis, repoPath } = repoRecord;
  const questionLower = (question || '').toLowerCase();

  // ── Detect question type and compute budget ──────────────────────
  const qType = detectQuestionType(question);
  const budget = buildContextBudget(
    repoRecord.provider || 'openai',
    repoRecord.model || 'gpt-4.1-mini',
    qType,
  );

  // ── 1. Core metadata (compact) ──────────────────────────────────
  const metadata = compressToTokenBudget(
    [
      `Repository: ${analysis.repoName}`,
      `URL: ${analysis.repoUrl}`,
      `Branch: ${analysis.branch}`,
      `Files: ${analysis.summary?.fileCount || analysis.files?.length || 0}`,
      `Folders: ${analysis.summary?.folderCount || 0}`,
      `Graph nodes: ${analysis.graph?.nodes?.length || 0}`,
      `Graph edges: ${analysis.graph?.edges?.length || 0}`,
      `Dependencies: ${analysis.summary?.dependencyEdgeCount || 0}`,
      `Scanned: ${analysis.scannedAt}`,
    ].join('\n'),
    Math.ceil(budget.budget.metadata / 4),
  );

  // ── 2. Language breakdown (compact) ─────────────────────────────
  const languages = compressToTokenBudget(
    (analysis.summary?.languageBreakdown || [])
      .slice(0, 10)
      .map(l => `${l.language}: ${l.count} files, ${l.bytes || 0} bytes`)
      .join('\n') || 'Unknown',
    Math.ceil(budget.budget.languages / 4),
  );

  // ── 3. External dependencies (compact) ──────────────────────────
  const dependencies = compressToTokenBudget(
    (analysis.summary?.externalDependencies || [])
      .slice(0, 25)
      .map(d => `${d.name}${d.version ? `@${d.version}` : ''}`)
      .join(', ') || 'None detected',
    Math.ceil(budget.budget.dependencies / 4),
  );

  // ── 4. Important files (compact) ────────────────────────────────
  const importantFiles = compressToTokenBudget(
    (analysis.summary?.importantFiles || [])
      .slice(0, 15)
      .map(f => `- ${f.path} [${f.reason}]${f.score ? ` (score: ${f.score})` : ''}`)
      .join('\n') || 'None detected',
    Math.ceil(budget.budget.importantFiles / 4),
  );

  // ── 5. RAG-retrieved relevant files ─────────────────────────────
  let relevantContext = '';
  if (searchIdx && question) {
    const searchResults = searchIndex(searchIdx, question, {
      maxResults: qType.primaryType === 'folderSpecific' ? 12 : 8,
      includeContent: false,
      analysis,
    });

    if (searchResults.length) {
      const relevantFiles = searchResults.map(r => {
        const parts = [`### ${r.path} (${r.language}) [relevance: ${r.score}]`];
        if (r.functions.length) parts.push(`Functions: ${r.functions.join(', ')}`);
        if (r.classes.length) parts.push(`Classes: ${r.classes.join(', ')}`);
        if (r.exports.length) parts.push(`Exports: ${r.exports.join(', ')}`);
        if (r.types?.length) parts.push(`Types: ${r.types.join(', ')}`);
        if (r.routes.length) parts.push(`Routes: ${r.routes.join(', ')}`);
        if (r.imports?.length) parts.push(`Imports: ${r.imports.join(', ')}`);
        if (r.summary) parts.push(`Summary: ${r.summary}`);
        return parts.join('\n');
      }).join('\n\n');
      relevantContext = compressToTokenBudget(
        `RELEVANT CODE FILES (ranked by semantic relevance):\n${relevantFiles}`,
        Math.ceil(budget.budget.ragResults / 4),
      );
    }
  }

  // ── 6. Selected file deep analysis ──────────────────────────────
  let selectedFileContext = '';
  if (selectedPath) {
    const content = await loadFileContent(repoPath, selectedPath);
    if (content) {
      const signatures = extractFileSignatures(content, selectedPath);
      const parts = [`SELECTED FILE: ${selectedPath}`];

      if (signatures.functions.length) {
        parts.push(`\nFUNCTIONS (${signatures.functions.length}):`);
        parts.push(signatures.functions.slice(0, 20).map(f => `  - ${f.signature} (line ${f.line})`).join('\n'));
      }
      if (signatures.classes.length) {
        parts.push(`\nCLASSES (${signatures.classes.length}):`);
        parts.push(signatures.classes.map(c =>
          `  - ${c.name}${c.extends ? ` extends ${c.extends}` : ''}${c.implements?.length ? ` implements ${c.implements.join(', ')}` : ''} (line ${c.line})`
        ).join('\n'));
      }
      if (signatures.exports.length) {
        parts.push(`\nEXPORTS: ${signatures.exports.join(', ')}`);
      }
      if (signatures.types?.length) {
        parts.push(`\nTYPES: ${signatures.types.join(', ')}`);
      }
      if (signatures.constants?.length) {
        parts.push(`\nCONSTANTS: ${signatures.constants.join(', ')}`);
      }
      if (signatures.routes.length) {
        parts.push(`\nROUTES: ${signatures.routes.map(r => `${r.method} ${r.path}`).join(', ')}`);
      }

      // For file-specific questions, include more content
      const contentLimit = qType.primaryType === 'fileSpecific' ? 8000 : 4000;
      parts.push(`\nFILE CONTENT:\n\`\`\`\n${clipText(content, contentLimit)}\n\`\`\``);

      selectedFileContext = compressToTokenBudget(
        parts.join('\n'),
        Math.ceil(budget.budget.selectedFile / 4),
        { isCode: true },
      );
    }
  }

  // ── 7. Focused node context ─────────────────────────────────────
  let focusedContext = '';
  if (focusedNodeIds?.length) {
    const focusedNodes = analysis.graph.nodes
      .filter(n => focusedNodeIds.includes(n.id))
      .slice(0, 12);

    if (focusedNodes.length) {
      const parts = [`FOCUSED GRAPH NODES (user selected):`];
      for (const node of focusedNodes) {
        parts.push(`- ${node.label} (${node.path || node.id}) [${node.type}, importance: ${node.importance || 0}]`);
      }

      // Add adjacency info
      const depMap = buildDependencyMap(analysis.files || [], analysis);
      for (const node of focusedNodes) {
        if (node.id?.startsWith('file:')) {
          const filePath = node.id.replace('file:', '');
          const deps = depMap.dependsOn.get(filePath) || [];
          const depBy = depMap.dependedBy.get(filePath) || [];
          if (deps.length || depBy.length) {
            parts.push(`\n${filePath}:`);
            if (deps.length) parts.push(`  imports: ${deps.slice(0, 8).join(', ')}`);
            if (depBy.length) parts.push(`  imported by: ${depBy.slice(0, 8).join(', ')}`);
          }
        }
      }

      focusedContext = compressToTokenBudget(
        parts.join('\n'),
        Math.ceil(budget.budget.focusedNodes / 4),
      );
    }
  }

  // ── 8. Architecture summary ─────────────────────────────────────
  const archSummary = buildArchitectureSummary(analysis);
  let architectureContext = '';
  if (archSummary) {
    const parts = ['ARCHITECTURE:'];

    if (archSummary.layers.length) {
      parts.push(`Layers: ${archSummary.layers.map(([layer, count]) => `${layer}: ${count}`).join(', ')}`);
    }
    if (archSummary.deadCodeCount) parts.push(`Dead code: ${archSummary.deadCodeCount} files`);
    if (archSummary.brokenPipelineCount) parts.push(`Broken signals: ${archSummary.brokenPipelineCount}`);
    if (archSummary.unresolvedImportCount) parts.push(`Unresolved imports: ${archSummary.unresolvedImportCount}`);
    if (archSummary.circularDependencyCount) parts.push(`Circular dependencies: ${archSummary.circularDependencyCount}`);

    if (archSummary.flows.length) {
      parts.push('\nVERIFIED ARCHITECTURE FLOWS:');
      for (const flow of archSummary.flows) {
        const strength = flow.strength ? `, ${flow.strength}` : '';
        const coverage = flow.evidenceCoverage != null ? `, ${flow.evidenceCoverage}% of files carry evidence` : '';
        parts.push(`- ${flow.label} (${flow.confidence}% confidence${strength}${coverage}, ${flow.nodeCount} files)`);
        if (flow.capabilityReasons?.length) {
          parts.push(`  Proven by: ${flow.capabilityReasons.join('; ')}`);
        }
        parts.push(`  Entry: ${flow.entryPoint || 'Unknown'} → Exit: ${flow.exitPoint || 'Unknown'}`);
        if (flow.stages.length) {
          parts.push(`  Key files: ${flow.stages.map(s => s.path).join(' → ')}`);
        }
      }
      parts.push('Only the flows listed above exist in this repository. Do not describe any other flow (for example authentication, payments, websockets or caching) unless it appears in this list.');
    }

    architectureContext = compressToTokenBudget(
      parts.join('\n'),
      Math.ceil(budget.budget.architecture / 4),
    );
  }

  // ── 9. Dependency relationships ─────────────────────────────────
  const depMap = buildDependencyMap(analysis.files || [], analysis);
  const topDependencyFiles = [...depMap.dependsOn.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 10)
    .map(([file, deps]) => `- ${file} imports ${deps.length} modules: ${deps.slice(0, 5).join(', ')}`)
    .join('\n');

  // ── 10. File tree (compact for folder questions, minimal otherwise) ──
  const fileTreeDepth = qType.primaryType === 'folderSpecific' ? 3 : 1;
  const fileTree = compressToTokenBudget(
    (analysis.summary?.topFolders || [])
      .slice(0, qType.primaryType === 'folderSpecific' ? 15 : 8)
      .map(f => `${f.path || f.label}: ${f.fileCount || f.count || 0} files`)
      .join('\n') || 'No folder data',
    Math.ceil(budget.budget.fileTree / 4),
  );

  // ── 11. Diagram context (for architecture/flow questions) ───────
  let diagramContext = '';
  if (qType.shouldIncludeDiagram && archSummary?.flows?.length) {
    const diagramParts = ['MERMAID DIAGRAM DATA (use for visual explanation):'];
    for (const flow of archSummary.flows.slice(0, 2)) {
      diagramParts.push(`\nFlow: ${flow.label}`);
      diagramParts.push(`graph TD`);
      if (flow.stages?.length) {
        flow.stages.forEach((stage, i) => {
          const nodeId = `S${i + 1}`;
          const label = (stage.path || '').split('/').pop() || `Step ${i + 1}`;
          diagramParts.push(`  ${nodeId}["${label}"]`);
          if (i > 0) {
            diagramParts.push(`  S${i} --> ${nodeId}`);
          }
        });
      } else if (flow.entryPoint && flow.exitPoint) {
        diagramParts.push(`  A["${flow.entryPoint}"] --> B["${flow.exitPoint}"]`);
      }
    }
    diagramContext = compressToTokenBudget(
      diagramParts.join('\n'),
      Math.ceil(budget.budget.diagramContext / 4),
    );
  }

  // ── 12. Conversation context ────────────────────────────────────
  const conversationContext = buildConversationContext(
    conversationMessages,
    Math.ceil(budget.budget.conversationHistory / 4),
  );


  // ── 13. Code Intelligence (GitNexus-inspired) ──────────────────────
  let codeIntelContext = '';
  const codeIntel = analysis.codeIntelligence;
  if (codeIntel) {
    const parts = ['CODE INTELLIGENCE (function-level analysis):'];
    parts.push('Functions: ' + codeIntel.totalFunctions + ' | Classes: ' + codeIntel.totalClasses + ' | Routes: ' + codeIntel.totalRoutes + ' | Call relationships: ' + codeIntel.totalCallRelationships);
    
    if (codeIntel.frameworks && codeIntel.frameworks.length) {
      parts.push('Frameworks detected: ' + codeIntel.frameworks.join(', '));
    }
    
    if (codeIntel.filePurposes) {
      parts.push('File purposes: ' + Object.entries(codeIntel.filePurposes).map(([k,v]) => k + ':' + v).join(', '));
    }
    
    if (codeIntel.entryPoints && codeIntel.entryPoints.length) {
      parts.push('\nENTRY POINTS (highest scoring):');
      for (const ep of codeIntel.entryPoints.slice(0, 10)) {
        parts.push('  - ' + ep.name + '() in ' + ep.filePath + ' [score: ' + ep.entryScore.toFixed(2) + ', reasons: ' + ep.entryReasons.join(', ') + ']');
      }
    }
    
    if (codeIntel.communities && codeIntel.communities.length) {
      parts.push('\nCODE COMMUNITIES (functional clusters):');
      for (const comm of codeIntel.communities.slice(0, 8)) {
        parts.push('  - ' + comm.label + ' (' + comm.memberCount + ' files): ' + comm.members.slice(0, 5).join(', '));
      }
    }
    
    if (codeIntel.topExporters && codeIntel.topExporters.length) {
      parts.push('\nTOP EXPORTERS:');
      for (const exp of codeIntel.topExporters.slice(0, 5)) {
        parts.push('  - ' + exp.filePath + ' (' + exp.exports + ' exports)');
      }
    }
    
    codeIntelContext = compressToTokenBudget(parts.join('\n'), Math.ceil(budget.budget.architecture / 4));
  }

  // ── 14. Verbatim code evidence (the model can quote this) ─────────
  // This is the single biggest lever for answer quality: it lets the model
  // reason about real code instead of only metadata about the code.
  let codeEvidence = '';
  if (searchIdx && question) {
    const evidenceLimit = qType.primaryType === 'fileSpecific' ? 3 : 5;
    const evidenceResults = searchIndex(searchIdx, question, {
      maxResults: evidenceLimit,
      includeContent: false,
      analysis,
    });

    const snippets = [];
    for (const result of evidenceResults) {
      const content = await loadFileContent(repoPath, result.path);
      const snippet = buildEvidenceSnippet(content, result.path);
      if (!snippet) continue;
      const header = `### ${result.path} [${result.language || 'unknown'}]`;
      const symbolLine = [
        result.functions?.length ? `defines: ${result.functions.slice(0, 6).join(', ')}` : '',
        result.classes?.length ? `classes: ${result.classes.slice(0, 4).join(', ')}` : '',
        result.exports?.length ? `exports: ${result.exports.slice(0, 6).join(', ')}` : '',
      ].filter(Boolean).join(' | ');
      snippets.push([header, symbolLine, '```' + (result.language || ''), snippet, '```'].filter(Boolean).join('\n'));
    }

    if (snippets.length) {
      codeEvidence = compressToTokenBudget(
        `CODE EVIDENCE — verbatim excerpts from the most relevant files. Quote from these exactly; do not paraphrase identifiers.\n\n${snippets.join('\n\n')}`,
        Math.ceil(budget.budget.relevantSnippets / 4),
        { isCode: true },
      );
    }
  }

  return {
    metadata,
    languages,
    dependencies,
    importantFiles,
    relevantContext,
    selectedFileContext,
    focusedContext,
    architectureContext,
    topDependencyFiles,
    fileTree,
    diagramContext,
    codeIntelContext,
    codeEvidence,
    conversationContext,
    projectDescription: compressToTokenBudget(
      analysis.summary?.description || analysis.summary?.narrative || '',
      200,
    ),
    questionType: qType,
    outputTokens: calculateOutputTokens(qType, repoRecord.provider || 'openai', repoRecord.model || ''),
  };
}

/**
 * Build the complete AI prompt using budgeted, compressed context.
 */
async function buildEnhancedPrompt({
  repoRecord,
  question,
  selectedPath,
  focusedNodeIds,
  searchIdx,
  wantsDetail,
  conversationMessages,
}) {
  const ctx = await buildRichContext({
    repoRecord,
    question,
    selectedPath,
    focusedNodeIds,
    searchIdx,
    conversationMessages,
  });

  const qType = ctx.questionType;
  const isHindi = qType.isHindi;

  // ── Per-question answer shape ────────────────────────────────────
  const answerShape = qType.primaryType === 'fileSpecific'
    ? [
        'ANSWER SHAPE (file question):',
        '- **What it is** — one sentence on this file\'s single responsibility.',
        '- **How it works** — the 2–4 real functions/classes that matter, what each does, and the line where it lives.',
        '- **Connections** — what it imports and who imports it, named explicitly.',
        '- **Watch out for** — a real bug, edge case, or coupling a reviewer would flag. Omit the section if there is nothing real to say.',
      ]
    : qType.primaryType === 'folderSpecific'
    ? [
        'ANSWER SHAPE (folder question):',
        '- **Role of the folder** — what this part of the system is for.',
        '- **Key files** — the files that carry the weight, each with one line on its job.',
        '- **How it plugs in** — what it consumes from and exposes to the rest of the repo.',
        '- **Inventory** — a short list of the remaining files grouped by purpose.',
      ]
    : qType.primaryType === 'architecture'
    ? [
        'ANSWER SHAPE (architecture question):',
        '- **The mental model** — 2–3 sentences a new engineer could repeat to a teammate.',
        '- **Layers** — each layer, its responsibility, and a representative file path.',
        '- **How a request/data moves through it** — the actual path, naming real files.',
        '- **Design notes** — patterns used, and the trade-off or risk each one buys.',
        '- **Diagram** — a Mermaid `graph TD` (max 8 nodes) using the diagram data provided.',
      ]
    : qType.primaryType === 'flow'
    ? [
        'ANSWER SHAPE (flow question):',
        '- **Entry point** — the exact file and symbol where the flow begins.',
        '- **Step by step** — numbered steps, each naming the file/symbol that performs it.',
        '- **Exit / side effects** — what is returned, persisted, or emitted.',
        '- **Failure paths** — error handling and where it breaks (if visible in the context).',
        '- **Diagram** — a Mermaid `flowchart TD` (max 8 nodes).',
      ]
    : qType.primaryType === 'dependency'
    ? [
        'ANSWER SHAPE (dependency question):',
        '- **Direct answer** — what depends on what, in one or two sentences.',
        '- **Outgoing** — imports, each with a one-line reason the code needs it.',
        '- **Incoming** — who imports this, and why it matters.',
        '- **Risk** — circular edges, layering violations, or fragile coupling (only if real).',
      ]
    : qType.primaryType === 'debug'
    ? [
        'ANSWER SHAPE (debug question):',
        '- **Most likely cause** — state it plainly, ranked if there are multiple candidates.',
        '- **Where to look** — exact files/symbols from the context, with what to check in each.',
        '- **Fix** — the concrete change, shown as a short code diff when the context supports it.',
        '- **Verify** — how to confirm the fix worked.',
      ]
    : qType.primaryType === 'specific'
    ? [
        'ANSWER SHAPE (symbol question):',
        '- **What it does** — one sentence.',
        '- **Where it lives** — exact file and line.',
        '- **Who calls it / what it calls** — from the context only.',
        '- **Notes** — non-obvious behavior, defaults, or edge cases.',
      ]
    : [
        'ANSWER SHAPE (general repo question):',
        '- **Direct answer first** — answer the question in the opening 1–3 sentences.',
        '- **Evidence** — bullets citing exact file paths and symbols.',
        '- **Next step** — one concrete pointer the user can act on.',
      ];

  return [
    // ── Identity & mission ───────────────────────────────────────
    'You are Aliya AI — a staff-level software engineer and systems architect embedded in the repository below.',
    'You have already read the codebase graph, the file inventory, and the verbatim code excerpts in this prompt.',
    'Answer the way a brilliant senior engineer answers a teammate during a code review: direct, specific, evidence-backed, and immediately useful.',
    'If asked who created you, say: Aliya AI was created by Gokul Raj.',
    '',
    'SCOPE: Discuss only the analyzed repository and the context provided. If the question is unrelated to this repo, decline in one short sentence and stop.',
    '',
    // ── Grounding rules ──────────────────────────────────────────
    'GROUNDING RULES (non-negotiable):',
    '1. Every claim must trace to the context below: exact file paths, function/class names, routes, graph edges, or code excerpts.',
    '2. Quote real code when it makes the answer concrete. Copy identifiers and snippets EXACTLY — never rename, invent, or "improve" them.',
    '3. Never invent files, functions, classes, endpoints, dependencies, metrics, or line numbers.',
    '4. If the context does not contain the answer, say exactly what is missing and where the user should look. Use "Not detected in this repo" or "Unable to verify from the scanned evidence". Never guess.',
    '5. The graph (nodes + edges) is derived from real imports and file analysis — treat it as ground truth for relationships.',
    '6. State the limits of your own evidence. A confident answer with an honest "not verified" line is worth more than a complete-sounding one that hides its gaps.',
    '',
    // ── Reasoning protocol ───────────────────────────────────────
    'THINK LIKE A SENIOR ENGINEER (do this silently — never print your reasoning):',
    'a. Classify the question: architecture / flow / file / dependency / debug / metric.',
    'b. Pick the 2–4 most relevant files from the context and infer each one\'s role from its real code.',
    'c. Trace how control or data actually moves between them, using imports and call sites.',
    'd. Ask what a reviewer would flag: coupling, missing error handling, duplicated logic, surprising side effects.',
    'e. Answer with the smallest set of points that fully resolves the question.',
    '',
    // ── Answer shape ─────────────────────────────────────────────
    ...answerShape,
    '',
    // ── Closing contract ─────────────────────────────────────────
    // Borrowed from the reverse-engineering tool this project was measured
    // against: a conclusion is only trustworthy when it ships with the evidence
    // behind it *and* an explicit statement of what was not examined. Without
    // the second half the reader cannot tell a verified claim from a plausible
    // one, which is exactly the failure mode this assistant exists to avoid.
    'CLOSING CONTRACT (every answer, no exceptions):',
    'After the answer body, always add these two short lines:',
    '- **Verified from** — the exact files and symbols this answer rests on. Copy the paths as given in the context; never invent line numbers you were not shown.',
    '- **Not verified** — what you did not or could not check: files outside the provided context, runtime behaviour, configuration, tests, or dependencies that were not scanned. If every claim above traces to the listed files, say so in one clause.',
    'Any claim you cannot ground belongs in **Not verified**, not in the answer body. Never pad this section with generic caveats — name the specific gap.',
    '',
    // ── Style ────────────────────────────────────────────────────
    'STYLE:',
    '- Lead with the answer. No preamble, no restating the question, no "Great question".',
    '- Write like an engineer: concrete nouns, active voice, zero filler.',
    '- Use `inline code` for paths, symbols, and commands. Use fenced blocks with a language tag for code.',
    '- Name the specific function or file instead of saying "the code" or "this module".',
    '- Default to tight answers. Go long only when the user asks for depth.',
    '',
    // ── Length ───────────────────────────────────────────────────
    wantsDetail || qType.wantsDetail
      ? 'LENGTH: DETAILED. The user asked for depth — give a thorough, well-structured walkthrough with real file paths and symbols. Do not pad with generic advice.'
      : qType.wantsBrief
      ? 'LENGTH: BRIEF. The user asked for a short answer — 3–6 lines maximum.'
      : 'LENGTH: MODERATE. Enough to fully answer, nothing more. Roughly 120–250 words unless the question genuinely needs more.',
    '',
    // ── Diagram ──────────────────────────────────────────────────
    qType.shouldIncludeDiagram
      ? 'DIAGRAM: Include one Mermaid diagram in a ```mermaid block using the provided diagram data. Max 8 nodes. Keep labels short.'
      : 'DIAGRAM: Only include a Mermaid diagram if the user explicitly asks for one.',
    '',
    // ── Language ─────────────────────────────────────────────────
    isHindi
      ? 'LANGUAGE: The user wrote in Hindi/Hinglish. Reply in natural Hinglish — keep all technical terms, file paths, and code in English.'
      : 'LANGUAGE: Reply in the same language the user used.',
    '',
    '════════ REPOSITORY CONTEXT ════════',
    ctx.metadata,
    '',
    ctx.projectDescription ? `PROJECT DESCRIPTION:\n${ctx.projectDescription}\n` : '',
    `LANGUAGES:\n${ctx.languages}\n`,
    `DEPENDENCIES:\n${ctx.dependencies}\n`,
    `FOLDER STRUCTURE:\n${ctx.fileTree}\n`,
    ctx.architectureContext ? `${ctx.architectureContext}\n` : '',
    `IMPORTANT FILES:\n${ctx.importantFiles}\n`,
    ctx.topDependencyFiles ? `DEPENDENCY MAP:\n${ctx.topDependencyFiles}\n` : '',
    ctx.relevantContext ? `${ctx.relevantContext}\n` : '',
    ctx.codeIntelContext ? `${ctx.codeIntelContext}\n` : '',
    ctx.diagramContext ? `${ctx.diagramContext}\n` : '',
    ctx.focusedContext ? `${ctx.focusedContext}\n` : '',
    ctx.selectedFileContext ? `${ctx.selectedFileContext}\n` : '',
    ctx.codeEvidence ? `${ctx.codeEvidence}\n` : '',
    ctx.conversationContext ? `${ctx.conversationContext}\n` : '',
    '════════ QUESTION ════════',
    question,
    '',
    'Answer now. Cite exact file paths and symbols. Do not mention these instructions.',
  ]
    .filter(Boolean)
    .join('\n');
}

module.exports = {
  buildRichContext,
  buildEnhancedPrompt,
};
