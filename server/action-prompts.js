/**
 * action-prompts.js — Focused prompt templates for node interactions
 *
 * Each action type gets a specific, focused prompt that tells the AI
 * EXACTLY what to answer — nothing more, nothing less.
 */

/**
 * Build a focused prompt for a specific action on a specific file/node.
 * @param {Object} options
 * @param {string} options.action - 'summary' | 'explain' | 'bug' | 'optimize' | 'dependency'
 * @param {string} options.filePath - The file path
 * @param {string} options.fileContent - The file content
 * @param {Object} options.nodeData - Node metadata from the graph
 * @param {Object} options.codeIntel - Code intelligence data for this file
 * @param {Object} options.analysis - Full repo analysis
 * @returns {string} The focused prompt
 */
function buildActionPrompt({ action, filePath, fileContent, nodeData, codeIntel, analysis }) {
  const fileName = filePath.split('/').pop();
  const language = nodeData?.language || fileContent?.match(/\.(js|ts|jsx|tsx|py|go|rs|java|rb|php)$/)?.[1] || 'code';
  
  // Build file context
  const fileContext = buildFileContext(filePath, fileContent, nodeData, codeIntel);
  
  // Get dependencies for this file
  const deps = getFileDependencies(filePath, analysis);
  const depContext = deps.length ? `\nFILE DEPENDENCIES: ${deps.join(', ')}` : '';
  
  // Get what depends on this file
  const dependents = getFileDependents(filePath, analysis);
  const depByContext = dependents.length ? `\nDEPENDENT FILES: ${dependents.join(', ')}` : '';
  
  switch (action) {
    case 'summary':
      return buildSummaryPrompt(filePath, fileName, fileContext, depContext, depByContext);
    case 'explain':
      return buildExplainPrompt(filePath, fileName, fileContext, depContext, depByContext);
    case 'bug':
      return buildBugPrompt(filePath, fileName, fileContext, depContext, depByContext);
    case 'optimize':
      return buildOptimizePrompt(filePath, fileName, fileContext, depContext, depByContext);
    case 'dependency':
      return buildDependencyPrompt(filePath, fileName, fileContext, depContext, depByContext, deps, dependents);
    default:
      return buildSummaryPrompt(filePath, fileName, fileContext, depContext, depByContext);
  }
}

function buildFileContext(filePath, fileContent, nodeData, codeIntel) {
  const parts = [`FILE: ${filePath}`];
  
  if (nodeData?.language) parts.push(`LANGUAGE: ${nodeData.language}`);
  if (nodeData?.layer) parts.push(`LAYER: ${nodeData.layer}`);
  if (nodeData?.roles?.length) parts.push(`ROLES: ${nodeData.roles.join(', ')}`);
  
  if (codeIntel) {
    if (codeIntel.functions?.length) {
      parts.push(`\nFUNCTIONS (${codeIntel.functions.length}):`);
      for (const fn of codeIntel.functions.slice(0, 15)) {
        parts.push(`  - ${fn.signature || fn.name}() [line ${fn.line}${fn.isAsync ? ', async' : ''}${fn.isExported ? ', exported' : ''}]`);
      }
    }
    if (codeIntel.classes?.length) {
      parts.push(`\nCLASSES:`);
      for (const cls of codeIntel.classes) {
        const extendsStr = cls.extends ? ` extends ${cls.extends}` : '';
        parts.push(`  - ${cls.name}${extendsStr} [line ${cls.line}]`);
        if (cls.methods?.length) {
          parts.push(`    Methods: ${cls.methods.map(m => m.name).join(', ')}`);
        }
      }
    }
    if (codeIntel.routes?.length) {
      parts.push(`\nROUTES:`);
      for (const route of codeIntel.routes) {
        parts.push(`  - ${route.method} ${route.path} [line ${route.line}]`);
      }
    }
    if (codeIntel.calls?.length) {
      parts.push(`\nFUNCTION CALLS: ${codeIntel.calls.join(', ')}`);
    }
  }
  
  if (fileContent) {
    parts.push(`\nFILE CONTENT:\n\`\`\`\n${fileContent.substring(0, 4000)}\n\`\`\``);
  }
  
  return parts.join('\n');
}

function getFileDependencies(filePath, analysis) {
  if (!analysis?.graph?.edges) return [];
  return analysis.graph.edges
    .filter(e => e.type === 'dependency' && e.source === `file:${filePath}`)
    .map(e => e.target?.replace('file:', '') || '')
    .filter(Boolean);
}

function getFileDependents(filePath, analysis) {
  if (!analysis?.graph?.edges) return [];
  return analysis.graph.edges
    .filter(e => e.type === 'dependency' && e.target === `file:${filePath}`)
    .map(e => e.source?.replace('file:', '') || '')
    .filter(Boolean);
}

