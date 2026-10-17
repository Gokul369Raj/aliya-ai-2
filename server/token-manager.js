/**
 * token-manager.js — Token budget management and smart context compression
 *
 * Tracks token usage, compresses context intelligently, and ensures
 * the AI never runs out of tokens mid-answer.
 *
 * Key features:
 * - Adaptive context sizing based on model provider
 * - Question-type detection for targeted context assembly
 * - Smart truncation that preserves the most relevant sections
 * - Token budget allocation per context section
 */

// ─── Model token limits (input + output combined context window) ──────
const MODEL_CONTEXT_WINDOWS = {
  // OpenAI
  'gpt-4.1': 1_048_576,
  'gpt-4.1-mini': 1_048_576,
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,

  // Gemini
  'gemini-2.5-pro': 1_048_576,
  'gemini-2.5-flash': 1_048_576,
  'gemini-2.5-flash-lite': 1_048_576,
  'gemini-2.0-flash': 1_048_576,

  // Anthropic
  'claude-sonnet-4-5': 200_000,
  'claude-haiku-4-5': 200_000,
  'claude-opus-4-1': 200_000,

  // xAI
  'grok-4.3': 131_072,
  'grok-build-0.1': 131_072,

  // DeepSeek
  'deepseek-v4-flash': 131_072,
  'deepseek-chat': 131_072,
  'deepseek-reasoner': 131_072,

  // Mistral
  'mistral-medium-3.5': 128_000,
  'mistral-small-4': 128_000,
  'mistral-large-3': 128_000,
  'codestral-latest': 128_000,

  // Groq
  'llama-3.3-70b-versatile': 128_000,
  'llama-3.1-8b-instant': 128_000,
  'openai/gpt-oss-120b': 128_000,

  // Perplexity
  'sonar-pro': 200_000,
  'sonar': 200_000,
  'sonar-reasoning-pro': 200_000,
  'sonar-deep-research': 200_000,

  // OpenRouter prefixed models
  'openai/gpt-4.1': 1_048_576,
  'openai/gpt-4.1-mini': 1_048_576,
  'google/gemini-2.5-pro': 1_048_576,
  'google/gemini-2.5-flash': 1_048_576,
  'anthropic/claude-sonnet-4.5': 200_000,
  'anthropic/claude-haiku-4.5': 200_000,
  'x-ai/grok-4.3': 131_072,
  'deepseek/deepseek-v4-flash': 131_072,
  'mistralai/mistral-medium-3.5': 128_000,
  'meta-llama/llama-3.3-70b-instruct': 128_000,
};

const DEFAULT_CONTEXT_WINDOW = 128_000;

// ─── Output token budgets based on question complexity ─────────────────
// The old ceilings (450/1100/2000/3200) physically could not produce the deep,
// diagram-led walkthroughs this product promises — the model was cut off
// mid-answer. These are sized for answers that actually finish.
const OUTPUT_TOKEN_BUDGETS = {
  simple: 900,          // Quick yes/no, single fact
  moderate: 2400,       // Focused explanation with evidence
  detailed: 5000,       // Full walkthrough with examples and a diagram
  comprehensive: 9000,  // Deep dive: diagram, file-by-file, risks, next steps
};

// ─── Per-provider hard ceilings on max_tokens ──────────────────────────
// Requesting more than a provider allows is a hard API error, so budgets are
// clamped rather than trusted. These are deliberately conservative.
const PROVIDER_MAX_OUTPUT = {
  openai: 16_000,
  gemini: 8_192,
  anthropic: 8_000,
  xai: 8_192,
  deepseek: 8_192,
  mistral: 8_192,
  groq: 8_000,
  perplexity: 8_000,
  openrouter: 8_000,
};

const DEFAULT_MAX_OUTPUT = 8_000;

// ─── Question type detection ──────────────────────────────────────────

