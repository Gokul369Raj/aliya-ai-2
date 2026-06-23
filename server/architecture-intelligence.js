const path = require('path');

const { IMPORTABLE_EXTENSIONS } = require('./constants');

const FLOW_LIBRARY = [
  { id: 'full', label: 'Full Project Pipeline', keywords: ['full', 'project', 'pipeline', 'architecture', 'system', 'repo'], maxNodes: 300 },
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
]);

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

function resolveModuleTarget(fromRelativePath, specifier, fileIndex) {
  if (!specifier) return null;

  if (specifier.startsWith('.')) {
    const baseDir = path.posix.dirname(fromRelativePath);
    const joined = path.posix.normalize(path.posix.join(baseDir, specifier));
    const candidates = IMPORTABLE_EXTENSIONS.flatMap((ext) => [
      `${joined}${ext}`,
      path.posix.join(joined, `index${ext}`),
    ]);
    return candidates.find((candidate) => fileIndex.has(candidate)) || null;
  }

  if (specifier.startsWith('/')) {
    const joined = path.posix.normalize(specifier.slice(1));
    const candidates = IMPORTABLE_EXTENSIONS.flatMap((ext) => [
      `${joined}${ext}`,
      path.posix.join(joined, `index${ext}`),
    ]);
    return candidates.find((candidate) => fileIndex.has(candidate)) || null;
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

function extractRouteDefinitions(content) {
  const routes = [];
  const routePattern = /(?:app|router)\.(get|post|put|patch|delete|options|head|use)\s*\(([\s\S]*?)\)/g;
  let match;

  while ((match = routePattern.exec(content)) !== null) {
    const method = match[1];
    const args = match[2];
    const pathMatch = args.match(/['"`]([^'"`]+)['"`]/);
    const handlerTokens = Array.from(args.matchAll(/\b([A-Za-z_$][\w$]*)\b/g))
      .map((item) => item[1])
      .filter((token) => !['app', 'router', 'req', 'res', 'next'].includes(token));

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

function inferRoles(file) {
  const roles = new Set();
  const filePath = lower(file.path);
  const content = lower(file.content || '');
  const ext = path.posix.extname(file.path).toLowerCase();

  if (hasAny(filePath, ['component', 'components', '/ui/', '/pages/', '/views/']) || ['.jsx', '.tsx', '.vue', '.svelte'].includes(ext)) roles.add('component');
  if (hasAny(filePath, ['route', 'router']) || /(app|router)\.(get|post|put|patch|delete|use)\s*\(/.test(content)) roles.add('routing');
  if (hasAny(filePath, ['controller', 'handler']) || /(?:req,\s*res|request,\s*response)/.test(content)) roles.add('controller');
  if (hasAny(filePath, ['service', 'services']) || /class\s+\w+service\b|function\s+\w+service\b/.test(content)) roles.add('service');
  if (hasAny(filePath, ['repository', 'repositories', 'dao']) || /prisma\.|mongoose|sequelize|knex|typeorm|query\(/.test(content)) roles.add('repository');
  if (hasAny(filePath, ['middleware', 'guard']) || /\bnext\s*\)|app\.use\(|router\.use\(/.test(content)) roles.add('middleware');
  if (hasAny(filePath, ['auth', 'login', 'register', 'session']) || /jwt\.|passport|oauth|token|refreshToken|signin|signout|authorize/.test(content)) roles.add('auth');
  if (hasAny(filePath, ['db', 'database', 'schema', 'model', 'migration', 'prisma']) || /prisma\.|mongoose|sequelize|knex|sql|mongodb|postgres|mysql/.test(content)) roles.add('database');
  if (hasAny(filePath, ['cache', 'redis']) || /redis|memcached|cache/.test(content)) roles.add('cache');
  if (hasAny(filePath, ['payment', 'stripe', 'paypal', 'razorpay']) || /stripe|paypal|razorpay|checkout|payment/.test(content)) roles.add('payment');
  if (hasAny(filePath, ['error', 'exception', 'catch']) || /try.*catch|throw new error|errorhandler/.test(content)) roles.add('error');
  if (hasAny(filePath, ['socket', 'ws', 'realtime']) || /socket\.io|new\s+websocket|ws/.test(content)) roles.add('websocket');
  if (hasAny(filePath, ['microservice', 'worker', 'queue', 'kafka']) || /kafka|rabbitmq|sqs|bullmq|pubsub/.test(content)) roles.add('microservice');
  if (hasAny(filePath, ['store', 'redux', 'zustand', 'context']) || /createslice|configurestore|createcontext|usecontext|dispatch\(|setstate\(/.test(content)) roles.add('state');
  if (hasAny(filePath, ['api', '/client/', '/src/']) || /axios\.|fetch\(|graphql|usequery|usemutation/.test(content)) roles.add('api');
  if (hasAny(filePath, ['event', 'listener']) || /onclick|addeventlistener|emit\(|on\(|subscribe\(/.test(content)) roles.add('event');
  if (hasAny(filePath, ['config', '.env', 'package.json', 'tsconfig', 'vite.config', 'next.config']) || /process\.env|import\.meta\.env|dotenv/.test(content)) roles.add('config');
  if (hasAny(filePath, ['queue', 'kafka', 'redis', 'bull', 'rabbit', 'worker']) || /kafka|redis|bullmq|sqs|pubsub/.test(content)) roles.add('infrastructure');
  if (hasAny(filePath, ['llm', 'prompt', 'embedding', 'vector', 'rag', 'openai']) || /openai|embedding|vector|langchain|retriever|rag/.test(content)) roles.add('ai');
  if (hasAny(filePath, ['index.', 'main.', 'app.', 'server.', 'bootstrap', 'entry']) || /createroot\(|reactdom\.render|app\.listen|express\(|fastify\(|nestfactory|new\s+apollo/.test(content)) roles.add('startup');
  if (hasAny(filePath, ['util', 'helper', 'common', 'shared'])) roles.add('utils');

  if (filePath.startsWith('server/') || filePath.startsWith('backend/')) roles.add('backend');
  if (filePath.startsWith('client/') || filePath.startsWith('src/') || filePath.startsWith('public/')) roles.add('frontend');

  if (!roles.size && CODE_EXTENSIONS.has(ext)) {
    roles.add('utils');
  }

  return [...roles];
}

function pickLayer(roles) {
  const roleSet = new Set(roles);
  if (roleSet.has('auth')) return 'auth';
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

function buildFlow(flowDefinition, metadataList, metadataById, allEdges, risks, { roleFilter, seedFilter }) {
  const filtered = metadataList.filter((meta) => roleFilter(meta));
  if (!filtered.length) return null;

  const rankedSeeds = filtered
    .filter((meta) => seedFilter(meta))
    .sort((left, right) => scoreFlowNode(right) - scoreFlowNode(left));

  const seeds = (rankedSeeds.length ? rankedSeeds : filtered)
    .slice(0, Math.min(6, filtered.length))
    .map((meta) => meta.id);

  const included = new Set(seeds);
  const edgeKeys = new Set();
  const adjacency = new Map();
  const relevantEdges = allEdges.filter((edge) => FLOW_EDGE_TYPES.has(edge.type));

  for (const edge of relevantEdges) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
    if (!adjacency.has(edge.target)) adjacency.set(edge.target, []);
    adjacency.get(edge.source).push(edge.target);
    adjacency.get(edge.target).push(edge.source);
  }

  const queue = [...seeds];
  while (queue.length && included.size < flowDefinition.maxNodes) {
    const current = queue.shift();
    const neighbors = (adjacency.get(current) || [])
      .map((nodeId) => metadataById.get(nodeId))
      .filter(Boolean)
      .filter((meta) => roleFilter(meta))
      .sort((left, right) => scoreFlowNode(right) - scoreFlowNode(left));

    for (const neighbor of neighbors) {
      if (included.has(neighbor.id)) continue;
      included.add(neighbor.id);
      queue.push(neighbor.id);
      if (included.size >= flowDefinition.maxNodes) break;
    }
  }

  const orderedNodes = orderFlowNodes([...included], seeds, metadataById, adjacency);
  const includedSet = new Set(orderedNodes);
  const flowEdges = relevantEdges.filter((edge) => includedSet.has(edge.source) && includedSet.has(edge.target));
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
      riskCount: flowRisks.filter((risk) => risk.fileId === nodeId).length,
      summary: `${path.posix.basename(meta.path)} acts in the ${meta.layer} layer.`,
    };
  });

  const layerSet = new Set(stages.map((stage) => stage.layer));
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
    risks: flowRisks.slice(0, 12),
    riskCount: flowRisks.length,
    deadCodeCount: flowRisks.filter((risk) => risk.kind === 'dead-code').length,
    brokenCount: flowRisks.filter((risk) => risk.severity === 'high').length,
    summary: `${flowDefinition.label} spans ${orderedNodes.length} architecture nodes across ${layerSet.size} layers.`,
  };
}

function buildArchitectureIntelligence(files, repoName) {
  const fileIndex = new Set(files.map((file) => normalizePath(file.path)));
  const metadataList = files
    .filter((file) => typeof file.content === 'string')
    .map((file) => {
      const normalizedPath = normalizePath(file.path);
      const imports = extractImportBindings(file.content || '');
      const resolvedImports = [];
      const unresolvedImports = [];

      for (const imported of imports) {
        const target = resolveModuleTarget(normalizedPath, imported.specifier, fileIndex);
        if (target) {
          resolvedImports.push({ ...imported, target });
        } else if (imported.specifier.startsWith('.') || imported.specifier.startsWith('/')) {
          unresolvedImports.push(imported.specifier);
        }
      }

      const roles = inferRoles(file);
      const layer = pickLayer(roles);

      return {
        id: fileId(normalizedPath),
        path: normalizedPath,
        label: path.posix.basename(normalizedPath),
        ext: path.posix.extname(normalizedPath).toLowerCase(),
        roles,
        layer,
        imports,
        resolvedImports,
        unresolvedImports,
        declaredSymbols: extractDeclaredSymbols(file.content || ''),
        exportedSymbols: extractExportedSymbols(file.content || ''),
        calls: extractCalledTokens(file.content || ''),
        jsxUsages: extractJsxUsages(file.content || ''),
        routeDefs: extractRouteDefinitions(file.content || ''),
        apiCalls: extractApiCalls(file.content || ''),
        hasAuthSignal: /jwt\.|passport|oauth|token|session|cookie/.test(lower(file.content)),
        hasDbSignal: /prisma\.|mongoose|sequelize|knex|query\(|sql|mongodb|redis/.test(lower(file.content)),
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
    for (const symbol of [...meta.declaredSymbols, ...meta.exportedSymbols]) {
      if (!symbolIndex.has(symbol)) symbolIndex.set(symbol, new Set());
      symbolIndex.get(symbol).add(meta.id);
    }

    for (const unresolved of meta.unresolvedImports) {
      addRisk(risks, riskKeys, {
        kind: 'unresolved-import',
        severity: 'high',
        fileId: meta.id,
        message: `Unresolved module: ${unresolved}`,
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
    if (meta.routeDefs.length && !edgeAccumulator.edges.some((edge) => edge.source === meta.id && (edge.type === 'route-handler' || edge.type === 'route-middleware'))) {
      addRisk(risks, riskKeys, {
        kind: 'route-without-handler-chain',
        severity: 'medium',
        fileId: meta.id,
        message: 'Route file appears to register endpoints without a linked handler or middleware chain.',
      });
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
    const entryLike = meta.roles.includes('startup') || meta.roles.includes('config') || /(^|\/)(index|main|app|server|page|layout)\./.test(meta.path);
    const inboundCount = inbound.get(meta.id) || 0;
    const outboundCount = outbound.get(meta.id) || 0;
    const isolated = inboundCount === 0 && outboundCount === 0;
    const orphan = inboundCount === 0 && !entryLike && (meta.roles.includes('component') || meta.roles.includes('service') || meta.roles.includes('repository') || meta.roles.includes('utils'));

    if (isCodeFile && !entryLike && (isolated || orphan)) {
      addRisk(risks, riskKeys, {
        kind: 'dead-code',
        severity: isolated ? 'high' : 'medium',
        fileId: meta.id,
        message: isolated
          ? 'File is disconnected from the graph and looks unused.'
          : 'File has no inbound references and may be orphaned or dead.',
      });
    }

    if (meta.roles.includes('database') && inboundCount === 0 && !entryLike) {
      addRisk(risks, riskKeys, {
        kind: 'unreachable-data-layer',
        severity: 'medium',
        fileId: meta.id,
        message: 'Database layer appears to have no inbound application flow.',
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

  const flows = FLOW_LIBRARY
    .map((definition) => {
      if (definition.id === 'full') {
        return buildFlow(definition, metadataList, metadataById, edgeAccumulator.edges, risks, {
          roleFilter: (meta) => !meta.roles.includes('config') || meta.roles.includes('startup'),
          seedFilter: (meta) => meta.roles.includes('startup') || meta.roles.includes('routing') || meta.roles.includes('controller') || meta.roles.includes('component'),
        });
      }

      if (definition.id === 'auth') {
        return buildFlow(definition, metadataList, metadataById, edgeAccumulator.edges, risks, {
          roleFilter: (meta) => meta.roles.some((role) => ['auth', 'routing', 'controller', 'service', 'repository', 'database', 'middleware', 'component', 'frontend', 'api'].includes(role)),
          seedFilter: (meta) => meta.roles.includes('auth') || /login|register|session|token/i.test(meta.path),
        });
      }

      if (definition.id === 'api') {
        return buildFlow(definition, metadataList, metadataById, edgeAccumulator.edges, risks, {
          roleFilter: (meta) => meta.roles.some((role) => ['api', 'routing', 'controller', 'service', 'repository', 'middleware', 'component', 'frontend', 'backend', 'database'].includes(role)),
          seedFilter: (meta) => meta.apiCalls.length > 0 || meta.routeDefs.length > 0 || meta.roles.includes('controller'),
        });
      }

      if (definition.id === 'db') {
        return buildFlow(definition, metadataList, metadataById, edgeAccumulator.edges, risks, {
          roleFilter: (meta) => meta.roles.some((role) => ['database', 'repository', 'service', 'controller', 'api', 'middleware', 'auth'].includes(role)),
          seedFilter: (meta) => meta.roles.includes('database') || meta.roles.includes('repository') || meta.hasDbSignal,
        });
      }

      if (definition.id === 'state') {
        return buildFlow(definition, metadataList, metadataById, edgeAccumulator.edges, risks, {
          roleFilter: (meta) => meta.roles.some((role) => ['state', 'component', 'frontend', 'api'].includes(role)),
          seedFilter: (meta) => meta.roles.includes('state'),
        });
      }

      if (definition.id === 'routing') {
        return buildFlow(definition, metadataList, metadataById, edgeAccumulator.edges, risks, {
          roleFilter: (meta) => meta.roles.some((role) => ['routing', 'middleware', 'controller', 'api', 'frontend', 'backend'].includes(role)),
          seedFilter: (meta) => meta.roles.includes('routing') || meta.routeDefs.length > 0 || meta.roles.includes('middleware'),
        });
      }

      if (definition.id === 'component') {
        return buildFlow(definition, metadataList, metadataById, edgeAccumulator.edges, risks, {
          roleFilter: (meta) => meta.roles.some((role) => ['component', 'frontend', 'state', 'api'].includes(role)),
          seedFilter: (meta) => meta.roles.includes('component') || meta.jsxUsages.length > 0,
        });
      }

      if (definition.id === 'startup') {
        return buildFlow(definition, metadataList, metadataById, edgeAccumulator.edges, risks, {
          roleFilter: (meta) => meta.roles.some((role) => ['startup', 'config', 'routing', 'middleware', 'backend', 'frontend', 'api'].includes(role)),
          seedFilter: (meta) => meta.roles.includes('startup') || meta.roles.includes('config'),
        });
      }

      if (definition.id === 'event') {
        return buildFlow(definition, metadataList, metadataById, edgeAccumulator.edges, risks, {
          roleFilter: (meta) => meta.roles.some((role) => ['event', 'component', 'frontend', 'api', 'state'].includes(role)),
          seedFilter: (meta) => meta.roles.includes('event'),
        });
      }

      if (definition.id === 'ai') {
        return buildFlow(definition, metadataList, metadataById, edgeAccumulator.edges, risks, {
          roleFilter: (meta) => meta.roles.some((role) => ['ai', 'service', 'api', 'database'].includes(role)),
          seedFilter: (meta) => meta.roles.includes('ai'),
        });
      }

      return null;
    })
    .filter(Boolean)
    .sort((left, right) => right.nodes.length - left.nodes.length);

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
};
