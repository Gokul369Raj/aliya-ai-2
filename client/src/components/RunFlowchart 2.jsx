import { ArrowDown, Terminal, Copy, Check, Info } from 'lucide-react'
import { useState } from 'react'

export function RunFlowchart({ flow, repoInfo }) {
  const [copiedIndex, setCopiedIndex] = useState(null)

  const handleCopy = (command, index) => {
    navigator.clipboard.writeText(command)
    setCopiedIndex(index)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  if (!flow?.found || !flow.steps?.length) {
    return (
      <div className="run-flow-container">
        {repoInfo?.description && (
          <div className="repo-description-card">
            <div className="repo-description-header">
              <Info size={18} />
              <span>About {repoInfo.name || 'Project'}</span>
            </div>
            <p className="repo-description-text">{repoInfo.description}</p>
          </div>
        )}
        <div className="run-flow-empty">Run steps not found in this repository</div>
      </div>
    )
  }

  return (
    <div className="run-flow-container">
      {repoInfo?.description && (
        <div className="repo-description-card">
          <div className="repo-description-header">
            <Info size={18} />
            <span>About {repoInfo.name || 'Project'}</span>
          </div>
          <p className="repo-description-text">{repoInfo.description}</p>
        </div>
      )}

      <div className="run-flowchart">
        {flow.steps.map((step, index) => (
          <div className="run-flow-item" key={step.id || `${step.title}-${index}`}>
            <div 
              className="run-flow-card"
              onClick={() => step.command && handleCopy(step.command, index)}
            >
              <span className="run-flow-index">{index + 1}</span>
              <div className="run-flow-copy">
                <strong>{step.title}</strong>
                {step.command && (
                  <code>
                    <Terminal size={12} />
                    {step.command}
                    <div className="copy-indicator" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px' }}>
                      {copiedIndex === index ? (
                        <><Check size={12} /> Copied</>
                      ) : (
                        <><Copy size={12} /> Click to copy</>
                      )}
                    </div>
                  </code>
                )}
              </div>
            </div>
            {index < flow.steps.length - 1 && (
              <ArrowDown className="run-flow-arrow" size={18} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

