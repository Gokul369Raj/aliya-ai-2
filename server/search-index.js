/**
 * search-index.js — Code-aware RAG search index for Aliya AI
 *
 * Builds an in-memory search index from scanned repository files.
 * Uses code-aware tokenization that understands:
 * - camelCase / PascalCase splitting (getUserData → get, User, Data)
 * - snake_case splitting (get_user_data → get, user, data)
 * - kebab-case splitting (my-component → my, component)
 * - Import path analysis (./utils/helpers → utils, helpers)
 * - Route pattern matching (/api/users/:id → api, users, :id)
 *
 * Inspired by GitNexus's hybrid search approach, adapted for Node.js.
 */

const path = require('path');

// ─── Stop words ───────────────────────────────────────────────────────
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'it', 'as', 'be', 'was', 'were',
  'been', 'are', 'am', 'do', 'did', 'does', 'has', 'have', 'had', 'not',
  'no', 'if', 'then', 'else', 'when', 'up', 'out', 'this', 'that',
  'these', 'those', 'can', 'will', 'just', 'so', 'than', 'too', 'very',
  'also', 'how', 'what', 'which', 'who', 'whom', 'where', 'why', 'all',
  'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'any',
  'only', 'own', 'same', 'such', 'here', 'there', 'now', 'get', 'got',
  'let', 'set', 'use', 'used', 'make', 'made', 'like', 'into', 'over',
]);

// ─── Code-aware tokenizer ─────────────────────────────────────────────

/**
 * Split camelCase and PascalCase identifiers into individual words.
 * Example: getUserData → ['get', 'user', 'data']
 */
function splitCamelCase(str) {
  return str
    .replace(/([a-z])([A-Z])/g, '$1 $2')    // get User → get User
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2') // HTMLParser → HTML Parser
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length >= 2);
}

/**
 * Split snake_case identifiers.
 * Example: get_user_data → ['get', 'user', 'data']
 */
function splitSnakeCase(str) {
  return str
    .split(/[_]+/)
    .map(w => w.toLowerCase())
    .filter(w => w.length >= 2 && !STOP_WORDS.has(w));
}

/**
 * Split kebab-case identifiers.
 * Example: my-component → ['my', 'component']
 */
function splitKebabCase(str) {
  return str
    .split(/[-]+/)
    .map(w => w.toLowerCase())
    .filter(w => w.length >= 2 && !STOP_WORDS.has(w));
}

/**
 * Split an import path into searchable tokens.
 * Example: ./utils/helpers → ['utils', 'helpers']
 * Example: @company/shared-lib → ['company', 'shared', 'lib']
 */
function tokenizeImportPath(importPath) {
  const tokens = [];
  // Remove leading ./ or ../
  const cleaned = importPath.replace(/^\.{1,2}\//, '');
  // Split by / and extract meaningful parts
  const parts = cleaned.split('/').filter(Boolean);
  for (const part of parts) {
    // Handle @scope/package
    if (part.startsWith('@')) {
      tokens.push(...splitKebabCase(part.slice(1)));
    } else {
      // Remove file extension
      const withoutExt = part.replace(/\.[^.]+$/, '');
      tokens.push(...splitCamelCase(withoutExt));
      tokens.push(...splitSnakeCase(withoutExt));
      tokens.push(...splitKebabCase(withoutExt));
    }
  }
  return [...new Set(tokens)];
}

/**
 * General tokenizer: handles all formats.
 */
function tokenize(text) {
  if (!text) return [];
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9_\\-\\s]/g, ' ')
    .split(/[\\s_\\-]+/)
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
}

function extractCodeTokens(content) {
  if (!content) return { tokens: [], identifiers: [] };
  const tokens = tokenize(content);

  const identifiers = [];
  const idPattern = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g;
  let match;
  while ((match = idPattern.exec(content)) !== null) {
    const id = match[1];
    if (id.length >= 3 && !STOP_WORDS.has(id.toLowerCase())) {
      identifiers.push(id.toLowerCase());
      // Also add camelCase splits for identifiers
      const splits = splitCamelCase(id);
      identifiers.push(...splits.filter(s => s.length >= 2 && !STOP_WORDS.has(s)));
    }
  }

  return { tokens, identifiers: [...new Set(identifiers)] };
}

