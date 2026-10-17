/**
 * Verifies the enhanced AI prompt: RAG retrieval, verbatim code evidence,
 * senior-engineer framing and per-question answer shape.
 * Run: node test-prompt-quality.js [repoId] ["question"]
 */
const { getRepo, getSearchIndex } = require('./server/store');
const { resolveSearchIndex } = require('./server/ai');
const { buildEnhancedPrompt, buildRichContext } = require('./server/ai-context');
const { detectQuestionType } = require('./server/token-manager');

const repoId = process.argv[2] || 'repo_mt1ukv1h_84yfe10z';
const question = process.argv[3] || 'How does routing work in this repo?';

(async () => {
  const repoRecord = getRepo(repoId);
  if (!repoRecord) {
    console.error(`Repo ${repoId} not found in the local store.`);
    process.exit(1);
  }

  console.log(`Repo:     ${repoRecord.analysis.repoName}`);
  console.log(`Question: ${question}`);

  const qType = detectQuestionType(question);
  console.log(`Detected: ${qType.primaryType} (complexity=${qType.complexity}, diagram=${qType.shouldIncludeDiagram})\n`);

  const searchIdx = await resolveSearchIndex(repoRecord);
  console.log(`RAG index entries: ${searchIdx?.entries?.length ?? 0}`);

  const ctx = await buildRichContext({
    repoRecord: { ...repoRecord, provider: 'openai', model: 'gpt-4.1' },
    question,
    selectedPath: null,
    focusedNodeIds: [],
    searchIdx,
    conversationMessages: [],
  });

  const prompt = await buildEnhancedPrompt({
    repoRecord: { ...repoRecord, provider: 'openai', model: 'gpt-4.1' },
    question,
    selectedPath: null,
    focusedNodeIds: [],
    searchIdx,
    conversationMessages: [],
  });

  const checks = [
    ['senior-engineer persona present', prompt.includes('staff-level software engineer')],
    ['grounding rules present', prompt.includes('GROUNDING RULES')],
    ['reasoning protocol present', prompt.includes('THINK LIKE A SENIOR ENGINEER')],
    ['answer shape present', prompt.includes('ANSWER SHAPE')],
    ['style rules present', prompt.includes('STYLE:')],
    ['no-filler instruction present', prompt.includes('No preamble')],
    ['repository context block present', prompt.includes('REPOSITORY CONTEXT')],
    ['question echoed in prompt', prompt.includes(question)],
    ['code evidence section built', ctx.codeEvidence.length > 0],
    ['code evidence has a fence', ctx.codeEvidence.includes('```')],
    ['RAG relevant files built', ctx.relevantContext.length > 0],
    ['code intelligence built', ctx.codeIntelContext.length > 0],
    ['architecture context built', ctx.architectureContext.length > 0],
    ['prompt carries code evidence', prompt.includes('CODE EVIDENCE')],
  ];

  console.log(`\nPrompt length: ${prompt.length} chars (~${Math.ceil(prompt.length / 4)} tokens)`);
  console.log(`Code evidence: ${ctx.codeEvidence.length} chars`);

  let failed = 0;
  console.log('\nASSERTIONS');
  for (const [label, ok] of checks) {
    console.log(` ${ok ? 'PASS' : 'FAIL'}  ${label}`);
    if (!ok) failed += 1;
  }

  console.log('\n─── CODE EVIDENCE PREVIEW ───');
  console.log(ctx.codeEvidence.slice(0, 900) || '(empty)');

  console.log('\n─── PROMPT HEAD ───');
  console.log(prompt.slice(0, 700));

  console.log(failed === 0 ? '\nALL CHECKS PASSED' : `\n${failed} CHECK(S) FAILED`);
  process.exit(failed === 0 ? 0 : 1);
})();
