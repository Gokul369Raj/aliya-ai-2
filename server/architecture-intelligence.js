const path = require('path');

const { IMPORTABLE_EXTENSIONS } = require('./constants');

const FLOW_LIBRARY = [
  { id: 'application', label: 'Application Flow', keywords: ['application', 'project', 'pipeline', 'architecture', 'system', 'repo'], maxNodes: 300 },
  { id: 'auth', label: 'Authentication Flow', keywords: ['auth', 'authentication', 'login', 'jwt', 'session', 'oauth'], maxNodes: 150 },
  { id: 'api', label: 'API Request Flow', keywords: ['api', 'request', 'rest', 'graphql', 'endpoint', 'route'], maxNodes: 200 },
  { id: 'db', label: 'Database Flow', keywords: ['db', 'database', 'query', 'orm', 'sql', 'mongoose', 'prisma'], maxNodes: 150 },
  { id: 'payment', label: 'Payment Flow', keywords: ['payment', 'stripe', 'razorpay', 'paypal', 'webhook', 'transaction'], maxNodes: 150 },
  { id: 'state', label: 'State Management Flow', keywords: ['state', 'redux', 'zustand', 'context', 'store'], maxNodes: 120 },
  { id: 'routing', label: 'Routing Flow', keywords: ['route', 'routing', 'navigation', 'router', 'middleware'], maxNodes: 120 },
  { id: 'component', label: 'Component Flow', keywords: ['component', 'render', 'ui', 'prop', 'hook'], maxNodes: 150 },
  { id: 'event', label: 'Event Flow', keywords: ['event', 'click', 'emit', 'socket', 'subscription'], maxNodes: 150 },
  { id: 'websocket', label: 'Websocket Flow', keywords: ['websocket', 'socket.io', 'ws', 'realtime', 'broadcast'], maxNodes: 150 },
  { id: 'microservice', label: 'Microservice Flow', keywords: ['microservice', 'queue', 'kafka', 'pubsub', 'rabbit'], maxNodes: 150 },
  { id: 'startup', label: 'Startup Flow', keywords: ['startup', 'boot', 'bootstrap', 'init', 'server', 'app'], maxNodes: 150 },
  { id: 'cache', label: 'Cache Flow', keywords: ['cache', 'redis', 'memory'], maxNodes: 120 },
  { id: 'error', label: 'Error Flow', keywords: ['error', 'exception', 'catch', 'retry'], maxNodes: 120 },
  { id: 'ai', label: 'AI Pipeline Flow', keywords: ['ai', 'llm', 'embedding', 'prompt', 'rag', 'vector'], maxNodes: 150 },
  { id: 'deadcode', label: 'Dead Code Flow', keywords: ['dead', 'unused', 'orphan'], maxNodes: 150 },
  { id: 'broken', label: 'Broken Pipeline Flow', keywords: ['broken', 'unresolved', 'missing'], maxNodes: 150 },
];

const FLOW_EDGE_TYPES = new Set([
  'dependency',
  'dynamic-import',
  're-export',
  'function-call',
  'route-handler',
  'route-middleware',
  'api-call',
  'auth-flow',
  'database-flow',
  'state-flow',
  'routing-flow',
  'component-flow',
  'event-flow',
  'startup-flow',
  'service-flow',
  'runtime-flow',
  'ai-flow',
  'payment-flow',
  'cache-flow',
  'error-flow',
  'websocket-flow',
  'microservice-flow',
  'hierarchy',
]);

const SUPPORTING_FLOW_EDGE_TYPES = new Set([
  'dependency',
  'dynamic-import',
  're-export',
  'function-call',
  'service-flow',
]);

// ─── Generated / vendor files ────────────────────────────────────────
// Lockfiles, bundles and source maps enumerate every dependency name in the
// project, so they match nearly every capability keyword. They must never be
// treated as evidence that a capability exists.
const GENERATED_FILE_PATTERN =
  /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|composer\.lock|Gemfile\.lock|Cargo\.lock|poetry\.lock|Pipfile\.lock)$|\.min\.(js|css)$|\.map$|(^|\/)(dist|build|out|vendor|third_party|node_modules|coverage)\//i;

// Bundler asset imports (images, fonts, media, archives) are not code modules.
// The scanner only indexes text files, so these can never resolve — reporting
// them as "unresolved imports" flagged every image import in a frontend app.
const NON_CODE_IMPORT_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.ico', '.bmp',
  '.mp4', '.webm', '.mov', '.mp3', '.wav', '.ogg',
  '.woff', '.woff2', '.ttf', '.otf', '.eot', '.pdf', '.zip', '.wasm',
]);

function isNonCodeAssetSpecifier(specifier = '') {
  const clean = String(specifier).split(/[?#]/)[0];
  return NON_CODE_IMPORT_EXTENSIONS.has(path.posix.extname(clean).toLowerCase());
}

function isGeneratedFile(filePath = '') {
  return GENERATED_FILE_PATTERN.test(filePath);
}

// Capability signatures are matched against raw content, so documentation and
// data files must be excluded — a README or a lockfile is not an integration.
const CAPABILITY_SCAN_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.vue', '.svelte', '.html',
  '.py', '.rb', '.go', '.php', '.java', '.kt', '.cs', '.rs', '.swift',
]);

/**
 * This module declares the capability rules as string and regex literals, so it
 * matches its own keyword tables. Those tables are not evidence about the
 * repository being analyzed, so the detector never counts itself.
 */
function isDetectorModule(filePath = '') {
  return path.posix.basename(normalizePath(filePath)) === 'architecture-intelligence.js';
}

function isCapabilityEvidenceFile(meta) {
  if (!meta || isGeneratedFile(meta.path) || isDetectorModule(meta.path)) return false;
  return CAPABILITY_SCAN_EXTENSIONS.has(meta.ext || '');
}

/**
 * Remove comments and string literals so keyword matching sees code, not prose.
 * Without this the analyzer matches its own keyword tables, UI labels, and
 * documentation — e.g. a report generator containing the word "payment" would
 * register as a payment integration.
 *
 * Imports/routes are extracted from the raw content elsewhere, so nothing that
 * matters is lost here.
 */
