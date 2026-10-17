import React, { useEffect, useState } from 'react';
import { LoaderCircle, Sparkles, AlertTriangle, Zap, Network, ChevronRight, X } from 'lucide-react';
import { getSummary, setSummary } from '../services/summaryDb';
import { analyzeFileStatic } from '../services/staticAnalyzer';
import { askRepositoryQuestion } from '../api';

export function FileSummaryPanel({ analysis, selectedNode, fileContent, assistantConfig, onClose }) {
  const [summaryData, setSummaryData] = useState(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [activeAction, setActiveAction] = useState(null);
  const [actionResult, setActionResult] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [isClosed, setIsClosed] = useState(false);

  useEffect(() => {
    setIsClosed(false);
    setSummaryData(null);
    setActionResult(null);
    setActiveAction(null);
    setLoadingAi(false);
    setActionLoading(false);
  }, [selectedNode]);

  const handleGenerateSummary = async () => {
    if (!analysis || !selectedNode || !fileContent) return;

    const path = selectedNode.path || selectedNode.id.replace(/^file:/, '');
    const repoId = analysis.repoId;
    const contentHash = `${fileContent.length}-${fileContent.substring(0, 100)}`;

    setLoadingAi(true);
    setActionResult(null);

    try {
      const cached = await getSummary(repoId, path);

      if (cached && cached.contentHash === contentHash && cached.aiSummary) {
        setSummaryData(cached);
        return;
      }

      const staticMeta = analyzeFileStatic(path, fileContent);
      const baseData = {
        ...(cached && cached.contentHash === contentHash ? cached : {}),
        contentHash,
        purpose: `Implementation of ${path.split('/').pop()}`,
        ...staticMeta
      };

      if (!assistantConfig?.apiKey) {
        const finalSummary = { ...baseData, aiSummary: "Connect an AI key to generate summary." };
        setSummaryData(finalSummary);
        await setSummary(repoId, path, finalSummary);
        return;
      }

      const prompt = `Return ONLY valid JSON for file: ${path}. No markdown, no explanation outside JSON.\nContent:\n${fileContent.substring(0, 3000)}\n\n{"purpose":"1 sentence purpose","aiSummary":"2-3 sentence explanation"}`;

      const res = await askRepositoryQuestion({
        repoId,
        question: prompt,
        provider: assistantConfig?.provider,
        model: assistantConfig?.model,
        apiKey: assistantConfig?.apiKey,
      });

      let aiData = { aiSummary: "Could not generate summary." };
      try {
        // Try to extract JSON from response (might be wrapped in markdown)
        let jsonStr = res.answer;
        const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (codeBlockMatch) jsonStr = codeBlockMatch[1];
        
        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          aiData = JSON.parse(jsonMatch[0]);
        } else {
          // If no JSON found, use the raw answer as summary
          aiData = { 
            purpose: "See explanation below",
            aiSummary: res.answer.substring(0, 500)
          };
        }
      } catch {
        // If JSON parsing fails, use raw answer
        aiData = { 
          purpose: "See explanation below",
          aiSummary: res.answer.substring(0, 500)
        };
      }

      const finalSummary = { ...baseData, ...aiData };
      setSummaryData(finalSummary);
      await setSummary(repoId, path, finalSummary);
    } catch (err) {
      console.error("AI Summary generation failed:", err);
      setSummaryData({
        purpose: selectedNode.path || selectedNode.label || 'Selected file',
        aiSummary: "Could not generate summary.",
        role: 'Unknown',
        complexity: 'Unknown',
        functions: [],
        dependencies: []
      });
    } finally {
      setLoadingAi(false);
    }
  };

  const handleAction = async (action) => {
    setActiveAction(action.id);
    if (!assistantConfig?.apiKey) {
      setActionResult("Please connect an AI key to use advanced actions.");
      return;
    }
    setActionLoading(true);
    setActionResult(null);

    try {
      const filePath = selectedNode.path || selectedNode.id.replace(/^file:/, '');
      
      const prompts = {
        explain: `Explain in detail how file ${filePath} works. Cover each function, the flow, and patterns used. Be specific with line references.`,
        bug: `Review file ${filePath} for actual bugs ONLY. If no bugs found, say "No bugs found" and nothing else. If bugs exist, list each with line number and fix.`,
        optimize: `Review file ${filePath} for performance/quality optimizations ONLY. If already optimized, say "Already well optimized". Otherwise list real optimizations with line numbers.`,
        dependency: `Show all dependencies of file ${filePath}: what it imports and what imports it. List each with a 1-line reason.`,
      };

      const question = prompts[action.id] || `${action.label} for file ${filePath}`;

      const res = await askRepositoryQuestion({
        repoId: analysis.repoId,
        provider: assistantConfig?.provider,
        model: assistantConfig?.model,
        apiKey: assistantConfig?.apiKey,
        question,
        selectedPath: filePath,
        focusedNodeIds: [`file:${filePath}`],
      });

      setActionResult(res.answer);
    } catch (err) {
      setActionResult(`Error: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  if (isClosed) return null;

  return (
    <div className="file-summary-panel">
      <div className="summary-section">
        <div className="summary-header">
          <Sparkles size={14} className="icon-accent" />
          <h4>AI Summary</h4>
          {loadingAi && <LoaderCircle size={12} className="spin text-muted" style={{ marginLeft: '8px' }} />}
          {!summaryData && (
            <button
              onClick={handleGenerateSummary}
              className="action-btn summary-generate-btn"
              disabled={loadingAi}
            >
              {loadingAi ? 'Generating...' : 'Generate Summary'}
            </button>
          )}
          <button 
            onClick={() => {
              setIsClosed(true);
              onClose?.();
            }} 
            className="toolbar-btn" 
            style={{ marginLeft: summaryData ? 'auto' : 0 }}
            title="Close AI Summary"
          >
            <X size={14} />
          </button>
        </div>
        {summaryData ? (
          <>
            <p className="summary-purpose"><strong>Purpose:</strong> {summaryData.purpose}</p>
            <p className="summary-text">{summaryData.aiSummary || 'No summary available.'}</p>
          </>
        ) : (
          <p className="summary-text">Click generate to create summary for this node.</p>
        )}
      </div>

      {summaryData && (
        <>
          <div className="summary-grid">
            <div className="summary-card">
              <h5>Architecture Role</h5>
              <span className="badge role-badge">{summaryData.role}</span>
            </div>
            <div className="summary-card">
              <h5>Complexity</h5>
              <span className={`badge comp-${summaryData.complexity?.toLowerCase()}`}>{summaryData.complexity}</span>
            </div>
          </div>

          <div className="summary-lists">
            <div className="list-col">
              <h5>⚡ Key Functions</h5>
              <ul>
                {summaryData.functions?.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            </div>
            <div className="list-col">
              <h5>🔗 Dependencies</h5>
              <ul>
                {summaryData.dependencies?.map((d, i) => <li key={i}>{d}</li>)}
              </ul>
            </div>
          </div>
        </>
      )}

      {summaryData && (
        <div className="summary-actions">
          {[
            { id: 'explain', label: 'Detail', icon: <ChevronRight size={13} />, title: 'Detailed explanation' },
            { id: 'bug', label: 'Bugs', icon: <AlertTriangle size={13} />, title: 'Find actual bugs only' },
            { id: 'optimize', label: 'Perf', icon: <Zap size={13} />, title: 'Performance optimizations' },
            { id: 'dependency', label: 'Deps', icon: <Network size={13} />, title: 'Import/depend relationships' }
          ].map(action => (
            <button 
              key={action.id} 
              className={`action-btn ${activeAction === action.id ? 'active' : ''}`}
              onClick={() => handleAction(action)}
              disabled={actionLoading}
              title={action.title}
            >
              {action.icon} <span className="action-label">{action.label}</span>
            </button>
          ))}
        </div>
      )}

      {(actionLoading || actionResult) && (
        <div className="action-result">
          {actionLoading ? (
            <div className="loading-state"><LoaderCircle size={16} className="spin" /> Processing {activeAction}...</div>
          ) : (
            <div className="markdown-content">{actionResult}</div>
          )}
        </div>
      )}
    </div>
  );
}
