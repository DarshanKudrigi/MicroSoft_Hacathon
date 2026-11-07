import { useState, useEffect } from 'react'
import { Database, Search, Filter, RefreshCw, X, AlertCircle } from 'lucide-react'

interface MemoryItem {
  id: string
  type: string
  agent: string
  derived: boolean
  service?: string
  source_incident_id?: number
  text: string
  recalled_count: number
  created_at: string
}

export default function MemoryExplorerView() {
  const [memories, setMemories] = useState<MemoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedAgent, setSelectedAgent] = useState('all')
  const [selectedService, setSelectedService] = useState('all')
  const [error, setError] = useState<string | null>(null)

  const fetchMemories = async (signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    let url = `/api/memories?`
    if (search) url += `q=${encodeURIComponent(search)}&`
    if (selectedAgent !== 'all') url += `agent=${encodeURIComponent(selectedAgent)}&`
    if (selectedService !== 'all') url += `service=${encodeURIComponent(selectedService)}&`

    try {
      const res = await fetch(url, { signal })
      if (!res.ok) throw new Error(`Memory request failed (${res.status})`)
      const data = await res.json()
      setMemories(Array.isArray(data.memories) ? data.memories : [])
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      console.error('Failed to load memories:', err)
      setError('Memories are unavailable right now. Try refreshing the connection.')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => fetchMemories(controller.signal), search ? 300 : 0)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [search, selectedAgent, selectedService])

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    fetchMemories()
  }

  return (
    <div className="space-y-6 animate-fadeIn max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <div className="flex items-center space-x-3 mb-1">
          <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center">
            <Database className="w-5 h-5" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Hindsight Memory Explorer</h1>
        </div>
        <p className="text-slate-400 text-sm">
          Inspect persistent knowledge, derived incident rules, recall frequency counters, and temporal anchors in bank <span className="text-purple-300 font-mono">nexus-org</span>.
        </p>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <form onSubmit={handleSearchSubmit} className="flex-1 min-w-[260px] relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search memories by semantic topic, incident number, or ID..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
          {search && <button type="button" onClick={() => setSearch('')} className="absolute right-3 top-2 text-slate-500 hover:text-slate-200" aria-label="Clear memory search"><X className="h-4 w-4" /></button>}
        </form>

        <div className="flex items-center space-x-3">
          {/* Agent Filter */}
          <div className="flex items-center space-x-2">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={selectedAgent}
              onChange={e => setSelectedAgent(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
            >
              <option value="all">All Agents</option>
              <option value="sentinel">Sentinel</option>
              <option value="codemind">CodeMind</option>
            </select>
          </div>

          {/* Service Filter */}
          <select
            value={selectedService}
            onChange={e => setSelectedService(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
          >
            <option value="all">All Services</option>
            <option value="payments">payments</option>
            <option value="auth">auth</option>
            <option value="orders">orders</option>
          </select>

          <button
            onClick={() => fetchMemories()}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Memories Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
        {error && <div className="flex items-center gap-2 border-b border-rose-500/20 bg-rose-500/10 px-4 py-3 text-xs text-rose-300"><AlertCircle className="h-4 w-4" />{error}</div>}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="text-[11px] uppercase tracking-wider text-slate-500 bg-slate-950/60 border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Memory ID & Scope</th>
                <th className="py-3 px-4">Agent / Type</th>
                <th className="py-3 px-4">Memory Text & Rules</th>
                <th className="py-3 px-4 text-center">Recalled</th>
                <th className="py-3 px-4 text-right">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {!loading && memories.length === 0 && <tr><td colSpan={5} className="px-4 py-14 text-center"><p className="text-sm font-semibold text-slate-300">No memories match these filters</p><button type="button" onClick={() => { setSearch(''); setSelectedAgent('all'); setSelectedService('all') }} className="mt-2 text-xs text-indigo-400 hover:text-indigo-300">Reset all filters</button></td></tr>}
              {memories.map((m, idx) => (
                <tr key={idx} className="hover:bg-slate-800/30 transition">
                  <td className="py-3 px-4 font-mono text-[11px] text-purple-400 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span>{m.id}</span>
                      {m.source_incident_id && (
                        <span className="text-[9px] text-indigo-400">
                          Source: Incident #{m.source_incident_id}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <div className="flex items-center space-x-1.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                        m.agent === 'sentinel' ? 'bg-rose-500/10 text-rose-300 border-rose-500/20' : 'bg-purple-500/10 text-purple-300 border-purple-500/20'
                      }`}>
                        {m.agent}
                      </span>
                      {m.derived && (
                        <span className="px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 text-[9px] font-bold">
                          DERIVED
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 max-w-md">
                    <p className="text-slate-200 line-clamp-2 leading-relaxed">{m.text}</p>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="font-mono px-2 py-0.5 rounded-full bg-slate-800 text-indigo-300 font-bold border border-slate-700">
                      {m.recalled_count}x
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right text-slate-500 font-mono text-[11px] whitespace-nowrap">
                    {new Date(m.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
