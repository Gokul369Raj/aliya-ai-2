import { startTransition, useDeferredValue, useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import Editor from '@monaco-editor/react'
import { Sparkles, LoaderCircle, Settings2, Code2, Network, Box, X, Filter, ChevronDown, ChevronLeft, ChevronRight, Search, Plus, Minus, Copy, Trash2, Maximize, Minimize, Clock3, GitBranch, ArrowRight, ShieldCheck, Zap, FileText, Activity, Check, Lightbulb, Cpu, CornerDownLeft } from 'lucide-react'

import {
  askRepositoryQuestion,
  askRepositoryQuestionStream,
  fetchCommitHistory,
  fetchRecentProjects,
  fetchRepository,
  deleteRepository,
  fetchJob,
  fetchModelCatalog,
  fetchRepositoryFile,
  startRepositoryAnalysis,
} from './api'
import { Graph2D } from './components/Graph2D'
import { Graph3D } from './components/Graph3D'
import { CommitGraphPanel } from './components/CommitGraphPanel'
import { RunFlowchart } from './components/RunFlowchart'
import { FileSummaryPanel } from './components/FileSummaryPanel'
import { FlowExplorerPanel } from './components/FlowExplorerPanel'
import HealthScorePanel from './components/HealthScorePanel'
import GitIntelligencePanel from './components/GitIntelligencePanel'
import { LayeredFlowView } from './components/LayeredFlowView'
import { PdfReportViewer } from './components/PdfReportViewer'
import { generateRepositoryPdfReport } from './utils/pdfReport'
import { buildVisibleGraph, formatBytes, phaseLabel, LANGUAGE_COLORS, LANGUAGE_LABELS, getNodeLanguageLabel, CATEGORY_NODE_COLORS, CATEGORY_LABELS, getNodeCategoryLabel, getNodeCategoryColor } from './graph-utils'
import './App.css'

const DEFAULT_CONFIG = {
  provider: 'openai',
  model: '',
  customModel: '',
  apiKey: '',
}

const FALLBACK_MODEL_CATALOG = {
  openai: {
    label: 'OpenAI',
    models: [
      { id: 'gpt-4.1', label: 'GPT-4.1', recommended: true },
      { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
      { id: 'gpt-4o', label: 'GPT-4o' },
      { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    ],
  },
  gemini: {
    label: 'Google Gemini',
    models: [
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', recommended: true },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite' },
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    ],
  },
  openrouter: {
    label: 'OpenRouter (All Models)',
    supportsCustomModel: true,
    models: [
      { id: 'openai/gpt-4.1', label: 'OpenAI GPT-4.1', recommended: true },
      { id: 'google/gemini-2.5-pro', label: 'Google Gemini 2.5 Pro' },
      { id: 'anthropic/claude-sonnet-4.5', label: 'Anthropic Claude Sonnet 4.5' },
      { id: 'x-ai/grok-4.3', label: 'xAI Grok 4.3' },
      { id: 'deepseek/deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
      { id: 'mistralai/mistral-medium-3.5', label: 'Mistral Medium 3.5' },
    ],
  },
  anthropic: {
    label: 'Anthropic Claude',
    supportsCustomModel: true,
    models: [
      { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', recommended: true },
      { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
      { id: 'claude-opus-4-1', label: 'Claude Opus 4.1' },
    ],
  },
  xai: {
    label: 'xAI Grok',
    supportsCustomModel: true,
    models: [
      { id: 'grok-4.3', label: 'Grok 4.3', recommended: true },
      { id: 'grok-build-0.1', label: 'Grok Build 0.1' },
    ],
  },
  deepseek: {
    label: 'DeepSeek',
    supportsCustomModel: true,
    models: [
      { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', recommended: true },
      { id: 'deepseek-chat', label: 'DeepSeek Chat' },
      { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner' },
    ],
  },
  mistral: {
    label: 'Mistral AI',
    supportsCustomModel: true,
    models: [
      { id: 'mistral-medium-3.5', label: 'Mistral Medium 3.5', recommended: true },
      { id: 'mistral-small-4', label: 'Mistral Small 4' },
      { id: 'mistral-large-3', label: 'Mistral Large 3' },
      { id: 'codestral-latest', label: 'Codestral' },
    ],
  },
  groq: {
    label: 'Groq',
    supportsCustomModel: true,
    models: [
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile', recommended: true },
      { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant' },
      { id: 'openai/gpt-oss-120b', label: 'GPT OSS 120B' },
    ],
  },
  perplexity: {
    label: 'Perplexity Sonar',
    supportsCustomModel: true,
    models: [
      { id: 'sonar-pro', label: 'Sonar Pro', recommended: true },
      { id: 'sonar', label: 'Sonar' },
      { id: 'sonar-reasoning-pro', label: 'Sonar Reasoning Pro' },
      { id: 'sonar-deep-research', label: 'Sonar Deep Research' },
    ],
  },
}

const ANALYSIS_PHASES = ['queued', 'cloning', 'parsing', 'building-graph', 'complete']

function clampPercent(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.max(0, Math.min(100, Math.round(numeric)))
}

function loadStoredConfig() {
  try {
    const raw = window.localStorage.getItem('aliya-ai-config')
    return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : DEFAULT_CONFIG
  } catch {
    return DEFAULT_CONFIG
  }
}

const Logo = ({ large = false }) => (
  <div className={`app-logo ${large ? 'large' : ''}`}>
    <span className="logo-text">
      Aliya<span className="logo-accent">AI</span>
    </span>
  </div>
);

function cleanDiagramLabel(value = '') {
  // Handle S1["label"] format from Mermaid
  const labelMatch = String(value).match(/^\s*[A-Za-z0-9_]+\s*\["(.+?)"\]/)
  if (labelMatch) return labelMatch[1].trim().slice(0, 42) || 'Step'

  return String(value)
    .replace(/^\s*[A-Za-z0-9_]+\s*/, '')
    .replace(/[\][{}()"']/g, '')
    .replace(/\|.*?\|/g, '')
    .replace(/:/g, '')
    .trim()
    .slice(0, 42) || 'Step'
}

function parseMermaidFlow(code = '') {
  return code
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.includes('-->'))
    .slice(0, 8) // Show up to 8 edges
    .map((line) => {
      const [source, target] = line.split(/-->|---/).map(cleanDiagramLabel)
      return { source, target }
    })
    .filter((edge) => edge.source && edge.target)
}

function DiagramBlock({ code }) {
  const edges = parseMermaidFlow(code)
  if (!edges.length) {
    return <pre className="chat-code-block">{code}</pre>
  }

  // Group by source instead of flattening into one list. The old version stacked
  // every node in first-seen order, so `A --> B` plus `A --> C` rendered as
  // A → B → C and implied a relationship that does not exist.
  const groups = []
  const groupIndex = new Map()
  edges.forEach((edge) => {
    if (!groupIndex.has(edge.source)) {
      groupIndex.set(edge.source, groups.length)
      groups.push({ source: edge.source, targets: [] })
    }
    const group = groups[groupIndex.get(edge.source)]
    if (!group.targets.includes(edge.target)) group.targets.push(edge.target)
  })

  const nodeCount = new Set(edges.flatMap((edge) => [edge.source, edge.target])).size

  return (
    <figure
      className="chat-diagram"
      aria-label={`Diagram with ${nodeCount} nodes and ${edges.length} links`}
    >
      <figcaption className="chat-diagram-head">
        <span className="chat-diagram-title">Diagram</span>
        <span className="chat-diagram-meta">{nodeCount} nodes · {edges.length} links</span>
      </figcaption>
      <div className="chat-diagram-body">
        {groups.map((group) => (
          <div className="chat-diagram-group" key={group.source}>
            <div className="chat-diagram-node is-source">{group.source}</div>
            <div className="chat-diagram-targets">
              {group.targets.map((target) => (
                <div className="chat-diagram-target" key={target}>
                  <span className="chat-diagram-arrow" aria-hidden="true">→</span>
                  <div className="chat-diagram-node">{target}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </figure>
  )
}

function renderInlineMarkdown(text = '') {
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/g
  const parts = String(text).split(pattern).filter(Boolean)
  return parts.map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return <code key={index}>{part.slice(1, -1)}</code>
    }
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={index}>{part.slice(2, -2)}</strong>
    }
    const link = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/)
    if (link) {
      return (
        <a key={index} href={link[2]} target="_blank" rel="noreferrer noopener">
          {link[1]}
        </a>
      )
    }
    return <span key={index}>{part}</span>
  })
}

/**
 * Parse a lightweight markdown subset into block descriptors.
 * Supports: fenced code, headings, ordered/unordered lists, blockquotes,
 * horizontal rules and paragraphs.
 */
function parseChatBlocks(source = '') {
  const lines = String(source).replace(/\r\n/g, '\n').split('\n')
  const blocks = []
  let index = 0

  const isBlockStart = (line) =>
    /^\s*(?:```|#{1,6}\s|>|[-*+]\s|\d+[.)]\s|(?:---|\*\*\*|___)\s*$)/.test(line)

  while (index < lines.length) {
    const line = lines[index]

    const fence = line.match(/^\s*```(\S+)?\s*$/)
    if (fence) {
      const language = (fence[1] || '').toLowerCase()
      const buffer = []
      index += 1
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
        buffer.push(lines[index])
        index += 1
      }
      index += 1
      blocks.push({ type: 'code', language, code: buffer.join('\n') })
      continue
    }

    if (!line.trim()) {
      index += 1
      continue
    }

    const heading = line.match(/^\s*(#{1,6})\s+(.*)$/)
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2].trim() })
      index += 1
      continue
    }

    if (/^\s*(?:---|\*\*\*|___)\s*$/.test(line)) {
      blocks.push({ type: 'hr' })
      index += 1
      continue
    }

    if (/^\s*>\s?/.test(line)) {
      const buffer = []
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        buffer.push(lines[index].replace(/^\s*>\s?/, ''))
        index += 1
      }
      blocks.push({ type: 'quote', text: buffer.join(' ') })
      continue
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items = []
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*+]\s+/, '').trim())
        index += 1
      }
      blocks.push({ type: 'ul', items })
      continue
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items = []
      while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*\d+[.)]\s+/, '').trim())
        index += 1
      }
      blocks.push({ type: 'ol', items })
      continue
    }

    const buffer = [line.trim()]
    index += 1
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) {
      buffer.push(lines[index].trim())
      index += 1
    }
    blocks.push({ type: 'p', text: buffer.join(' ') })
  }

  return blocks
}

