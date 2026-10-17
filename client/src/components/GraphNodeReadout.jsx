import { CATEGORY_LABELS, LANGUAGE_LABELS, getNodeCategoryLabel, getNodeLanguageLabel } from '../graph-utils'

/**
 * A small "what am I looking at" card for the graph views.
 *
 * Every field is read straight off the scanner payload — label, path, language,
 * category, status — plus a connection count derived from the edge list. Nothing
 * is inferred: a field with no evidence is simply not rendered.
 */
export function GraphNodeReadout({ node, connectionCount }) {
  if (!node) return null

  const language = getNodeLanguageLabel(node)
  const category = getNodeCategoryLabel(node)
  const languageLabel = LANGUAGE_LABELS[language] || language
  const categoryLabel = CATEGORY_LABELS[category] || category
  const showPath = node.path && node.path !== node.label

  return (
    <div className="graph-node-readout" role="status" aria-live="polite">
      <div className="graph-node-readout-head">
        <span className="graph-node-readout-name">{node.label || node.path || node.id}</span>
        {node.type === 'folder' && <span className="graph-node-readout-kind">folder</span>}
      </div>

      {showPath && <div className="graph-node-readout-path">{node.path}</div>}

      <div className="graph-node-readout-tags">
        <span className="graph-node-readout-tag">{languageLabel}</span>
        <span className="graph-node-readout-tag">{categoryLabel}</span>
        {node.status === 'dead' && <span className="graph-node-readout-tag is-alert">unused</span>}
        {node.status === 'broken' && <span className="graph-node-readout-tag is-alert">broken import</span>}
      </div>

      {Number.isFinite(connectionCount) && connectionCount > 0 && (
        <div className="graph-node-readout-meta">
          {connectionCount} connection{connectionCount === 1 ? '' : 's'}
        </div>
      )}
    </div>
  )
}