function stripCommentsAndStrings(content = '') {
  return String(content)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1 ')
    .replace(/`(?:\\[\s\S]|[^`\\])*`/g, '``')
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""');
}

// ─── Path helpers (segment-based, never substring-based) ─────────────
function pathParts(filePath = '') {
  const parts = normalizePath(filePath).split('/').filter(Boolean);
  const file = parts.pop() || '';
  const stem = file.replace(/\.[^.]+$/, '');
  return { dirs: parts, file, stem };
}

/** True when a directory is exactly one of `segments`, or the filename stem is. */
function hasPathSegment(filePath, segments) {
  const { dirs, stem } = pathParts(filePath);
  return dirs.some((dir) => segments.includes(dir)) || segments.includes(stem);
}

/** True when the filename stem contains one of the tokens as a whole word. */
function filenameHasWord(filePath, words) {
  const { stem } = pathParts(filePath);
  return words.some((word) => new RegExp(`(^|[-_.])${word}($|[-_.])`, 'i').test(stem));
}

// ─── Capability rules ────────────────────────────────────────────────
// A domain flow (auth, payment, cache, ...) may only appear when the repo
// actually has that capability. Evidence is ranked:
//   strong — a declared dependency, an import specifier, or a structured API
//            call that only that capability's SDK produces
//   medium — a naming convention (a `payments/` directory), needs corroboration
// Word boundaries are mandatory throughout: /ws/ must not match "shows",
// /rag/ must not match "storage", and bare "token"/"session" must not match
// every web file that mentions a token.
const CAPABILITY_RULES = {
  auth: {
    packages: [/^jsonwebtoken$/, /^passport(-|$)/, /^bcrypt(js)?$/, /^express-session$/, /^cookie-session$/, /^next-auth$/, /^@auth0\//, /^@clerk\//, /^lucia$/, /^iron-session$/, /^jose$/, /^oauth/, /^openid-client$/, /^@supabase\//, /^firebase-admin$/, /^simple-jwt/],
    // Inbound authentication only. Sending `Authorization: Bearer <key>` to a
    // third-party API is an outbound credential, not an auth system, so the
    // patterns below all describe code that *verifies* a caller's identity.
    code: [/\bjwt\.(sign|verify|decode)\s*\(/, /\bpassport\.(authenticate|use|initialize|session)\s*\(/, /\bbcrypt\.(hash|compare|genSalt)\s*\(/, /\b(req|request)\.session\b/, /\b(req|request)\.headers?(\.|\[)\s*['"]?authorization/i, /\b(requireAuth|ensureAuth|ensureLoggedIn|isAuthenticated|authMiddleware|requireLogin)\b/, /\bverifyToken\s*\(/, /\bcreateSession\s*\(/, /\bnew\s+(JwtStrategy|LocalStrategy|OAuth2Strategy|GoogleStrategy|BearerStrategy)\s*\(/],
    segments: ['auth', 'authentication', 'login', 'signup', 'register', 'registration', 'session', 'sessions', 'oauth', 'auth0', 'clerk'],
    filenameWords: ['auth', 'login', 'signup', 'register', 'session', 'oauth', 'jwt', 'password'],
  },
  payment: {
    packages: [/^stripe$/, /^@stripe\//, /^razorpay$/, /^@paypal\//, /^paypal$/, /^braintree$/, /^@square\//, /^square$/, /^paddle$/, /^@paddle\//, /^@lemonsqueezy\//, /^payu/, /^cashfree/],
    code: [/\bstripe\.(paymentIntents|charges|checkout|subscriptions|customers|webhooks|refunds|invoices)\b/, /\brazorpay\.(orders|payments|refunds|utility)\b/, /\bpaypal\.(orders|payments|subscriptions)\b/, /\bbraintree\.\w+\.(sale|create|submit)\b/, /\bcheckout\.sessions\.create\b/, /\bnew\s+Razorpay\s*\(/, /api\.stripe\.com/, /api\.razorpay\.com/, /checkout\.stripe\.com/],
    segments: ['payment', 'payments', 'billing', 'checkout', 'subscription', 'subscriptions', 'invoices', 'stripe', 'razorpay', 'paypal'],
    filenameWords: ['payment', 'billing', 'checkout', 'stripe', 'razorpay', 'paypal', 'invoice', 'subscription'],
  },
  cache: {
    packages: [/^redis$/, /^ioredis$/, /^memcached$/, /^node-cache$/, /^lru-cache$/, /^@upstash\/redis$/, /^keyv$/, /^cache-manager$/, /^@nestjs\/cache-manager$/],
    code: [/\bnew\s+Redis\s*\(/, /\bredis\.(get|set|setex|del|hget|hset|expire|mget)\s*\(/, /\bnew\s+LRUCache\s*\(/, /\bmemcached\s*\(/, /\bcacheManager\.(get|set|del)\s*\(/, /\bcache\.(get|set|del)\s*\(/, /redis:\/\//],
    segments: ['cache', 'caches', 'caching', 'redis', 'memcached'],
    filenameWords: ['cache', 'redis', 'memcached'],
  },
  db: {
    packages: [/^mongoose$/, /^prisma$/, /^@prisma\/client$/, /^sequelize$/, /^typeorm$/, /^knex$/, /^pg$/, /^mysql2?$/, /^sqlite3$/, /^better-sqlite3$/, /^mongodb$/, /^drizzle-orm$/, /^@planetscale\/database$/, /^@nestjs\/typeorm$/, /^kysely$/],
    code: [/\bprisma\.\w+\.(findMany|findUnique|findFirst|create|update|delete|upsert|count)\s*\(/, /\bmongoose\.(connect|model|Schema)\s*\(/, /\bsequelize\.define\s*\(/, /\bnew\s+(Pool|Client)\s*\(/, /\b(db|pool|connection|client)\.query\s*\(/, /\bModel\.(find|findOne|findById|create|updateOne|aggregate)\s*\(/, /\bcreateConnection\s*\(/, /\b(mongodb|postgres|postgresql|mysql|mariadb|sqlite):\/\//],
    segments: ['db', 'database', 'databases', 'models', 'model', 'migrations', 'migration', 'schema', 'schemas', 'entities', 'entity', 'repositories', 'repository', 'dao', 'orm'],
    filenameWords: ['db', 'database', 'migration', 'schema', 'repository', 'sequelize', 'mongoose', 'prisma'],
  },
  state: {
    packages: [/^redux$/, /^@reduxjs\/toolkit$/, /^react-redux$/, /^zustand$/, /^jotai$/, /^recoil$/, /^mobx(-react)?$/, /^valtio$/, /^xstate$/, /^pinia$/, /^vuex$/, /^effector$/],
    code: [/\bcreateSlice\s*\(/, /\bconfigureStore\s*\(/, /\bcreateStore\s*\(/, /\bdefineStore\s*\(/, /\buseRecoilState\s*\(/, /\bcreate\s*\(\s*\(\s*set\s*\)/, /\bmakeAutoObservable\s*\(/, /\bcreateMachine\s*\(/],
    segments: ['store', 'stores', 'state', 'redux', 'zustand', 'context', 'reducers', 'reducer', 'slices', 'slices'],
    filenameWords: ['store', 'redux', 'zustand', 'reducer', 'slice', 'state'],
  },
  websocket: {
    packages: [/^socket\.io$/, /^socket\.io-client$/, /^ws$/, /^engine\.io$/, /^engine\.io-client$/, /^@socket\.io\//, /^sockjs(-client)?$/, /^pusher(-js)?$/, /^ably$/, /^@ably\//, /^graphql-ws$/, /^@nestjs\/websockets$/, /^@nestjs\/platform-socket\.io$/],
    code: [/\bnew\s+WebSocket\s*\(/, /\.on\s*\(\s*['"]connection['"]/, /\bsocket\.(emit|on|join|broadcast|to)\s*\(/, /\bio\.(on|emit|to|in)\s*\(/, /\bws\.on\s*\(\s*['"](connection|message)/, /\bnew\s+Socket\s*\(/],
    segments: ['socket', 'sockets', 'websocket', 'websockets', 'realtime', 'ws'],
    filenameWords: ['socket', 'websocket', 'realtime'],
  },
  microservice: {
    packages: [/^kafkajs$/, /^amqplib$/, /^amqp-connection-manager$/, /^bullmq$/, /^bull$/, /^@aws-sdk\/client-sqs$/, /^@aws-sdk\/client-sns$/, /^sqs-consumer$/, /^nats$/, /^@google-cloud\/pubsub$/, /^rascal$/, /^celery$/, /^@nestjs\/microservices$/],
    code: [/\bnew\s+(Queue|Worker|FlowProducer)\s*\(/, /\bkafka\.(producer|consumer|admin)\s*\(/, /\bchannel\.(consume|sendToQueue|publish|assertQueue)\s*\(/, /\b(sqs|sns)\.(sendMessage|publish|send)\s*\(/, /\bproducer\.send\s*\(/, /\bnew\s+Kafka\s*\(/, /\bconsumer\.(subscribe|run)\s*\(/],
    segments: ['queue', 'queues', 'workers', 'worker', 'consumer', 'consumers', 'producers', 'producer', 'jobs', 'events', 'kafka', 'rabbitmq', 'sqs'],
    filenameWords: ['queue', 'worker', 'consumer', 'producer', 'kafka', 'rabbit', 'sqs'],
  },
  ai: {
    packages: [/^openai$/, /^@anthropic-ai\//, /^@google\/generative-ai$/, /^@google-ai\/generativelanguage$/, /^cohere-ai$/, /^langchain$/, /^@langchain\//, /^llamaindex$/, /^@pinecone-database\//, /^@qdrant\//, /^chromadb$/, /^@xenova\/transformers$/, /^@huggingface\//, /^replicate$/, /^groq-sdk$/, /^@mistralai\//, /^@ai-sdk\//, /^ollama$/, /^@vercel\/ai$/],
    code: [/\bnew\s+OpenAI\s*\(/, /\bopenai\.(chat\.completions|responses|embeddings|images)\b/, /\banthropic\.messages\.create\s*\(/, /\bnew\s+ChatOpenAI\s*\(/, /\bembeddings\.create\s*\(/, /\bnew\s+Pinecone\s*\(/, /\bgenerateContent\s*\(/, /\bnew\s+GoogleGenerativeAI\s*\(/, /api\.openai\.com/, /generativelanguage\.googleapis\.com/, /api\.anthropic\.com/, /api\.mistral\.ai/, /api\.groq\.com/, /openrouter\.ai/, /api\.deepseek\.com/, /api\.cohere\.ai/, /api\.perplexity\.ai/, /huggingface\.co/],
    segments: ['ai', 'llm', 'llms', 'prompts', 'prompt', 'embeddings', 'embedding', 'vector', 'vectors', 'rag', 'agents', 'agent', 'inference'],
    filenameWords: ['prompt', 'embedding', 'llm', 'openai', 'anthropic', 'gemini', 'rag', 'vector', 'inference'],
  },
  event: {
    packages: [/^eventemitter3$/, /^mitt$/, /^emittery$/, /^events$/],
    // Process signal handling is not an event architecture, so only real
    // emitter wiring counts.
    code: [/\bnew\s+EventEmitter\s*\(/, /\bextends\s+EventEmitter\b/, /\bemitter\.(emit|on|once|off)\s*\(/, /\bnew\s+(Emitter|EventBus|EventTarget)\s*\(/],
    segments: ['events', 'event', 'emitters', 'emitter', 'listeners', 'listener', 'subscribers'],
    filenameWords: ['event', 'emitter', 'listener', 'subscriber'],
  },
  error: {
    packages: [],
    code: [/\bapp\.use\s*\(\s*\(\s*(err|error)\s*,\s*(req|request)\s*,\s*(res|response)\s*,\s*next/, /\bclass\s+\w*(ErrorBoundary|ErrorHandler)\b/, /\bprocess\.on\s*\(\s*['"](uncaughtException|unhandledRejection)/, /\bnew\s+\w*ErrorHandler\s*\(/, /\bglobalErrorHandler\b/, /\bExceptionFilter\b/],
    segments: ['errors', 'error', 'exceptions', 'exception', 'handlers'],
    filenameWords: ['error', 'exception', 'errorhandler', 'errorboundary'],
  },
};

// Structural flows describe shape (entry points, routes, components) rather
// than an optional capability, so they are not capability-gated.
const DOMAIN_FLOW_IDS = new Set(Object.keys(CAPABILITY_RULES));

/**
 * Decide which capabilities a repository actually has.
 * Returns a map of flowId → { strength, reasons } where strength is
 * 'strong' (dependency / import / structured call), 'medium' (naming
 * convention only) or 'weak' (nothing found).
 */
function detectCapabilities(metadataList, dependencyNames) {
  const packages = new Set([...dependencyNames].map((name) => lower(name)));
  const importedPackages = new Set();
  for (const meta of metadataList) {
    for (const imported of meta.imports || []) {
      const specifier = imported.specifier || '';
      if (!specifier || specifier.startsWith('.') || specifier.startsWith('/')) continue;
      const parts = specifier.split('/');
      importedPackages.add(lower(parts[0].startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]));
    }
  }

  const matchesPackage = (patterns, name) => patterns.some((pattern) => pattern.test(name));

  const capabilities = {};

  for (const [flowId, rule] of Object.entries(CAPABILITY_RULES)) {
    const reasons = [];
    let strength = 'weak';

    // 1. Declared dependency — the strongest, cheapest signal.
    for (const name of packages) {
      if (matchesPackage(rule.packages, name)) {
        reasons.push(`declared dependency "${name}"`);
        strength = 'strong';
        break;
      }
    }

    // 2. Imported at runtime, even if not declared.
    if (strength !== 'strong') {
      for (const name of importedPackages) {
        if (matchesPackage(rule.packages, name)) {
          reasons.push(`imports "${name}"`);
          strength = 'strong';
          break;
        }
      }
    }

    // 3. Structured API usage — only this SDK produces these calls.
    //    Tested against the raw content because provider endpoints and SDK
    //    calls live inside string literals, which the stripped view removes.
    //    These patterns are precise enough (escaped regex literals in this
    //    file cannot match their own unescaped form) that prose is not a risk.
    if (strength !== 'strong') {
      for (const meta of metadataList) {
        if (!isCapabilityEvidenceFile(meta)) continue;
        const raw = meta.content || '';
        if (rule.code.some((pattern) => pattern.test(raw))) {
          reasons.push(`code signature in ${meta.path}`);
          strength = 'strong';
          break;
        }
      }
    }

    // 4. Naming convention — a hint, not proof.
    const conventional = metadataList.filter((meta) => {
      if (!isCapabilityEvidenceFile(meta)) return false;
      return hasPathSegment(meta.path, rule.segments) || filenameHasWord(meta.path, rule.filenameWords);
    });

    if (strength !== 'strong' && conventional.length >= 2) {
      strength = 'medium';
      reasons.push(`${conventional.length} files named by convention`);
    } else if (strength === 'strong' && conventional.length) {
      reasons.push(`${conventional.length} file${conventional.length === 1 ? '' : 's'} named by convention`);
    }

    capabilities[flowId] = { strength, reasons, files: conventional.map((meta) => meta.path) };
  }

  return capabilities;
}

const CODE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.py', '.php', '.rb', '.go', '.java']);
const STOP_CALL_TOKENS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'new', 'await', 'function',
  'console', 'Math', 'Object', 'Array', 'String', 'Number', 'Boolean', 'Date', 'Promise',
  'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
]);

function normalizePath(filePath) {
  return filePath.split(path.sep).join('/');
}

function fileId(filePath) {
  return `file:${filePath}`;
}

function lower(value) {
  return String(value || '').toLowerCase();
}

function hasAny(text, patterns) {
  return patterns.some((pattern) => text.includes(pattern));
}

// TypeScript ESM requires the *emitted* extension in the specifier: `import
// './types.js'` loads `types.ts`. Without the swap every one of those imports
// was reported as an unresolved module (11 false risks in copilot-engine-sdk).
const SPECIFIER_EXTENSION_SWAPS = {
  '.js': ['.ts', '.tsx', '.d.ts'],
  '.jsx': ['.tsx', '.ts'],
  '.mjs': ['.mts', '.ts'],
  '.cjs': ['.cts', '.ts'],
  '.ts': ['.js', '.tsx'],
  '.tsx': ['.jsx'],
  '.mts': ['.mjs'],
  '.cts': ['.cjs'],
};

