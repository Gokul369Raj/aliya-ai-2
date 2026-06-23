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

      const staticMeta = analyzeFileStatic(path, fileContent, analysis.graph.nodes);
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

      const prompt = `Analyze the following file from the repository. Keep it extremely concise. 
Provide a short 1-2 sentence purpose, and a brief explanation of what the file does. 
File Path: ${path}
Content snippet:
${fileContent.substring(0, 2000)} // Only sending top 2000 chars to save tokens!

Format as JSON:
{
  "purpose": "Short purpose",
  "aiSummary": "1-2 sentence explanation"
}`;

      const res = await askRepositoryQuestion({
        repoId,
        question: prompt,
        provider: assistantConfig?.provider,
        model: assistantConfig?.model,
        apiKey: assistantConfig?.apiKey,
      });

      const jsonMatch = res.answer.match(/\{[\s\S]*\}/);
      let aiData = { aiSummary: "Could not generate summary." };
      if (jsonMatch) {
        aiData = JSON.parse(jsonMatch[0]);
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
      const path = selectedNode.path || selectedNode.id.replace(/^file:/, '');
      const prompt = `Action: ${action.label}
File: ${path}
Content:
${fileContent.substring(0, 3000)}
Please perform the requested action concisely.`;

      const res = await askRepositoryQuestion({
        repoId: analysis.repoId,
        question: prompt,
        provider: assistantConfig?.provider,
        model: assistantConfig?.model,
        apiKey: assistantConfig?.apiKey,
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
            { id: 'explain', label: 'Explain More', icon: <ChevronRight size={14} /> },
            { id: 'bugs', label: 'Find Bugs', icon: <AlertTriangle size={14} /> },
            { id: 'optimize', label: 'Optimize', icon: <Zap size={14} /> },
            { id: 'deps', label: 'Show Dependencies', icon: <Network size={14} /> }
          ].map(action => (
            <button 
              key={action.id} 
              className={`action-btn ${activeAction === action.id ? 'active' : ''}`}
              onClick={() => handleAction(action)}
              disabled={actionLoading}
            >
              {action.icon} {action.label}
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