// ─── File signature extraction ────────────────────────────────────────

function extractFileSignatures(content, filePath) {
  if (!content) return { functions: [], classes: [], exports: [], imports: [], routes: [], comments: [], constants: [], types: [] };

  const functions = [];
  const classes = [];
  const exports = [];
  const imports = [];
  const routes = [];
  const comments = [];
  const constants = [];
  const types = [];

  const lines = content.split('\n');

  // Extract function definitions
  const fnPatterns = [
    /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/g,
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>/g,
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?function\s*\(([^)]*)\)/g,
    /([A-Za-z_$][\w$]*)\s*:\s*(?:async\s+)?function\s*\(([^)]*)\)/g,
    /([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{/g,
  ];

  for (const pattern of fnPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const name = match[1];
      const params = match[2] || '';
      const paramList = params.split(',').map(p => p.trim().split(/[:\s=]/)[0]).filter(Boolean);
      if (name && !['if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'new', 'delete'].includes(name)) {
        const lineNum = content.slice(0, match.index).split('\n').length;
        functions.push({
          name,
          params: paramList.slice(0, 8),
          line: lineNum,
          signature: `${name}(${paramList.slice(0, 5).join(', ')})`,
        });
      }
    }
  }

  // Extract class definitions
  const classPattern = /(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)(?:\s+extends\s+([A-Za-z_$][\w$]*))?(?:\s+implements\s+([^{]+))?\s*\{/g;
  let classMatch;
  while ((classMatch = classPattern.exec(content)) !== null) {
    const name = classMatch[1];
    const parent = classMatch[2] || '';
    const interfaces = classMatch[3] ? classMatch[3].split(',').map(s => s.trim()) : [];
    const lineNum = content.slice(0, classMatch.index).split('\n').length;
    classes.push({ name, extends: parent, implements: interfaces, line: lineNum });
  }

  // Extract exports
  const exportPatterns = [
    /export\s+(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
    /export\s+(?:default\s+)?(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)/g,
    /export\s*\{([^}]+)\}/g,
    /module\.exports\s*=\s*(?:\{([^}]+)\}|([A-Za-z_$][\w$]*))/g,
  ];

  for (const pattern of exportPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      if (match[1] && match[1].includes(',')) {
        match[1].split(',').map(n => n.trim().split(/\s+as\s+/)[0]).filter(Boolean).forEach(n => {
          exports.push(n);
        });
      } else {
        exports.push(match[1] || match[2]);
      }
    }
  }

  // Extract imports with full details
  const importPatterns = [
    { regex: /import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g, type: 'named' },
    { regex: /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g, type: 'default' },
    { regex: /import\s+(\*\s+as\s+\w+)\s+from\s+['"]([^'"]+)['"]/g, type: 'namespace' },
    { regex: /import\s+['"]([^'"]+)['"]/g, type: 'side-effect' },
    { regex: /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g, type: 'require' },
  ];

  for (const { regex, type } of importPatterns) {
    let match;
    while ((match = regex.exec(content)) !== null) {
      const modulePath = type === 'named' || type === 'default' || type === 'namespace'
        ? match[2] : match[1];
      const bindings = type === 'named'
        ? match[1].split(',').map(b => b.trim().split(/\s+as\s+/)[0]).filter(Boolean)
        : [];
      imports.push({
        path: modulePath,
        type,
        bindings,
        tokens: tokenizeImportPath(modulePath),
      });
    }
  }

  // Extract route definitions
  const routePattern = /(?:app|router)\.(get|post|put|patch|delete|options|head|use)\s*\((['"`])([^'"`]+)\2/g;
  let routeMatch;
  while ((routeMatch = routePattern.exec(content)) !== null) {
    routes.push({
      method: routeMatch[1].toUpperCase(),
      path: routeMatch[3],
    });
  }

  // Extract meaningful comments
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^\/\/\s*[A-Z]/.test(line) || /^\/\*\*?\s*[A-Z]/.test(line) || /^#\s*[A-Z]/.test(line)) {
      const commentText = line.replace(/^\/\/\s*|\/\*\*?\s*|#\s*/, '').replace(/\*\/$/, '').trim();
      if (commentText.length > 5 && commentText.length < 200) {
        comments.push({ text: commentText, line: i + 1 });
      }
    }
  }

  // Extract constants (const ALL_CAPS = ...)
  const constPattern = /(?:export\s+)?const\s+([A-Z][A-Z0-9_]+)\s*=/g;
  let constMatch;
  while ((constMatch = constPattern.exec(content)) !== null) {
    constants.push(constMatch[1]);
  }

  // Extract type/interface definitions (TypeScript)
  const typePattern = /(?:export\s+)?(?:type|interface)\s+([A-Za-z_$][\w$]*)/g;
  let typeMatch;
  while ((typeMatch = typePattern.exec(content)) !== null) {
    types.push(typeMatch[1]);
  }

  // Deduplicate
  const seenFunctions = new Set();
  const uniqueFunctions = functions.filter(fn => {
    if (seenFunctions.has(fn.name)) return false;
    seenFunctions.add(fn.name);
    return true;
  });

  return {
    functions: uniqueFunctions.slice(0, 50),
    classes: classes.slice(0, 20),
    exports: [...new Set(exports)].slice(0, 30),
    imports: imports.slice(0, 40),
    routes: routes.slice(0, 20),
    comments: comments.slice(0, 15),
    constants: [...new Set(constants)].slice(0, 20),
    types: [...new Set(types)].slice(0, 20),
  };
}

// ─── BM25 scoring ────────────────────────────────────────────────────
//
// The previous `computeTfIdf` never used the global document frequency it
// built (`termDocCount`), so a term appearing in one file scored the same as a
// term appearing in every file. BM25 uses the real IDF.

const BM25_K1 = 1.5;
const BM25_B = 0.75;

function bm25Score(queryTerms, entry, stats) {
  let score = 0;
  for (const term of queryTerms) {
    const tf = entry.termFreq.get(term);
    if (!tf) continue;
    const df = stats.termDocCount.get(term) || 1;
    const idf = Math.log(1 + (stats.documentCount - df + 0.5) / (df + 0.5));
    const denom = tf + BM25_K1 * (1 - BM25_B + BM25_B * (entry.length / stats.avgLength));
    score += idf * ((tf * (BM25_K1 + 1)) / denom);
  }
  return score;
}

// ─── Vector embeddings ───────────────────────────────────────────────
//
// Neural embeddings would need a model call per repository. This is a local,
// deterministic vector space that captures most of the retrieval benefit:
// hashed TF-IDF vectors with sub-word character n-grams, so `auth` lands near
// `authentication` and `userReducer` near `reducer`. Retrieval is then a
// cosine search over real vectors, fused with BM25 and graph signals.

const EMBEDDING_DIM = 256;

function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function subwordGrams(token, size = 4) {
  const padded = `#${token}#`;
  const grams = [];
  for (let i = 0; i + size <= padded.length; i += 1) {
    grams.push(padded.slice(i, i + size));
  }
  return grams;
}

function buildEmbedding(termFreq, idf) {
  const vector = new Float64Array(EMBEDDING_DIM);
  for (const [term, tf] of termFreq) {
    const weight = (1 + Math.log(tf)) * (idf.get(term) || 1);
    vector[fnv1a(term) % EMBEDDING_DIM] += weight;
    // n-grams give partial matching so morphological variants still collide.
    if (term.length > 4) {
      for (const gram of subwordGrams(term)) {
        vector[fnv1a(gram) % EMBEDDING_DIM] += weight * 0.35;
      }
    }
  }
  let norm = 0;
  for (const value of vector) norm += value * value;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < vector.length; i += 1) vector[i] /= norm;
  return vector;
}

function cosineSimilarity(left, right) {
  let dot = 0;
  for (let i = 0; i < left.length; i += 1) dot += left[i] * right[i];
  return dot;
}

/** Scale an array of raw scores to 0..1 so signals can be fused. */
function normalize(values) {
  const max = Math.max(...values, 0);
  if (!max) return values.map(() => 0);
  return values.map((value) => value / max);
}

/**
 * Do two terms refer to the same thing?
 *
 * Substring matching alone is asymmetric: "auth" is a substring of the query
 * "authentication", so a file that merely *imports* auth scored while the file
 * that *implements* it did not. Shared-prefix matching is symmetric, so
 * authentication / authenticated / auth all meet in the middle.
 */
function termsMatch(left, right) {
  if (!left || !right) return false;
  if (left === right) return true;
  let shared = 0;
  while (shared < left.length && shared < right.length && left[shared] === right[shared]) {
    shared += 1;
  }
  const shortest = Math.min(left.length, right.length);
  return shared >= 4 && shared >= shortest * 0.7;
}

/** How many distinct query terms match at least one term in `candidates`. */
function countTermMatches(queryTerms, candidates) {
  let matches = 0;
  for (const queryTerm of queryTerms) {
    for (const candidate of candidates) {
      if (termsMatch(queryTerm, candidate)) {
        matches += 1;
        break;
      }
    }
  }
  return matches;
}

// ─── Search index builder ─────────────────────────────────────────────

/**
 * Bundled / generated artifacts must never enter the retrieval corpus. A
 * minified bundle mentions every identifier in the project, so it outranks the
 * real source for almost any query.
 */
const GENERATED_PATH_PATTERNS = [
  /(^|\/)(dist|build|out|coverage|\.next|\.nuxt|\.svelte-kit|\.cache|\.parcel-cache)(\/|$)/,
  /\/(vendor|node_modules|bower_components)\//,
];
const GENERATED_FILE_PATTERNS = [
  /\.min\.(js|mjs|cjs|css)$/i,
  /[.-][0-9a-f]{8,}\.(js|mjs|cjs|css)$/i, // content-hashed bundles
  /\.map$/i,
  /\.(lock|snap)$/i,
  /^(package-lock|yarn\.lock|pnpm-lock)\.json$/i,
];

function isGeneratedArtifact(filePath = '') {
  const normalized = String(filePath).toLowerCase();
  if (GENERATED_FILE_PATTERNS.some((pattern) => pattern.test(normalized))) return true;
  // A directory like `build/` is only treated as generated when it holds
  // compiled web assets, so Go/Rust `build/` source is still indexed.
  if (/\.(js|mjs|cjs|css)$/i.test(normalized)
    && GENERATED_PATH_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return true;
  }
  return false;
}

function buildSearchIndex(files, analysis) {
  const entries = [];

  for (const file of files) {
    if (!file.content || file.content.length < 10) continue;
    if (isGeneratedArtifact(file.path)) continue;

    const filePath = file.path;
    const language = file.language || 'unknown';
    const signatures = extractFileSignatures(file.content, filePath);
    const { tokens, identifiers } = extractCodeTokens(file.content);

    // Build enriched corpus with all extracted signals
    const corpus = [
      ...tokens,
      ...identifiers,
      ...signatures.functions.map(f => f.name.toLowerCase()),
      ...signatures.functions.flatMap(f => splitCamelCase(f.name)),
      ...signatures.classes.map(c => c.name.toLowerCase()),
      ...signatures.classes.flatMap(c => splitCamelCase(c.name)),
      ...signatures.exports.map(e => e.toLowerCase()),
      ...signatures.exports.flatMap(e => splitCamelCase(e)),
      ...signatures.constants.map(c => c.toLowerCase()),
      ...signatures.types.map(t => t.toLowerCase()),
      ...signatures.imports.flatMap(imp => imp.tokens),
      ...signatures.routes.flatMap(r => {
        // Split route paths into tokens
        return r.path.split(/[/:]/).filter(Boolean).map(s => s.toLowerCase());
      }),
      // File path tokens
      ...path.basename(filePath).replace(/\.[^.]+$/, '').split(/[\s_\-./]+/).map(s => s.toLowerCase()),
      // Directory tokens
      ...path.dirname(filePath).split('/').filter(Boolean).map(s => s.toLowerCase()),
    ].filter(t => t && t.length >= 2 && !STOP_WORDS.has(t));

    const contentSummary = buildFileSummary(file, signatures);

    const termFreq = new Map();
    for (const term of corpus) {
      termFreq.set(term, (termFreq.get(term) || 0) + 1);
    }

    // Separate term sets so symbol matching can be weighted by signal type
    // instead of matching everything against one big blob of text.
    const pathTerms = [...new Set([
      ...path.basename(filePath).replace(/\.[^.]+$/, '').split(/[\s_\-./]+/),
      ...path.dirname(filePath).split('/'),
    ])].map((term) => term.toLowerCase()).filter((term) => term.length >= 2 && !STOP_WORDS.has(term));

    const symbolTerms = [...new Set([
      ...signatures.functions.map(f => f.name.toLowerCase()),
      ...signatures.classes.map(c => c.name.toLowerCase()),
      ...signatures.exports.map(e => String(e).toLowerCase()),
      ...signatures.types.map(t => t.toLowerCase()),
      ...signatures.constants.map(c => c.toLowerCase()),
    ])].filter((term) => term.length >= 2);

    const importTerms = [...new Set(signatures.imports.flatMap(imp => imp.tokens))];
    const routeTerms = [...new Set(
      signatures.routes.flatMap(r => r.path.split(/[/:]/).filter(Boolean).map(s => s.toLowerCase())),
    )];

    entries.push({
      filePath,
      language,
      size: file.size || 0,
      corpus,
      tokens,
      identifiers,
      signatures,
      contentSummary,
      allText: corpus.join(' '),
      termFreq,
      pathTerms,
      symbolTerms,
      importTerms,
      routeTerms,
      length: corpus.length || 1,
      embedding: null, // filled in once the corpus-wide IDF is known
    });
  }

  // Build global IDF statistics
  const documentCount = entries.length || 1;
  const termDocCount = new Map();
  for (const entry of entries) {
    const uniqueTerms = new Set(entry.corpus);
    for (const term of uniqueTerms) {
      termDocCount.set(term, (termDocCount.get(term) || 0) + 1);
    }
  }

  // Real IDF: rare terms carry more signal than terms in every file.
  const idf = new Map();
  for (const [term, df] of termDocCount) {
    idf.set(term, Math.log(1 + (documentCount - df + 0.5) / (df + 0.5)));
  }

  // Embed every file once, up front, so a query only costs one vector.
  const avgLength = entries.reduce((sum, entry) => sum + entry.length, 0) / documentCount || 1;
  for (const entry of entries) {
    entry.embedding = buildEmbedding(entry.termFreq, idf);
  }

  return {
    entries,
    documentCount,
    termDocCount,
    idf,
    avgLength,
    totalEntries: entries.length,
  };
}

function buildFileSummary(file, signatures) {
  const parts = [];
  if (signatures.functions.length) {
    parts.push(`Functions: ${signatures.functions.map(f => f.signature).join(', ')}`);
  }
  if (signatures.classes.length) {
    parts.push(`Classes: ${signatures.classes.map(c => {
      let s = c.name;
      if (c.extends) s += ` extends ${c.extends}`;
      return s;
    }).join(', ')}`);
  }
  if (signatures.exports.length) {
    parts.push(`Exports: ${signatures.exports.join(', ')}`);
  }
  if (signatures.routes.length) {
    parts.push(`Routes: ${signatures.routes.map(r => `${r.method} ${r.path}`).join(', ')}`);
  }
  if (signatures.types.length) {
    parts.push(`Types: ${signatures.types.join(', ')}`);
  }
  if (signatures.constants.length) {
    parts.push(`Constants: ${signatures.constants.join(', ')}`);
  }
  if (signatures.comments.length) {
    const topComments = signatures.comments.slice(0, 3).map(c => c.text);
    parts.push(`Notes: ${topComments.join('; ')}`);
  }

  return parts.join('\n') || `File: ${file.path} (${file.language || 'unknown'}, ${file.size || 0} bytes)`;
}

// ─── Search function ──────────────────────────────────────────────────

function buildImportanceIndex(analysis) {
  const index = new Map();
  for (const node of analysis?.graph?.nodes || []) {
    const filePath = String(node.id || '').replace(/^file:/, '');
    if (filePath && node.importance) index.set(filePath, node.importance);
  }
  return index;
}

/**
 * Undirected adjacency from the real graph, used to pull collaborators of a
 * strong hit into context. A question about `orderController` is usually
 * answered by `orderController` *plus* the model and route it talks to, even
 * when those files never mention the question's words.
 */
function buildAdjacency(analysis) {
  const adjacency = new Map();
  for (const edge of analysis?.graph?.edges || []) {
    const source = String(edge.source || '').replace(/^file:/, '');
    const target = String(edge.target || '').replace(/^file:/, '');
    if (!source || !target) continue;
    if (!adjacency.has(source)) adjacency.set(source, new Set());
    if (!adjacency.has(target)) adjacency.set(target, new Set());
    adjacency.get(source).add(target);
    adjacency.get(target).add(source);
  }
  return adjacency;
}

// How much each signal contributes once all three are normalised to 0..1.
const FUSION_WEIGHTS = { bm25: 0.42, vector: 0.33, symbol: 0.25 };

function searchIndex(searchIndex, query, options = {}) {
  const { maxResults = 15, includeContent = false, maxContentChars = 3000, analysis = null } = options;
  const queryLower = query.toLowerCase();
  const queryTokens = tokenize(query);

  // Also extract code-aware tokens from query
  const queryIdentifiers = queryLower.split(/[\s,;.!?]+/).filter(w => w.length >= 2);
  const queryCamelTokens = queryIdentifiers.flatMap(splitCamelCase);

  // Embed the query into the same vector space as the indexed files.
  const queryTermFreq = new Map();
  for (const token of [...queryTokens, ...queryIdentifiers, ...queryCamelTokens]) {
    const term = token.toLowerCase();
    if (term.length >= 2 && !STOP_WORDS.has(term)) {
      queryTermFreq.set(term, (queryTermFreq.get(term) || 0) + 1);
    }
  }
  const queryTerms = [...queryTermFreq.keys()];
  const queryEmbedding = searchIndex?.idf ? buildEmbedding(queryTermFreq, searchIndex.idf) : null;

  const stats = {
    documentCount: searchIndex?.documentCount || 1,
    termDocCount: searchIndex?.termDocCount || new Map(),
    avgLength: searchIndex?.avgLength || 1,
  };
  const importanceIndex = buildImportanceIndex(analysis);

  const scored = searchIndex.entries.map((entry) => {
    // 1. BM25 over the enriched corpus (real IDF — rare terms matter).
    const bm25 = bm25Score(queryTerms, entry, stats);

    // 2. Cosine similarity in the hashed embedding space.
    const vector = queryEmbedding && entry.embedding
      ? cosineSimilarity(queryEmbedding, entry.embedding)
      : 0;

    // 3. Code-aware symbol signals, matched term-to-term rather than by raw
    //    substring. This is what makes "authentication" credit the file that
    //    implements auth as strongly as the file that merely imports it.
    let symbol = 0;
    symbol += countTermMatches(queryTerms, entry.pathTerms) * 6;
    symbol += countTermMatches(queryTerms, entry.symbolTerms) * 9;
    symbol += countTermMatches(queryTerms, entry.importTerms) * 4;
    symbol += countTermMatches(queryTerms, entry.routeTerms) * 5;

    // The query names a symbol or phrase verbatim.
    for (const qi of queryIdentifiers) {
      if (qi.length >= 5 && entry.allText.includes(qi)) symbol += 6;
    }

    if (queryLower.includes(entry.language)) symbol += 2;

    const importance = importanceIndex.get(entry.filePath);
    if (importance) symbol += Math.min(3, importance / 20);

    return { entry, bm25, vector, symbol, score: 0 };
  });

  // Normalise each signal before fusing — BM25, cosine and the symbol
  // heuristics live on completely different scales.
  const bm25Values = normalize(scored.map((item) => item.bm25));
  const vectorValues = normalize(scored.map((item) => item.vector));
  const symbolValues = normalize(scored.map((item) => item.symbol));

  scored.forEach((item, index) => {
    item.score = FUSION_WEIGHTS.bm25 * bm25Values[index]
      + FUSION_WEIGHTS.vector * vectorValues[index]
      + FUSION_WEIGHTS.symbol * symbolValues[index];
  });

  // Graph expansion: boost the collaborators of the strongest hits.
  const adjacency = buildAdjacency(analysis);
  const seeds = [...scored].sort((a, b) => b.score - a.score).slice(0, 5);
  const bonusByPath = new Map();
  for (const seed of seeds) {
    const neighbours = adjacency.get(seed.entry.filePath);
    if (!neighbours) continue;
    for (const neighbour of neighbours) {
      bonusByPath.set(neighbour, Math.max(bonusByPath.get(neighbour) || 0, seed.score * 0.35));
    }
  }
  for (const item of scored) {
    const bonus = bonusByPath.get(item.entry.filePath);
    if (bonus) item.score += bonus;
  }

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, maxResults).map(({ entry, score }) => {
    const result = {
      path: entry.filePath,
      language: entry.language,
      score: Math.round(score * 100),
      functions: entry.signatures.functions.slice(0, 10).map(f => f.signature),
      classes: entry.signatures.classes.map(c => c.name),
      exports: entry.signatures.exports.slice(0, 10),
      types: entry.signatures.types.slice(0, 10),
      constants: entry.signatures.constants.slice(0, 5),
      routes: entry.signatures.routes.map(r => `${r.method} ${r.path}`),
      imports: entry.signatures.imports.slice(0, 8).map(i => i.path),
      summary: entry.contentSummary,
    };

    if (includeContent) {
      const analysisNode = analysis?.graph?.nodes?.find(n => n.id === `file:${entry.filePath}`);
      if (analysisNode?.content) {
        result.content = analysisNode.content.slice(0, maxContentChars);
      }
    }

    return result;
  });
}

// ─── Utility functions ────────────────────────────────────────────────

function buildFileTree(files) {
  const tree = {};
  for (const file of files) {
    const parts = file.path.split('/').filter(Boolean);
    let current = tree;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) current[parts[i]] = { _children: {}, _files: [] };
      current = current[parts[i]]._children;
    }
    const fileName = parts[parts.length - 1];
    if (!current._files) current._files = [];
    current._files.push({
      name: fileName,
      path: file.path,
      language: file.language || 'unknown',
      size: file.size || 0,
    });
  }
  return tree;
}