const QUESTION_PATTERNS = {
  fileSpecific: {
    patterns: [
      /(?:what does|explain|describe|analyze|tell me about|kya karta hai|kya hai|samjhao)\s+(?:this\s+)?(?:file|module|component)\b/i,
      /(?:file|module)\s+[\w/\\.-]+\.\w+/i,
      /\b(?:how does|kaise kaam karta hai)\s+[\w/\\.-]+\.\w+/i,
      /(?:what is|kya hai)\s+(?:inside|in)\s+[\w/\\.-]+/i,
      /[\w/\\.-]+\.\w+\s*(?:do|does|karta|karte|work|kaam|function|role|purpose)/i,
      /(?:what does|tell me about|explain|kya hai|samjhao)\s+[\w/\\.-]+\.\w+/i,
    ],
    weight: 10,
  },
  folderSpecific: {
    patterns: [
      /(?:what does|explain|describe)\s+(?:this\s+)?(?:folder|directory|package|module)\b/i,
      /(?:folder|directory)\s+[\w/\\.-]+/i,
      /(?:what's inside|kya hai)\s+(?:the\s+)?(?:src|lib|components?|utils?|helpers?|pages?|routes?|controllers?|services?|models?)/i,
    ],
    weight: 9,
  },
  architecture: {
    patterns: [
      /\b(?:architecture|arch|design|structure|layout|system)\b/i,
      /(?:how is|kaise hai)\s+(?:this\s+)?(?:project|codebase|repo|app)\s+(?:structured|organized|designed)/i,
      /(?:what are|kya hain)\s+(?:the\s+)?(?:layers?|modules?|components?|services?)/i,
      /(?:explain|samjhao)\s+(?:the\s+)?(?:overall|pura|poora)\s+(?:structure|architecture|design)/i,
    ],
    weight: 8,
  },
  flow: {
    patterns: [
      /\b(?:flow|workflow|pipeline|process|sequence|execution|data flow)\b/i,
      /(?:how does|kaise)\s+(?:this\s+)?(?:work|kaam karta hai|run|chalta hai)/i,
      // "how does <subject> work" — a walkthrough question, e.g.
      // "how does routing work" or "how does getUserData work".
      /(?:how|kaise)\s+(?:does|do|is)\s+(?:the\s+|this\s+|a\s+|an\s+)?[\w$.-]+\s+(?:work|works|function|functions|behave|run|flow|operate)/i,
      /(?:what happens|kya hota hai)\s+(?:when|jab)\b/i,
      /(?:request|data)\s+(?:lifecycle|journey|path|cycle)/i,
    ],
    weight: 8,
  },
  dependency: {
    patterns: [
      /\b(?:depend|import|require|use)\b.*\b(?:what|which|kya|kaun)/i,
      /(?:what does|kya)\s+[\w./-]+\s+(?:depend on|use|import)/i,
      /(?:depend|import|require)\s*(?:ency|encies|graph|tree)/i,
      /(?:circular|cycle)\s*(?:dependency|depend)/i,
    ],
    weight: 6,
  },
  specific: {
    patterns: [
      /\b(?:function|class|method|variable|constant|type|interface)\s+[\w$_]+/i,
      /\b(?:route|endpoint|api|url|path)\s+[\w/{}$:-]+/i,
      /(?:tell me about|explain|describe|samjhao)\s+(?:the\s+)?(?:function|class|method|component)\s+[\w$_]+/i,
      /(?:tell me about|explain|describe)\s+[\w$_]+\s+(?:function|class|method)/i,
      // Require a code-like symbol (camelCase, PascalCase, snake_case) so plain
      // prose questions like "what is the core flow" are not misclassified.
      /(?:what is|what does|tell me about|where is)\s+[`"']?[a-zA-Z_$][\w$]*[A-Z_][\w$]*\b/,
      /(?:what is|what does|tell me about|where is)\s+[`"']?[a-zA-Z_$][\w$]*_[a-zA-Z0-9_$]+\b/,
      /(?:what is|what does|tell me about|where is)\s+[`"']?[\w$]+\.[\w$]+/i,
      /(?:what is|what does|tell me about|where is)\s+`[^`]+`/i,
    ],
    weight: 8,
  },
  debug: {
    patterns: [
      /\b(?:error|bug|issue|problem|fix|broken|crash|fail)\b/i,
      /(?:kyu|kyun|kyon)\s+(?:nahi|nhi)\s+(?:kaam|chal|run)/i,
      /(?:why is|kyu hai)\s+(?:this\s+)?(?:broken|failing|erroring)/i,
    ],
    weight: 5,
  },
};

/**
 * Detect the primary question type and complexity.
 */
function detectQuestionType(question) {
  const q = (question || '').toLowerCase();
  const types = [];

  for (const [type, config] of Object.entries(QUESTION_PATTERNS)) {
    let maxWeight = 0;
    for (const pattern of config.patterns) {
      if (pattern.test(question)) {
        maxWeight = config.weight;
        break;
      }
    }
    if (maxWeight > 0) {
      types.push({ type, weight: maxWeight });
    }
  }

  // Sort by weight
  types.sort((a, b) => b.weight - a.weight);

  // Detect complexity
  const wantsDetail = /\b(explain more|deep dive|detail|detailed|expand|full explanation|poora|vistar|comprehensive|in depth)\b/i.test(question);
  const wantsBrief = /\b(short|brief|quick|jaldi|sirf|bas)\b/i.test(question);

  // Detect if question is in Hindi/Hinglish
  const isHindi = /[अ-ह]/.test(question) || /\b(kya|hai|kaun|kaise|kyu|nahi|mein|pe|ka|ki|ko|se|aur|ye|wo|jo|jisme)\b/i.test(q);

  let complexity;
  if (wantsDetail) complexity = 'detailed';
  else if (wantsBrief) complexity = 'simple';
  else if (types.length > 0 && types[0].weight >= 8) complexity = 'detailed';
  else if (types.length > 0 && types[0].weight >= 5) complexity = 'moderate';
  else complexity = 'moderate';

  return {
    primaryType: types[0]?.type || 'general',
    allTypes: types.map(t => t.type),
    complexity,
    wantsDetail,
    wantsBrief,
    isHindi,
    shouldIncludeDiagram: ['architecture', 'flow', 'dependency'].includes(types[0]?.type) || wantsDetail,
    shouldIncludeCode: ['fileSpecific', 'specific', 'debug'].includes(types[0]?.type),
    shouldIncludeFullTree: types[0]?.type === 'folderSpecific',
  };
}

// ─── Adaptive output token budget ─────────────────────────────────────

/**
 * Calculate optimal output tokens based on question type and model.
 */
function calculateOutputTokens(questionType, provider, model) {
  const budget = OUTPUT_TOKEN_BUDGETS[questionType.complexity] || OUTPUT_TOKEN_BUDGETS.moderate;

  // Some providers/models handle longer outputs better
  const modelStr = `${model || ''}`.toLowerCase();
  const isLargeModel = modelStr.includes('gpt-4.1') ||
    modelStr.includes('gemini-2.5-pro') ||
    modelStr.includes('claude-sonnet') ||
    modelStr.includes('claude-opus') ||
    modelStr.includes('grok-4');

  if (isLargeModel && questionType.wantsDetail) {
    return Math.min(budget * 1.5, OUTPUT_TOKEN_BUDGETS.comprehensive);
  }

  return budget;
}

// ─── Context compression ──────────────────────────────────────────────

/**
 * Compress a text section to fit within token budget.
 * Uses heuristic ~4 chars per token for English, ~2 chars for code.
 */
function compressToTokenBudget(text, maxTokens, options = {}) {
  if (!text) return '';
  const estimatedTokens = Math.ceil(text.length / (options.isCode ? 2.5 : 4));
  if (estimatedTokens <= maxTokens) return text;

  const maxChars = maxTokens * (options.isCode ? 2.5 : 4);
  const truncated = text.slice(0, maxChars);
  // Try to cut at a line boundary
  const lastNewline = truncated.lastIndexOf('\n');
  const cutPoint = lastNewline > maxChars * 0.8 ? lastNewline : maxChars;
  return truncated.slice(0, cutPoint).trimEnd() + '\n... [compressed to fit token budget]';
}

/**
 * Build a context budget allocation for each section.
 * Total budget = context window - output tokens - system prompt overhead.
 */
function buildContextBudget(provider, model, questionType) {
  const modelStr = model || '';
  const contextWindow = MODEL_CONTEXT_WINDOWS[modelStr] || DEFAULT_CONTEXT_WINDOW;
  const outputTokens = calculateOutputTokens(questionType, provider, modelStr);
  const systemOverhead = 800; // System prompt + formatting
  const totalInputBudget = contextWindow - outputTokens - systemOverhead;

  // Allocate percentages based on question type
  const allocations = {
    metadata: 0.03,          // Repo name, branch, stats
    languages: 0.03,         // Language breakdown
    dependencies: 0.05,      // External deps
    importantFiles: 0.05,    // Important files
    fileTree: 0.04,          // Folder structure
    architecture: 0.08,      // Architecture summary
    dependencyMap: 0.06,     // Dependency relationships
    ragResults: 0.15,        // RAG retrieved files
    selectedFile: 0.12,      // Selected file content
    focusedNodes: 0.08,      // Focused node context
    relevantSnippets: 0.10,  // Code snippets for the answer
    diagramContext: 0.06,    // Mermaid diagram data
    conversationHistory: 0.05, // Previous Q&A context
    freeSpace: 0.10,         // Buffer for unexpected content
  };

  // Adjust allocations based on question type
  if (questionType.primaryType === 'fileSpecific') {
    allocations.selectedFile = 0.20;
    allocations.ragResults = 0.10;
    allocations.architecture = 0.04;
    allocations.relevantSnippets = 0.15;
  } else if (questionType.primaryType === 'folderSpecific') {
    allocations.fileTree = 0.12;
    allocations.ragResults = 0.18;
    allocations.architecture = 0.06;
  } else if (questionType.primaryType === 'architecture') {
    allocations.architecture = 0.15;
    allocations.diagramContext = 0.12;
    allocations.dependencyMap = 0.10;
  } else if (questionType.primaryType === 'flow') {
    allocations.architecture = 0.12;
    allocations.diagramContext = 0.14;
    allocations.ragResults = 0.12;
  } else if (questionType.primaryType === 'dependency') {
    allocations.dependencyMap = 0.15;
    allocations.ragResults = 0.12;
    allocations.diagramContext = 0.10;
  } else if (questionType.primaryType === 'debug') {
    allocations.ragResults = 0.20;
    allocations.selectedFile = 0.15;
    allocations.relevantSnippets = 0.15;
  }

  // Convert percentages to token counts
  const budget = {};
  for (const [section, pct] of Object.entries(allocations)) {
    budget[section] = Math.floor(totalInputBudget * pct);
  }

  return {
    contextWindow,
    outputTokens,
    systemOverhead,
    totalInputBudget,
    budget,
  };
}

// ─── Conversation memory ──────────────────────────────────────────────

/**
 * Build conversation context from recent messages (last N exchanges).
 * Compresses older messages more aggressively.
 */
function buildConversationContext(messages, maxTokens = 1200) {
  if (!messages?.length) return '';

  const recentMessages = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .slice(-6); // Last 6 messages (3 exchanges)

  if (!recentMessages.length) return '';

  let totalChars = 0;
  const maxChars = maxTokens * 4;
  const parts = [];

  // Process in reverse (most recent first)
  for (let i = recentMessages.length - 1; i >= 0; i--) {
    const msg = recentMessages[i];
    const role = msg.role === 'user' ? 'Q' : 'A';

    // Compress older messages more
    const age = recentMessages.length - 1 - i;
    let content = msg.content || '';
    if (age > 2) {
      // Very old: just first sentence
      content = content.split(/[.!?\n]/)[0] || content.slice(0, 100);
    } else if (age > 0) {
      // Somewhat old: truncate
      content = content.slice(0, 300);
    } else {
      // Most recent: keep more
      content = content.slice(0, 500);
    }

    const part = `${role}: ${content}`;
    totalChars += part.length;

    if (totalChars > maxChars) break;
    parts.unshift(part);
  }

  return parts.length
    ? `CONVERSATION CONTEXT (recent Q&A for continuity):\n${parts.join('\n')}`
    : '';
}

// ─── Exports ──────────────────────────────────────────────────────────

module.exports = {
  MODEL_CONTEXT_WINDOWS,
  OUTPUT_TOKEN_BUDGETS,
  DEFAULT_CONTEXT_WINDOW,
  detectQuestionType,
  calculateOutputTokens,
  compressToTokenBudget,
  buildContextBudget,
  buildConversationContext,
};
