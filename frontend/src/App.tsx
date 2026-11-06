import { useState, useEffect } from 'react'
import {
  Activity, ShieldCheck, Brain, GitPullRequest, GitGraph,
  Database, AlertCircle
} from 'lucide-react'

import DashboardView from './components/DashboardView'
import SentinelView from './components/SentinelView'
import CodeMindView from './components/CodeMindView'
import MemoryExplorerView from './components/MemoryExplorerView'
import KnowledgeGraphView from './components/KnowledgeGraphView'

interface HealthState {
  status: string
  database: { connected: boolean; dialect: string; error?: string }
  llm: { provider: string; primary_model: string; primary_available: boolean; fallback_available: boolean }
  memory: { provider: string; connected: boolean; bank_id: string; status: string }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'sentinel' | 'codemind' | 'memory' | 'graph'>('dashboard')
  const [health, setHealth] = useState<HealthState | null>(null)
  const [loadingHealth, setLoadingHealth] = useState<boolean>(true)

  useEffect(() => {
    fetch('/api/health')
      .then(res => res.json())
      .then(data => {
        setHealth(data)
        setLoadingHealth(false)
      })
      .catch(err => {
        console.error('Failed to fetch health check:', err)
        setLoadingHealth(false)
      })
  }, [])

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 selection:bg-indigo-500 selection:text-white">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/70 backdrop-blur sticky top-0 z-50 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-lg tracking-tight text-white">NEXUS AI</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-medium">Hindsight v2</span>
            </div>
            <p className="text-xs text-slate-400">Cross-Agent Incident Learning System</p>
          </div>
        </div>

        {/* Tab Buttons */}
        <nav className="flex items-center space-x-1 bg-slate-800/60 p-1 rounded-xl border border-slate-700/60">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition ${
              activeTab === 'dashboard' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/40'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Dashboard</span>
          </button>
          <button
            onClick={() => setActiveTab('sentinel')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition ${
              activeTab === 'sentinel' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/40'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Sentinel (RCA)</span>
          </button>
          <button
            onClick={() => setActiveTab('codemind')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition ${
              activeTab === 'codemind' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/40'
            }`}
          >
            <GitPullRequest className="w-3.5 h-3.5" />
            <span>CodeMind (Review)</span>
          </button>
          <button
            onClick={() => setActiveTab('memory')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition ${
              activeTab === 'memory' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/40'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Memory Explorer</span>
          </button>
          <button
            onClick={() => setActiveTab('graph')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition ${
              activeTab === 'graph' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/40'
            }`}
          >
            <GitGraph className="w-3.5 h-3.5" />
            <span>Knowledge Graph</span>
          </button>
        </nav>

        {/* Health Status Badge */}
        <div className="flex items-center space-x-2 text-xs">
          {loadingHealth ? (
            <span className="flex items-center text-slate-400">
              <span className="w-2 h-2 rounded-full bg-slate-500 animate-ping mr-2" />
              Checking...
            </span>
          ) : health?.status === 'ok' ? (
            <div className="flex items-center space-x-2 bg-emerald-950/40 border border-emerald-800/50 px-3 py-1 rounded-full text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>All Systems Operational</span>
            </div>
          ) : (
            <div className="flex items-center space-x-2 bg-amber-950/40 border border-amber-800/50 px-3 py-1 rounded-full text-amber-300">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span>Degraded / Standby</span>
            </div>
          )}
        </div>
      </header>

      {/* Main Screen Body */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        {/* Standby Banner if Memory not connected */}
        {health && !health.memory.connected && (
          <div className="mb-6 p-4 rounded-xl border border-amber-700/40 bg-amber-950/20 text-amber-200 flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold text-sm">Hindsight Memory Cloud Standby Mode</p>
              <p className="text-xs text-amber-300/80 mt-1">
                Hindsight Cloud key is unconfigured. Nexus is operating gracefully in baseline offline mode with full test coverage and fallback knowledge.
              </p>
            </div>
          </div>
        )}

        {/* Active Screen Tab View */}
        {activeTab === 'dashboard' && <DashboardView />}
        {activeTab === 'sentinel' && <SentinelView />}
        {activeTab === 'codemind' && <CodeMindView />}
        {activeTab === 'memory' && <MemoryExplorerView />}
        {activeTab === 'graph' && <KnowledgeGraphView />}
      </main>
    </div>
  )
}