function ChatCodeBlock({ code, language }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await window.navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      // Clipboard unavailable — silently ignore.
    }
  }, [code])

  return (
    <div className="chat-code">
      <div className="chat-code-head">
        <span className="chat-code-lang">{language || 'text'}</span>
        <button type="button" className="chat-code-copy" onClick={handleCopy}>
          {copied ? <Check size={12} /> : <Copy size={12} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="chat-code-block">{code}</pre>
    </div>
  )
}

function ChatMarkdown({ content }) {
  const blocks = useMemo(() => parseChatBlocks(content), [content])

  return blocks.map((block, index) => {
    switch (block.type) {
      case 'code':
        return block.language === 'mermaid'
          ? <DiagramBlock code={block.code} key={`d-${index}`} />
          : <ChatCodeBlock code={block.code} language={block.language} key={`c-${index}`} />
      case 'heading':
        return (
          <strong className={`chat-md-heading level-${Math.min(block.level, 3)}`} key={`h-${index}`}>
            {renderInlineMarkdown(block.text)}
          </strong>
        )
      case 'ul':
        return (
          <ul className="chat-md-list" key={`ul-${index}`}>
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>{renderInlineMarkdown(item)}</li>
            ))}
          </ul>
        )
      case 'ol':
        return (
          <ol className="chat-md-list ordered" key={`ol-${index}`}>
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>{renderInlineMarkdown(item)}</li>
            ))}
          </ol>
        )
      case 'quote':
        return <blockquote className="chat-md-quote" key={`q-${index}`}>{renderInlineMarkdown(block.text)}</blockquote>
      case 'hr':
        return <hr className="chat-md-rule" key={`hr-${index}`} />
      default:
        return <p key={`p-${index}`}>{renderInlineMarkdown(block.text)}</p>
    }
  })
}

function buildChatReportFacts(analysis) {
  if (!analysis) return null
  const flows = analysis.flows?.available || []
  return {
    repo: analysis.repoName,
    files: analysis.summary?.fileCount ?? 0,
    graph: `${analysis.graph?.nodes?.length || 0} nodes / ${analysis.graph?.edges?.length || 0} edges`,
    flows: flows.slice(0, 3).map((flow) => flow.label).join(', ') || 'Not Detected',
    languages: (analysis.summary?.languageBreakdown || []).slice(0, 3).map((item) => `${LANGUAGE_LABELS[item.language] || item.language} ${item.count}`).join(', ') || 'Unable to Verify',
  }
}

function ReportFacts({ facts }) {
  if (!facts) return null
  return (
    <div className="chat-report-facts" aria-label="Report data used">
      <span>Report data</span>
      <strong>{facts.repo}</strong>
      <em>{facts.files} files</em>
      <em>{facts.graph}</em>
      <em>Flows: {facts.flows}</em>
      <em>Languages: {facts.languages}</em>
    </div>
  )
}

function ChatMessage({ message, onCopy }) {
  const [copied, setCopied] = useState(false)
  const isAssistant = message.role === 'assistant'

  const handleCopy = useCallback(async () => {
    await onCopy(message.content)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }, [message.content, onCopy])

  return (
    <div className={`chat-bubble ${message.role}`}>
      {isAssistant && (
        <span className="chat-avatar" aria-hidden="true">
          <Sparkles size={13} />
        </span>
      )}
      <div className="chat-content-wrap">
        <div className="chat-content">
          <ChatMarkdown content={message.content} />
          {isAssistant && <ReportFacts facts={message.reportFacts} />}
        </div>
        <button className="chat-copy-btn" onClick={handleCopy} title="Copy message">
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </button>
      </div>
    </div>
  )
}

const QUICK_PROMPTS = [
  'Explain the architecture',
  'What is the core flow?',
  'Where should I start?',
  'What are the biggest risks?',
]

/**
 * The empty state is where most people stall — a blank box does not tell you
 * what this assistant is actually good at. Each card names a question the
 * scanner can genuinely answer from the graph and the file inventory.
 */
const STARTER_PROMPTS = [
  {
    label: 'How is this codebase put together?',
    hint: 'Layers, entry points and the path a request takes',
    question: 'Explain the architecture of this repository: the layers, the entry points, and how a request moves through it.',
  },
  {
    label: 'What breaks if I change this?',
    hint: 'Blast radius for the file you have selected',
    question: 'If I change the currently selected file, what else is affected? Name the dependants.',
  },
  {
    label: 'Where should a new engineer start?',
    hint: 'Reading order grounded in real imports',
    question: 'Where should a new engineer start reading this codebase, and in what order?',
  },
  {
    label: 'What are the real risks here?',
    hint: 'Circular deps, dead code, unresolved imports',
    question: 'What are the biggest architectural risks in this repository, and which files carry them?',
  },
  {
    label: 'Walk me through the main flow',
    hint: 'Step by step, naming each file',
    question: 'Walk me through the main execution flow step by step, naming the file and symbol at each step.',
  },
  {
    label: 'How does the data layer work?',
    hint: 'Storage, models and where they are touched',
    question: 'How does the data layer work here — what stores state, and which files read or write it?',
  },
]

function buildFollowUps(analysis, messages) {
  if (!analysis) return []
  const flows = (analysis.flows?.available || []).map((flow) => flow.label).filter(Boolean)
  const files = (analysis.summary?.importantFiles || []).map((file) => file.path).filter(Boolean)
  const lastQuestion = messages.filter((message) => message.role === 'user').slice(-1)[0]?.content || ''

  const pool = [
    flows[0] ? `Walk me through the ${flows[0]} flow step by step` : null,
    files[0] ? `What does \`${files[0]}\` do?` : null,
    'Where are the biggest risks in this repo?',
    files[1] ? `How does \`${files[1]}\` connect to the rest of the repo?` : null,
    flows[1] ? `Explain the ${flows[1]} flow` : null,
    'How would I add a new feature to this codebase?',
  ].filter(Boolean)

  return pool.filter((prompt) => prompt !== lastQuestion).slice(0, 3)
}

