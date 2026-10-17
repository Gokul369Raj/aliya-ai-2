const path = require('path');

const ENTRY_POINT_PATTERNS = [
  /^(main|init|bootstrap|start|run|setup|configure)$/i,
  /^handle[A-Z]/, /^on[A-Z]/, /Handler$/, /Controller$/,
  /^process[A-Z]/, /^execute[A-Z]/, /^perform[A-Z]/,
  /^dispatch[A-Z]/, /^trigger[A-Z]/, /^create[A-Z]/, /^build[A-Z]/,
];

const UTILITY_PATTERNS = [
  /^(get|set|is|has|can|should|will|did)[A-Z]/, /^_/,
  /^(format|parse|validate|convert|transform)/i,
  /^(log|debug|error|warn|info)$/i, /^(to|from)[A-Z]/,
  /^(encode|decode)/i, /(Helper|Util|Utils)$/,
];

const FILE_PURPOSE_PATTERNS = {
  'entry-point': [/^(index|main|app|server|cli)\.(js|ts|jsx|tsx)$/i, /^src\/(index|main|app|server)\.(js|ts|jsx|tsx)$/i, /^bin\//i],
  'config': [/config\.(js|ts|json|yaml|yml)$/i, /\.config\.(js|ts|mjs)$/i, /^(package|tsconfig|vite|next|webpack|babel|jest|eslint|prettier)/i],
  'test': [/\.(test|spec)\.(js|ts|jsx|tsx)$/i, /__tests__\//i, /^test\//i, /^tests\//i],
  'documentation': [/^README/i, /^CHANGELOG/i, /^docs?\//i, /\.(md|markdown|txt|rst)$/i],
  'api-handler': [/^routes?\//i, /^api\//i, /^controllers?\//i, /^handlers?\//i],
  'component': [/\.(jsx|tsx|vue|svelte)$/i, /^components?\//i, /^pages?\//i, /^views?\//i],
};

const FRAMEWORK_PATTERNS = {
  express: { pathPatterns: [/^(routes?|api|controllers?|middleware)\//i, /server\.(js|ts)$/i], routePatterns: [/(?:app|router)\.(get|post|put|patch|delete|use)\s*\(/g] },
  react: { pathPatterns: [/^src\/(components?|pages?|app)\//i, /\.(jsx|tsx)$/i], routePatterns: [/<Route\s/g] },
  nextjs: { pathPatterns: [/^(app|pages?)\//i, /next\.config/i], routePatterns: [/export\s+(?:default\s+)?(?:async\s+)?function\s+(GET|POST|PUT|DELETE)/g] },
  vue: { pathPatterns: [/^src\/(views?|components?|pages?)\//i, /\.vue$/i], routePatterns: [/defineComponent\(/g] },
};

const SKIP_WORDS = new Set(['if','for','while','switch','catch','return','typeof','new','delete','require','import','export','throw','console','JSON','Math','Object','Array','String','Number','Promise','Map','Set','undefined','null','true','false','this','super']);
const SKIP_METHODS = new Set(['log','error','warn','info','debug','parse','stringify','assign','keys','values','entries','push','pop','shift','splice','map','filter','reduce','forEach','find','includes','indexOf','join','split','replace','trim','slice','then','catch','finally']);
const SKIP_OBJECTS = new Set(['console','Math','JSON','Object','Array','String','Number','process','window','document']);

function extractFunctions(content) {
  const functions = [];
  if (!content) return functions;
  const patterns = [
    { regex: /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/g, type: 'function' },
    { regex: /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>/g, type: 'arrow' },
    { regex: /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?function\s*\(([^)]*)\)/g, type: 'function-expr' },
  ];
  const seen = new Set();
  for (const { regex, type } of patterns) {
    let match;
    while ((match = regex.exec(content)) !== null) {
      const name = match[1];
      const params = match[2] || '';
      if (['if','for','while','switch','catch','return','typeof','new','delete'].includes(name)) continue;
      if (seen.has(name)) continue;
      seen.add(name);
      const paramList = params.split(',').map(p => p.trim().split(/[:\s=]/)[0]).filter(Boolean);
      const lineNum = content.slice(0, match.index).split('\n').length;
      const isAsync = content.slice(Math.max(0, match.index - 30), match.index).includes('async');
      // The pattern consumes the optional `export ` prefix, so `match.index`
      // points at `export` and looking backwards misses it. Check the matched
      // text itself — otherwise `export function foo()` reported isExported
      // false, which silently broke export maps and entry-point scoring.
      let isExported = /^\s*export\b/.test(match[0])
        || content.slice(Math.max(0, match.index - 20), match.index).includes('export');
      functions.push({ name, params: paramList.slice(0, 8), line: lineNum, type, isAsync, isExported, signature: name + '(' + paramList.slice(0, 5).join(', ') + ')' });
    }
  }
  // Phase 2: Check module.exports
  const moduleRegex = /module\.exports\s*=\s*\{([^}]+)\}/g;
  let m;
  while ((m = moduleRegex.exec(content)) !== null) {
    const names = m[1].split(',').map(n => n.trim().split(/\s+as\s+/)[0]).filter(Boolean);
    for (const fn of functions) { if (names.includes(fn.name)) fn.isExported = true; }
  }
  const exportRegex = /export\s*\{([^}]+)\}/g;
  while ((m = exportRegex.exec(content)) !== null) {
    const names = m[1].split(',').map(n => n.trim().split(/\s+as\s+/)[0]).filter(Boolean);
    for (const fn of functions) { if (names.includes(fn.name)) fn.isExported = true; }
  }
  return functions;
}

function extractClasses(content) {
  const classes = [];
  if (!content) return classes;
  const classPattern = /(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)(?:\s+extends\s+([A-Za-z_$][\w$]*))?(?:\s+implements\s+([^{]+))?\s*\{/g;
  let match;
  while ((match = classPattern.exec(content)) !== null) {
    const name = match[1];
    const parent = match[2] || '';
    const interfaces = match[3] ? match[3].split(',').map(s => s.trim()) : [];
    const lineNum = content.slice(0, match.index).split('\n').length;
    // Same prefix-consumption issue as extractFunctions: the pattern eats the
    // optional `export `, so check the matched text.
    const isExported = /^\s*export\b/.test(match[0])
      || content.slice(Math.max(0, match.index - 20), match.index).includes('export');
    const classStart = match.index + match[0].length;
    const nextClass = content.slice(classStart).search(/(?:export\s+)?(?:abstract\s+)?class\s+/);
    const classEnd = nextClass > 0 ? classStart + nextClass : content.length;
    const classBody = content.slice(classStart, classEnd);
    const methods = [];
    const methodPattern = /(?:(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{)/g;
    let mm;
    while ((mm = methodPattern.exec(classBody)) !== null) {
      const methodName = mm[1];
      if (['if','for','while','switch','catch','constructor'].includes(methodName)) continue;
      methods.push({ name: methodName, params: (mm[2] || '').split(',').map(p => p.trim().split(/[:\s=]/)[0]).filter(Boolean).slice(0, 5), line: lineNum + classBody.slice(0, mm.index).split('\n').length });
    }
    classes.push({ name, extends: parent, implements: interfaces, line: lineNum, isExported, methods: methods.slice(0, 30) });
  }
  return classes;
}

function extractRoutes(content) {
  const routes = [];
  if (!content) return routes;
  const routePattern = /(?:app|router)\.(get|post|put|patch|delete|options|head|use)\s*\((['"`])([^'"`]+)\2/g;
  let match;
  while ((match = routePattern.exec(content)) !== null) {
    routes.push({ method: match[1].toUpperCase(), path: match[3], line: content.slice(0, match.index).split('\n').length });
  }
  const nextPattern = /export\s+(?:default\s+)?(?:async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH)\s*\(/g;
  while ((match = nextPattern.exec(content)) !== null) {
    routes.push({ method: match[1].toUpperCase(), path: '(next.js route handler)', line: content.slice(0, match.index).split('\n').length });
  }
  return routes;
}

function extractFunctionCalls(content) {
  const calls = [];
  if (!content) return calls;
  const callPattern = /\b([a-zA-Z_$][\w$]*)\s*\(([^)]*)\)/g;
  let match;
  while ((match = callPattern.exec(content)) !== null) {
    const name = match[1];
    if (SKIP_WORDS.has(name)) continue;
    const before = content.slice(Math.max(0, match.index - 20), match.index);
    if (/(?:function|const|let|var|class|async)\s+$/.test(before)) continue;
    if (/\.\s*$/.test(before)) continue;
    calls.push({ name, line: content.slice(0, match.index).split('\n').length });
  }
  return calls;
}

/**
 * Score how likely a function is to be an entry point — somewhere execution
 * enters the program rather than a helper called from within it.
 *
 * The previous formula was `calleeCount / (callerCount + 1)` where `calleeCount`
 * is how many functions the *file* calls, not the function itself. Almost every
 * exported function in any file that calls something therefore scored above the
 * 0.1 cut-off: a 39-file project reported 237 "entry points", which is every
 * function it has. The signals below actually separate the two cases.
 */
function scoreEntryPoint(name, isExported, callerCount, calleeCount) {
  const reasons = [];
  let score = 0;

  const calledInternally = callerCount > 0;

  if (!calledInternally && isExported) {
    score += 1.0;
    reasons.push('exported, not called internally');
  } else if (!calledInternally) {
    score += 0.3;
    reasons.push('not called internally');
  } else if (isExported) {
    score += 0.2;
    reasons.push('exported');
  }

  if (ENTRY_POINT_PATTERNS.some((pattern) => pattern.test(name))) {
    score += 1.5;
    reasons.push('entry-pattern');
  }

  if (UTILITY_PATTERNS.some((pattern) => pattern.test(name))) {
    score -= 0.6;
    reasons.push('utility');
  }

  // A file that calls many things is doing orchestration work.
  if (calleeCount >= 3) {
    score += 0.3;
    reasons.push('orchestrates calls');
  }

  return { score: Math.max(0, Number(score.toFixed(2))), reasons };
}

function detectFilePurpose(filePath) {
  const basename = path.posix.basename(filePath);
  const purposes = [];
  for (const [purpose, patterns] of Object.entries(FILE_PURPOSE_PATTERNS)) {
    if (patterns.some(p => p.test(filePath) || p.test(basename))) purposes.push(purpose);
  }
  return purposes.length ? purposes : ['source'];
}

function detectFramework(filePath, content) {
  for (const [name, config] of Object.entries(FRAMEWORK_PATTERNS)) {
    if (config.pathPatterns.some(p => p.test(filePath))) return name;
    if (content && config.routePatterns.some(p => p.test(content))) return name;
  }
  return null;
}

function generateCommunityLabel(memberPaths) {
  const folderCounts = new Map();
  for (const fp of memberPaths) {
    const parts = fp.split('/').filter(Boolean);
    if (parts.length >= 2) {
      const folder = parts[parts.length - 2];
      if (!['src','lib','core','utils','common','shared','helpers','node_modules'].includes(folder.toLowerCase())) {
        folderCounts.set(folder, (folderCounts.get(folder) || 0) + 1);
      }
    }
  }
  let max = 0, best = '';
  for (const [f, c] of folderCounts) { if (c > max) { max = c; best = f; } }
  return best || 'Core';
}

function buildCodeIntelligence(files) {
  const functionNodes = [];
  const classNodes = [];
  const routeNodes = [];
  const callRelationships = [];
  const exportMap = new Map();
  const fileMap = new Map();
  const callerMap = new Map();
  const calleeMap = new Map();

  for (const file of files) {
    if (!file.content || file.content.length < 20) continue;
    const filePath = file.path;
    const content = file.content;
    const language = file.language || 'unknown';

    const functions = extractFunctions(content);
    const classes = extractClasses(content);
    const routes = extractRoutes(content);
    const calls = extractFunctionCalls(content);
    const purposes = detectFilePurpose(filePath);
    const framework = detectFramework(filePath, content);

    fileMap.set(filePath, { purposes, framework, language });

    for (const fn of functions) {
      const nodeId = 'func:' + filePath + '::' + fn.name;
      if (fn.isExported) exportMap.set(fn.name, filePath);
      functionNodes.push({ id: nodeId, name: fn.name, filePath, language, params: fn.params, line: fn.line, isAsync: fn.isAsync, isExported: fn.isExported, type: fn.type, purposes });
    }

    for (const cls of classes) {
      const nodeId = 'class:' + filePath + '::' + cls.name;
      classNodes.push({ id: nodeId, name: cls.name, filePath, language, extends: cls.extends, implements: cls.implements, line: cls.line, isExported: cls.isExported, methods: cls.methods, purposes });
      if (cls.isExported) exportMap.set(cls.name, filePath);
    }

    for (const route of routes) {
      routeNodes.push({ id: 'route:' + filePath + '::' + route.method + ':' + route.path, method: route.method, path: route.path, filePath, line: route.line });
    }

    if (!calleeMap.has(filePath)) calleeMap.set(filePath, new Set());
    for (const call of calls) {
      callRelationships.push({ source: filePath, targetFunction: call.name, line: call.line, type: 'function-call' });
      calleeMap.get(filePath).add(call.name);
      if (!callerMap.has(call.name)) callerMap.set(call.name, new Set());
      callerMap.get(call.name).add(filePath);
    }
  }

  const entryPoints = [];
  for (const fn of functionNodes) {
    const callerCount = callerMap.get(fn.name)?.size || 0;
    const calleeCount = calleeMap.get(fn.filePath)?.size || 0;
    const { score, reasons } = scoreEntryPoint(fn.name, fn.isExported, callerCount, calleeCount);
    // A real entry point is one nothing internal calls, or one whose name marks
    // it as an entry. A plain exported helper called from elsewhere is not.
    if (score >= 0.8) {
      entryPoints.push({ name: fn.name, filePath: fn.filePath, entryScore: score, entryReasons: reasons, callerCount, calleeCount, isExported: fn.isExported });
    }
  }
  entryPoints.sort((a, b) => b.entryScore - a.entryScore);

  // Communities via connected components
  const adjacency = new Map();
  for (const rel of callRelationships) {
    const targetFnNode = functionNodes.find(f => f.name === rel.targetFunction);
    if (targetFnNode && targetFnNode.filePath !== rel.source) {
      if (!adjacency.has(rel.source)) adjacency.set(rel.source, new Set());
      if (!adjacency.has(targetFnNode.filePath)) adjacency.set(targetFnNode.filePath, new Set());
      adjacency.get(rel.source).add(targetFnNode.filePath);
      adjacency.get(targetFnNode.filePath).add(rel.source);
    }
  }
  const visited = new Set();
  const communities = [];
  for (const [filePath, neighbors] of adjacency) {
    if (visited.has(filePath)) continue;
    const community = { members: [], label: '', type: 'functional' };
    const stack = [filePath];
    while (stack.length > 0) {
      const current = stack.pop();
      if (visited.has(current)) continue;
      visited.add(current);
      community.members.push(current);
      for (const neighbor of (adjacency.get(current) || new Set())) {
        if (!visited.has(neighbor)) stack.push(neighbor);
      }
    }
    if (community.members.length >= 2) {
      community.label = generateCommunityLabel(community.members);
      community.memberCount = community.members.length;
      communities.push(community);
    }
  }
  communities.sort((a, b) => b.memberCount - a.memberCount);

  const filePurposes = {};
  for (const [, { purposes }] of fileMap) {
    for (const p of purposes) filePurposes[p] = (filePurposes[p] || 0) + 1;
  }

  const topExporters = [...exportMap.entries()].reduce((acc, [, fp]) => {
    const existing = acc.find(e => e.filePath === fp);
    if (existing) existing.exports++; else acc.push({ filePath: fp, exports: 1 });
    return acc;
  }, []).sort((a, b) => b.exports - a.exports).slice(0, 10);

  const frameworks = [...new Set([...fileMap.values()].filter(f => f.framework).map(f => f.framework))];

  return {
    functionNodes, classNodes, routeNodes, callRelationships,
    exportMap: Object.fromEntries(exportMap),
    communities, entryPoints,
    fileMap: Object.fromEntries(fileMap),
    summary: {
      totalFunctions: functionNodes.length,
      totalClasses: classNodes.length,
      totalRoutes: routeNodes.length,
      totalCallRelationships: callRelationships.length,
      // `entryPoints` is capped for payload size, so the true count travels
      // alongside it — consumers that report "N entry points" must not read the
      // capped list length as the total.
      totalEntryPoints: entryPoints.length,
      entryPoints: entryPoints.slice(0, 20),
      totalCommunities: communities.length,
      communities: communities.slice(0, 15),
      frameworks,
      filePurposes,
      topExporters,
    },
  };
}

module.exports = { buildCodeIntelligence, extractFunctions, extractClasses, extractRoutes, extractFunctionCalls, scoreEntryPoint, detectFilePurpose, detectFramework };