function moduleCandidates(joined) {
  const ext = path.posix.extname(joined).toLowerCase();
  const base = ext ? joined.slice(0, -ext.length) : joined;
  const candidates = [];

  // A specifier that already names a file exactly must be tried before any
  // extension is appended, otherwise `./styles.css` only ever resolves as
  // `./styles.css.ts`.
  if (ext) candidates.push(joined);
  for (const swap of SPECIFIER_EXTENSION_SWAPS[ext] || []) candidates.push(`${base}${swap}`);

  for (const candidate of IMPORTABLE_EXTENSIONS) {
    candidates.push(`${joined}${candidate}`);
    candidates.push(path.posix.join(joined, `index${candidate}`));
  }
  return [...new Set(candidates)];
}

function resolveModuleTarget(fromRelativePath, specifier, fileIndex) {
  if (!specifier) return null;

  if (specifier.startsWith('.')) {
    const baseDir = path.posix.dirname(fromRelativePath);
    const joined = path.posix.normalize(path.posix.join(baseDir, specifier));
    return moduleCandidates(joined).find((candidate) => fileIndex.has(candidate)) || null;
  }

  if (specifier.startsWith('/')) {
    const joined = path.posix.normalize(specifier.slice(1));
    return moduleCandidates(joined).find((candidate) => fileIndex.has(candidate)) || null;
  }

  return null;
}

function extractImportBindings(content) {
  const imports = [];
  const importRegex = /import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
  const bareImportRegex = /import\s+['"]([^'"]+)['"]/g;
  const requireRegex = /(?:const|let|var)\s+([^=;\n]+?)\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/g;
  const dynamicImportRegex = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
  const reExportRegex = /export\s+[^'"]*?from\s+['"]([^'"]+)['"]/g;

  const pushImport = (specifier, type, bindings = []) => {
    imports.push({
      specifier,
      type,
      bindings: bindings.filter(Boolean),
    });
  };

  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const rawBindings = match[1].trim();
    const specifier = match[2];
    const bindings = [];

    const namedSection = rawBindings.match(/\{([\s\S]*?)\}/);
    if (namedSection) {
      const named = namedSection[1]
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      for (const part of named) {
        const [imported, alias] = part.split(/\s+as\s+/i).map((value) => value.trim());
        bindings.push({ local: alias || imported, imported, kind: 'named' });
      }
    }

    const namespaceSection = rawBindings.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/);
    if (namespaceSection) {
      bindings.push({ local: namespaceSection[1], imported: '*', kind: 'namespace' });
    }

    const defaultCandidate = rawBindings
      .replace(/\{[\s\S]*?\}/g, '')
      .replace(/\*\s+as\s+[A-Za-z_$][\w$]*/g, '')
      .split(',')
      .map((item) => item.trim())
      .find(Boolean);

    if (defaultCandidate) {
      bindings.push({ local: defaultCandidate, imported: 'default', kind: 'default' });
    }

    pushImport(specifier, 'import', bindings);
  }

  while ((match = bareImportRegex.exec(content)) !== null) {
    pushImport(match[1], 'import', []);
  }

  while ((match = requireRegex.exec(content)) !== null) {
    const bindingPart = match[1].trim();
    const specifier = match[2];
    const bindings = [];

    if (bindingPart.startsWith('{')) {
      const named = bindingPart
        .replace(/[{}]/g, '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      for (const part of named) {
        const [imported, alias] = part.split(/\s*:\s*/).map((value) => value.trim());
        bindings.push({ local: alias || imported, imported, kind: 'named' });
      }
    } else {
      bindings.push({ local: bindingPart, imported: 'default', kind: 'require' });
    }

    pushImport(specifier, 'require', bindings);
  }

  while ((match = dynamicImportRegex.exec(content)) !== null) {
    pushImport(match[1], 'dynamic', []);
  }

  while ((match = reExportRegex.exec(content)) !== null) {
    pushImport(match[1], 're-export', []);
  }

  return imports;
}

function extractDeclaredSymbols(content) {
  const declared = new Set();
  const patterns = [
    /function\s+([A-Za-z_$][\w$]*)\s*\(/g,
    // Any variable declaration, not just arrow functions. Mounting a sub-app
    // (`var sub = express(); app.use('/sub', sub)`) declares a real symbol, and
    // missing it made the route-handler resolver report false "unresolved
    // handler" risks.
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g,
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g,
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?[A-Za-z_$][\w$]*\s*=>/g,
    /class\s+([A-Za-z_$][\w$]*)\s+/g,
    /export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g,
    /export\s+class\s+([A-Za-z_$][\w$]*)\s+/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      declared.add(match[1]);
    }
  }

  return [...declared];
}

function extractExportedSymbols(content) {
  const exported = new Set();
  const patterns = [
    /export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g,
    /export\s+(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)\b/g,
    /export\s*\{([^}]+)\}/g,
    /module\.exports\s*=\s*\{([^}]+)\}/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      if (pattern.source.includes('{([^}]+)}')) {
        const names = match[1]
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean);
        for (const part of names) {
          const [local] = part.split(/\s+as\s+|:/i).map((value) => value.trim());
          if (local) exported.add(local);
        }
      } else {
        exported.add(match[1]);
      }
    }
  }

  return [...exported];
}