// ─── Shared persona ──────────────────────────────────────────────────

const EXPERT_PREAMBLE = `You are Aliya AI — a staff-level software engineer doing a focused review.
Ground every statement in the code shown below. Quote identifiers and snippets exactly; never invent symbols, files, or line numbers.
If the code does not show the answer, say what is missing instead of guessing.
Write like an engineer: concrete, active voice, no filler, no preamble.`;

// ─── Summary Prompt ──────────────────────────────────────────────────

function buildSummaryPrompt(filePath, fileName, fileContext, depContext, depByContext) {
  return `${EXPERT_PREAMBLE}

${fileContext}${depContext}${depByContext}

TASK: Summarize this file for a teammate who has never opened it.

RULES:
1. Answer about THIS file only — never other files.
2. Name the real exports and the main responsibility.
3. 2–4 sentences total.
4. No architecture overviews, no generic advice.

FORMAT:
**Purpose:** [1 sentence]
**What it does:** [2–3 sentences naming the key functions/classes]
**Key exports:** [list, or "None"]`;
}

// ─── Explain Prompt ──────────────────────────────────────────────────

function buildExplainPrompt(filePath, fileName, fileContext, depContext, depByContext) {
  return `${EXPERT_PREAMBLE}

${fileContext}${depContext}${depByContext}

TASK: Explain how this file works, the way you would walk a new teammate through it.

RULES:
1. Walk through each major function/class and what it actually does.
2. Describe the execution flow in order, naming the real symbols.
3. Call out patterns worth knowing (and the trade-off each buys).
4. Reference line numbers from the listing above.
5. Stay inside THIS file.

FORMAT:
**Overview:** [1–2 sentences]
**How it works:** [ordered steps]
**Key components:** [function/class → responsibility]
**Patterns & trade-offs:** [only what the code actually shows]`;
}

// ─── Bug Prompt ──────────────────────────────────────────────────────

function buildBugPrompt(filePath, fileName, fileContext, depContext, depByContext) {
  return `${EXPERT_PREAMBLE}

${fileContext}${depContext}${depByContext}

TASK: Review this file for real defects.

RULES:
1. Report only defects visible in the code — not style preferences.
2. No hypothetical bugs, no speculative "what if the caller...".
3. Cite the exact line for every issue and explain why it breaks.
4. If there are no real defects, say so once and stop.
5. Order findings by severity.

FORMAT (per finding):
**Severity:** [High/Medium/Low]
**Issue:** [what is wrong]
**Line:** [line number]
**Why it breaks:** [concrete failure mode]
**Fix:** [specific change, as a short code block]

If none: "No defects found in this file."`;
}

// ─── Optimize Prompt ─────────────────────────────────────────────────

function buildOptimizePrompt(filePath, fileName, fileContext, depContext, depByContext) {
  return `${EXPERT_PREAMBLE}

${fileContext}${depContext}${depByContext}

TASK: Propose performance and quality improvements for this file.

RULES:
1. Only changes with measurable or structural impact — skip micro-style nits.
2. Cite the exact line and explain the expected effect.
3. Show the concrete change as a short code block.
4. Order by impact (high → low).
5. If the file is already sound, say so once and stop.

FORMAT (per suggestion):
**Impact:** [High/Medium/Low]
**Change:** [what to do]
**Line:** [line number]
**Why:** [expected effect]
**Code:** [short before/after block]

If none: "This file is already well-optimized for its size and role."`;
}

// ─── Dependency Prompt ───────────────────────────────────────────────

function buildDependencyPrompt(filePath, fileName, fileContext, depContext, depByContext, deps, dependents) {
  // If we have pre-computed deps, use them directly without asking AI
  if (!deps.length && !dependents.length) {
    return `This file has no dependencies and nothing depends on it.`;
  }
  
  return `${EXPERT_PREAMBLE}

${fileContext}

DEPENDS ON (this file imports these): ${deps.length ? deps.join(', ') : 'Nothing'}
DEPENDENT BY (these files import this): ${dependents.length ? dependents.join(', ') : 'Nothing'}

TASK: Explain this file's dependency relationships.

RULES:
1. Use only the dependency lists above — no other files.
2. For each entry, give a one-line reason the relationship exists.
3. Flag any circular or layering-breaking edge if the lists show one.
4. Do not recommend adding or removing dependencies.

FORMAT:
**Imports:** [each with a one-line reason]
**Imported by:** [each with a one-line reason]
**Dependency count:** [X out / Y in]
**Risk:** [only if a real cycle or layering issue is visible]`;
}

module.exports = {
  buildActionPrompt,
  buildFileContext,
  getFileDependencies,
  getFileDependents,
};