function App() {
  const [repoUrl, setRepoUrl] = useState('')
  const [recentProjects, setRecentProjects] = useState([])
  const [recentState, setRecentState] = useState({ loading: true, openingId: '', deletingId: '' })
  const [showRecentProjects, setShowRecentProjects] = useState(false)
  const [catalog, setCatalog] = useState(FALLBACK_MODEL_CATALOG)
  const [analysis, setAnalysis] = useState(null)
  const [graphScope, setGraphScope] = useState('repo')
  const [activeArchitectureFlow, setActiveArchitectureFlow] = useState(null)
  const [commitHistory, setCommitHistory] = useState(null)
  const [commitHistoryState, setCommitHistoryState] = useState({ loading: false, error: '' })
  const [reportState, setReportState] = useState({ loading: false, error: '', open: false, url: '', filename: '', size: 0 })
  const [job, setJob] = useState(null)
  const [viewMode, setViewMode] = useState('3d')
  const [selectedNodeId, setSelectedNodeId] = useState('')
  const [summaryClosedNodeId, setSummaryClosedNodeId] = useState('')
  const [hoveredNodeId, setHoveredNodeId] = useState('')
  const [filterLanguages, setFilterLanguages] = useState([])
  const [filterCategories, setFilterCategories] = useState([])
  const [showFilterMenu, setShowFilterMenu] = useState(false)
  const [filterType, setFilterType] = useState('language') // 'language' or 'category'
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [fileState, setFileState] = useState({ loading: false, data: null, error: '' })
  const [editorFontSize, setEditorFontSize] = useState(13)
  const [editorWordWrap, setEditorWordWrap] = useState(true)
  const [editorMinimap, setEditorMinimap] = useState(false)
  const [editorLineNumbers, setEditorLineNumbers] = useState(true)
  const [chatInputRows, setChatInputRows] = useState(1)
  const [isChatOpen, setIsChatOpen] = useState(false)
  // The dock is fine for a quick follow-up; a real research session needs the
  // whole window. Expanding lifts the same panel into a full-screen overlay.
  const [isChatExpanded, setIsChatExpanded] = useState(false)
  const [displayJobProgress, setDisplayJobProgress] = useState(0)
  const displayJobIdRef = useRef('')
  const [chatPanelHeight, setChatPanelHeight] = useState(() => {
    try {
      const raw = window.localStorage.getItem('aliya-ai-chat-height')
      const value = raw ? Number(raw) : 320
      return Number.isFinite(value) ? Math.max(220, Math.min(720, value)) : 320
    } catch {
      return 320
    }
  })
  
  const mouseGlowRef = useRef(null)
  const chatMessagesRef = useRef(null)
  const rightPaneRef = useRef(null)
  const filterButtonRef = useRef(null)
  const paneActionsRef = useRef(null)
  const reportUrlRef = useRef('')
  const [toolbarScroll, setToolbarScroll] = useState({ canLeft: false, canRight: false })
  const chatResizeStateRef = useRef({ dragging: false, startY: 0, startHeight: 0 })
  const [filterMenuPosition, setFilterMenuPosition] = useState({ top: 0, left: 0, width: 320 })
  
  const [assistantConfig, setAssistantConfig] = useState(() => loadStoredConfig())
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Analyze a repository to ask questions about its architecture and codebase.' }
  ])
  const [aiBusy, setAiBusy] = useState(false)
  // The answer being streamed right now. Kept out of `messages` so a partial
  // answer can never be mistaken for a finished one (and so React never has to
  // splice a placeholder into the list mid-render).
  const [streamingText, setStreamingText] = useState('')
  const [error, setError] = useState('')

  const deferredSearch = useDeferredValue('')
  const activeProvider = assistantConfig.provider || 'openai'
  const modelCatalog = catalog || FALLBACK_MODEL_CATALOG
  const activeProviderInfo = modelCatalog[activeProvider]
  const providerModels = modelCatalog[activeProvider]?.models || []
  const effectiveModel = assistantConfig.model === '__custom__'
    ? assistantConfig.customModel.trim()
    : assistantConfig.model
  const effectiveAssistantConfig = useMemo(() => ({
    ...assistantConfig,
    model: effectiveModel,
  }), [assistantConfig, effectiveModel])
  const activeFilterCount = filterType === 'language' ? filterLanguages.length : filterCategories.length

  const updateFilterMenuPosition = useCallback(() => {
    const button = filterButtonRef.current
    if (!button) return

    const rect = button.getBoundingClientRect()
    const width = Math.min(340, Math.max(280, window.innerWidth - 24))
    const left = Math.min(
      Math.max(12, rect.right - width),
      Math.max(12, window.innerWidth - width - 12),
    )
    const maxTop = Math.max(12, window.innerHeight - 120)
    const top = Math.min(rect.bottom + 10, maxTop)

    setFilterMenuPosition({ top, left, width })
  }, [])

  const updateToolbarScroll = useCallback(() => {
    const toolbar = paneActionsRef.current
    if (!toolbar) return
    setToolbarScroll({
      canLeft: toolbar.scrollLeft > 2,
      canRight: toolbar.scrollLeft + toolbar.clientWidth < toolbar.scrollWidth - 2,
    })
  }, [])

  const scrollToolbar = useCallback((direction) => {
    paneActionsRef.current?.scrollBy({ left: direction * 260, behavior: 'smooth' })
  }, [])

  useEffect(() => {
    const frame = window.requestAnimationFrame(updateToolbarScroll)
    window.addEventListener('resize', updateToolbarScroll)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', updateToolbarScroll)
    }
  }, [analysis, graphScope, updateToolbarScroll])

  useEffect(() => {

    fetchRecentProjects()
      .then((payload) => setRecentProjects(payload.projects || []))
      .catch(() => setRecentProjects([]))
      .finally(() => setRecentState((current) => ({ ...current, loading: false })))

    fetchModelCatalog().then((payload) => {
      setCatalog(payload)
      setAssistantConfig((current) => {
        const currentProviderModels = payload[current.provider]?.models || []
        const recommended = currentProviderModels.find(m => m.recommended)?.id || currentProviderModels[0]?.id || ''
        return { ...current, model: current.model && currentProviderModels.some(m => m.id === current.model) ? current.model : recommended }
      })
    }).catch(() => {
      setCatalog(FALLBACK_MODEL_CATALOG)
    })

    const handleMouseMove = (e) => {
      if (mouseGlowRef.current) {
        mouseGlowRef.current.animate({
          left: `${e.clientX}px`,
          top: `${e.clientY}px`
        }, { duration: 2000, fill: "forwards", easing: "ease-out" })
      }
    }
    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isFullscreen) {
        if (graphScope === 'architecture') closeArchitectureExplorer()
        else setIsFullscreen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isFullscreen, graphScope])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showFilterMenu && !event.target.closest('.filter-dropdown') && !event.target.closest('.filter-menu')) {
        setShowFilterMenu(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showFilterMenu])

  useEffect(() => {
    if (!showFilterMenu) return
    updateFilterMenuPosition()
    window.addEventListener('resize', updateFilterMenuPosition)
    window.addEventListener('scroll', updateFilterMenuPosition, true)
    return () => {
      window.removeEventListener('resize', updateFilterMenuPosition)
      window.removeEventListener('scroll', updateFilterMenuPosition, true)
    }
  }, [showFilterMenu, updateFilterMenuPosition])

  useEffect(() => {
    window.localStorage.setItem('aliya-ai-config', JSON.stringify(assistantConfig))
  }, [assistantConfig])

  useEffect(() => {
    try {
      window.localStorage.setItem('aliya-ai-chat-height', String(chatPanelHeight))
    } catch {
      // ignore
    }
  }, [chatPanelHeight])

  useEffect(() => {
    if (!chatMessagesRef.current) return
    chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight
  }, [messages, aiBusy])

  useEffect(() => {
    const incomingJobId = String(job?.id || '')
    const incomingProgress = clampPercent(job?.progress ?? 0)

    if (!incomingJobId) {
      displayJobIdRef.current = ''
      setDisplayJobProgress(incomingProgress)
      return
    }

    if (displayJobIdRef.current !== incomingJobId) {
      displayJobIdRef.current = incomingJobId
      setDisplayJobProgress(incomingProgress)
      return
    }

    setDisplayJobProgress((prev) => {
      const next = Math.max(prev, incomingProgress)
      if (job?.status === 'completed') return 100
      return next
    })
  }, [job?.id, job?.progress, job?.status])

  useEffect(() => {
    if (!analysis?.repoId || graphScope !== 'commits' || commitHistory) return

    let cancelled = false
    setCommitHistoryState({ loading: true, error: '' })
    fetchCommitHistory(analysis.repoId, 150)
      .then((payload) => {
        if (!cancelled) {
          setCommitHistory(payload)
          setCommitHistoryState({ loading: false, error: '' })
        }
      })
      .catch((e) => {
        if (!cancelled) setCommitHistoryState({ loading: false, error: e.message })
      })

    return () => { cancelled = true }
  }, [analysis?.repoId, graphScope, commitHistory])

  const loadCommitHistory = useCallback((repoId) => {
    if (!repoId) return

    setCommitHistoryState({ loading: true, error: '' })
    fetchCommitHistory(repoId, 150)
      .then((payload) => {
        setCommitHistory(payload)
        setCommitHistoryState({ loading: false, error: '' })
      })
      .catch((e) => {
        setCommitHistoryState({ loading: false, error: e.message })
      })
  }, [])

  const revokeReportUrl = useCallback(() => {
    if (reportUrlRef.current) {
      window.URL.revokeObjectURL(reportUrlRef.current)
      reportUrlRef.current = ''
    }
  }, [])

  useEffect(() => () => revokeReportUrl(), [revokeReportUrl])

  const resetReportState = useCallback(() => {
    revokeReportUrl()
    setReportState({ loading: false, error: '', open: false, url: '', filename: '', size: 0 })
  }, [revokeReportUrl])

  const handleDownloadPdfReport = useCallback(async () => {
    if (!analysis) return

    revokeReportUrl()
    setReportState({ loading: true, error: '', open: true, url: '', filename: '', size: 0 })
    try {
      let reportCommitHistory = commitHistory
      if (!reportCommitHistory && analysis.repoId) {
        try {
          const payload = await fetchCommitHistory(analysis.repoId, 150)
          reportCommitHistory = payload
          setCommitHistory(payload)
          setCommitHistoryState({ loading: false, error: '' })
        } catch (fetchErr) {
          console.warn('Could not fetch commit history for PDF:', fetchErr)
          reportCommitHistory = null
        }
      }

      const blob = generateRepositoryPdfReport({
        analysis,
        commitHistory: reportCommitHistory,
        activeArchitectureFlow,
      })
      const safeName = (analysis.repoName || 'repository').replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase()
      const filename = `${safeName || 'repository'}-report.pdf`
      const url = window.URL.createObjectURL(blob)
      reportUrlRef.current = url
      setReportState({ loading: false, error: '', open: true, url, filename, size: blob.size })
    } catch (e) {
      console.error('PDF generation error:', e)
      const message = e?.message || 'PDF report generation failed.'
      setReportState({ loading: false, error: message, open: true, url: '', filename: '', size: 0 })
    }
  }, [activeArchitectureFlow, analysis, commitHistory, revokeReportUrl])

  const openPdfReport = useCallback(() => {
    if (reportState.url) {
      setReportState((current) => ({ ...current, open: true }))
      return
    }
    void handleDownloadPdfReport()
  }, [reportState.url, handleDownloadPdfReport])

  const downloadPdfReport = useCallback(() => {
    const { url, filename } = reportState
    if (!url) return
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename || 'repository-report.pdf'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  }, [reportState])

  const openPdfReportInTab = useCallback(() => {
    if (reportState.url) window.open(reportState.url, '_blank', 'noopener,noreferrer')
  }, [reportState.url])

  const closePdfViewer = useCallback(() => {
    setReportState((current) => ({ ...current, open: false }))
  }, [])

  // Optimize graph building using useCallback and useMemo
  const visibleGraph = useMemo(() => {
    const baseGraph = buildVisibleGraph(analysis, {
      limit: 300,
      search: deferredSearch,
      extraSeedNodes: [selectedNodeId].filter(Boolean),
    })

    // Start with base graph nodes, then apply coloring based on filter type
    const nodesWithColor = baseGraph.nodes.map(node => ({
      ...node,
      color: filterType === 'category' ? getNodeCategoryColor(node) : node.color
    }));

    // Collect active items for legend
    const activeItems = new Set();
    nodesWithColor.forEach(node => {
      if (node.type !== 'folder') {
        if (filterType === 'category') {
          activeItems.add(getNodeCategoryLabel(node));
        } else {
          activeItems.add(getNodeLanguageLabel(node));
        }
      }
    });

    // Apply filtering if needed
    let filteredNodes = nodesWithColor;
    let filteredEdges = baseGraph.edges;

    if (filterType === 'language' && filterLanguages.length > 0) {
      filteredNodes = nodesWithColor.filter(node => 
        filterLanguages.includes(getNodeLanguageLabel(node))
      );
    } else if (filterType === 'category' && filterCategories.length > 0) {
      filteredNodes = nodesWithColor.filter(node => 
        filterCategories.includes(getNodeCategoryLabel(node))
      );
    }

    // If we filtered nodes, filter edges too
    if ((filterType === 'language' && filterLanguages.length > 0) || 
        (filterType === 'category' && filterCategories.length > 0)) {
      const nodeIdSet = new Set(filteredNodes.map(n => n.id));
      filteredEdges = baseGraph.edges.filter(e => 
        nodeIdSet.has(e.source) && nodeIdSet.has(e.target)
      );
    }

    // Build final visible graph
    return {
      ...baseGraph,
      nodes: filteredNodes,
      edges: filteredEdges,
      languages: Array.from(activeItems).sort()
    };
  }, [analysis, deferredSearch, filterLanguages, filterCategories, filterType, selectedNodeId])

  const selectedNode = useMemo(() => analysis?.graph.nodes.find(n => n.id === selectedNodeId) || null, [analysis, selectedNodeId])
  const architectureFlowCount = useMemo(() => (
    (analysis?.flows?.available || []).filter((flow) =>
      Array.isArray(flow.nodes) &&
      flow.nodes.length > 0 &&
      Array.isArray(flow.stages) &&
      flow.stages.length > 0
    ).length
  ), [analysis])

  const followUps = useMemo(
    () => (aiBusy || messages.length < 2 ? [] : buildFollowUps(analysis, messages)),
    [aiBusy, analysis, messages],
  )

  const clearChat = useCallback(() => {
    setMessages([{ role: 'assistant', content: 'Repository indexed. Ask about architecture, dependencies, or files.' }])
  }, [])

  useEffect(() => {
    setSummaryClosedNodeId('')
  }, [selectedNodeId])

  useEffect(() => {
    if (!analysis || !selectedNodeId.startsWith('file:')) return
    let cancelled = false
    const filePath = selectedNodeId.replace(/^file:/, '')
    
    setFileState({ loading: true, data: null, error: '' })
    fetchRepositoryFile(analysis.repoId, filePath)
      .then(data => { if (!cancelled) setFileState({ loading: false, data, error: '' }) })
      .catch(e => { if (!cancelled) setFileState({ loading: false, data: null, error: e.message }) })
    return () => { cancelled = true }
  }, [analysis, selectedNodeId])

  const handleSelectNode = useCallback((nodeId) => {
    // Toggle selection: if same node is clicked, deselect it
    if (selectedNodeId === nodeId) {
      setSelectedNodeId('')
      setFileState({ loading: false, data: null, error: '' })
    } else {
      setSelectedNodeId(nodeId)
      if (!nodeId?.startsWith('file:')) {
        setFileState({ loading: false, data: null, error: '' })
      }
    }
  }, [selectedNodeId])

  const handleHoverNode = useCallback((nodeId) => {
    setHoveredNodeId(nodeId)
  }, [])

  async function pollJob(jobId) {
    while (true) {
      const snapshot = await fetchJob(jobId)
      setJob(snapshot)
      if (snapshot.status === 'completed') {
        startTransition(() => setAnalysis(snapshot.result))
        fetchRecentProjects()
          .then((payload) => setRecentProjects(payload.projects || []))
          .catch(() => {})
        loadCommitHistory(snapshot.result.repoId)
        setError('')
        setMessages([{ role: 'assistant', content: 'Repository indexed. Ask about architecture, dependencies, or files.' }])
        return
      }
      if (snapshot.status === 'failed') {
        setError(snapshot.error || 'Analysis failed.')
        return
      }
      await new Promise(r => window.setTimeout(r, 200))
    }
  }

  async function handleAnalyze(e) {
    e.preventDefault()
    if (!repoUrl.trim()) return setError('Enter a GitHub repository URL.')
    setError('')
    setAnalysis(null)
    setGraphScope('repo')
    setActiveArchitectureFlow(null)
    setCommitHistory(null)
    setCommitHistoryState({ loading: false, error: '' })
    resetReportState()
    setSelectedNodeId('')
    setHoveredNodeId('')
    setFileState({ loading: false, data: null, error: '' })
    setQuestion('')
    setJob({ status: 'queued', phase: 'queued', progress: 0, message: 'Starting analysis...' })
    displayJobIdRef.current = ''
    setDisplayJobProgress(0)
    try {
      const { jobId } = await startRepositoryAnalysis(repoUrl.trim())
      await pollJob(jobId)
    } catch (e) {
      setError(e.message)
    }
  }

  async function openRecentProject(repoId) {
    setError('')
    setRecentState((current) => ({ ...current, openingId: repoId }))
    try {
      const savedAnalysis = await fetchRepository(repoId)
      setGraphScope('repo')
      setActiveArchitectureFlow(null)
      setCommitHistory(null)
      resetReportState()
      setSelectedNodeId('')
      setHoveredNodeId('')
      setFileState({ loading: false, data: null, error: '' })
      startTransition(() => setAnalysis(savedAnalysis))
      setShowRecentProjects(false)
      setRecentProjects((current) => current.map((project) => (
        project.repoId === repoId ? { ...project, viewedAt: new Date().toISOString() } : project
      )).sort((a, b) => String(b.viewedAt).localeCompare(String(a.viewedAt))))
    } catch (e) {
      setError(e.message)
    } finally {
      setRecentState((current) => ({ ...current, openingId: '' }))
    }
  }

  async function removeRecentProject(event, project) {
    event.stopPropagation()
    if (!window.confirm(`Delete ${project.repoName}? This also removes its saved repository data.`)) return
    setError('')
    setRecentState((current) => ({ ...current, deletingId: project.repoId }))
    try {
      await deleteRepository(project.repoId)
      setRecentProjects((current) => current.filter((item) => item.repoId !== project.repoId))
    } catch (e) {
      setError(e.message)
    } finally {
      setRecentState((current) => ({ ...current, deletingId: '' }))
    }
  }

  async function submitQuestion(promptText) {
    const prompt = promptText.trim()
    if (!analysis || !assistantConfig.apiKey.trim() || !prompt) return
    setError('')
    setAiBusy(true)
    setStreamingText('')
    setMessages(current => [...current, { role: 'user', content: prompt }])
    setQuestion('')

    // Build conversation history for follow-up context (last 6 messages)
    const conversationHistory = messages.slice(-6).map(m => ({ role: m.role, content: m.content }))
    const reportFacts = buildChatReportFacts(analysis)
    const payload = {
      repoId: analysis.repoId,
      provider: assistantConfig.provider,
      model: effectiveModel,
      apiKey: assistantConfig.apiKey,
      question: prompt,
      selectedPath: selectedNode?.type === 'folder' ? '' : selectedNode?.path || '',
      focusedNodeIds: selectedNodeId ? [selectedNodeId, ...(analysis.graph.adjacency[selectedNodeId] || [])] : [],
      conversationHistory,
    }

    try {
      let answer
      try {
        answer = await askRepositoryQuestionStream(payload, {
          onDelta: (_chunk, fullText) => setStreamingText(fullText),
        })
      } catch (streamError) {
        // Streaming is a nicety, not a requirement. If a proxy buffers the
        // response or the provider refuses to stream, fall back to the buffered
        // endpoint instead of surfacing an error.
        console.warn('Streaming failed, falling back:', streamError.message)
        const response = await askRepositoryQuestion(payload)
        answer = response.answer
      }

      setMessages(current => [...current, { role: 'assistant', content: answer, reportFacts }])
    } catch (e) {
      setError(e.message)
    } finally {
      setStreamingText('')
      setAiBusy(false)
    }
  }

  async function copyCurrentFileContent() {
    const content = fileState.data?.content
    if (!content) return
    try {
      await window.navigator.clipboard.writeText(content)
    } catch {
      setError('Could not copy file content to clipboard.')
    }
  }

  async function copyMessageContent(content) {
    if (!content) return
    try {
      await window.navigator.clipboard.writeText(content)
    } catch {
      setError('Could not copy chat message to clipboard.')
    }
  }

  function beginChatResize(e) {
    chatResizeStateRef.current = {
      dragging: true,
      startY: e.clientY,
      startHeight: chatPanelHeight,
    }

    const handleMove = (moveEvent) => {
      if (!chatResizeStateRef.current.dragging) return
      const deltaY = chatResizeStateRef.current.startY - moveEvent.clientY
      const paneHeight = rightPaneRef.current?.getBoundingClientRect().height || 900
      const maxHeight = Math.max(260, Math.floor(paneHeight * 0.8))
      const next = Math.max(220, Math.min(maxHeight, chatResizeStateRef.current.startHeight + deltaY))
      setChatPanelHeight(next)
    }

    const handleUp = () => {
      chatResizeStateRef.current.dragging = false
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }

  function handleReset() {
    setAnalysis(null)
    setJob(null)
    setRepoUrl('')
    setShowRecentProjects(false)
    setGraphScope('repo')
    setActiveArchitectureFlow(null)
    setCommitHistory(null)
    setCommitHistoryState({ loading: false, error: '' })
    resetReportState()
  }

  function closeArchitectureExplorer() {
    setActiveArchitectureFlow(null)
    setGraphScope('repo')
    setViewMode('3d')
    setIsFullscreen(false)
    setSelectedNodeId('')
    setHoveredNodeId('')
    setFileState({ loading: false, data: null, error: '' })
  }

  if (!analysis) {
    const totalPercent = displayJobProgress
    const currentPhaseIndex = Math.max(0, ANALYSIS_PHASES.indexOf(job?.phase || 'queued'))

    return (
      <div className="tv-landing">
        <div className="tv-cursor-glow" ref={mouseGlowRef}></div>

        <header className="tv-nav">
          <div className="tv-nav-inner">
            <Logo />
            <span className="tv-nav-tag">Code intelligence</span>
            <div className="tv-nav-actions">
              <span className="tv-nav-status">
                <i aria-hidden="true" />
                Local-first
              </span>
              <button
                type="button"
                className="tv-nav-cta"
                onClick={() => setShowRecentProjects(true)}
              >
                <Clock3 size={14} />
                Recent Projects
                {recentProjects.length > 0 && <em>{recentProjects.length}</em>}
              </button>
            </div>
          </div>
        </header>

        <main className="tv-hero">
          <div className="tv-hero-inner">
            <span className="tv-eyebrow">
              <i aria-hidden="true" />
              Local scan · nothing leaves your machine
            </span>

            <h1 className="tv-headline">
              Understand a GitHub repo
              <br />
              <span className="tv-headline-accent">in minutes.</span>
            </h1>

            <p className="tv-lede">
              Paste a repository URL. Aliya AI builds a clean architecture graph,
              repo-only answers, and report-ready evidence without extra setup.
            </p>

            <div className="tv-cta">
              {job && job.status !== 'failed' && job.status !== 'completed' ? (
                <div className="tv-loader" role="status" aria-live="polite">
                  <div className="tv-loader-head">
                    <span className="tv-loader-pulse">
                      <LoaderCircle className="spin" size={20} />
                    </span>
                    <div className="tv-loader-copy">
                      <p className="tv-loader-title">{phaseLabel(job.phase)}</p>
                      <p className="tv-loader-message">{job.message}</p>
                    </div>
                    <strong className="tv-loader-percent">{totalPercent}%</strong>
                  </div>

                  <div className="tv-progress" aria-label={`Total analysis ${totalPercent}%`}>
                    <div className="tv-progress-fill" style={{ width: `${totalPercent}%` }} />
                  </div>

                  <div className="tv-steps">
                    {ANALYSIS_PHASES.slice(0, -1).map((phase, index) => (
                      <span
                        key={phase}
                        className={`tv-step ${index < currentPhaseIndex ? 'is-complete' : ''} ${phase === job.phase ? 'is-active' : ''}`}
                      >
                        {phaseLabel(phase)}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <form className="tv-form" onSubmit={handleAnalyze}>
                    <GitBranch size={18} className="tv-form-icon" />
                    <input
                      value={repoUrl}
                      onChange={(e) => setRepoUrl(e.target.value)}
                      placeholder="https://github.com/owner/repository"
                      aria-label="GitHub repository URL"
                      autoFocus
                    />
                    <button
                      type="submit"
                      disabled={!repoUrl.trim()}
                      title="Analyze repository"
                      aria-label="Analyze repository"
                    >
                      <ArrowRight size={18} />
                    </button>
                  </form>
                  <p className="tv-form-note">
                    <ShieldCheck size={13} />
                    Public repositories · Local scan · Verified graph
                  </p>
                </>
              )}
            </div>

            {error && <div className="tv-error">{error}</div>}

            {!job && (
              <ul className="tv-benefits">
                <li><Network size={15} /><span>Architecture graph</span></li>
                <li><Zap size={15} /><span>Short repo answers</span></li>
                <li><ShieldCheck size={15} /><span>Local-first scan</span></li>
              </ul>
            )}
          </div>
        </main>

        <footer className="tv-footer">
          <span>Built for developers who need clarity, fast.</span>
          <div className="tv-badge">
            CREATED BY <span>GOKUL RAJ</span>
          </div>
        </footer>

        {showRecentProjects && (
          <div className="modal-overlay" onClick={() => setShowRecentProjects(false)}>
            <div className="modal-content recent-projects-modal" onClick={(event) => event.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <h3>Recent Projects</h3>
                  <p>Open a saved project without analyzing it again.</p>
                </div>
                <button onClick={() => setShowRecentProjects(false)} className="close-btn"><X size={16}/></button>
              </div>
              <div className="recent-projects modal-project-list" aria-label="Recent projects">
                {recentState.loading ? (
                  <div className="recent-projects-loading"><LoaderCircle className="spin" size={18} /> Loading projects...</div>
                ) : recentProjects.length > 0 ? (
                  <div className="recent-projects-grid">
                    {recentProjects.map((project) => (
                      <div className="recent-project-card" key={project.repoId}>
                        <button
                          type="button"
                          className="recent-project-open"
                          onClick={() => openRecentProject(project.repoId)}
                          disabled={recentState.openingId === project.repoId || recentState.deletingId === project.repoId}
                        >
                          <span className="recent-project-icon"><GitBranch size={17} /></span>
                          <span className="recent-project-copy">
                            <strong>{project.repoName}</strong>
                            <small>{project.fileCount} files · {project.nodeCount} nodes</small>
                          </span>
                        </button>
                        {recentState.openingId === project.repoId ? (
                          <LoaderCircle className="spin recent-project-action" size={17} />
                        ) : (
                          <button
                            type="button"
                            className="recent-project-delete"
                            title={`Delete ${project.repoName}`}
                            onClick={(event) => removeRecentProject(event, project)}
                            disabled={recentState.deletingId === project.repoId}
                          ><Trash2 size={15} /></button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="recent-projects-empty">
                    <GitBranch size={20} />
                    <span>No saved projects yet.</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="app-layout">
      <header className="navbar">
        <div className="brand">
          <Logo />
        </div>

        {analysis && (
          <div className="nav-repo-context">
            <span className="nav-repo-icon"><GitBranch size={14} /></span>
            <div className="nav-repo-copy">
              <strong>{analysis.repoName}</strong>
              <span>
                {analysis.branch || 'HEAD'} · {analysis.summary?.fileCount || analysis.files?.length || 0} files ·{' '}
                {analysis.graph?.nodes?.length || 0} nodes
              </span>
            </div>
            <span className={`nav-ai-status ${assistantConfig.apiKey ? 'is-ready' : ''}`}>
              <span className="nav-ai-dot" />
              {assistantConfig.apiKey ? 'AI ready' : 'AI offline'}
            </span>
          </div>
        )}

        <div className="nav-actions">
          <button className="icon-button" onClick={() => setShowRecentProjects(true)}>
            <Clock3 size={16} />
            Recent Projects
            {recentProjects.length > 0 && <span className="nav-count-badge">{recentProjects.length}</span>}
          </button>
          <button className="icon-button" onClick={handleReset}>
            <Search size={16} />
            New Analysis
          </button>
          <button className="icon-button" onClick={() => setIsSettingsOpen(true)}>
            <Settings2 size={16} />
            Connect AI
          </button>
        </div>
      </header>

      <main className={`main-content ${graphScope === 'architecture' ? 'architecture-layout' : ''} ${isFullscreen ? 'graph-fullscreen-active' : ''}`}>
        <section className="left-pane">
          <div className="pane-header">
            <div className="pane-title-block">
              <h3>{analysis?.repoName || 'Graph View'}</h3>
              {analysis && (
                <span>
                  {analysis.summary?.fileCount || analysis.files?.length || 0} files · {analysis.summary?.folderCount || 0} folders · {analysis.graph?.nodes?.length || 0} nodes
                </span>
              )}
            </div>
            <div className="pane-action-scroller">
              <button
                type="button"
                className="pane-scroll-arrow"
                onClick={() => scrollToolbar(-1)}
                disabled={!toolbarScroll.canLeft}
                title="Scroll controls left"
                aria-label="Scroll graph controls left"
              >
                <ChevronLeft size={16} />
              </button>
              <div className="pane-actions" ref={paneActionsRef} onScroll={updateToolbarScroll}>
              {graphScope === 'repo' && (
                <>
                  <div className="filter-dropdown" style={{ position: 'relative' }}>
                    <button 
                      ref={filterButtonRef}
                      className={`filter-button ${showFilterMenu ? 'active' : ''}`}
                      onClick={() => {
                        updateFilterMenuPosition()
                        setShowFilterMenu(!showFilterMenu)
                      }}
                    >
                      <Filter size={14} />
                      <span>Filters</span>
                      {activeFilterCount > 0 && <span className="filter-count-chip">{activeFilterCount}</span>}
                      <ChevronDown size={12} className={showFilterMenu ? 'rotate-up' : ''} />
                    </button>
                    {showFilterMenu && (
                      <div
                        className="filter-menu"
                        style={{
                          top: `${filterMenuPosition.top}px`,
                          left: `${filterMenuPosition.left}px`,
                          width: `${filterMenuPosition.width}px`,
                        }}
                      >
                        {/* Filter Type Tabs */}
                        <div className="filter-type-tabs">
                          <button
                            className={`filter-type-tab ${filterType === 'language' ? 'active' : ''}`}
                            onClick={() => setFilterType('language')}
                          >
                            By Language
                          </button>
                          <button
                            className={`filter-type-tab ${filterType === 'category' ? 'active' : ''}`}
                            onClick={() => setFilterType('category')}
                          >
                            By Category
                          </button>
                        </div>

                        {filterType === 'language' ? (
                          <>
                            <div className="filter-header">Languages</div>
                            <div className="filter-list">
                              {Object.entries(LANGUAGE_COLORS).map(([key, color]) => (
                                <label key={key} className="filter-item">
                                  <input 
                                    type="checkbox" 
                                    checked={filterLanguages.includes(key)}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setFilterLanguages([...filterLanguages, key])
                                      } else {
                                        setFilterLanguages(filterLanguages.filter(l => l !== key))
                                      }
                                    }}
                                  />
                                  <span className="filter-color" style={{ backgroundColor: color }}></span>
                                  <span className="filter-label">{LANGUAGE_LABELS[key] || key}</span>
                                </label>
                              ))}
                            </div>
                            <div className="filter-actions">
                              <button 
                                onClick={() => setFilterLanguages(Object.keys(LANGUAGE_COLORS))}
                                className="filter-action-btn"
                              >
                                Select All
                              </button>
                              <button 
                                onClick={() => setFilterLanguages([])}
                                className="filter-action-btn"
                              >
                                Clear
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="filter-header">Categories</div>
                            <div className="filter-list">
                              {Object.entries(CATEGORY_NODE_COLORS).map(([key, color]) => (
                                <label key={key} className="filter-item">
                                  <input 
                                    type="checkbox" 
                                    checked={filterCategories.includes(key)}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setFilterCategories([...filterCategories, key])
                                      } else {
                                        setFilterCategories(filterCategories.filter(c => c !== key))
                                      }
                                    }}
                                  />
                                  <span className="filter-color" style={{ backgroundColor: color }}></span>
                                  <span className="filter-label">{CATEGORY_LABELS[key] || key}</span>
                                </label>
                              ))}
                            </div>
                            <div className="filter-actions">
                              <button 
                                onClick={() => setFilterCategories(Object.keys(CATEGORY_NODE_COLORS))}
                                className="filter-action-btn"
                              >
                                Select All
                              </button>
                              <button 
                                onClick={() => setFilterCategories([])}
                                className="filter-action-btn"
                              >
                                Clear
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
              <div className="toggle-group">
                <button className={graphScope === 'repo' ? 'active' : ''} onClick={() => setGraphScope('repo')}>Repo Graph</button>
                <button
                  className={graphScope === 'commits' ? 'active' : ''}
                  onClick={() => {
                    setGraphScope('commits')
                    if (analysis?.repoId && !commitHistory && !commitHistoryState.loading) {
                      loadCommitHistory(analysis.repoId)
                    }
                  }}
                >
                  Commit Graph
                </button>
                <button className={graphScope === 'runflow' ? 'active' : ''} onClick={() => setGraphScope('runflow')}>Run Flow</button>
                <button
                  className={graphScope === 'architecture' ? 'active architecture-tab' : 'architecture-tab'}
                  disabled={!analysis || architectureFlowCount === 0}
                  title={!analysis ? 'Analyze a repository first' : architectureFlowCount === 0 ? 'No verified architecture flow found in this repository' : 'Open verified architecture flows'}
                  onClick={() => {
                    if (!analysis || architectureFlowCount === 0) return
                    setGraphScope('architecture')
                    setIsFullscreen(true)
                  }}
                >
                  <Sparkles size={12} /> Architecture
                  {analysis && <span className="architecture-flow-count">{architectureFlowCount}</span>}
                </button>
                <button
                  className={graphScope === 'health' ? 'active' : ''}
                  onClick={() => setGraphScope('health')}
                >
                  <Activity size={12} /> Health Score
                </button>
              </div>
              {graphScope === 'architecture' ? (
                <span className="graph-mode-badge architecture-mode-badge">Guided Explorer</span>
              ) : graphScope !== 'repo' ? (
                <span className="graph-mode-badge">3D Only</span>
              ) : null}
              </div>
              <button
                type="button"
                className="pane-scroll-arrow"
                onClick={() => scrollToolbar(1)}
                disabled={!toolbarScroll.canRight}
                title="Scroll controls right"
                aria-label="Scroll graph controls right"
              >
                <ChevronRight size={16} />
              </button>
              <div className="graph-utility-actions">
                <button
                  className={`icon-button report-download-btn ${reportState.loading || reportState.open ? 'active' : ''}`}
                  onClick={openPdfReport}
                  disabled={!analysis || reportState.loading}
                  title="View & download repository PDF report"
                >
                  {reportState.loading ? <LoaderCircle size={16} className="spin" /> : <FileText size={16} />}
                  {reportState.loading ? 'Generating...' : 'PDF Report'}
                </button>
                <button 
                  className={`icon-button ${isFullscreen ? 'active' : ''}`} 
                  onClick={() => {
                    if (graphScope === 'architecture' && isFullscreen) closeArchitectureExplorer()
                    else setIsFullscreen(!isFullscreen)
                  }}
                  title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
                >
                  {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
                  {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                </button>
              </div>
            </div>
          </div>
          <div className={`graph-container ${isFullscreen ? 'fullscreen' : ''}`}>
            {isFullscreen && graphScope !== 'architecture' && (
              <button 
                className="fullscreen-exit-btn" 
                onClick={() => {
                  if (graphScope === 'architecture') closeArchitectureExplorer()
                  else setIsFullscreen(false)
                }}
                title="Exit Fullscreen"
              >
                <Minimize size={20} />
              </button>
            )}
            {!analysis ? (
              <div className="empty-state">
                <Network size={32} className="icon-muted" />
                <p>Enter a repository URL above to generate the graph.</p>
              </div>
            ) : (
              <>
                {/* Legend UI */}
                {graphScope === 'repo' && visibleGraph.languages && visibleGraph.languages.length > 0 && (
                  <div className="graph-legend">
                    <div className="legend-group-label">
                      {filterType === 'category' ? 'Colour · category' : 'Colour · language'}
                    </div>
                    {visibleGraph.languages.map(key => (
                      <div key={key} className="legend-item">
                        <span 
                          className="legend-color" 
                          style={{ 
                            backgroundColor: filterType === 'category' 
                              ? (CATEGORY_NODE_COLORS[key] || CATEGORY_NODE_COLORS.unknown)
                              : (LANGUAGE_COLORS[key] || LANGUAGE_COLORS.unknown)
                          }}
                        ></span>
                        {filterType === 'category' 
                          ? (CATEGORY_LABELS[key] || key)
                          : (LANGUAGE_LABELS[key] || key)
                        }
                      </div>
                    ))}
                    <div className="legend-group-label">Shape</div>
                    <div className="legend-item"><span className="legend-shape is-folder"></span>Folder</div>
                    <div className="legend-item"><span className="legend-shape is-file"></span>File</div>
                    <div className="legend-item"><span className="legend-shape is-key"></span>Key module</div>
                    <div className="legend-group-label">Edges</div>
                    <div className="legend-item"><span className="legend-line is-import"></span>Imports</div>
                    <div className="legend-item"><span className="legend-line is-contains"></span>Contains</div>
                  </div>
                )}
                {/* View-mode switch lives on the canvas itself, so it stays
                    reachable when the toolbar scrolls or the pane is narrow. */}
                {graphScope === 'repo' && (
                  <div className="graph-view-toggle" role="group" aria-label="Graph view mode">
                    <button
                      type="button"
                      className={viewMode === '3d' ? 'active' : ''}
                      aria-pressed={viewMode === '3d'}
                      onClick={() => setViewMode('3d')}
                      title="3D graph view"
                    >
                      <Box size={13} />
                      3D
                    </button>
                    <button
                      type="button"
                      className={viewMode === '2d' ? 'active' : ''}
                      aria-pressed={viewMode === '2d'}
                      onClick={() => setViewMode('2d')}
                      title="2D graph view"
                    >
                      <Network size={13} />
                      2D
                    </button>
                  </div>
                )}
                {graphScope === 'architecture' ? (
                  <div className="architecture-workbench">
                    <aside className="architecture-flow-sidebar">
                      <FlowExplorerPanel
                        analysis={analysis}
                        activeFlow={activeArchitectureFlow}
                        setActiveFlow={setActiveArchitectureFlow}
                        onSelectNode={(nodeId) => setSelectedNodeId(nodeId)}
                        onClose={closeArchitectureExplorer}
                      />
                    </aside>
                    <section className="architecture-map-area">
                      <LayeredFlowView
                        analysis={analysis}
                        activeFlow={activeArchitectureFlow}
                        onHover={handleHoverNode}
                        onSelect={handleSelectNode}
                      />
                    </section>
                  </div>
                ) : graphScope === 'runflow' ? (
                  <RunFlowchart 
                    flow={analysis.runFlow} 
                    repoInfo={{
                      description: analysis.summary?.description,
                      name: analysis.repoName
                    }}
                  />
                ) : graphScope === 'commits' ? (
                  commitHistoryState.loading ? (
                    <div className="empty-state"><LoaderCircle className="spin" size={28} /><p>Loading commit history...</p></div>
                  ) : commitHistoryState.error ? (
                    <div className="empty-state error"><p>{commitHistoryState.error}</p></div>
                  ) : (
                    <CommitGraphPanel history={commitHistory} repoUrl={analysis.repoUrl} />
                  )
                ) : graphScope === 'health' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 16, height: '100%', overflowY: 'auto' }}>
                    <HealthScorePanel repoId={analysis?.repoId} />
                    <div style={{ borderTop: '1px solid rgba(20, 2, 6, 0.06)', paddingTop: 16 }}>
                      <GitIntelligencePanel repoId={analysis?.repoId} />
                    </div>
                  </div>
                ) : viewMode === '3d' ? (
                  <Graph3D
                    graph={visibleGraph}
                    selectedNodeId={selectedNodeId}
                    hoveredNodeId={hoveredNodeId}
                    onHover={handleHoverNode}
                    onSelect={handleSelectNode}
                    isFullscreen={isFullscreen}
                  />
                ) : (
                  <Graph2D
                    graph={visibleGraph}
                    selectedNodeId={selectedNodeId}
                    hoveredNodeId={hoveredNodeId}
                    onHover={handleHoverNode}
                    onSelect={handleSelectNode}
                    isFullscreen={isFullscreen}
                  />
                )}
                {selectedNode?.type !== 'folder' && selectedNodeId !== summaryClosedNodeId && fileState.data?.content && !fileState.data?.truncated && !fileState.loading && !fileState.error && (
                  <div className="summary-dock">
                    <FileSummaryPanel
                      analysis={analysis}
                      selectedNode={selectedNode}
                      fileContent={fileState.data.content}
                      assistantConfig={effectiveAssistantConfig}
                      onClose={() => setSummaryClosedNodeId(selectedNodeId)}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        <section className="right-pane" ref={rightPaneRef}>
          <div className="file-viewer">
            <div className="pane-header">
              <div className="pane-title-block inspector-title">
                <h3>{fileState.data?.path || selectedNode?.path || 'File Inspector'}</h3>
                <span>{selectedNode?.path ? 'Selected source file' : 'Click any graph node to inspect code'}</span>
              </div>
              <div className="inspector-actions">
                {selectedNode?.path && selectedNode.type !== 'folder' && (
                  <span className="badge">{formatBytes(analysis?.files.find(f => f.path === selectedNode.path)?.size || 0)}</span>
                )}
              </div>
            </div>
            <div className="inspector-toolbar">
              <div className="inspector-controls">
                <button className="toolbar-btn" onClick={() => setEditorFontSize((v) => Math.max(10, v - 1))} title="Decrease font size">
                  <Minus size={14} />
                </button>
                <span className="toolbar-chip">{editorFontSize}px</span>
                <button className="toolbar-btn" onClick={() => setEditorFontSize((v) => Math.min(24, v + 1))} title="Increase font size">
                  <Plus size={14} />
                </button>
                <button className={`toolbar-chip toggle ${editorWordWrap ? 'active' : ''}`} onClick={() => setEditorWordWrap((v) => !v)}>
                  Wrap
                </button>
                <button className={`toolbar-chip toggle ${editorMinimap ? 'active' : ''}`} onClick={() => setEditorMinimap((v) => !v)}>
                  Minimap
                </button>
                <button className={`toolbar-chip toggle ${editorLineNumbers ? 'active' : ''}`} onClick={() => setEditorLineNumbers((v) => !v)}>
                  Lines
                </button>
              </div>
              <div className="inspector-controls">
                <button className="toolbar-btn" onClick={copyCurrentFileContent} title="Copy full file">
                  <Copy size={14} />
                </button>
              </div>
            </div>
            <div className="editor-container">
              {!selectedNode ? (
                <div className="empty-state"><Code2 size={24} className="icon-muted"/><p>Select a node to view code</p></div>
              ) : selectedNode.type === 'folder' ? (
                <div className="empty-state"><p>Folder: {selectedNode.path}</p></div>
              ) : fileState.loading ? (
                <div className="empty-state"><LoaderCircle className="spin" size={24} /></div>
              ) : fileState.error ? (
                <div className="empty-state error"><p>{fileState.error}</p></div>
              ) : (
                <Editor
                  height="100%"
                  theme="vs"
                  language={fileState.data?.language || 'plaintext'}
                  value={fileState.data?.content || ''}
                  options={{
                    fontSize: editorFontSize,
                    minimap: { enabled: editorMinimap },
                    readOnly: true,
                    wordWrap: editorWordWrap ? 'on' : 'off',
                    lineNumbers: editorLineNumbers ? 'on' : 'off',
                    scrollBeyondLastLine: false,
                    smoothScrolling: true,
                    cursorBlinking: 'smooth',
                    renderWhitespace: 'selection',
                    contextmenu: true,
                  }}
                />
              )}
            </div>
          </div>

          {isChatOpen ? (() => {
            // `.right-pane` is its own stacking context (`z-index: 2`,
            // `overflow: hidden`), so a `position: fixed` child would be
            // positioned and clipped against that pane instead of the viewport —
            // which is exactly why the expanded panel looked cramped on a
            // laptop. Portalling it to <body> puts it in the real viewport.
            const surface = (
            <>
              {isChatExpanded && (
                <div
                  className="chat-backdrop"
                  onClick={() => setIsChatExpanded(false)}
                  aria-hidden="true"
                />
              )}
              {!isChatExpanded && (
                <div className="chat-resizer" onMouseDown={beginChatResize} role="separator" aria-label="Resize chat panel" />
              )}
              <div
                className={`ai-panel ${isChatExpanded ? 'is-expanded' : ''}`}
                style={isChatExpanded ? undefined : { height: `${chatPanelHeight}px`, flex: '0 0 auto' }}
              >
              <div className="chat-header">
                <div className="chat-header-identity">
                  <span className="chat-header-orb" aria-hidden="true">
                    <span className="assistant-wave-bar" />
                    <span className="assistant-wave-bar" />
                    <span className="assistant-wave-bar" />
                  </span>
                  <div className="chat-header-copy">
                    <strong>Aliya AI</strong>
                    <span>
                      {assistantConfig.apiKey
                        ? `${activeProviderInfo?.label || activeProvider} · ${effectiveModel || 'default'}`
                        : 'Connect an API key to start'}
                    </span>
                  </div>
                </div>
                <div className="inspector-controls">
                  <button
                    className={`toolbar-btn ${isChatExpanded ? 'active' : ''}`}
                    onClick={() => setIsChatExpanded((value) => !value)}
                    title={isChatExpanded ? 'Collapse to dock' : 'Expand to a full panel'}
                    aria-label={isChatExpanded ? 'Collapse chat panel' : 'Expand chat panel'}
                  >
                    {isChatExpanded ? <Minimize size={14} /> : <Maximize size={14} />}
                  </button>
                  <button className="toolbar-btn" onClick={clearChat} title="Clear chat">
                    <Trash2 size={14} />
                  </button>
                  <button
                    className="toolbar-btn"
                    onClick={() => { setIsChatOpen(false); setIsChatExpanded(false) }}
                    title="Close chat"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
              <div className="chat-messages" ref={chatMessagesRef}>
                {messages.length === 0 && !aiBusy && (
                  <div className="chat-empty">
                    <div className="chat-empty-head">
                      <span className="chat-empty-orb" aria-hidden="true"><Sparkles size={16} /></span>
                      <div>
                        <strong>Ask anything about this repository</strong>
                        <span>
                          Answers cite the files they rest on and say what could not be verified.
                        </span>
                      </div>
                    </div>
                    <div className="chat-empty-grid">
                      {STARTER_PROMPTS.map((prompt) => (
                        <button
                          key={prompt.label}
                          type="button"
                          className="chat-empty-card"
                          onClick={() => submitQuestion(prompt.question)}
                          disabled={!assistantConfig.apiKey || !analysis}
                        >
                          <strong>{prompt.label}</strong>
                          <span>{prompt.hint}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {messages.map((m, i) => (
                  <ChatMessage key={i} message={m} onCopy={copyMessageContent} />
                ))}
                {aiBusy && (
                  <div className="chat-bubble assistant">
                    <span className="chat-avatar" aria-hidden="true"><Sparkles size={13} /></span>
                    <div className="chat-content-wrap">
                      <div className="chat-content">
                        {streamingText ? (
                          <>
                            <ChatMarkdown content={streamingText} />
                            <span className="chat-streaming-caret" aria-hidden="true" />
                          </>
                        ) : (
                          <div className="chat-thinking">
                            <span className="chat-thinking-dots"><i /><i /><i /></span>
                            <em>Reading the codebase…</em>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {!aiBusy && followUps.length > 0 && (
                  <div className="chat-followups">
                    <span className="chat-followups-label"><Lightbulb size={12} /> Ask next</span>
                    <div className="chat-followups-list">
                      {followUps.map((prompt) => (
                        <button key={prompt} type="button" onClick={() => submitQuestion(prompt)}>
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="chat-input-area">
                <div className="quick-actions">
                  {QUICK_PROMPTS.map(p => (
                    <button key={p} onClick={() => submitQuestion(p)}>{p}</button>
                  ))}
                </div>
                <form onSubmit={e => { e.preventDefault(); submitQuestion(question) }} className="chat-form">
                  <textarea
                    value={question} 
                    onChange={e => {
                      setQuestion(e.target.value)
                      const lines = Math.max(1, Math.min(6, e.target.value.split('\n').length))
                      setChatInputRows(lines)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        submitQuestion(question)
                      }
                    }}
                    placeholder={assistantConfig.apiKey ? "Ask about the code…" : "Connect AI key to ask questions"} 
                    disabled={!assistantConfig.apiKey}
                    rows={chatInputRows}
                  />
                  <button type="submit" disabled={aiBusy || !analysis || !assistantConfig.apiKey || !question.trim()} title="Send (Enter)">
                    <Sparkles size={16} />
                  </button>
                </form>
                <div className="chat-input-hint">
                  <CornerDownLeft size={11} /> Enter to send · Shift + Enter for a new line
                </div>
              </div>
              </div>
            </>
            )
            return isChatExpanded ? createPortal(surface, document.body) : surface
          })() : (
            <div className="chat-collapsed">
              <button className="open-chat-btn" onClick={() => setIsChatOpen(true)} title="Open Aliya AI assistant" aria-label="Open Aliya AI assistant">
                <span className="open-chat-orb" aria-hidden="true">
                  <span className="assistant-wave-bar" />
                  <span className="assistant-wave-bar" />
                  <span className="assistant-wave-bar" />
                  <span className="assistant-wave-bar" />
                </span>
                <span className="open-chat-label">Aliya AI</span>
              </button>
            </div>
          )}
        </section>
      </main>

      {showRecentProjects && (
        <div className="modal-overlay" onClick={() => setShowRecentProjects(false)}>
          <div className="modal-content recent-projects-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Recent Projects</h3>
                <p>Open a saved project without analyzing it again.</p>
              </div>
              <button onClick={() => setShowRecentProjects(false)} className="close-btn"><X size={16}/></button>
            </div>
            <div className="recent-projects modal-project-list" aria-label="Recent projects">
              {recentState.loading ? (
                <div className="recent-projects-loading"><LoaderCircle className="spin" size={18} /> Loading projects...</div>
              ) : recentProjects.length > 0 ? (
                <div className="recent-projects-grid">
                  {recentProjects.map((project) => (
                    <div className="recent-project-card" key={project.repoId}>
                      <button
                        type="button"
                        className="recent-project-open"
                        onClick={() => openRecentProject(project.repoId)}
                        disabled={recentState.openingId === project.repoId || recentState.deletingId === project.repoId}
                      >
                        <span className="recent-project-icon"><GitBranch size={17} /></span>
                        <span className="recent-project-copy">
                          <strong>{project.repoName}</strong>
                          <small>{project.fileCount} files · {project.nodeCount} nodes</small>
                        </span>
                      </button>
                      {recentState.openingId === project.repoId ? (
                        <LoaderCircle className="spin recent-project-action" size={17} />
                      ) : (
                        <button
                          type="button"
                          className="recent-project-delete"
                          title={`Delete ${project.repoName}`}
                          onClick={(event) => removeRecentProject(event, project)}
                          disabled={recentState.deletingId === project.repoId}
                        ><Trash2 size={15} /></button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="recent-projects-empty">
                  <GitBranch size={20} />
                  <span>No saved projects yet.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {isSettingsOpen && (
        <div className="modal-overlay" onClick={() => setIsSettingsOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Connect AI</h3>
              <button onClick={() => setIsSettingsOpen(false)} className="close-btn"><X size={16}/></button>
            </div>
            <div className="modal-body">
              <label>
                <span>Provider</span>
                <select
                  value={assistantConfig.provider}
                  onChange={e => {
                    const provider = e.target.value
                    const nextModels = modelCatalog[provider]?.models || []
                    const recommended = nextModels.find(m => m.recommended)?.id || nextModels[0]?.id || ''
                    setAssistantConfig(c => ({...c, provider, model: recommended, customModel: ''}))
                  }}
                >
                  {Object.entries(modelCatalog).map(([key, info]) => (
                    <option key={key} value={key}>{info.label}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Model</span>
                <select value={assistantConfig.model} onChange={e => setAssistantConfig(c => ({...c, model: e.target.value}))}>
                  {providerModels.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                  {activeProviderInfo?.supportsCustomModel && <option value="__custom__">Custom model ID...</option>}
                </select>
              </label>
              {assistantConfig.model === '__custom__' && (
                <label>
                  <span>Custom Model ID</span>
                  <input
                    value={assistantConfig.customModel}
                    onChange={e => setAssistantConfig(c => ({...c, customModel: e.target.value}))}
                    placeholder="provider/model-name or model-name"
                  />
                </label>
              )}
              <label>
                <span>API Key (Stored locally)</span>
                <input type="password" value={assistantConfig.apiKey} onChange={e => setAssistantConfig(c => ({...c, apiKey: e.target.value}))} placeholder="sk-..." />
              </label>
            </div>
            <div className="modal-footer">
              <button className="primary" onClick={() => setIsSettingsOpen(false)}>Save</button>
            </div>
          </div>
        </div>
      )}

      <PdfReportViewer
        open={reportState.open}
        url={reportState.url}
        filename={reportState.filename}
        size={reportState.size}
        generating={reportState.loading}
        error={reportState.error}
        onClose={closePdfViewer}
        onDownload={downloadPdfReport}
        onOpenInTab={openPdfReportInTab}
        onRegenerate={handleDownloadPdfReport}
      />
    </div>
  )
}

export default App
