import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Download,
  ExternalLink,
  FileText,
  LoaderCircle,
  Maximize2,
  Minimize2,
  RotateCw,
  X,
} from 'lucide-react'

function formatBytes(size = 0) {
  const value = Number(size) || 0
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(2)} MB`
}

/**
 * In-app PDF report viewer.
 *
 * Renders the generated report blob inside an embedded viewer so the user can
 * read it without leaving the app, and exposes download / open-in-tab actions.
 */
export function PdfReportViewer({
  open,
  url,
  filename = 'repository-report.pdf',
  size = 0,
  generating = false,
  error = '',
  onClose,
  onDownload,
  onOpenInTab,
  onRegenerate,
}) {
  const [expanded, setExpanded] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [frameReady, setFrameReady] = useState(false)
  const objectRef = useRef(null)

  useEffect(() => {
    if (!open) {
      setExpanded(false)
      setFrameReady(false)
      setReloadKey(0)
      return
    }
    setFrameReady(false)
    // The embedded viewer reports readiness asynchronously; if it never fires
    // (some browsers block inline PDF rendering) we still show the fallback.
    const timer = window.setTimeout(() => setFrameReady(true), 1200)
    return () => window.clearTimeout(timer)
  }, [open, url, reloadKey])

  useEffect(() => {
    if (!open) return undefined
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose?.()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  const handleDownload = useCallback(() => {
    if (onDownload) {
      onDownload()
      return
    }
    if (!url) return
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  }, [filename, onDownload, url])

  const handleOpenInTab = useCallback(() => {
    if (onOpenInTab) {
      onOpenInTab()
      return
    }
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
  }, [onOpenInTab, url])

  const displayName = useMemo(() => filename || 'repository-report.pdf', [filename])

  if (!open) return null

  return (
    <div className="pdf-viewer-overlay" role="dialog" aria-modal="true" aria-label="Repository PDF report">
      <div className={`pdf-viewer-shell ${expanded ? 'is-expanded' : ''}`}>
        <header className="pdf-viewer-header">
          <div className="pdf-viewer-title">
            <span className="pdf-viewer-icon"><FileText size={16} /></span>
            <div className="pdf-viewer-title-copy">
              <strong>{displayName}</strong>
              <span>
                {generating
                  ? 'Generating report…'
                  : url
                    ? `${formatBytes(size)} · Generated locally from scanner evidence`
                    : 'No report loaded'}
              </span>
            </div>
          </div>

          <div className="pdf-viewer-actions">
            <button
              type="button"
              className="pdf-action-btn"
              onClick={handleDownload}
              disabled={!url || generating}
              title="Download PDF"
            >
              <Download size={14} />
              <span>Download</span>
            </button>
            <button
              type="button"
              className="pdf-action-btn ghost"
              onClick={handleOpenInTab}
              disabled={!url || generating}
              title="Open in new tab"
            >
              <ExternalLink size={14} />
            </button>
            <button
              type="button"
              className="pdf-action-btn ghost"
              onClick={() => setReloadKey((value) => value + 1)}
              disabled={!url || generating}
              title="Reload preview"
            >
              <RotateCw size={14} />
            </button>
            <button
              type="button"
              className="pdf-action-btn ghost"
              onClick={() => setExpanded((value) => !value)}
              title={expanded ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            <button type="button" className="pdf-action-btn ghost danger" onClick={onClose} title="Close viewer">
              <X size={15} />
            </button>
          </div>
        </header>

        <div className="pdf-viewer-body">
          {generating && (
            <div className="pdf-viewer-status">
              <LoaderCircle className="spin" size={26} />
              <p>Building your repository report…</p>
              <span>Collecting graph, architecture, risk and git evidence.</span>
            </div>
          )}

          {!generating && error && (
            <div className="pdf-viewer-status is-error">
              <p>Report generation failed</p>
              <span>{error}</span>
              {onRegenerate && (
                <button type="button" className="pdf-action-btn" onClick={onRegenerate}>
                  <RotateCw size={14} />
                  <span>Try again</span>
                </button>
              )}
            </div>
          )}

          {!generating && !error && url && (
            <>
              <object
                key={reloadKey}
                ref={objectRef}
                data={url}
                type="application/pdf"
                className="pdf-viewer-frame"
                aria-label="Repository report PDF"
              >
                <div className="pdf-viewer-fallback">
                  <FileText size={28} />
                  <p>Your browser can’t display the PDF inline.</p>
                  <span>Download it or open it in a new tab instead.</span>
                  <div className="pdf-viewer-fallback-actions">
                    <button type="button" className="pdf-action-btn" onClick={handleDownload}>
                      <Download size={14} />
                      <span>Download PDF</span>
                    </button>
                    <button type="button" className="pdf-action-btn ghost" onClick={handleOpenInTab}>
                      <ExternalLink size={14} />
                      <span>Open in new tab</span>
                    </button>
                  </div>
                </div>
              </object>
              {!frameReady && (
                <div className="pdf-viewer-loading-hint">
                  <LoaderCircle className="spin" size={14} />
                  <span>Rendering report…</span>
                </div>
              )}
            </>
          )}

          {!generating && !error && !url && (
            <div className="pdf-viewer-status">
              <FileText size={26} />
              <p>No report yet</p>
              <span>Generate the PDF report to preview it here.</span>
              {onRegenerate && (
                <button type="button" className="pdf-action-btn" onClick={onRegenerate}>
                  <FileText size={14} />
                  <span>Generate report</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default PdfReportViewer
