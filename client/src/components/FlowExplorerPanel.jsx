import { useState, useEffect, useMemo } from 'react';
import { Play, Pause, SkipBack, SkipForward, FastForward, Info, AlertTriangle, Activity, X, Filter } from 'lucide-react';
import { CATEGORY_COLORS, CATEGORY_LABELS, getNodeCategoryLabel } from '../graph-utils';

const FALLBACK_FLOW_DEFS = [
  { id: 'full', label: 'Full Project Pipeline', categories: ['frontend', 'routing', 'middleware', 'api', 'controller', 'backend', 'service', 'database', 'cache', 'response', 'state', 'auth', 'infrastructure', 'config', 'ui', 'utils'], maxNodes: 300 },
  { id: 'auth', label: 'Authentication Flow', categories: ['auth', 'routing', 'middleware', 'api', 'controller', 'service', 'database', 'cache', 'frontend', 'ui', 'state', 'response'], maxNodes: 150 },
  { id: 'api', label: 'API Request Flow', categories: ['api', 'routing', 'middleware', 'controller', 'backend', 'service', 'database', 'cache', 'response', 'frontend', 'ui', 'infrastructure'], maxNodes: 200 },
  { id: 'db', label: 'Database Flow', categories: ['database', 'cache', 'service', 'controller', 'api', 'backend', 'auth', 'infrastructure', 'state'], maxNodes: 150 },
  { id: 'payment', label: 'Payment Flow', categories: ['payment', 'api', 'routing', 'middleware', 'controller', 'service', 'database', 'response', 'state', 'frontend', 'ui'], maxNodes: 150 },
  { id: 'state', label: 'State Management Flow', categories: ['state', 'frontend', 'ui', 'api', 'controller', 'service', 'response'], maxNodes: 120 },
  { id: 'routing', label: 'Routing Flow', categories: ['routing', 'api', 'middleware', 'controller', 'frontend', 'backend', 'ui', 'response'], maxNodes: 120 },
  { id: 'component', label: 'Component Flow', categories: ['ui', 'frontend', 'state', 'api', 'controller', 'utils'], maxNodes: 150 },
  { id: 'event', label: 'Event Flow', categories: ['frontend', 'ui', 'state', 'api', 'controller', 'service', 'infrastructure'], maxNodes: 150 },
  { id: 'startup', label: 'Startup Flow', categories: ['config', 'backend', 'routing', 'middleware', 'api', 'controller', 'service', 'database', 'cache', 'infrastructure'], maxNodes: 150 },
  { id: 'error', label: 'Error Flow', categories: ['errors', 'middleware', 'api', 'controller', 'service', 'backend', 'frontend', 'ui'], maxNodes: 120 },
  { id: 'deadcode', label: 'Dead Code Flow', categories: ['dead', 'frontend', 'backend', 'api', 'service', 'ui'], maxNodes: 150 },
  { id: 'broken', label: 'Broken Pipeline Flow', categories: ['broken', 'api', 'middleware', 'controller', 'service', 'database', 'frontend'], maxNodes: 150 },
  { id: 'cache', label: 'Cache Flow', categories: ['cache', 'database', 'service', 'controller', 'api', 'infrastructure'], maxNodes: 120 },
  { id: 'microservice', label: 'Microservice Flow', categories: ['infrastructure', 'api', 'controller', 'service', 'backend'], maxNodes: 150 },
  { id: 'ai', label: 'AI Pipeline Flow', categories: ['api', 'service', 'backend', 'infrastructure', 'database', 'controller'], maxNodes: 150 },
];

