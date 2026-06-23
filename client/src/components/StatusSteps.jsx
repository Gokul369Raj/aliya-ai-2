import { phaseLabel } from '../graph-utils'

const ORDER = ['queued', 'cloning', 'parsing', 'building-graph', 'complete']

export function StatusSteps({ job }) {
  return (
    <div className="status-steps">
      {ORDER.map((phase) => {
        const completed = job && ORDER.indexOf(job.phase) > ORDER.indexOf(phase)
        const active = job?.phase === phase
        const ready = phase === 'complete' && job?.status === 'completed'

        return (
          <div
            key={phase}
            className={`status-step ${completed ? 'is-complete' : ''} ${active ? 'is-active' : ''} ${ready ? 'is-complete' : ''}`}
          >
            <span className="status-dot" />
            <span>{phaseLabel(phase)}</span>
          </div>
        )
      })}
    </div>
  )
}
