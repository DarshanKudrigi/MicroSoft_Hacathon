import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Activity, AlertCircle, Bell, Brain, Command, Database, GitGraph,
  GitPullRequest, Moon, Search, ShieldCheck, Sun, X
} from 'lucide-react'

import DashboardView from './components/DashboardView'
import SentinelView from './components/SentinelView'
import CodeMindView from './components/CodeMindView'
import MemoryExplorerView from './components/MemoryExplorerView'
import KnowledgeGraphView from './components/KnowledgeGraphView'

type Tab = 'dashboard' | 'sentinel' | 'codemind' | 'memory' | 'graph'

interface HealthState {
  status: string
  database: { connected: boolean; dialect: string; error?: string }
  llm: { provider: string; primary_model: string; primary_available: boolean; fallback_available: boolean }
  memory: { provider: string; connected: boolean; bank_id: string; status: string }
}

const tabs: Array<{ id: Tab; label: string; icon: typeof Activity }> = [
  { id: 'dashboard', label: 'Dashboard', icon: Activity },
  { id: 'sentinel', label: 'Sentinel (RCA)', icon: ShieldCheck },
  { id: 'codemind', label: 'CodeMind (Review)', icon: GitPullRequest },
  { id: 'memory', label: 'Memory Explorer', icon: Database },
  { id: 'graph', label: 'Knowledge Graph', icon: GitGraph },
]

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
}

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')
  const [health, setHealth] = useState<HealthState | null>(null)
  const [loadingHealth, setLoadingHealth] = useState(true)
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('nexus-theme') === 'dark')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [activityOpen, setActivityOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
    document.body.classList.toggle('dark', darkMode)
    localStorage.setItem('nexus-theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  useEffect(() => {
    fetch('/api/health')
      .then(res => {
        if (!res.ok) throw new Error(`Health check failed (${res.status})`)
        return res.json()
      })
      .then(data => setHealth(data))
      .catch(() => setToast('Backend health check is unavailable'))
      .finally(() => setLoadingHealth(false))
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 5000)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen(open => !open)
      }
      if (event.key === 'Escape') {
        setPaletteOpen(false)
        setActivityOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const filteredTabs = useMemo(
    () => tabs.filter(tab => tab.label.toLowerCase().includes(query.toLowerCase())),
    [query],
  )

  const selectTab = (tab: Tab) => {
    setActiveTab(tab)
    setPaletteOpen(false)
    setQuery('')
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 transition-colors">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-indigo-500/[0.06] blur-3xl" />
        <div className="absolute right-0 top-24 h-96 w-96 rounded-full bg-purple-500/[0.05] blur-3xl" />
      </div>

      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/90 px-4 py-3 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 sm:px-6">
        <div className="flex min-w-0 flex-nowrap items-center gap-4">
          <div className="flex shrink-0 items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 shadow-lg shadow-indigo-500/20">
              <Brain className="h-5 w-5 text-white" />
            </div>
            <div className="hidden xl:block">
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">NEXUS AI</span>
                <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-xs font-medium text-indigo-600 dark:text-indigo-300">Hindsight v2</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Cross-Agent Incident Learning System</p>
            </div>
          </div>

          <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden rounded-xl border border-slate-200/70 bg-slate-100/80 p-1 dark:border-slate-700/60 dark:bg-slate-800/60">
            {tabs.map(tab => {
              const IconComponent = tab.icon
              return (
                <button key={tab.id} onClick={() => selectTab(tab.id)} className="relative flex min-w-0 shrink items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-xs font-medium text-slate-500 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 sm:px-3">
                  {activeTab === tab.id && <motion.span layoutId="active-nav-pill" className="absolute inset-0 rounded-lg bg-white shadow-sm dark:bg-indigo-600" transition={{ type: 'spring', stiffness: 450, damping: 34 }} />}
                  <IconComponent className="relative z-10 h-3.5 w-3.5" />
                  <span className="relative z-10 hidden lg:inline">{tab.label}</span>
                </button>
              )
            })}
          </nav>

          <div className="flex shrink-0 items-center gap-1.5">
            <button onClick={() => setPaletteOpen(true)} className="hidden items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 sm:flex" title="Command palette">
              <Search className="h-3.5 w-3.5" /><span className="hidden xl:inline">Search</span><kbd className="rounded bg-slate-100 px-1 dark:bg-slate-800">⌘K</kbd>
            </button>
            <button onClick={() => setDarkMode(mode => !mode)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800" title="Toggle theme">
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <div className="relative">
              <button onClick={() => setActivityOpen(open => !open)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800" title="System activity"><Bell className="h-4 w-4" /></button>
              <AnimatePresence>
                {activityOpen && <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="absolute right-0 top-11 w-64 rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-xl dark:border-slate-700 dark:bg-slate-900">
                  <p className="font-semibold text-slate-900 dark:text-white">System activity</p>
                  <p className="mt-2 text-slate-500 dark:text-slate-400">Health checks and agent events will appear here.</p>
                </motion.div>}
              </AnimatePresence>
            </div>
            <div className="hidden items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-600 dark:text-emerald-400 md:flex">
              <span className={`h-2 w-2 rounded-full ${loadingHealth ? 'animate-ping bg-slate-400' : health?.status === 'ok' ? 'animate-pulse bg-emerald-500' : 'bg-amber-400'}`} />
              <span>{loadingHealth ? 'Checking...' : health?.status === 'ok' ? 'All Systems Operational' : 'Degraded / Standby'}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">
        {health && !health.memory.connected && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-700 dark:text-amber-200">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <div><p className="text-sm font-semibold">Hindsight Memory Cloud Standby Mode</p><p className="mt-1 text-xs opacity-80">Nexus is operating in offline fallback mode.</p></div>
          </div>
        )}
        <AnimatePresence mode="wait">
          <motion.div key={activeTab} variants={containerVariants} initial="hidden" animate="show" exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            {activeTab === 'dashboard' && <DashboardView />}
            {activeTab === 'sentinel' && <SentinelView />}
            {activeTab === 'codemind' && <CodeMindView />}
            {activeTab === 'memory' && <MemoryExplorerView />}
            {activeTab === 'graph' && <KnowledgeGraphView />}
          </motion.div>
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {toast && <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} className="fixed bottom-5 right-5 z-[70] flex items-center gap-3 rounded-xl border border-amber-500/30 bg-white px-4 py-3 text-xs text-slate-700 shadow-xl dark:bg-slate-900 dark:text-slate-200">
          <AlertCircle className="h-4 w-4 text-amber-500" />{toast}<button onClick={() => setToast(null)}><X className="h-3.5 w-3.5" /></button>
        </motion.div>}
      </AnimatePresence>

      <AnimatePresence>
        {paletteOpen && <motion.div className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-950/40 p-4 pt-[15vh] backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={() => setPaletteOpen(false)}>
          <motion.div initial={{ scale: 0.96, y: -8 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: -8 }} onMouseDown={(event: MouseEvent<HTMLDivElement>) => event.stopPropagation()} className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center gap-2 border-b border-slate-200 px-4 dark:border-slate-700"><Command className="h-4 w-4 text-indigo-500" /><input autoFocus value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => event.key === 'Enter' && filteredTabs[0] && selectTab(filteredTabs[0].id)} placeholder="Search views and preferences..." className="w-full bg-transparent py-4 text-sm outline-none placeholder:text-slate-400" /><button onClick={() => setPaletteOpen(false)}><X className="h-4 w-4 text-slate-400" /></button></div>
            <div className="p-2">{filteredTabs.map(tab => {
              const IconComponent = tab.icon
              return <button key={tab.id} onClick={() => selectTab(tab.id)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"><IconComponent className="h-4 w-4 text-indigo-500" />{tab.label}<span className="ml-auto text-xs text-slate-400">Enter</span></button>
            })}</div>
          </motion.div>
        </motion.div>}
      </AnimatePresence>
    </div>
  )
}