function formatRiskLabel(kind = '') {
  return kind
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function buildFlowLookup(analysis) {
  return new Map(getAvailableFlows(analysis).map((flow) => [flow.id, flow]));
}

function getEffectiveCategory(node) {
  if (node.layer && CATEGORY_COLORS[node.layer]) return node.layer;
  return getNodeCategoryLabel(node);
}

function scoreNode(node) {
  return (node.importance || 0) + ((node.riskCount || 0) * 2) + ((node.roles?.length || 0) * 3);
}

function buildFallbackFlow(definition, analysis) {
  const nodes = analysis?.graph?.nodes || [];
  const adjacency = analysis?.graph?.adjacency || {};
  const nodesById = new Map(nodes.map((n) => [n.id, n]));

  // Use server-assigned layer as primary category source
  const eligible = nodes.filter((node) => node.type !== 'folder' && (
    definition.categories.includes(getEffectiveCategory(node)) ||
    (node.roles || []).some((role) => definition.categories.includes(role))
  ));
  if (!eligible.length) return null;

  // Increase seeds from 4 to 20 to start BFS with a broader base
  const rankedSeeds = [...eligible].sort((left, right) => scoreNode(right) - scoreNode(left));
  const seedIds = rankedSeeds.slice(0, Math.min(20, rankedSeeds.length)).map((node) => node.id);
  const included = new Set(seedIds);
  const queue = [...seedIds];

  // BFS: don't filter neighbors by category during traversal — include ALL connected file nodes
  // This allows the graph to discover deeply connected nodes across all layers
  while (queue.length && included.size < definition.maxNodes) {
    const currentId = queue.shift();
    const neighbors = (adjacency[currentId] || [])
      .map((neighborId) => nodesById.get(neighborId))
      .filter(Boolean)
      .filter((node) => node.type !== 'folder')
      .sort((left, right) => scoreNode(right) - scoreNode(left));

    for (const neighbor of neighbors) {
      if (included.has(neighbor.id)) continue;
      included.add(neighbor.id);
      queue.push(neighbor.id);
      if (included.size >= definition.maxNodes) break;
    }
  }

  const orderedNodes = [...included].sort((leftId, rightId) => {
    const left = nodesById.get(leftId);
    const right = nodesById.get(rightId);
    return scoreNode(right || {}) - scoreNode(left || {});
  });

  const edgeKeys = [];
  const visibleSet = new Set(orderedNodes);
  const risks = (analysis?.architecture?.risks || []).filter((risk) => visibleSet.has(risk.fileId));
  for (const edge of analysis?.graph?.edges || []) {
    const sourceId = typeof edge.source === 'object' ? edge.source.id : edge.source;
    const targetId = typeof edge.target === 'object' ? edge.target.id : edge.target;
    if (visibleSet.has(sourceId) && visibleSet.has(targetId)) {
      edgeKeys.push(`${sourceId}->${targetId}`);
    }
  }

  const stages = orderedNodes.map((nodeId, index) => {
    const node = nodesById.get(nodeId);
    const category = getEffectiveCategory(node || {});
    return {
      index,
      nodeId,
      label: node?.label || nodeId,
      path: node?.path || '',
      layer: category,
      roles: node?.roles || [],
      architectureRole: node?.architectureRole || (CATEGORY_LABELS[category] || category),
      dependencyCount: (adjacency[nodeId] || []).length,
      outboundCalls: (adjacency[nodeId] || []).length,
      riskCount: node?.riskCount || 0,
      summary: `${node?.label || nodeId} participates in the ${CATEGORY_LABELS[category] || category} layer.`,
    };
  });

  return {
    id: definition.id,
    type: definition.label,
    query: definition.id,
    label: definition.label,
    keywords: definition.categories,
    nodes: orderedNodes,
    edgeKeys,
    stages,
    layers: [...new Set(stages.map((stage) => stage.layer))],
    risks: risks.slice(0, 12),
    riskCount: risks.length,
    deadCodeCount: risks.filter((risk) => risk.kind === 'dead-code').length,
    brokenCount: risks.filter((risk) => risk.severity === 'high').length,
    summary: `${definition.label} spans ${orderedNodes.length} nodes.`,
  };
}

function getAvailableFlows(analysis) {
  const serverFlows = analysis?.flows?.available || [];
  if (serverFlows.length) {
    return serverFlows.map(flow => {
      const maxNodes = 40;
      if (!flow.nodes || flow.nodes.length <= maxNodes) return flow;
      
      const cappedNodes = flow.nodes.slice(0, maxNodes);
      const cappedStages = (flow.stages || []).slice(0, maxNodes);
      
      return {
        ...flow,
        nodes: cappedNodes,
        stages: cappedStages,
        layers: [...new Set(cappedStages.map((stage) => stage.layer || 'unknown'))],
      };
    });
  }
  return FALLBACK_FLOW_DEFS
    .map((definition) => buildFallbackFlow(definition, analysis))
    .filter(Boolean);
}

export function FlowExplorerPanel({ analysis, activeFlow, setActiveFlow, onSelectNode, onClose }) {
  const [selectedFlowId, setSelectedFlowId] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  const flowLookup = useMemo(() => buildFlowLookup(analysis), [analysis]);
  const availableFlows = useMemo(() => getAvailableFlows(analysis), [analysis]);

  useEffect(() => {
    if (!selectedFlowId && availableFlows.length) {
      const initialFlow = availableFlows[0];
      setSelectedFlowId(initialFlow.id);
      setActiveFlow({ ...initialFlow, currentIndex: 0, isPlaybackActive: false });
    }
  }, [availableFlows, selectedFlowId, setActiveFlow]);

  useEffect(() => {
    if (!isPlaying || !activeFlow) return;

    const intervalTime = 1500 / speed;
    const timer = setInterval(() => {
      setActiveFlow((prev) => {
        if (!prev) return prev;
        const nextIndex = prev.currentIndex + 1;
        if (nextIndex >= prev.nodes.length) {
          setIsPlaying(false);
          return { ...prev, isPlaybackActive: false };
        }
        return { ...prev, currentIndex: nextIndex, isPlaybackActive: true };
      });
    }, intervalTime);

    return () => clearInterval(timer);
  }, [isPlaying, activeFlow, speed, setActiveFlow]);

  const currentFlow = activeFlow || flowLookup.get(selectedFlowId) || null;
  const currentNodeId = currentFlow?.nodes?.[currentFlow.currentIndex] || '';
  const currentStage = currentFlow?.stages?.[currentFlow.currentIndex] || null;
  const currentNode = analysis?.graph?.nodes?.find((node) => node.id === currentNodeId) || null;
  const currentNeighbors = currentNodeId ? (analysis?.graph?.adjacency?.[currentNodeId] || []).length : 0;

  const handleSelectFlow = (flowId) => {
    setSelectedFlowId(flowId);
    setIsPlaying(false);

    if (!flowId) {
      setActiveFlow(null);
      return;
    }

    const selected = flowLookup.get(flowId);
    if (!selected) return;

    setActiveFlow({
      ...selected,
      currentIndex: 0,
      isPlaybackActive: false,
    });
  };

  const handlePlayToggle = () => {
    const nextPlaying = !isPlaying;
    setIsPlaying(nextPlaying);
    setActiveFlow((prev) => {
      if (!prev) return prev;
      return { ...prev, isPlaybackActive: nextPlaying };
    });
    if (nextPlaying && currentNodeId) {
      onSelectNode?.(currentNodeId);
    }
  };

  if (!analysis) return null;

  return (
    <div className="flow-explorer-container">
      <div className="flow-explorer-panel">
        <div className="flow-header">
          <div className="flow-header-title">
            <h3><Activity size={16} /> Architecture Flow Explorer</h3>
            <p>Deep repository behavior across runtime, services, auth, routes, state, and data layers</p>
          </div>
          <button className="flow-close-btn" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        <div className="flow-filter-section">
          <div className="flow-filter-label"><Filter size={14} /> Select Architecture Flow</div>
          <select
            className="flow-dropdown"
            value={selectedFlowId}
            onChange={(event) => handleSelectFlow(event.target.value)}
          >
            <option value="">-- Choose a Flow to Visualize --</option>
            {availableFlows.map((flow) => (
              <option key={flow.id} value={flow.id}>
                {flow.label} ({flow.nodes.length} nodes)
              </option>
            ))}
          </select>
        </div>

        {currentFlow && (
          <div className="flow-player">
            <div className="flow-meta">
              <span className="flow-badge">{currentFlow.type}</span>
              <span className="flow-stats">
                {currentFlow.nodes.length} Nodes · {currentFlow.layers?.length || 0} Layers · {currentFlow.riskCount || 0} Risks
              </span>
            </div>

            <div className="flow-controls">
              <button
                className="control-btn"
                onClick={() => setActiveFlow((prev) => prev ? { ...prev, currentIndex: 0, isPlaybackActive: isPlaying } : prev)}
                title="Restart"
              >
                <SkipBack size={16} />
              </button>
              <button className="control-btn primary" onClick={handlePlayToggle} title="Play or Pause">
                {isPlaying ? <Pause size={18} /> : <Play size={18} />}
              </button>
              <button
                className="control-btn"
                onClick={() => setActiveFlow((prev) => prev ? { ...prev, currentIndex: Math.min(prev.nodes.length - 1, prev.currentIndex + 1), isPlaybackActive: isPlaying } : prev)}
                title="Next Step"
              >
                <SkipForward size={16} />
              </button>
              <button
                className={`control-btn speed-btn ${speed === 2 ? 'active' : ''}`}
                onClick={() => setSpeed((value) => value === 1 ? 2 : 1)}
                title="Toggle Speed"
              >
                <FastForward size={16} /> {speed}x
              </button>
            </div>

            <div className="flow-summary-grid">
              <div className="flow-summary-card">
                <span className="flow-summary-label">Current Stage</span>
                <strong>{currentStage?.label || currentNode?.label || 'Unknown'}</strong>
                <span>{currentStage?.layer ? (CATEGORY_LABELS[currentStage.layer] || currentStage.layer) : 'No layer detected'}</span>
              </div>
              <div className="flow-summary-card">
                <span className="flow-summary-label">Architecture Role</span>
                <strong>{currentStage?.architectureRole || currentNode?.architectureRole || 'Unknown'}</strong>
                <span>{currentNeighbors} connected neighbors</span>
              </div>
              <div className="flow-summary-card">
                <span className="flow-summary-label">Flow Health</span>
                <strong>{currentFlow.brokenCount || 0} broken</strong>
                <span>{currentFlow.deadCodeCount || 0} dead-code warnings</span>
              </div>
            </div>

            <div className="flow-timeline-wrapper">
              <div className="flow-timeline">
                {currentFlow.stages.map((stage, idx) => {
                  const isActive = idx === currentFlow.currentIndex;
                  const isPast = idx < currentFlow.currentIndex;
                  const category = stage.layer || getNodeCategoryLabel(currentNode || {});
                  const color = CATEGORY_COLORS[category] || CATEGORY_COLORS.unknown;

                  return (
                    <div
                      key={stage.nodeId}
                      className={`timeline-step ${isActive ? 'active' : ''} ${isPast ? 'past' : ''}`}
                      onClick={() => {
                        setIsPlaying(false);
                        setActiveFlow((prev) => prev ? { ...prev, currentIndex: idx } : prev);
                        onSelectNode?.(stage.nodeId);
                      }}
                    >
                      <div
                        className="step-indicator"
                        style={{
                          borderColor: isActive || isPast ? color : '#333',
                          backgroundColor: isActive ? color : 'transparent',
                        }}
                      />
                      <div className="step-content">
                        <div className="step-label" title={stage.path}>{stage.label}</div>
                        <div className="step-category" style={{ color }}>
                          {CATEGORY_LABELS[category] || category}
                        </div>
                        <div className="step-subcopy">
                          {stage.dependencyCount} deps · {stage.outboundCalls} calls · {stage.riskCount} risks
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flow-side-info">
              <div className="flow-side-card">
                <div className="flow-side-title"><Info size={14} /> Active File</div>
                <div className="flow-side-body">
                  <strong>{currentStage?.path || currentNode?.path || 'Unknown file'}</strong>
                  <span>{currentStage?.summary || 'Repository stage metadata unavailable.'}</span>
                </div>
              </div>

              <div className="flow-side-card">
                <div className="flow-side-title"><AlertTriangle size={14} /> Risk Analysis</div>
                <div className="flow-side-body">
                  {currentFlow.risks?.length ? (
                    currentFlow.risks.slice(0, 4).map((risk) => (
                      <div key={`${risk.kind}-${risk.fileId}`} className={`flow-risk-chip severity-${risk.severity || 'medium'}`}>
                        {formatRiskLabel(risk.kind)}: {risk.message}
                      </div>
                    ))
                  ) : (
                    <span>No major architecture risks detected in this flow.</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flow-explanation">
              <Info size={14} className="info-icon" />
              <div>
                <strong>Current Step:</strong> The flow is traversing <code>{currentStage?.label || currentNode?.label}</code>,
                acting as <code>{currentStage?.architectureRole || currentNode?.architectureRole || currentStage?.layer}</code>.
                This flow spans {currentFlow.nodes.length} nodes and {currentFlow.layers?.length || 0} architecture layers.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