function extractCalledTokens(content) {
  const tokens = new Set();
  const tokenPattern = /(?:^|[^\w$.])([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)\s*\(/gm;
  let match;

  while ((match = tokenPattern.exec(content)) !== null) {
    const token = match[1];
    const root = token.split('.')[0];
    if (!token || STOP_CALL_TOKENS.has(root)) continue;
    tokens.add(token);
  }

  return [...tokens];
}

function lineNumberFor(content, regexes) {
  for (const regex of regexes) {
    const match = regex.exec(content);
    regex.lastIndex = 0;
    if (!match) continue;
    return content.slice(0, match.index).split('\n').length;
  }
  return null;
}

function detectFrameworks(metadataList, files) {
  const packageFiles = files.filter((file) => /(^|\/)package\.json$/i.test(file.path || ''));
  const deps = new Set();
  const importedPackages = new Set();
  for (const meta of metadataList) {
    for (const imported of meta.imports || []) {
      if (!imported.specifier || imported.specifier.startsWith('.') || imported.specifier.startsWith('/')) continue;
      importedPackages.add(imported.specifier);
      importedPackages.add(imported.specifier.split('/')[0].startsWith('@') ? imported.specifier.split('/').slice(0, 2).join('/') : imported.specifier.split('/')[0]);
    }
  }
  for (const file of packageFiles) {
    try {
      const manifest = JSON.parse(file.content || '{}');
      for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
        for (const dependency of Object.keys(manifest[section] || {})) deps.add(dependency);
      }
    } catch {
      // Ignore malformed manifests; repository analysis must stay best-effort and evidence-only.
    }
  }

  const content = metadataList.map((meta) => `${meta.path}\n${meta.imports.map((item) => item.specifier).join('\n')}`).join('\n').toLowerCase();
  const hasPackage = (name) => deps.has(name) || importedPackages.has(name);
  const candidates = [
    ['Express', () => hasPackage('express') || /express\(/.test(content)],
    ['React', () => hasPackage('react') || /createroot\(|reactdom/.test(content)],
    ['Next.js', () => hasPackage('next') || /next\.config|(^|\/)(app|pages)\//.test(content)],
    ['NestJS', () => hasPackage('@nestjs/core') || /nestfactory|@nestjs\//.test(content)],
    ['Fastify', () => hasPackage('fastify') || /fastify\(/.test(content)],
    ['Django', () => /manage\.py|django/.test(content)],
    ['Flask', () => /from flask import|flask\(/.test(content)],
    ['FastAPI', () => /fastapi|fastapi\(/.test(content)],
    ['Spring Boot', () => /spring-boot|@springbootapplication/.test(content)],
    ['Laravel', () => /artisan|illuminate\\|laravel/.test(content)],
    ['Ruby on Rails', () => /gem ['"]rails|rails/.test(content)],
  ];

  return candidates.filter(([, test]) => test()).map(([label]) => label);
}

function summarizeDependencies(metadataList, files) {
  const deps = new Set();
  for (const meta of metadataList) {
    for (const imported of meta.imports) {
      if (imported.specifier && !imported.specifier.startsWith('.') && !imported.specifier.startsWith('/')) {
        deps.add(imported.specifier.split('/')[0].startsWith('@') ? imported.specifier.split('/').slice(0, 2).join('/') : imported.specifier.split('/')[0]);
      }
    }
  }

  for (const file of files) {
    if (!/(^|\/)package\.json$/i.test(file.path || '')) continue;
    try {
      const manifest = JSON.parse(file.content || '{}');
      for (const section of ['dependencies', 'devDependencies']) {
        for (const dependency of Object.keys(manifest[section] || {})) deps.add(dependency);
      }
    } catch {
      // Ignore malformed manifests.
    }
  }

  return [...deps].sort();
}

function classifyEvidence(meta, flowId) {
  const evidence = [];
  const roles = new Set(meta.roles || []);
  if (roles.has(flowId)) evidence.push(`${flowId} role`);
  if (flowId === 'application' && roles.has('startup')) evidence.push('startup entry signal');
  if (flowId === 'api' && (meta.routeDefs.length || meta.apiCalls.length)) evidence.push('route/API call metadata');
  if (flowId === 'auth' && meta.hasAuthSignal) evidence.push('auth token/session signal');
  if (flowId === 'db' && meta.hasDbSignal) evidence.push('database query/ORM signal');
  if (flowId === 'routing' && meta.routeDefs.length) evidence.push('route definition');
  if (flowId === 'component' && (meta.jsxUsages.length || roles.has('component'))) evidence.push('component/JSX usage');
  if (flowId === 'startup' && roles.has('startup')) evidence.push('entry point pattern');
  if (flowId === 'state' && roles.has('state')) evidence.push('state management signal');
  if (flowId === 'event' && roles.has('event')) evidence.push('event/listener signal');
  if (flowId === 'ai' && roles.has('ai')) evidence.push('AI/LLM signal');
  if (flowId === 'payment' && roles.has('payment')) evidence.push('payment provider signal');
  if (flowId === 'cache' && roles.has('cache')) evidence.push('cache/redis signal');
  if (flowId === 'error' && roles.has('error')) evidence.push('error handling signal');
  if (flowId === 'websocket' && roles.has('websocket')) evidence.push('websocket/realtime signal');
  if (flowId === 'microservice' && roles.has('microservice')) evidence.push('queue/worker signal');
  return evidence;
}

function extractJsxUsages(content) {
  const components = new Set();
  const jsxPattern = /<([A-Z][A-Za-z0-9_]*)\b/g;
  let match;
  while ((match = jsxPattern.exec(content)) !== null) {
    components.add(match[1]);
  }
  return [...components];
}

function normalizeRoutePath(routePath) {
  if (!routePath) return '';
  const cleaned = routePath
    .replace(/`/g, '')
    .replace(/\$\{[^}]+\}/g, ':param')
    .replace(/\/+/g, '/');
  return cleaned.startsWith('/') ? cleaned : `/${cleaned}`;
}

// Tokens that are never handler references.
const NON_HANDLER_TOKENS = new Set([
  'app', 'router', 'req', 'res', 'next',
  'var', 'let', 'const', 'function', 'return', 'new', 'async', 'await', 'yield',
  'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
  'try', 'catch', 'finally', 'throw', 'typeof', 'instanceof', 'in', 'of', 'delete', 'void',
  'class', 'extends', 'super', 'this', 'require', 'module', 'exports',
  'import', 'export', 'default', 'from', 'true', 'false', 'null', 'undefined',
]);

function extractRouteDefinitions(content) {
  const routes = [];
  const callPattern = /(?:^|[^\w$.])(app|router)\.(get|post|put|patch|delete|options|head|use)\s*\(/g;
  let match;

  while ((match = callPattern.exec(content)) !== null) {
    const method = match[2];
    const argsStart = callPattern.lastIndex;

    // Walk forward balancing parentheses. A non-greedy regex stops at the first
    // `)`, which truncates `app.use(bodyParser.urlencoded({ ... }))` and makes
    // the tail look like handler references.
    let depth = 1;
    let index = argsStart;
    while (index < content.length && depth > 0) {
      const char = content[index];
      if (char === '(') depth += 1;
      else if (char === ')') depth -= 1;
      index += 1;
    }
    const args = content.slice(argsStart, Math.max(argsStart, index - 1));

    // The path must be the *first* argument. Taking the first string literal
    // anywhere in the args mis-read `app.use(express.json({ limit: '2mb' }))`
    // as a route mounted at `/2mb`.
    const pathMatch = args.match(/^\s*['"`]([^'"`]+)['"`]/);

    // Everything from the first `{`, `=>` or `function` is the handler body,
    // not an argument. Without this cut, local variables inside a multi-line
    // inline handler (`var minute = 60000`) leaked in as unresolved handlers.
    const argList = args.split(/\{|=>|\bfunction\b/)[0];

    // Strip string literals quote-by-quote. A single generic quote class breaks
    // on `res.send('... <a href="/forget">')` — the inner double quote would end
    // the match early and leak `forget` as a handler name.
    const withoutStrings = argList
      .replace(/'(?:[^'\\]|\\.)*'/g, ' ')
      .replace(/"(?:[^"\\]|\\.)*"/g, ' ')
      .replace(/`(?:[^`\\]|\\.)*`/g, ' ');

    // A handler is a bare *reference* passed to the route. Exclude tokens that
    // are called (`cors()`), member-accessed (`express.json`), or nested inside
    // an object/array literal (`{ extended: true }`).
    const flatArgs = withoutStrings
      .replace(/\((?:[^()]|\([^()]*\))*\)/g, ' ')
      .replace(/\{[^{}]*\}/g, ' ')
      .replace(/\[[^\[\]]*\]/g, ' ');

    const referenced = new Set(
      Array.from(withoutStrings.matchAll(/\b([A-Za-z_$][\w$]*)\b(?!\s*[.(])/g)).map((item) => item[1]),
    );
    const topLevel = new Set(
      Array.from(flatArgs.matchAll(/\b([A-Za-z_$][\w$]*)\b(?!\s*[.(])/g)).map((item) => item[1]),
    );

    const handlerTokens = [...referenced].filter(
      (token) => topLevel.has(token) && !NON_HANDLER_TOKENS.has(token),
    );

    routes.push({
      method,
      path: pathMatch ? normalizeRoutePath(pathMatch[1]) : method === 'use' ? 'middleware' : '',
      handlers: [...new Set(handlerTokens)],
    });
  }

  return routes;
}

function extractApiCalls(content) {
  const calls = [];
  const patterns = [
    { type: 'axios', regex: /axios\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/g },
    { type: 'fetch', regex: /fetch\s*\(\s*['"`]([^'"`]+)['"`]/g },
    { type: 'graphql', regex: /(useQuery|useMutation|client\.query|client\.mutate|graphql)\s*\(/g },
    { type: 'websocket', regex: /(socket\.emit|socket\.on|new\s+WebSocket)\s*\(\s*['"`]?([^,'"`)]+)?/g },
  ];

  for (const { type, regex } of patterns) {
    let match;
    while ((match = regex.exec(content)) !== null) {
      calls.push({
        type,
        method: match[1] && ['get', 'post', 'put', 'patch', 'delete'].includes(match[1]) ? match[1] : type,
        path: match[2] ? normalizeRoutePath(match[2]) : '',
      });
    }
  }

  return calls;
}

function inferRoles(file, strippedCode) {
  const roles = new Set();
  const filePath = normalizePath(file.path || '');
  const ext = path.posix.extname(filePath).toLowerCase();
  const stripped = strippedCode !== undefined ? strippedCode : stripCommentsAndStrings(file.content || '');
  // Content signals are only meaningful in source files. A changelog that
  // happens to contain `app.get(` inside a snippet is not part of the router.
  const content = CAPABILITY_SCAN_EXTENSIONS.has(ext) ? stripped : '';

  // Generated/vendor files enumerate every dependency name in the project.
  // They must never contribute architectural roles.
  if (isGeneratedFile(filePath)) {
    roles.add('generated');
    return [...roles];
  }

  const hasSegment = (segments) => hasPathSegment(filePath, segments);
  const hasWord = (words) => filenameHasWord(filePath, words);

  if (hasSegment(['components', 'component', 'ui', 'pages', 'page', 'views', 'view', 'screens', 'widgets'])
    || ['.jsx', '.tsx', '.vue', '.svelte'].includes(ext)) {
    roles.add('component');
  }

  if (hasSegment(['routes', 'route', 'router', 'routers', 'navigation', 'middleware', 'middlewares'])
    || /\b(?:app|router|server)\.(get|post|put|patch|delete|options|head|use)\s*\(/.test(content)) {
    roles.add('routing');
  }

  if (hasSegment(['controllers', 'controller', 'handlers', 'handler'])
    || /\b(?:req|request)\s*,\s*(?:res|response)\b/.test(content)) {
    roles.add('controller');
  }

  if (hasSegment(['services', 'service', 'usecases', 'use-cases', 'domain'])) {
    roles.add('service');
  }

  if (hasSegment(['repositories', 'repository', 'dao', 'models', 'model', 'entities', 'entity', 'orm'])) {
    roles.add('repository');
  }

  if (hasSegment(['middleware', 'middlewares', 'guards', 'guard', 'interceptors'])) {
    roles.add('middleware');
  }

  // Capability roles come from the shared capability rules so that a role and
  // the corresponding flow can never disagree about whether it exists.
  const capabilityRoleMap = {
    auth: 'auth',
    db: 'database',
    cache: 'cache',
    payment: 'payment',
    websocket: 'websocket',
    microservice: 'microservice',
    state: 'state',
    ai: 'ai',
    event: 'event',
    error: 'error',
  };
  const capabilityEligible = isCapabilityEvidenceFile({ path: filePath, ext });

  for (const [flowId, role] of Object.entries(capabilityRoleMap)) {
    if (!capabilityEligible) break;
    const rule = CAPABILITY_RULES[flowId];
    // Capability signatures are tested against raw content (provider URLs and
    // SDK calls live in string literals); the loose structural checks below use
    // the stripped view so prose cannot create a role.
    const rawContent = file.content || '';
    const codeHit = rule.code.some((pattern) => pattern.test(rawContent));
    const pathHit = hasSegment(rule.segments) || hasWord(rule.filenameWords);
    if (codeHit || pathHit) roles.add(role);
  }

  if (hasSegment(['api', 'apis', 'endpoints', 'graphql', 'rest', 'client', 'sdk'])
    || /\baxios\.(get|post|put|patch|delete|request)\s*\(/.test(content)
    || /\bfetch\s*\(/.test(content)
    || /\b(?:useQuery|useMutation|useSWR)\s*\(/.test(content)
    || /\bgql`/.test(content)) {
    roles.add('api');
  }

  if (hasSegment(['config', 'configs', 'settings', 'env'])
    || hasWord(['config', 'settings'])
    || /\bprocess\.env\b/.test(content)
    || /\bimport\.meta\.env\b/.test(content)) {
    roles.add('config');
  }

  if (hasSegment(['queue', 'queues', 'workers', 'worker', 'kafka', 'rabbitmq', 'sqs'])) {
    roles.add('infrastructure');
  }

  // Entry points: a file that actually boots something.
  if (/\bapp\.listen\s*\(/.test(content)
    || /\bcreateRoot\s*\(/.test(content)
    || /\bReactDOM\.render\s*\(/.test(content)
    || /\bnew\s+(Express|Fastify|Koa|NestFactory|ApolloServer)\s*\(/.test(content)
    || /\bNestFactory\.create\s*\(/.test(content)
    || /\buvicorn\.run\s*\(/.test(content)
    || hasWord(['main', 'index', 'server', 'app', 'bootstrap', 'entry'])
    || hasSegment(['bin', 'cmd', 'entrypoints'])) {
    roles.add('startup');
  }

  if (hasSegment(['utils', 'util', 'helpers', 'helper', 'common', 'shared', 'lib'])) {
    roles.add('utils');
  }

  if (filePath.startsWith('server/') || filePath.startsWith('backend/') || filePath.startsWith('api/') || filePath.startsWith('src/server/')) {
    roles.add('backend');
  }
  if (filePath.startsWith('client/') || filePath.startsWith('frontend/') || filePath.startsWith('web/') || filePath.startsWith('app/') || filePath.startsWith('src/components/')) {
    roles.add('frontend');
  }

  // Root-level source files with no other signal: classify by what they do.
  if (!filePath.includes('/') && CODE_EXTENSIONS.has(ext)) {
    if (/document\.|window\.|canvas\b|addEventListener\s*\(/.test(content)) roles.add('frontend');
    else if (/app\.listen\s*\(|require\s*\(\s*['"]express/.test(content)) roles.add('backend');
    else roles.add('source');
  }

  if (!roles.size && CODE_EXTENSIONS.has(ext)) {
    roles.add('utils');
  }

  return [...roles];
}

function pickLayer(roles) {
  const roleSet = new Set(roles);
  if (roleSet.has('payment')) return 'payment';
  if (roleSet.has('database')) return 'database';
  if (roleSet.has('cache')) return 'cache';
  if (roleSet.has('state')) return 'state';
  if (roleSet.has('middleware')) return 'middleware';
  if (roleSet.has('api') || roleSet.has('routing') || roleSet.has('controller') || roleSet.has('websocket')) return 'api';
  if (roleSet.has('service') || roleSet.has('repository')) return 'service';
  if (roleSet.has('infrastructure') || roleSet.has('microservice')) return 'infrastructure';
  if (roleSet.has('component') || roleSet.has('frontend')) return 'frontend';
  if (roleSet.has('backend') || roleSet.has('startup')) return 'backend';
  if (roleSet.has('auth')) return 'auth';
  if (roleSet.has('error')) return 'errors';
  if (roleSet.has('config')) return 'config';
  return 'utils';
}

function baseImportance(filePath, roles) {
  let score = 0;
  const lowerPath = lower(filePath);
  if (/\/?(index|main|app|server|bootstrap|router|layout|page)\./.test(lowerPath)) score += 18;
  if (roles.includes('startup')) score += 20;
  if (roles.includes('routing')) score += 16;
  if (roles.includes('controller')) score += 14;
  if (roles.includes('service')) score += 12;
  if (roles.includes('auth') || roles.includes('database')) score += 10;
  return score;
}

function addRisk(risks, keySet, risk) {
  const key = `${risk.kind}|${risk.fileId || ''}|${risk.relatedFileId || ''}|${risk.message}`;
  if (keySet.has(key)) return;
  keySet.add(key);
  risks.push(risk);
}

function createEdgeAccumulator() {
  const keySet = new Set();
  const edges = [];

  return {
    edges,
    add(source, target, type, meta = {}) {
      if (!source || !target || source === target) return;
      const key = `${source}|${target}|${type}|${meta.path || ''}|${meta.method || ''}`;
      if (keySet.has(key)) return;
      keySet.add(key);
      edges.push({ source, target, type, ...meta });
    },
  };
}

function detectCircularDependencies(metadataList) {
  const graph = new Map(metadataList.map((meta) => [meta.id, meta.resolvedImports.map((item) => fileId(item.target))]));
  const visited = new Set();
  const stack = new Set();
  const cycles = [];

  function visit(nodeId, trail) {
    if (stack.has(nodeId)) {
      const cycleStart = trail.indexOf(nodeId);
      if (cycleStart >= 0) cycles.push(trail.slice(cycleStart));
      return;
    }
    if (visited.has(nodeId)) return;

    visited.add(nodeId);
    stack.add(nodeId);
    const nextNodes = graph.get(nodeId) || [];
    for (const nextNode of nextNodes) {
      visit(nextNode, [...trail, nextNode]);
    }
    stack.delete(nodeId);
  }

  for (const nodeId of graph.keys()) {
    visit(nodeId, [nodeId]);
  }

  return cycles;
}

function scoreFlowNode(meta) {
  return baseImportance(meta.path, meta.roles) + meta.resolvedImports.length * 2 + meta.calls.length + meta.routeDefs.length * 4;
}

function matchRoutePath(apiPath, routePath) {
  if (!apiPath || !routePath) return false;
  if (apiPath === routePath) return true;
  if (routePath !== '/' && apiPath.startsWith(routePath)) return true;

  const apiSegments = apiPath.split('/').filter(Boolean);
  const routeSegments = routePath.split('/').filter(Boolean);
  if (!apiSegments.length || !routeSegments.length) return false;
  const overlap = routeSegments.every((segment, index) => {
    if (segment.startsWith(':')) return Boolean(apiSegments[index]);
    return apiSegments[index] === segment;
  });
  return overlap;
}

function orderFlowNodes(nodeIds, seeds, metadataById, adjacency) {
  const queue = [...seeds];
  const distance = new Map();
  const included = new Set(nodeIds);

  seeds.forEach((seed) => distance.set(seed, 0));

  while (queue.length) {
    const current = queue.shift();
    for (const next of adjacency.get(current) || []) {
      if (!included.has(next)) continue;
      if (distance.has(next)) continue;
      distance.set(next, (distance.get(current) || 0) + 1);
      queue.push(next);
    }
  }

  return [...nodeIds].sort((left, right) => {
    const leftMeta = metadataById.get(left);
    const rightMeta = metadataById.get(right);
    const leftDistance = distance.get(left) ?? 999;
    const rightDistance = distance.get(right) ?? 999;
    if (leftDistance !== rightDistance) return leftDistance - rightDistance;
    return scoreFlowNode(rightMeta) - scoreFlowNode(leftMeta);
  });
}

function buildFlow(flowDefinition, metadataList, metadataById, allEdges, risks, {
  roleFilter,
  seedFilter,
  frameworks = [],
  dependencies = [],
  minNodes = 2,
  requiredEdgeTypes = [],
  evidenceEdgeTypes,
  capability = null,
  isDomain = false,
  allowHierarchyFallback = true,
  includeAllSeeds = false,
}) {
  // ── Capability gate ──────────────────────────────────────────────
  // A domain flow (auth, payment, cache, ...) may only be reported when the
  // repository actually has that capability. Without this, one file that
  // merely mentions a keyword spawns an entire invented flow.
  const capabilityStrength = capability?.strength || 'weak';
  if (isDomain && capabilityStrength === 'weak') return null;

  const filtered = metadataList.filter((meta) => roleFilter(meta));
  if (!filtered.length) return null;

  const rankedSeeds = filtered
    .filter((meta) => seedFilter(meta))
    .sort((left, right) => scoreFlowNode(right) - scoreFlowNode(left));

  if (!rankedSeeds.length) return null;

  // Domain flows include every file that carries the capability's evidence, so
  // the flow covers the whole capability rather than an arbitrary top-N slice.
  const seedLimit = includeAllSeeds
    ? Math.min(rankedSeeds.length, flowDefinition.maxNodes)
    : Math.min(6, filtered.length);
  const seeds = rankedSeeds.slice(0, seedLimit).map((meta) => meta.id);

  const included = new Set(seeds);
  const edgeKeys = new Set();
  const adjacency = new Map();

  // Traverse only edge types that are meaningful for this flow. Letting a flow
  // walk the whole graph is what pulled unrelated files into invented flows.
  let relevantEdges = allEdges.filter((edge) => FLOW_EDGE_TYPES.has(edge.type));
  const flowEdgeTypes = new Set([...requiredEdgeTypes, ...(evidenceEdgeTypes || [])]);
  if (flowEdgeTypes.size) {
    const scoped = relevantEdges.filter((edge) => flowEdgeTypes.has(edge.type));
    if (scoped.length) relevantEdges = scoped;
  }
  const hasRealEdges = relevantEdges.some((edge) => edge.type !== 'hierarchy');
  const usingHierarchyOnly = !hasRealEdges && allowHierarchyFallback;
  if (usingHierarchyOnly) {
    relevantEdges = allEdges.filter((edge) => edge.type === 'hierarchy');
  }

  for (const edge of relevantEdges) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
    if (!adjacency.has(edge.target)) adjacency.set(edge.target, []);
    adjacency.get(edge.source).push(edge.target);
    adjacency.get(edge.target).push(edge.source);
  }

  // Domain flows expand at most two hops and only into files that themselves
  // show the capability's evidence, which keeps collaborators in and unrelated
  // neighbours out.
  const maxDepth = isDomain ? 2 : 4;
  const queue = seeds.map((id) => ({ id, depth: 0 }));
  while (queue.length && included.size < flowDefinition.maxNodes) {
    const { id: current, depth } = queue.shift();
    if (depth >= maxDepth) continue;

    const neighbors = (adjacency.get(current) || [])
      .map((nodeId) => metadataById.get(nodeId))
      .filter(Boolean)
      .filter((meta) => roleFilter(meta))
      .filter((meta) => {
        if (!isDomain || depth === 0) return true;
        return classifyEvidence(meta, flowDefinition.id).length > 0;
      })
      .sort((left, right) => scoreFlowNode(right) - scoreFlowNode(left));

    for (const neighbor of neighbors) {
      if (included.has(neighbor.id)) continue;
      included.add(neighbor.id);
      queue.push({ id: neighbor.id, depth: depth + 1 });
      if (included.size >= flowDefinition.maxNodes) break;
    }
  }

  const orderedNodes = orderFlowNodes([...included], seeds, metadataById, adjacency);
  const includedSet = new Set(orderedNodes);
  const flowEdges = relevantEdges.filter((edge) => includedSet.has(edge.source) && includedSet.has(edge.target));
  const requiredEdges = requiredEdgeTypes.length
    ? flowEdges.filter((edge) => requiredEdgeTypes.includes(edge.type))
    : flowEdges;
  const requiredEvidenceTypes = evidenceEdgeTypes || requiredEdgeTypes.filter((type) => !SUPPORTING_FLOW_EDGE_TYPES.has(type));
  const evidenceEdges = requiredEvidenceTypes.length
    ? flowEdges.filter((edge) => requiredEvidenceTypes.includes(edge.type))
    : requiredEdges;
  const stageEvidenceCount = orderedNodes.reduce((count, nodeId) => {
    const meta = metadataById.get(nodeId);
    return count + classifyEvidence(meta, flowDefinition.id).length;
  }, 0);
  const evidenceNodes = orderedNodes.filter((nodeId) =>
    classifyEvidence(metadataById.get(nodeId), flowDefinition.id).length > 0);

  // Structural flows still need real edges. Domain flows are already gated on a
  // proven capability, so sparse local edges must not discard a real flow.
  const requiredEdgesOk = requiredEdges.length > 0 || usingHierarchyOnly;
  const evidenceOk = isDomain
    ? evidenceNodes.length > 0
    : requiredEvidenceTypes.length
      ? evidenceEdges.length > 0
      : stageEvidenceCount > 0 || usingHierarchyOnly;

  if (
    orderedNodes.length < minNodes ||
    !evidenceOk ||
    (!isDomain && !requiredEdgesOk)
  ) return null;
  flowEdges.forEach((edge) => edgeKeys.add(`${edge.source}->${edge.target}`));

  const flowRisks = risks.filter((risk) => includedSet.has(risk.fileId) || (risk.relatedFileId && includedSet.has(risk.relatedFileId)));
  const stages = orderedNodes.map((nodeId, index) => {
    const meta = metadataById.get(nodeId);
    return {
      index,
      nodeId,
      label: path.posix.basename(meta.path),
      path: meta.path,
      layer: meta.layer,
      roles: meta.roles,
      architectureRole: meta.roles.join(', ') || meta.layer,
      dependencyCount: meta.resolvedImports.length,
      outboundCalls: meta.calls.length,
      lineNumber: meta.lineNumber,
      functions: meta.declaredSymbols.slice(0, 8),
      imports: meta.imports.map((item) => item.specifier).slice(0, 12),
      exports: meta.exportedSymbols.slice(0, 8),
      calls: meta.calls.slice(0, 12),
      routes: meta.routeDefs.slice(0, 6),
      apiCalls: meta.apiCalls.slice(0, 6),
      evidence: classifyEvidence(meta, flowDefinition.id),
      riskCount: flowRisks.filter((risk) => risk.fileId === nodeId).length,
      summary: `${path.posix.basename(meta.path)} acts in the ${meta.layer} layer.`,
    };
  });

  const layerSet = new Set(stages.map((stage) => stage.layer));
  const sourceFiles = orderedNodes.map((nodeId) => metadataById.get(nodeId)?.path).filter(Boolean);
  const verification = ['Import Graph', 'Dependency Graph'];
  if (stages.some((stage) => stage.functions.length || stage.exports.length)) verification.push('Symbol Resolution');
  if (flowEdges.some((edge) => edge.type.includes('flow') || edge.type.includes('route') || edge.type === 'api-call')) verification.push('Call Graph');
  if (frameworks.length) verification.push('Framework Analysis');
  const evidence = [
    ...new Set([
      ...stages.flatMap((stage) => stage.evidence),
      ...requiredEdges.map((edge) => edge.type),
      ...sourceFiles.slice(0, 6),
    ]),
  ];
  // Confidence must discriminate. The previous formula floored at 62 and
  // saturated at 99 for every flow, which made it meaningless. Score it from
  // how the capability was proven and how much of the flow carries evidence.
  const evidenceCoverage = orderedNodes.length ? evidenceNodes.length / orderedNodes.length : 0;
  const strengthBonus = capabilityStrength === 'strong' ? 22 : capabilityStrength === 'medium' ? 10 : 0;
  const baseScore = isDomain ? 34 : 50;
  const confidence = Math.min(97, Math.round(
    baseScore +
    strengthBonus +
    Math.min(12, verification.length * 3) +
    Math.round(evidenceCoverage * 14) +
    Math.min(6, evidenceEdges.length || requiredEdges.length),
  ));
  const entryPoint = stages[0] || null;
  const exitPoint = stages[stages.length - 1] || null;

  return {
    id: flowDefinition.id,
    type: flowDefinition.label,
    query: flowDefinition.id,
    label: flowDefinition.label,
    keywords: flowDefinition.keywords,
    nodes: orderedNodes,
    edgeKeys: [...edgeKeys],
    stages,
    layers: [...layerSet],
    confidence,
    strength: isDomain ? capabilityStrength : 'structural',
    capabilityReasons: isDomain ? (capability?.reasons || []).slice(0, 4) : [],
    evidenceCoverage: Math.round(evidenceCoverage * 100),
    evidence,
    sourceFiles,
    entryPoint,
    exitPoint,
    intermediateSteps: stages.slice(1, -1),
    framework: frameworks.join(', ') || 'Unable to Verify',
    dependencies: dependencies.filter((dependency) => {
      const needle = dependency.toLowerCase();
      return stages.some((stage) => stage.imports.some((specifier) => specifier.toLowerCase().includes(needle)));
    }).slice(0, 12),
    relatedModules: [...layerSet],
    verification,
    evidenceEdgeCount: evidenceEdges.length,
    requiredEdgeCount: requiredEdges.length,
    executionSequence: stages.map((stage) => stage.label),
    explanation: `The detected ${flowDefinition.label} starts at ${entryPoint?.path || 'Unable to Verify'} and follows scanner-confirmed graph edges through ${stages.length} source files before reaching ${exitPoint?.path || 'Unable to Verify'}.`,
    risks: flowRisks.slice(0, 12),
    riskCount: flowRisks.length,
    deadCodeCount: flowRisks.filter((risk) => risk.kind === 'dead-code').length,
    brokenCount: flowRisks.filter((risk) => risk.severity === 'high').length,
    summary: `${flowDefinition.label} is backed by ${evidence.length} evidence signals, ${evidenceEdges.length || requiredEdges.length} verified flow edges, and ${verification.length} verification methods.`,
  };
}

function buildArchitectureIntelligence(files, repoName) {
  const fileIndex = new Set(files.map((file) => normalizePath(file.path)));
  const metadataList = files
    .filter((file) => typeof file.content === 'string')
    .map((file) => {
      const normalizedPath = normalizePath(file.path);
      const ext = path.posix.extname(normalizedPath).toLowerCase();
      // Route, API and import metadata is only meaningful in source files. A
      // Markdown doc with a fenced JavaScript sample (`require('./x.cjs')`) is
      // documentation, not a module graph — it previously produced bogus
      // "route without handler chain" and "unresolved module" risks.
      const isSource = CAPABILITY_SCAN_EXTENSIONS.has(ext);

      const imports = isSource ? extractImportBindings(file.content || '') : [];
      const resolvedImports = [];
      const unresolvedImports = [];

      for (const imported of imports) {
        const target = resolveModuleTarget(normalizedPath, imported.specifier, fileIndex);
        if (target) {
          resolvedImports.push({ ...imported, target });
        } else if ((imported.specifier.startsWith('.') || imported.specifier.startsWith('/'))
          && !isNonCodeAssetSpecifier(imported.specifier)) {
          unresolvedImports.push(imported.specifier);
        }
      }

      // `code` is the content with comments and string literals removed, so
      // keyword matching cannot be fooled by prose, labels or the analyzer's
      // own keyword tables.
      const code = stripCommentsAndStrings(file.content || '');
      const roles = inferRoles(file, code);
      const layer = pickLayer(roles);

      return {
        id: fileId(normalizedPath),
        path: normalizedPath,
        content: file.content || '',
        code,
        label: path.posix.basename(normalizedPath),
        ext,
        roles,
        layer,
        imports,
        resolvedImports,
        unresolvedImports,
        declaredSymbols: extractDeclaredSymbols(file.content || ''),
        exportedSymbols: extractExportedSymbols(file.content || ''),
        calls: extractCalledTokens(file.content || ''),
        jsxUsages: extractJsxUsages(file.content || ''),
        routeDefs: isSource ? extractRouteDefinitions(file.content || '') : [],
        apiCalls: isSource ? extractApiCalls(file.content || '') : [],
        hasAuthSignal: CAPABILITY_RULES.auth.code.some((pattern) => pattern.test(code)),
        hasDbSignal: CAPABILITY_RULES.db.code.some((pattern) => pattern.test(code)),
      };
    });

  const metadataById = new Map(metadataList.map((meta) => [meta.id, meta]));
  const metadataByPath = new Map(metadataList.map((meta) => [meta.path, meta]));
  const symbolIndex = new Map();
  const routeDefs = [];
  const edgeAccumulator = createEdgeAccumulator();
  const risks = [];
  const riskKeys = new Set();

  for (const meta of metadataList) {
    meta.lineNumber = lineNumberFor(meta.content || '', [
      /(?:app|router)\.(get|post|put|patch|delete|options|head|use)\s*\(/,
      /function\s+[A-Za-z_$][\w$]*\s*\(/,
      /class\s+[A-Za-z_$][\w$]*\s+/,
      /(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=/,
      /import\s+[\s\S]*?\s+from\s+['"][^'"]+['"]/,
      /require\(\s*['"][^'"]+['"]\s*\)/,
    ]);
  }

  for (const meta of metadataList) {
    for (const symbol of [...meta.declaredSymbols, ...meta.exportedSymbols]) {
      if (!symbolIndex.has(symbol)) symbolIndex.set(symbol, new Set());
      symbolIndex.get(symbol).add(meta.id);
    }

    for (const unresolved of meta.unresolvedImports) {
      // Find the exact import statement that references this unresolved module
      const matchingImport = meta.imports.find(imp => imp.specifier === unresolved);
      addRisk(risks, riskKeys, {
        kind: 'unresolved-import',
        severity: 'high',
        fileId: meta.id,
        message: `Unresolved module: ${unresolved}`,
        importSpecifier: unresolved,
        importType: matchingImport?.type || 'unknown',
        importBindings: matchingImport?.bindings?.map(b => b.local || b.imported).slice(0, 5) || [],
        declaredSymbols: meta.declaredSymbols.slice(0, 10),
        exportedSymbols: meta.exportedSymbols.slice(0, 10),
        roles: meta.roles,
        layer: meta.layer,
        lineNumber: meta.lineNumber || null,
      });
    }

    for (const routeDef of meta.routeDefs) {
      routeDefs.push({ ...routeDef, fileId: meta.id, path: routeDef.path || '' });
    }
  }

  for (const meta of metadataList) {
    for (const resolvedImport of meta.resolvedImports) {
      const targetId = fileId(resolvedImport.target);
      if (resolvedImport.type === 'dynamic') {
        edgeAccumulator.add(meta.id, targetId, 'dynamic-import');
      } else if (resolvedImport.type === 're-export') {
        edgeAccumulator.add(meta.id, targetId, 're-export');
      }

      const importedLocals = new Set(resolvedImport.bindings.map((binding) => binding.local));
      const importedRoots = new Set([...importedLocals].map((local) => local.split('.')[0]));
      const targetMeta = metadataByPath.get(resolvedImport.target);
      const calledRoots = new Set(meta.calls.map((token) => token.split('.')[0]));

      let callMatched = false;
      for (const binding of importedLocals) {
        if (meta.calls.some((token) => token === binding || token.startsWith(`${binding}.`))) {
          callMatched = true;
          break;
        }
      }

      if (!callMatched && targetMeta) {
        const exported = new Set(targetMeta.exportedSymbols);
        const declared = new Set(targetMeta.declaredSymbols);
        callMatched = [...calledRoots].some((token) => exported.has(token) || declared.has(token) || importedRoots.has(token));
      }

      if (callMatched) {
        edgeAccumulator.add(meta.id, targetId, 'function-call');
      }

      if (targetMeta?.roles.includes('service') || targetMeta?.roles.includes('repository') || targetMeta?.roles.includes('controller')) {
        edgeAccumulator.add(meta.id, targetId, 'service-flow');
      }

      if (targetMeta?.roles.includes('state') || meta.roles.includes('state')) {
        edgeAccumulator.add(meta.id, targetId, 'state-flow');
      }

      if (targetMeta?.roles.includes('component') && meta.jsxUsages.some((token) => importedLocals.has(token))) {
        edgeAccumulator.add(meta.id, targetId, 'component-flow');
      }

      if (targetMeta?.roles.includes('middleware') || targetMeta?.roles.includes('routing')) {
        edgeAccumulator.add(meta.id, targetId, 'routing-flow');
      }

      if (meta.roles.includes('auth') || targetMeta?.roles.includes('auth')) {
        edgeAccumulator.add(meta.id, targetId, 'auth-flow');
      }

      if (meta.roles.includes('database') || targetMeta?.roles.includes('database')) {
        edgeAccumulator.add(meta.id, targetId, 'database-flow');
      }

      if (meta.roles.includes('startup') || targetMeta?.roles.includes('startup') || meta.roles.includes('config')) {
        edgeAccumulator.add(meta.id, targetId, 'startup-flow');
      }

      if (meta.roles.includes('event') || targetMeta?.roles.includes('event')) {
        edgeAccumulator.add(meta.id, targetId, 'event-flow');
      }

      if (meta.roles.includes('ai') || targetMeta?.roles.includes('ai')) {
        edgeAccumulator.add(meta.id, targetId, 'ai-flow');
      }

      if (meta.roles.includes('payment') || targetMeta?.roles.includes('payment')) {
        edgeAccumulator.add(meta.id, targetId, 'payment-flow');
      }

      if (meta.roles.includes('cache') || targetMeta?.roles.includes('cache')) {
        edgeAccumulator.add(meta.id, targetId, 'cache-flow');
      }

      if (meta.roles.includes('error') || targetMeta?.roles.includes('error')) {
        edgeAccumulator.add(meta.id, targetId, 'error-flow');
      }

      if (meta.roles.includes('websocket') || targetMeta?.roles.includes('websocket')) {
        edgeAccumulator.add(meta.id, targetId, 'websocket-flow');
      }

      if (meta.roles.includes('microservice') || targetMeta?.roles.includes('microservice')) {
        edgeAccumulator.add(meta.id, targetId, 'microservice-flow');
      }
    }
  }

  for (const routeDef of routeDefs) {
    for (const handler of routeDef.handlers) {
      const possibleTargets = [...(symbolIndex.get(handler) || [])].filter((targetId) => targetId !== routeDef.fileId);
      for (const targetId of possibleTargets.slice(0, 2)) {
        const targetMeta = metadataById.get(targetId);
        if (!targetMeta) continue;
        const edgeType = targetMeta.roles.includes('middleware') ? 'route-middleware' : 'route-handler';
        edgeAccumulator.add(routeDef.fileId, targetId, edgeType, { method: routeDef.method, path: routeDef.path });
      }
    }
  }

  const routeCandidates = routeDefs.filter((routeDef) => routeDef.path && routeDef.path !== 'middleware');
  for (const meta of metadataList) {
    for (const apiCall of meta.apiCalls) {
      const matchedRoute = routeCandidates.find((routeDef) => matchRoutePath(apiCall.path, routeDef.path));
      if (matchedRoute) {
        edgeAccumulator.add(meta.id, matchedRoute.fileId, 'api-call', { method: apiCall.method, path: apiCall.path });
      } else if (apiCall.path && apiCall.path.startsWith('/')) {
        addRisk(risks, riskKeys, {
          kind: 'unmatched-api-call',
          severity: 'high',
          fileId: meta.id,
          message: `No backend route matched ${apiCall.path}`,
        });
      }
    }
  }

  for (const meta of metadataList) {
    const hasRouteChain = edgeAccumulator.edges.some(
      (edge) => edge.source === meta.id && (edge.type === 'route-handler' || edge.type === 'route-middleware'),
    );

    if (meta.routeDefs.length && !hasRouteChain) {
      // Only a real problem when the route names a handler that resolves
      // nowhere in the repository. Inline handlers (`app.get('/', (req, res)
      // => …)`) produce no named token and are entirely normal — flagging them
      // accounted for nearly every "route without handler chain" false positive.
      const namedHandlers = meta.routeDefs.flatMap((routeDef) => routeDef.handlers || []);
      const unresolvedHandlers = namedHandlers.filter((handler) => !symbolIndex.has(handler));

      if (namedHandlers.length > 0 && unresolvedHandlers.length === namedHandlers.length) {
        addRisk(risks, riskKeys, {
          kind: 'route-without-handler-chain',
          severity: 'medium',
          fileId: meta.id,
          message: `Route handler(s) could not be resolved in this repository: ${[...new Set(unresolvedHandlers)].slice(0, 4).join(', ')}`,
        });
      }
    }

    if (meta.roles.includes('auth') && !edgeAccumulator.edges.some((edge) => edge.source === meta.id || edge.target === meta.id)) {
      addRisk(risks, riskKeys, {
        kind: 'isolated-auth',
        severity: 'medium',
        fileId: meta.id,
        message: 'Authentication file looks isolated from the wider request pipeline.',
      });
    }
  }

  const cycles = detectCircularDependencies(metadataList);
  for (const cycle of cycles) {
    for (const nodeId of cycle) {
      addRisk(risks, riskKeys, {
        kind: 'circular-dependency',
        severity: 'high',
        fileId: nodeId,
        message: `Circular dependency detected in ${cycle.length}-node chain.`,
      });
    }
  }

  const inbound = new Map();
  const outbound = new Map();
  for (const edge of edgeAccumulator.edges) {
    outbound.set(edge.source, (outbound.get(edge.source) || 0) + 1);
    inbound.set(edge.target, (inbound.get(edge.target) || 0) + 1);
  }

  for (const meta of metadataList) {
    const isCodeFile = CODE_EXTENSIONS.has(meta.ext);
    // Test suites, CLI scripts and shebang files are executed directly rather
    // than imported, so "no inbound references" is expected — not dead code.
    const isTestFile = /(^|\/)(test|tests|__tests__|spec|specs|e2e)\//.test(meta.path)
      || /(^|\/)(test|spec)[-_.]/.test(meta.path)
      || /\.(test|spec)\.[cm]?[jt]sx?$/.test(meta.path);
    const isExecutableEntry = /(^|\/)(bin|scripts|cmd|tools)\//.test(meta.path)
      || (meta.content || '').startsWith('#!');
    const entryLike = meta.roles.includes('startup')
      || meta.roles.includes('config')
      || isTestFile
      || isExecutableEntry
      || /(^|\/)(index|main|app|server|page|layout)\./.test(meta.path);
    const inboundCount = inbound.get(meta.id) || 0;
    const outboundCount = outbound.get(meta.id) || 0;
    const isolated = inboundCount === 0 && outboundCount === 0;
    const isStandalone = meta.ext && !['.js', '.ts', '.jsx', '.tsx', '.py', '.mjs', '.cjs'].includes(meta.ext);
    // Files referenced in HTML via <script> tags are not dead. Metadata carries
    // `label`, not `name` — reading `.name` made this check a silent no-op.
    const isScriptRef = metadataList.some(m => m.ext === '.html' && (m.content || '').includes(meta.label));
    const hasExports = meta.exportedSymbols && meta.exportedSymbols.length > 0;
    const orphan = inboundCount === 0 && !entryLike && (meta.roles.includes('component') || meta.roles.includes('service') || meta.roles.includes('repository'));

    if (isCodeFile && !entryLike && !isStandalone && !hasExports && !isScriptRef && (isolated || orphan)) {
      addRisk(risks, riskKeys, {
        kind: 'dead-code',
        severity: isolated ? 'high' : 'medium',
        fileId: meta.id,
        message: isolated
          ? 'File is disconnected from the graph and looks unused.'
          : 'File has no inbound references and may be orphaned or dead.',
        declaredSymbols: meta.declaredSymbols.slice(0, 10),
        exportedSymbols: meta.exportedSymbols.slice(0, 10),
        roles: meta.roles,
        layer: meta.layer,
        lineNumber: meta.lineNumber || null,
        inboundCount,
        outboundCount,
      });
    }

    if (meta.roles.includes('database') && inboundCount === 0 && !entryLike) {
      addRisk(risks, riskKeys, {
        kind: 'unreachable-data-layer',
        severity: 'medium',
        fileId: meta.id,
        message: 'Database layer appears to have no inbound application flow.',
        declaredSymbols: meta.declaredSymbols.slice(0, 10),
        roles: meta.roles,
        layer: meta.layer,
      });
    }
  }

  const nodeAnnotations = {};
  for (const meta of metadataList) {
    const nodeRisks = risks.filter((risk) => risk.fileId === meta.id);
    const dead = nodeRisks.some((risk) => risk.kind === 'dead-code');
    const broken = nodeRisks.some((risk) => risk.severity === 'high');
    nodeAnnotations[meta.id] = {
      layer: meta.layer,
      roles: meta.roles,
      status: dead ? 'dead' : broken ? 'broken' : nodeRisks.length ? 'warning' : 'healthy',
      riskCount: nodeRisks.length,
      riskLabels: nodeRisks.map((risk) => risk.kind),
      architectureRole: meta.roles.join(', ') || meta.layer,
    };
  }

  const frameworks = detectFrameworks(metadataList, files);
  const dependencies = summarizeDependencies(metadataList, files);

  // Which capabilities this repository actually has. Domain flows are gated on
  // this so an invented flow can never be reported.
  const capabilities = detectCapabilities(metadataList, dependencies);

  const flowContext = { frameworks, dependencies };

  const flows = FLOW_LIBRARY
    .map((definition) => {
      const isDomain = DOMAIN_FLOW_IDS.has(definition.id);
      // Spread first so the explicit per-flow options below always win.
      const domainOptions = {
        capability: capabilities[definition.id] || null,
        isDomain,
        includeAllSeeds: isDomain,
        allowHierarchyFallback: !isDomain,
      };

      if (definition.id === 'application') {
        return buildFlow(definition, metadataList, metadataById, edgeAccumulator.edges, risks, {
          ...domainOptions,
          roleFilter: (meta) => (!meta.roles.includes('config') || meta.roles.includes('startup')) && (meta.ext && CODE_EXTENSIONS.has(meta.ext) || meta.ext === '.html'),
          seedFilter: (meta) => meta.roles.includes('startup') || meta.roles.includes('routing') || meta.roles.includes('controller') || meta.roles.includes('component') || meta.roles.includes('frontend') || meta.roles.includes('backend') || meta.roles.includes('source'),
          requiredEdgeTypes: ['startup-flow', 'routing-flow', 'component-flow', 'service-flow', 'function-call', 'dynamic-import', 'hierarchy'],
          // The whole-application view spans every layer, so any real structural
          // edge counts as evidence. Demanding one specific edge type made this
          // flow disappear on projects that use a different wiring style.
          evidenceEdgeTypes: ['dependency', 'dynamic-import', 'function-call', 'service-flow', 'startup-flow', 'routing-flow', 'component-flow', 'hierarchy'],
          ...flowContext,
        });
      }

      if (definition.id === 'auth') {
        return buildFlow(definition, metadataList, metadataById, edgeAccumulator.edges, risks, {
          ...domainOptions,
          roleFilter: (meta) => meta.roles.some((role) => ['auth', 'routing', 'controller', 'service', 'repository', 'database', 'middleware', 'component', 'frontend', 'api'].includes(role)),
          seedFilter: (meta) => meta.roles.includes('auth'),
          requiredEdgeTypes: ['auth-flow', 'route-middleware', 'route-handler', 'function-call'],
          ...flowContext,
        });
      }

      if (definition.id === 'api') {
        return buildFlow(definition, metadataList, metadataById, edgeAccumulator.edges, risks, {
          ...domainOptions,
          roleFilter: (meta) => meta.roles.some((role) => ['api', 'routing', 'controller', 'service', 'repository', 'middleware', 'component', 'frontend', 'backend', 'database'].includes(role)),
          seedFilter: (meta) => meta.apiCalls.length > 0 || meta.routeDefs.length > 0 || meta.roles.includes('controller'),
          requiredEdgeTypes: ['api-call', 'route-handler', 'route-middleware', 'routing-flow', 'service-flow', 'function-call'],
          ...flowContext,
        });
      }

      if (definition.id === 'db') {
        return buildFlow(definition, metadataList, metadataById, edgeAccumulator.edges, risks, {
          ...domainOptions,
          roleFilter: (meta) => meta.roles.some((role) => ['database', 'repository', 'service', 'controller', 'api', 'middleware', 'auth'].includes(role)),
          seedFilter: (meta) => meta.roles.includes('database') || meta.roles.includes('repository'),
          requiredEdgeTypes: ['database-flow', 'service-flow', 'function-call'],
          ...flowContext,
        });
      }

      if (definition.id === 'state') {
        return buildFlow(definition, metadataList, metadataById, edgeAccumulator.edges, risks, {
          ...domainOptions,
          roleFilter: (meta) => meta.roles.some((role) => ['state', 'component', 'frontend', 'api'].includes(role)),
          seedFilter: (meta) => meta.roles.includes('state'),
          requiredEdgeTypes: ['state-flow', 'component-flow', 'function-call'],
          ...flowContext,
        });
      }

      if (definition.id === 'routing') {
        return buildFlow(definition, metadataList, metadataById, edgeAccumulator.edges, risks, {
          ...domainOptions,
          roleFilter: (meta) => meta.roles.some((role) => ['routing', 'middleware', 'controller', 'api', 'frontend', 'backend'].includes(role)),
          seedFilter: (meta) => meta.roles.includes('routing') || meta.routeDefs.length > 0 || meta.roles.includes('middleware'),
          requiredEdgeTypes: ['routing-flow', 'route-handler', 'route-middleware', 'api-call'],
          ...flowContext,
        });
      }

      if (definition.id === 'component') {
        return buildFlow(definition, metadataList, metadataById, edgeAccumulator.edges, risks, {
          ...domainOptions,
          roleFilter: (meta) => meta.roles.some((role) => ['component', 'frontend', 'state', 'api'].includes(role)),
          seedFilter: (meta) => meta.roles.includes('component') || meta.jsxUsages.length > 0,
          requiredEdgeTypes: ['component-flow', 'state-flow', 'api-call', 'function-call'],
          ...flowContext,
        });
      }

      if (definition.id === 'startup') {
        return buildFlow(definition, metadataList, metadataById, edgeAccumulator.edges, risks, {
          ...domainOptions,
          roleFilter: (meta) => meta.roles.some((role) => ['startup', 'config', 'routing', 'middleware', 'backend', 'frontend', 'api'].includes(role)),
          seedFilter: (meta) => meta.roles.includes('startup') || meta.roles.includes('config'),
          requiredEdgeTypes: ['startup-flow', 'dynamic-import', 'function-call', 'routing-flow'],
          ...flowContext,
        });
      }

      if (definition.id === 'event') {
        return buildFlow(definition, metadataList, metadataById, edgeAccumulator.edges, risks, {
          ...domainOptions,
          roleFilter: (meta) => meta.roles.some((role) => ['event', 'component', 'frontend', 'api', 'state'].includes(role)),
          seedFilter: (meta) => meta.roles.includes('event'),
          requiredEdgeTypes: ['event-flow', 'component-flow', 'state-flow', 'function-call'],
          ...flowContext,
        });
      }

      if (definition.id === 'payment') {
        return buildFlow(definition, metadataList, metadataById, edgeAccumulator.edges, risks, {
          ...domainOptions,
          roleFilter: (meta) => meta.roles.some((role) => ['payment', 'api', 'routing', 'controller', 'service', 'repository', 'database', 'frontend'].includes(role)),
          seedFilter: (meta) => meta.roles.includes('payment'),
          requiredEdgeTypes: ['payment-flow', 'route-handler', 'api-call', 'service-flow', 'function-call'],
          ...flowContext,
        });
      }

      if (definition.id === 'cache') {
        return buildFlow(definition, metadataList, metadataById, edgeAccumulator.edges, risks, {
          ...domainOptions,
          roleFilter: (meta) => meta.roles.some((role) => ['cache', 'database', 'service', 'controller', 'api', 'infrastructure'].includes(role)),
          seedFilter: (meta) => meta.roles.includes('cache'),
          requiredEdgeTypes: ['cache-flow', 'database-flow', 'service-flow', 'function-call'],
          ...flowContext,
        });
      }

      if (definition.id === 'error') {
        return buildFlow(definition, metadataList, metadataById, edgeAccumulator.edges, risks, {
          ...domainOptions,
          roleFilter: (meta) => meta.roles.some((role) => ['error', 'middleware', 'api', 'controller', 'service', 'backend', 'frontend'].includes(role)),
          seedFilter: (meta) => meta.roles.includes('error'),
          requiredEdgeTypes: ['error-flow', 'route-middleware', 'service-flow', 'function-call'],
          ...flowContext,
        });
      }

      if (definition.id === 'websocket') {
        return buildFlow(definition, metadataList, metadataById, edgeAccumulator.edges, risks, {
          ...domainOptions,
          roleFilter: (meta) => meta.roles.some((role) => ['websocket', 'event', 'api', 'service', 'frontend', 'backend'].includes(role)),
          seedFilter: (meta) => meta.roles.includes('websocket'),
          requiredEdgeTypes: ['websocket-flow', 'event-flow', 'service-flow', 'function-call'],
          ...flowContext,
        });
      }

      if (definition.id === 'microservice') {
        return buildFlow(definition, metadataList, metadataById, edgeAccumulator.edges, risks, {
          ...domainOptions,
          roleFilter: (meta) => meta.roles.some((role) => ['microservice', 'infrastructure', 'api', 'controller', 'service', 'backend'].includes(role)),
          seedFilter: (meta) => meta.roles.includes('microservice'),
          requiredEdgeTypes: ['microservice-flow', 'service-flow', 'api-call', 'function-call'],
          ...flowContext,
        });
      }

      if (definition.id === 'ai') {
        return buildFlow(definition, metadataList, metadataById, edgeAccumulator.edges, risks, {
          ...domainOptions,
          roleFilter: (meta) => meta.roles.some((role) => ['ai', 'service', 'api', 'database'].includes(role)),
          seedFilter: (meta) => meta.roles.includes('ai'),
          requiredEdgeTypes: ['ai-flow', 'service-flow', 'api-call', 'function-call'],
          ...flowContext,
        });
      }

      return null;
    })
    .filter(Boolean)
    .sort((left, right) => right.confidence - left.confidence || right.nodes.length - left.nodes.length);

  const layerSummary = {};
  for (const meta of metadataList) {
    layerSummary[meta.layer] = (layerSummary[meta.layer] || 0) + 1;
  }

  const deadNodeIds = Object.entries(nodeAnnotations).filter(([, value]) => value.status === 'dead').map(([nodeId]) => nodeId);
  const brokenNodeIds = Object.entries(nodeAnnotations).filter(([, value]) => value.status === 'broken').map(([nodeId]) => nodeId);

  return {
    nodeAnnotations,
    semanticEdges: edgeAccumulator.edges,
    risks,
    deadNodeIds,
    brokenNodeIds,
    flows: {
      available: flows,
      searchIndex: flows.map((flow) => ({
        id: flow.id,
        label: flow.label,
        keywords: flow.keywords,
        summary: flow.summary,
      })),
    },
    summary: {
      layerSummary,
      deadCodeCount: deadNodeIds.length,
      brokenPipelineCount: brokenNodeIds.length,
      unresolvedImportCount: risks.filter((risk) => risk.kind === 'unresolved-import').length,
      unmatchedApiCount: risks.filter((risk) => risk.kind === 'unmatched-api-call').length,
      circularDependencyCount: risks.filter((risk) => risk.kind === 'circular-dependency').length,
      nodeCount: metadataList.length,
      repoName,
    },
  };
}

module.exports = {
  buildArchitectureIntelligence,
  // Exported for tests: route extraction is easier to check directly than
  // through a full flow, which needs enough files to seed one.
  extractRouteDefinitions,
};
