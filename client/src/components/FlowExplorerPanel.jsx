import { useState, useEffect, useMemo } from 'react';
import { Play, Pause, SkipBack, SkipForward, FastForward, Info, AlertTriangle, Activity, X, Filter, CheckCircle, XCircle, ChevronRight, Layers, FileCode } from 'lucide-react';
import { CATEGORY_COLORS, CATEGORY_LABELS } from '../graph-utils';

function formatRiskLabel(kind = '') {
  return kind
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

// How the flow was proven. A flow backed by a dependency or a real code
// signature is trustworthy; one inferred from naming alone is a hint.
const FLOW_STRENGTH_LABELS = {
  strong: 'Proven',
  medium: 'Inferred',
  structural: 'Structural',
};

function flowStrengthLabel(strength) {
  return FLOW_STRENGTH_LABELS[strength] || 'Structural';
}

function flowStrengthHint(strength) {
  if (strength === 'strong') return 'Confirmed by a dependency or code signature';
  if (strength === 'medium') return 'Inferred from file and folder naming only';
  return 'Core project structure rather than an optional capability';
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

function StageCard({ stage, idx, isActive, isPast, color, onClick, stageRisks, totalStages }) {
  const riskCount = stage.riskCount || stageRisks.length || 0;
  const hasRisks = riskCount > 0;
  const deps = stage.dependencyCount || 0;
  const calls = stage.outboundCalls || 0;
  const functions = stage.functions || [];

  return (
    <div
      className={`timeline-step ${isActive ? 'active' : ''} ${isPast ? 'past' : ''} ${hasRisks ? 'has-risks' : ''}`}
      onClick={onClick}
    >
      {/* Step number + indicator */}
      <div className="step-number">{idx + 1}</div>
      <div
        className="step-indicator"
        style={{
          borderColor: isActive || isPast ? color : '#d9d0c2',
          backgroundColor: isActive ? color : 'transparent',
        }}
      />

      {/* Stage content */}
      <div className="step-content">
        <div className="step-header">
          <div className="step-label" title={stage.path || stage.label}>
            <FileCode size={11} />
            {stage.label}
          </div>
          {/* Inline risk badge */}
          {hasRisks && (
            <span className={`step-risk-badge risk-${riskCount >= 3 ? 'high' : riskCount >= 2 ? 'medium' : 'low'}`}>
              <AlertTriangle size={9} /> {riskCount}
            </span>
          )}
        </div>

        <div className="step-category" style={{ color }}>
          {CATEGORY_LABELS[stage.layer] || stage.layer}
        </div>

        {/* Inline stats */}
        <div className="step-stats">
          <span className="step-stat">
            <Layers size={9} /> {deps}
          </span>
          <span className="step-stat">
            <Activity size={9} /> {calls}
          </span>
          {functions.length > 0 && (
            <span className="step-stat step-functions" title={functions.join(', ')}>
              {functions.length} fn
            </span>
          )}
        </div>

        {/* Inline evidence dots */}
        {isActive && (
          <div className="step-evidence-row">
            {stage.evidence && stage.evidence.length > 0 ? (
              stage.evidence.slice(0, 3).map((ev, i) => (
                <span key={i} className="step-evidence-dot" title={typeof ev === 'string' ? ev : ev.message}>
                  <CheckCircle size={8} />
                </span>
              ))
            ) : (
              <span className="step-evidence-dot neutral" title="No per-stage evidence">
                <Info size={8} />
              </span>
            )}
          </div>
        )}
      </div>

      {/* Connector line */}
      {idx < totalStages - 1 && (
        <div className={`step-connector ${isPast ? 'active' : ''}`} style={{ backgroundColor: isPast ? color : '#eae5de' }} />
      )}
    </div>
  );
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

  // Per-stage risks for current stage
  const currentStageRisks = useMemo(() => {
    if (!currentFlow || !currentStage) return [];
    return (currentFlow.risks || []).filter(
      (r) => r.fileId === currentStage.nodeId || r.fileId === currentStage.path
    );
  }, [currentFlow, currentStage]);

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

            <div className="flow-provenance" title={flowStrengthHint(currentFlow.strength)}>
              <div className="flow-provenance-head">
                <span className={`flow-strength is-${currentFlow.strength || 'structural'}`}>
                  {flowStrengthLabel(currentFlow.strength)}
                </span>
                {currentFlow.evidenceCoverage != null && (
                  <span className="flow-coverage">{currentFlow.evidenceCoverage}% of files carry evidence</span>
                )}
              </div>
              <span className="flow-reasons">
                {currentFlow.capabilityReasons?.length > 0
                  ? currentFlow.capabilityReasons.join(' · ')
                  : flowStrengthHint(currentFlow.strength)}
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

            {/* Inline stage detail — always shows current stage info */}
            <div className="flow-current-detail">
              <div className="flow-current-header">
                <span className="flow-current-step">Step {currentFlow.currentIndex + 1}/{currentFlow.stages.length}</span>
                <span className="flow-current-label">{currentStage?.label || currentNode?.label || 'Unknown'}</span>
              </div>
              <div className="flow-current-meta">
                <span className="flow-current-layer" style={{ color: CATEGORY_COLORS[currentStage?.layer] || CATEGORY_COLORS.unknown }}>
                  <Layers size={10} /> {CATEGORY_LABELS[currentStage?.layer] || currentStage?.layer || 'Unknown layer'}
                </span>
                <span className="flow-current-role">
                  {currentStage?.architectureRole || currentNode?.architectureRole || 'No role detected'}
                </span>
              </div>
              {currentStage?.summary && (
                <div className="flow-current-summary">{currentStage.summary}</div>
              )}
              {currentStage?.functions?.length > 0 && (
                <div className="flow-current-functions">
                  Functions: {currentStage.functions.join(', ')}
                </div>
              )}
            </div>

            {/* Timeline with inline labels, evidence, risks */}
            <div className="flow-timeline-wrapper">
              <div className="flow-timeline">
                {currentFlow.stages.map((stage, idx) => {
                  const isActive = idx === currentFlow.currentIndex;
                  const isPast = idx < currentFlow.currentIndex;
                  const category = stage.layer || 'unknown';
                  const color = CATEGORY_COLORS[category] || CATEGORY_COLORS.unknown;
                  const stageRisks = (currentFlow.risks || []).filter(
                    (r) => r.fileId === stage.nodeId || r.fileId === stage.path
                  );

                  return (
                    <StageCard
                      key={stage.nodeId}
                      stage={stage}
                      idx={idx}
                      isActive={isActive}
                      isPast={isPast}
                      color={color}
                      stageRisks={stageRisks}
                      totalStages={currentFlow.stages.length}
                      onClick={() => {
                        setIsPlaying(false);
                        setActiveFlow((prev) => prev ? { ...prev, currentIndex: idx } : prev);
                        onSelectNode?.(stage.nodeId);
                      }}
                    />
                  );
                })}
              </div>
            </div>

            {/* Evidence panel — shows per-stage evidence */}
            <div className="flow-side-info">
              <div className="flow-side-card">
                <div className="flow-side-title"><FileCode size={14} /> Active File</div>
                <div className="flow-side-body">
                  <strong>{currentStage?.path || currentNode?.path || 'Unknown file'}</strong>
                  <span>
                    {currentStage?.lineNumber ? `Line ${currentStage.lineNumber}. ` : ''}
                    {currentStage?.summary || 'Repository stage metadata unavailable.'}
                  </span>
                  {currentStage?.functions?.length > 0 && (
                    <span className="flow-functions-list">
                      {currentStage.functions.map((fn, i) => (
                        <span key={i} className="flow-function-chip">{fn}</span>
                      ))}
                    </span>
                  )}
                </div>
              </div>

              <div className="flow-side-card">
                <div className="flow-side-title"><CheckCircle size={14} /> Flow Evidence</div>
                <div className="flow-side-body">
                  <div className="flow-evidence-row">
                    <span className="flow-evidence-label">Entry</span>
                    <span className="flow-evidence-value">{currentFlow.entryPoint?.path || 'Unable to Verify'}</span>
                  </div>
                  <div className="flow-evidence-row">
                    <span className="flow-evidence-label">Exit</span>
                    <span className="flow-evidence-value">{currentFlow.exitPoint?.path || 'Unable to Verify'}</span>
                  </div>
                  <div className="flow-evidence-row">
                    <span className="flow-evidence-label">Framework</span>
                    <span className="flow-evidence-value">{currentFlow.framework || 'Unable to Verify'}</span>
                  </div>
                  {currentFlow.evidence?.length > 0 && (
                    <div className="flow-evidence-chips">
                      {currentFlow.evidence.slice(0, 6).map((ev, i) => (
                        <span key={i} className="flow-evidence-chip">
                          <CheckCircle size={8} /> {typeof ev === 'string' ? ev : ev.message || String(ev)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Risk Analysis — per-stage risks with severity */}
            <div className="flow-side-card flow-risk-panel">
              <div className="flow-side-title">
                <AlertTriangle size={14} /> Risk Analysis
                {currentStageRisks.length > 0 && (
                  <span className="flow-risk-count">{currentStageRisks.length} on this stage</span>
                )}
              </div>
              <div className="flow-side-body">
                {currentStageRisks.length > 0 ? (
                  currentStageRisks.map((risk, i) => (
                    <div key={`${risk.kind}-${i}`} className={`flow-risk-chip severity-${risk.severity || 'medium'}`}>
                      <span className="flow-risk-icon">
                        {risk.severity === 'high' ? <XCircle size={12} /> : <AlertTriangle size={12} />}
                      </span>
                      <div className="flow-risk-content">
                        <strong>{formatRiskLabel(risk.kind)}</strong>
                        <span>{risk.message}</span>
                      </div>
                    </div>
                  ))
                ) : currentFlow.risks?.length > 0 ? (
                  <div className="flow-risk-summary">
                    <span className="flow-risk-total">{currentFlow.risks.length} total risks across flow</span>
                    <span className="flow-risk-hint">Click any stage to see its specific risks</span>
                  </div>
                ) : (
                  <span className="flow-risk-clean">
                    <CheckCircle size={12} /> No verified risks in this flow
                  </span>
                )}
              </div>
            </div>

            {/* Verified step explanation */}
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
