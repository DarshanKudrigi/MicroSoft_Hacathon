import { useState, useEffect } from 'react'
import {
  Activity, ShieldCheck, Clock, ArrowDownRight,
  TrendingDown, CheckCircle2, Sparkles, Database
} from 'lucide-react'
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area
} from 'recharts'

interface DashboardData {
  total_incidents: number
  active_rules: number
  repeat_issues_caught: number
  avg_mttr_current: number
  mttr_reduction_pct: number
  resolution_time_series: Array<{ id: number; service: string; minutes: number; date: string; category: string }>
  learning_feed: Array<{ id: number; type: string; detail: string; source_incident_id?: number; memory_id?: string; created_at: string }>
  analytics: {
    weekly_improvement_slope: number
    repeat_incident_rate: number
    rule_catch_rate: number
    repeat_issues_caught: number
    comment_acceptance_rate: number
    memory_on_confidence: number
    memory_off_confidence: number
    estimated_hours_saved: number
    service_breakdown: Array<{ service: string; incidents: number; avg_mttr: number; reviews: number; repeat_issues_caught: number }>
    manager_takeaways: string[]
    is_synthetic: boolean
  }
}

export default function DashboardView() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [windowSize, setWindowSize] = useState<7 | 30>(30)

  const fetchDashboard = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/dashboard')
      if (!res.ok) throw new Error(`Dashboard request failed (${res.status})`)
      setData(await res.json() as DashboardData)
    } catch (err) {
      console.error('Failed to load dashboard:', err)
      setError('We could not load the latest metrics. Check the backend and try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDashboard()
  }, [])

  const triggerSeed = async () => {
    setSeeding(true)
    try {
      const res = await fetch('/api/admin/seed', {
        method: 'POST',
        headers: { 'X-API-Key': 'nexus-dev-secret-key' }
      })
      if (!res.ok) throw new Error(`Seed request failed (${res.status})`)
      await fetchDashboard()
    } catch (e) {
      console.error('Seed error:', e)
      setError('Demo data could not be refreshed. Check the API key and database connection.')
    } finally {
      setSeeding(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-400">Loading Nexus metrics & learning feed...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto flex min-h-[400px] max-w-xl flex-col items-center justify-center rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm dark:border-rose-900/50 dark:bg-slate-900">
        <ShieldCheck className="h-10 w-10 text-rose-500" />
        <h1 className="mt-4 text-lg font-bold text-slate-900 dark:text-white">Dashboard unavailable</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{error}</p>
        <button onClick={fetchDashboard} className="mt-5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500">Try again</button>
      </div>
    )
  }

  const analytics = data?.analytics

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header & Quick Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Engineering Intelligence Dashboard</h1>
          <p className="text-slate-400 text-sm mt-1">
            Tracking cross-agent resolution speed, recurring regression catches, and team memory gains.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={triggerSeed}
            disabled={seeding}
            className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition disabled:opacity-50"
          >
            <Database className="w-3.5 h-3.5 text-indigo-400" />
            <span>{seeding ? 'Seeding Org...' : 'Re-Seed Demo Data'}</span>
          </button>
        </div>
      </div>

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Incidents */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 relative overflow-hidden group hover:border-slate-700 transition">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Total Incidents</span>
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-3xl font-extrabold text-white">{data?.total_incidents || 0}</span>
            <span className="text-xs text-slate-400">across 3 services</span>
          </div>
        </div>

        {/* Active Rules Derived */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 relative overflow-hidden group hover:border-slate-700 transition">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Derived Review Rules</span>
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-3xl font-extrabold text-white">{data?.active_rules || 0}</span>
            <span className="text-xs text-purple-400 font-medium">Hindsight synced</span>
          </div>
        </div>

        {/* Repeat Issues Caught in PRs */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 relative overflow-hidden group hover:border-slate-700 transition">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Repeat Outages Caught</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-3xl font-extrabold text-emerald-400">{data?.repeat_issues_caught || 0}</span>
            <span className="text-xs text-slate-400">in CodeMind reviews</span>
          </div>
        </div>

        {/* MTTR Drop */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 relative overflow-hidden group hover:border-slate-700 transition">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Avg MTTR</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-3xl font-extrabold text-white">{data?.avg_mttr_current || 25}m</span>
            <span className="flex items-center text-xs font-semibold text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-800/40">
              <ArrowDownRight className="w-3 h-3 mr-0.5" />
              {data?.mttr_reduction_pct || 0}%
            </span>
          </div>
        </div>
      </div>

      {/* Main Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Learning Curve Chart */}
        <div className="lg:col-span-2 p-6 rounded-2xl bg-slate-900/60 border border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-emerald-400" />
                <span>Mean Time To Resolution (MTTR) Learning Curve</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Resolution duration (minutes) drops as Sentinel recalls past fixes and CodeMind prevents repeats
              </p>
            </div>
            <select value={windowSize} onChange={event => setWindowSize(Number(event.target.value) as 7 | 30)} className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 outline-none transition focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              <option value={30}>30-Day Window</option>
              <option value={7}>7-Day Window</option>
            </select>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              {(data?.resolution_time_series || []).length === 0 ? (
                <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-200 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">No resolved incidents yet.</div>
              ) : <AreaChart data={(data?.resolution_time_series || []).slice(-windowSize)} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="mttrGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} unit="m" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '12px' }}
                  labelStyle={{ color: '#94a3b8' }}
                />
                <Area type="monotone" dataKey="minutes" stroke="#818cf8" strokeWidth={2.5} fillOpacity={1} fill="url(#mttrGradient)" />
              </AreaChart>}
            </ResponsiveContainer>
          </div>
        </div>

        {/* Live Learning Feed */}
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-indigo-400" />
              <span>Cross-Agent Learning Feed</span>
            </h2>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-1 max-h-72">
            {(data?.learning_feed || []).length === 0 && <p className="rounded-xl border border-dashed border-slate-200 p-4 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">Learning events will appear here after the first incident or review.</p>}
            {data?.learning_feed.map(item => (
              <div key={item.id} className="p-3 rounded-xl bg-slate-800/40 border border-slate-800 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-indigo-300 capitalize">{item.type.replace('_', ' ')}</span>
                  <span className="text-[10px] text-slate-500">{new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <p className="text-slate-300 leading-relaxed">{item.detail}</p>
                {item.source_incident_id && (
                  <span className="inline-block text-[10px] text-purple-400 bg-purple-950/40 px-2 py-0.5 rounded border border-purple-800/40">
                    Source: Incident #{item.source_incident_id}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Section: "Is Nexus Actually Helping?" (Manager Section) */}
      <div className="p-6 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900/80 to-indigo-950/30 border border-indigo-900/40 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-4 border-b border-slate-800">
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-lg font-bold text-white tracking-tight">Is Nexus Actually Helping?</h2>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20 font-medium">
                Synthetic Benchmark
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Automated impact analysis computed directly from Postgres records and pull request citations.
            </p>
          </div>

          <div className="text-right">
            <span className="text-xs text-slate-400 block">Estimated Hours Saved</span>
            <span className="text-2xl font-black text-indigo-400">
              {analytics?.estimated_hours_saved || 0} hrs
            </span>
          </div>
        </div>

        {/* Manager Takeaways */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
          {analytics?.manager_takeaways.map((takeaway, idx) => (
            <div key={idx} className="flex items-start space-x-3 p-3.5 rounded-xl bg-slate-800/40 border border-slate-700/50">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-slate-200 leading-relaxed">{takeaway}</p>
            </div>
          ))}
        </div>

        {/* Per-Service Breakdown Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
              <tr>
                <th className="pb-2">Service Domain</th>
                <th className="pb-2">Total Incidents</th>
                <th className="pb-2">Current MTTR</th>
                <th className="pb-2">PRs Reviewed</th>
                <th className="pb-2 text-right">Regressions Prevented</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {analytics?.service_breakdown.map((s, idx) => (
                <tr key={idx} className="hover:bg-slate-800/20">
                  <td className="py-2.5 font-sans font-medium text-white flex items-center space-x-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-400" />
                    <span>{s.service}</span>
                  </td>
                  <td className="py-2.5">{s.incidents}</td>
                  <td className="py-2.5">{s.avg_mttr}m</td>
                  <td className="py-2.5">{s.reviews}</td>
                  <td className="py-2.5 text-right font-sans font-bold text-emerald-400">{s.repeat_issues_caught}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
