import { useState, useEffect, useMemo } from 'react';
import { Play, Pause, SkipBack, SkipForward, FastForward, Info, AlertTriangle, Activity, X, Filter } from 'lucide-react';
import { CATEGORY_COLORS, CATEGORY_LABELS, getNodeCategoryLabel } from '../graph-utils';

function formatRiskLabel(kind = '') {
  return kind
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function buildFlowLookup(analysis) {
  return new Map(getAvailableFlows(analysis).map((flow) => [flow.id, flow]));
}

function getAvailableFlows(analysis) {
  const serverFlows = analysis?.flows?.available || [];
  return serverFlows
    .filter((flow) => Array.isArray(flow.nodes) && flow.nodes.length > 0 && Array.isArray(flow.stages) && flow.stages.length > 0)
    .map(flow => {
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

export function FlowExplorerPanel({ analysis, activeFlow, setActiveFlow, onSelectNode, onClose }) {
  const [selectedFlowId, setSelectedFlowId] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  const flowLookup = useMemo(() => buildFlowLookup(analysis), [analysis]);
  const availableFlows = useMemo(() => getAvailableFlows(analysis), [analysis]);

  useEffect(() => {
    if (!availableFlows.length) {
      if (selectedFlowId) setSelectedFlowId('');
      setActiveFlow(null);
      setIsPlaying(false);
      return;
    }

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

  const currentFlow = activeFlow && flowLookup.has(activeFlow.id)
    ? activeFlow
    : flowLookup.get(selectedFlowId) || null;
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
                {currentFlow.confidence != null ? `${currentFlow.confidence}% Confidence` : 'Confidence Unable to Verify'} · {currentFlow.nodes.length} Nodes · {currentFlow.layers?.length || 0} Layers
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
                <span className="flow-summary-label">Evidence</span>
                <strong>{currentFlow.evidence?.length || 0} signals</strong>
                <span>{currentFlow.verification?.join(', ') || 'Unable to Verify'}</span>
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
                  <span>
                    {currentStage?.lineNumber ? `Line ${currentStage.lineNumber}. ` : ''}
                    {currentStage?.summary || 'Repository stage metadata unavailable.'}
                  </span>
                  <span>{currentStage?.functions?.length ? `Functions: ${currentStage.functions.join(', ')}` : 'Functions: Unable to Verify'}</span>
                </div>
              </div>

              <div className="flow-side-card">
                <div className="flow-side-title"><Info size={14} /> Flow Evidence</div>
                <div className="flow-side-body">
                  <strong>Entry: {currentFlow.entryPoint?.path || 'Unable to Verify'}</strong>
                  <span>Exit: {currentFlow.exitPoint?.path || 'Unable to Verify'}</span>
                  <span>Framework: {currentFlow.framework || 'Unable to Verify'}</span>
                  <span>{currentFlow.evidence?.slice(0, 5).join(' · ') || 'Insufficient Evidence'}</span>
                </div>
              </div>
            </div>

            <div className="flow-side-card flow-risk-panel">
              <div className="flow-side-title"><AlertTriangle size={14} /> Risk Analysis</div>
              <div className="flow-side-body">
                {currentFlow.risks?.length ? (
                  currentFlow.risks.slice(0, 4).map((risk) => (
                    <div key={`${risk.kind}-${risk.fileId}`} className={`flow-risk-chip severity-${risk.severity || 'medium'}`}>
                      {formatRiskLabel(risk.kind)}: {risk.message}
                    </div>
                  ))
                ) : (
                  <span>No verified risks were emitted for this flow.</span>
                )}
              </div>
            </div>

            <div className="flow-explanation">
              <Info size={14} className="info-icon" />
              <div>
                <strong>Verified Step:</strong> The flow is traversing <code>{currentStage?.label || currentNode?.label}</code>,
                acting as <code>{currentStage?.architectureRole || currentNode?.architectureRole || currentStage?.layer}</code>.
                {currentFlow.explanation ? ` ${currentFlow.explanation}` : ''}
              </div>
            </div>
          </div>
        )}

        {!currentFlow && (
          <div className="flow-empty-evidence">
            <Activity size={18} />
            <strong>Flow Not Detected</strong>
            <span>No architecture flow had enough scanner evidence to verify a real execution path in this repository.</span>
          </div>
        )}
      </div>
    </div>
  );
}