function buildDependencyMap(files, analysis) {
  const map = new Map();
  const reverseMap = new Map();

  for (const edge of (analysis?.graph?.edges || [])) {
    if (edge.type === 'dependency') {
      const source = typeof edge.source === 'string' ? edge.source.replace('file:', '') : '';
      const target = typeof edge.target === 'string' ? edge.target.replace('file:', '') : '';
      if (!source || !target) continue;

      if (!map.has(source)) map.set(source, []);
      map.get(source).push(target);

      if (!reverseMap.has(target)) reverseMap.set(target, []);
      reverseMap.get(target).push(source);
    }
  }

  return { dependsOn: map, dependedBy: reverseMap };
}

function buildArchitectureSummary(analysis) {
  if (!analysis) return null;

  const arch = analysis.architecture?.summary || {};
  const layers = Object.entries(arch.layerSummary || {}).sort((a, b) => b[1] - a[1]);
  // Only real, evidence-backed flows reach this point, so pass them all through
  // rather than truncating to a slice the model cannot reason about.
  const flows = (analysis.flows?.available || []).slice(0, 10);
  const risks = (analysis.architecture?.risks || []);
  const risksByKind = {};
  for (const risk of risks) {
    risksByKind[risk.kind] = (risksByKind[risk.kind] || 0) + 1;
  }

  return {
    layers,
    risksByKind,
    deadCodeCount: arch.deadCodeCount || 0,
    brokenPipelineCount: arch.brokenPipelineCount || 0,
    unresolvedImportCount: arch.unresolvedImportCount || 0,
    circularDependencyCount: arch.circularDependencyCount || 0,
    nodeCount: arch.nodeCount || 0,
    flows: flows.map(f => ({
      label: f.label,
      confidence: f.confidence,
      strength: f.strength,
      capabilityReasons: f.capabilityReasons || [],
      evidenceCoverage: f.evidenceCoverage,
      entryPoint: f.entryPoint?.path,
      exitPoint: f.exitPoint?.path,
      nodeCount: f.nodes?.length || 0,
      stages: (f.stages || []).slice(0, 8).map(s => ({
        path: s.path,
        layer: s.layer,
        roles: s.roles,
        functions: s.functions?.slice(0, 5) || [],
      })),
    })),
  };
}

module.exports = {
  buildSearchIndex,
  searchIndex,
  extractFileSignatures,
  extractCodeTokens,
  buildFileTree,
  buildDependencyMap,
  buildArchitectureSummary,
  buildFileSummary,
  tokenize,
  splitCamelCase,
  tokenizeImportPath,
  // Exported for tests: retrieval is easier to check signal-by-signal than
  // through a full prompt.
  bm25Score,
  buildEmbedding,
  cosineSimilarity,
  fnv1a,
  termsMatch,
  isGeneratedArtifact,
};
