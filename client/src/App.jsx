import { startTransition, useDeferredValue, useEffect, useMemo, useState, useCallback, useRef } from 'react'
import Editor from '@monaco-editor/react'
import { Sparkles, FolderSearch, LoaderCircle, Settings2, Code2, Network, X, Filter, ChevronDown, ChevronLeft, ChevronRight, Search, Plus, Minus, Copy, Trash2, Maximize, Minimize, Clock3, GitBranch, ArrowRight, ShieldCheck, Zap, FileText } from 'lucide-react'

import {
  askRepositoryQuestion,
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
import { CommitHistory3D } from './components/CommitHistory3D'
import { RunFlowchart } from './components/RunFlowchart'
import { FileSummaryPanel } from './components/FileSummaryPanel'
import { FlowExplorerPanel } from './components/FlowExplorerPanel'
import { LayeredFlowView } from './components/LayeredFlowView'
import { downloadBlob, generateRepositoryPdfReport } from './utils/pdfReport'
import { buildVisibleGraph, formatBytes, phaseLabel, LANGUAGE_COLORS, LANGUAGE_LABELS, getNodeLanguageLabel, CATEGORY_COLORS, CATEGORY_LABELS, getNodeCategoryLabel, getNodeCategoryColor } from './graph-utils'
import './App.css'

const QUICK_PROMPTS = [
  'Explain the architecture',
  'What is the core flow?',
  'Where should I start?',
]

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
  const [reportState, setReportState] = useState({ loading: false, error: '' })
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

  const handleDownloadPdfReport = useCallback(async () => {
    if (!analysis) return

    setReportState({ loading: true, error: '' })
    try {
      let reportCommitHistory = commitHistory
      if (!reportCommitHistory && analysis.repoId) {
        const payload = await fetchCommitHistory(analysis.repoId, 150)
        reportCommitHistory = payload
        setCommitHistory(payload)
        setCommitHistoryState({ loading: false, error: '' })
      }

      const blob = generateRepositoryPdfReport({
        analysis,
        commitHistory: reportCommitHistory,
        activeArchitectureFlow,
      })
      const safeName = (analysis.repoName || 'repository').replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase()
      downloadBlob(blob, `${safeName || 'repository'}-report.pdf`)
      setReportState({ loading: false, error: '' })
    } catch (e) {
      const message = e?.message || 'PDF report generation failed.'
      setReportState({ loading: false, error: message })
      setError(message)
    }
  }, [activeArchitectureFlow, analysis, commitHistory])

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
    setMessages(current => [...current, { role: 'user', content: prompt }])
    setQuestion('')
    try {
      const response = await askRepositoryQuestion({
        repoId: analysis.repoId,
        provider: assistantConfig.provider,
        model: effectiveModel,
        apiKey: assistantConfig.apiKey,
        question: prompt,
        selectedPath: selectedNode?.type === 'folder' ? '' : selectedNode?.path || '',
        focusedNodeIds: selectedNodeId ? [selectedNodeId, ...(analysis.graph.adjacency[selectedNodeId] || [])] : [],
      })
      setMessages(current => [...current, { role: 'assistant', content: response.answer }])
    } catch (e) {
      setError(e.message)
    } finally {
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
      <div className="landing-screen">
        <div className="mouse-glow" ref={mouseGlowRef}></div>
        <div className="ai-background-animation">
          <div className="glow-orb"></div>
          <div className="glow-orb secondary"></div>
          <div className="landing-grid-pattern"></div>
        </div>

        <header className="landing-navbar">
          <Logo />
          <div className="landing-navbar-status">
            <span></span>
            Local-first code intelligence
          </div>
        </header>

        <main className="landing-content">
          <div className="landing-eyebrow">
            <Sparkles size={14} />
            AI-powered repository intelligence
          </div>

          <h1>Understand any codebase<br /><span>without the guesswork.</span></h1>
          <p className="landing-description">
            Turn a GitHub repository into an interactive architecture graph. Explore dependencies,
            inspect source files, and understand execution flow in minutes.
          </p>
          
          <div className="landing-analysis-center">
            {job && job.status !== 'failed' && job.status !== 'completed' ? (
              <div className="analysis-loader" role="status" aria-live="polite">
              <div className="loader-header">
                <div className="loader-pulse">
                  <LoaderCircle className="spin" size={22} />
                </div>
                <div>
                  <p className="loader-title">{phaseLabel(job.phase)}</p>
                  <p className="loader-message">{job.message}</p>
                </div>
              </div>

              <div className="loader-metric">
                <div className="metric-row">
                  <span>Total analysis</span>
                  <strong>{totalPercent}%</strong>
                </div>
                <div className="landing-progress-track" aria-label={`Total analysis ${totalPercent}%`}>
                  <div className="landing-progress-fill" style={{ width: `${totalPercent}%` }} />
                </div>
              </div>

              <div className="loader-steps">
                {ANALYSIS_PHASES.slice(0, -1).map((phase, index) => (
                  <span
                    key={phase}
                    className={`loader-step ${index < currentPhaseIndex ? 'is-complete' : ''} ${phase === job.phase ? 'is-active' : ''}`}
                  >
                    {phaseLabel(phase)}
                  </span>
                ))}
              </div>
              </div>
            ) : (
              <div className="landing-analyze-card">
              <div className="landing-input-label">
                <span><GitBranch size={15} /> GitHub repository</span>
                <small>Public repositories supported</small>
              </div>
              <form className="search-bar large-search" onSubmit={handleAnalyze}>
                <FolderSearch size={20} className="icon-muted" />
                <input
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder="https://github.com/owner/repository"
                  aria-label="GitHub repository URL"
                  autoFocus
                />
                <button type="submit" disabled={!repoUrl.trim()}>
                  Analyze repo <ArrowRight size={16} />
                </button>
              </form>
              <div className="landing-card-footnote">
                No sign-up required. Repository analysis stays on your machine.
              </div>
              </div>
            )}
          </div>

          {!job && (
            <button
              type="button"
              className="landing-recent-projects-btn"
              onClick={() => setShowRecentProjects(true)}
            >
              <Clock3 size={16} />
              <span>Recent Projects</span>
              {recentProjects.length > 0 && <strong>{recentProjects.length}</strong>}
            </button>
          )}

          {error && <div className="landing-error">{error}</div>}

          {!job && (
            <div className="landing-benefits">
              <div><Network size={17} /><span><strong>Visual architecture</strong><small>Interactive 2D and 3D graphs</small></span></div>
              <div><Zap size={17} /><span><strong>Instant exploration</strong><small>Navigate files and dependencies</small></span></div>
              <div><ShieldCheck size={17} /><span><strong>Local and private</strong><small>Your API keys stay in-browser</small></span></div>
            </div>
          )}
        </main>

        <footer className="landing-footer">
          <span>Built for developers who need clarity, fast.</span>
          <div className="developer-badge">
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
                              {Object.entries(CATEGORY_COLORS).map(([key, color]) => (
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
                                onClick={() => setFilterCategories(Object.keys(CATEGORY_COLORS))}
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
                  onClick={() => {
                    setGraphScope('architecture')
                    setIsFullscreen(true)
                  }}
                >
                  <Sparkles size={12} /> Architecture
                </button>
              </div>
              {graphScope === 'repo' ? (
                <div className="toggle-group">
                  <button className={viewMode === '3d' ? 'active' : ''} onClick={() => setViewMode('3d')}>3D</button>
                  <button className={viewMode === '2d' ? 'active' : ''} onClick={() => setViewMode('2d')}>2D</button>
                </div>
              ) : graphScope === 'architecture' ? (
                <span className="graph-mode-badge architecture-mode-badge">Guided Explorer</span>
              ) : (
                <span className="graph-mode-badge">3D Only</span>
              )}
              <div className="graph-utility-actions">
                <button
                  className={`icon-button report-download-btn ${reportState.loading ? 'active' : ''}`}
                  onClick={handleDownloadPdfReport}
                  disabled={!analysis || reportState.loading}
                  title="Download repository PDF report"
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
                    {visibleGraph.languages.map(key => (
                      <div key={key} className="legend-item">
                        <span 
                          className="legend-color" 
                          style={{ 
                            backgroundColor: filterType === 'category' 
                              ? (CATEGORY_COLORS[key] || CATEGORY_COLORS.unknown)
                              : (LANGUAGE_COLORS[key] || LANGUAGE_COLORS.unknown)
                          }}
                        ></span>
                        {filterType === 'category' 
                          ? (CATEGORY_LABELS[key] || key)
                          : (LANGUAGE_LABELS[key] || key)
                        }
                      </div>
                    ))}
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
                    <CommitHistory3D history={commitHistory} />
                  )
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
                  theme="vs-dark"
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

          {isChatOpen ? (
            <>
              <div className="chat-resizer" onMouseDown={beginChatResize} role="separator" aria-label="Resize chat panel" />
              <div className="ai-panel" style={{ height: `${chatPanelHeight}px`, flex: '0 0 auto' }}>
              <div className="pane-header">
                <h3>Ask this repo</h3>
                <div className="inspector-controls">
                  <button className="toolbar-btn" onClick={() => setMessages([{ role: 'assistant', content: 'Analyze a repository to ask questions about its architecture and codebase.' }])} title="Clear chat">
                    <Trash2 size={14} />
                  </button>
                  <button className="toolbar-btn" onClick={() => setIsChatOpen(false)} title="Close chat">
                    <X size={14} />
                  </button>
                </div>
              </div>
              <div className="chat-messages" ref={chatMessagesRef}>
                {messages.map((m, i) => (
                  <div key={i} className={`chat-bubble ${m.role}`}>
                    <div className="chat-content-wrap">
                      <div className="chat-content">{m.content}</div>
                      <button className="chat-copy-btn" onClick={() => copyMessageContent(m.content)} title="Copy message">
                        <Copy size={12} />
                      </button>
                    </div>
                  </div>
                ))}
                {aiBusy && <div className="chat-bubble assistant"><div className="chat-content"><LoaderCircle className="spin" size={14} /></div></div>}
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
                    placeholder={assistantConfig.apiKey ? "Ask about the code..." : "Connect AI key to ask questions"} 
                    disabled={!assistantConfig.apiKey}
                    rows={chatInputRows}
                  />
                  <button type="submit" disabled={aiBusy || !analysis || !assistantConfig.apiKey || !question.trim()}>
                    <Sparkles size={16} />
                  </button>
                </form>
              </div>
              </div>
            </>
          ) : (
            <div className="chat-collapsed">
              <button className="open-chat-btn" onClick={() => setIsChatOpen(true)}>
                Aliya AI
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
    </div>
  )
}

export default App
