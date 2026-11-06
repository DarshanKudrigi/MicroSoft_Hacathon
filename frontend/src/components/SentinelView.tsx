import { useState } from 'react'
import {
  ShieldAlert, Brain, Zap, CheckCircle2, XCircle, ArrowRight,
  ListOrdered, CheckSquare, Layers, AlertCircle
} from 'lucide-react'

const SAMPLE_INCIDENT_12 = `2026-10-18T14:22:01.402Z [payments-worker-3] ERROR com.zaxxer.hikari.HikariPool - HikariPool-1 - Connection is not available, request timed out after 30005ms.
org.postgresql.util.PSQLException: FATAL: remaining connection slots are reserved for non-replication superuser connections
    at com.nexus.payments.checkout.ProcessPayment(CheckoutService.java:142)
    at com.nexus.payments.webhook.StripeWebhookHandler.handleEvent(StripeWebhookHandler.java:88)
    at org.springframework.web.servlet.FrameworkServlet.service(FrameworkServlet.java:883)
Caused by: Connection leak in StripeWebhookHandler: connection acquired at line 88 was never released during error response handling
2026-10-18T14:22:05.112Z [payments-worker-7] WARN com.zaxxer.hikari.pool.PoolBase - HikariPool-1 - Failed to validate connection org.postgresql.jdbc.PgConnection@4d2a1f8 (connection dead)`

const SAMPLE_OOM = `2026-10-25T11:20:00Z [orders-srv] ERROR java.lang.OutOfMemoryError: Java heap space
Dumping heap to java_pid1042.hprof ... Heap exhausted processing bulk export payload.
at java.util.Arrays.copyOf(Arrays.java:3210)
at java.util.ArrayList.grow(ArrayList.java:265)
at com.nexus.orders.export.BulkOrderExporter.accumulate(BulkOrderExporter.java:78)`

interface DiagnosisResult {
  incident_id: number
  service: string
  signature: {
    service: string
    errorType: string
    symptoms: string[]
    severity: string
  }
  analysis: {
    rootCause: string
    rootCauseCategory: string
    confidence: number
    causalChain: string[]
    contributingFactors: string[]
    hypotheses: Array<{ cause: string; confidence: number; evidence: string[] }>
    verifySteps: string[]
    steps: string[]
    usedMemories: string[]
  }
  recalled_memories: Array<{ id: string; text: string; tags: string[]; confidence: number }>
  memory_enabled: boolean
  memory_available: boolean
}

export default function SentinelView() {
  const [service, setService] = useState('payments')
  const [logs, setLogs] = useState('')
  const [memoryEnabled, setMemoryEnabled] = useState(true)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<DiagnosisResult | null>(null)
  const [minutesToResolve, setMinutesToResolve] = useState(20)
  const [outcomeStatus, setOutcomeStatus] = useState<string | null>(null)

  const handleDiagnose = async () => {
    if (!logs.trim()) return
    setLoading(true)
    setOutcomeStatus(null)
    try {
      const res = await fetch('/api/sentinel/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service,
          logs,
          memory_enabled: memoryEnabled
        })
      })
      const data = await res.json()
      setResult(data)
    } catch (e) {
      console.error('Diagnosis failed:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleOutcome = async (worked: boolean) => {
    if (!result) return
    try {
      await fetch(`/api/sentinel/incidents/${result.incident_id}/outcome`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worked,
          minutesToResolve: Number(minutesToResolve)
        })
      })
      setOutcomeStatus(worked ? 'RESOLVED_WORKED' : 'RESOLVED_FAILED')
    } catch (e) {
      console.error('Outcome failed:', e)
    }
  }

  return (
    <div className="space-y-8 animate-fadeIn max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <div className="flex items-center space-x-3 mb-1">
          <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Sentinel — Autonomous Incident RCA</h1>
        </div>
        <p className="text-slate-400 text-sm">
          Diagnose production outages from raw logs using Hindsight memory recall to separate surface symptoms from underlying root causes.
        </p>
      </div>

      {/* Input Section */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Service Selector */}
          <div className="flex items-center space-x-3">
            <label className="text-xs font-semibold text-slate-300">Service:</label>
            <select
              value={service}
              onChange={e => setService(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500"
            >
              <option value="payments">payments</option>
              <option value="auth">auth</option>
              <option value="orders">orders</option>
            </select>

            {/* Quick Sample Presets */}
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => { setService('payments'); setLogs(SAMPLE_INCIDENT_12); }}
                className="px-2.5 py-1 rounded-md bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs transition"
              >
                Preset: Incident #12 (HikariPool Outage)
              </button>
              <button
                type="button"
                onClick={() => { setService('orders'); setLogs(SAMPLE_OOM); }}
                className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
              >
                Preset: OOM Heap Crash
              </button>
            </div>
          </div>

          {/* Memory Toggle */}
          <div className="flex items-center space-x-3 bg-slate-800/60 px-4 py-1.5 rounded-xl border border-slate-700/60">
            <Brain className={`w-4 h-4 ${memoryEnabled ? 'text-indigo-400' : 'text-slate-500'}`} />
            <span className="text-xs font-medium text-slate-300">Hindsight Memory</span>
            <button
              type="button"
              onClick={() => setMemoryEnabled(!memoryEnabled)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                memoryEnabled ? 'bg-indigo-600' : 'bg-slate-700'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  memoryEnabled ? 'translate-x-4' : 'translate-x-1'
                }`}
              />
            </button>
            <span className={`text-[11px] font-bold ${memoryEnabled ? 'text-indigo-400' : 'text-slate-500'}`}>
              {memoryEnabled ? 'ON' : 'OFF'}
            </span>
          </div>
        </div>

        {/* Logs Textarea */}
        <div className="space-y-1.5">
          <label className="text-xs text-slate-400">Pasted Production Logs / Stack Traces (Untrusted):</label>
          <textarea
            rows={7}
            value={logs}
            onChange={e => setLogs(e.target.value)}
            placeholder="Paste raw application logs, stack traces, or exception dumps here..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs text-slate-200 focus:outline-none focus:border-indigo-500 leading-relaxed resize-y"
          />
        </div>

        {/* Action Button */}
        <div className="flex justify-end">
          <button
            onClick={handleDiagnose}
            disabled={loading || !logs.trim()}
            className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-medium text-xs shadow-lg shadow-indigo-500/20 transition disabled:opacity-50"
          >
            {loading ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Sentinel Analyzing Root Cause...</span>
              </>
            ) : (
              <>
                <Zap className="w-3.5 h-3.5" />
                <span>Run Sentinel RCA Diagnosis</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Diagnosis Results Section */}
      {result && (
        <div className="space-y-6 animate-fadeIn">
          {/* Main RCA Card */}
          <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800 gap-3">
              <div>
                <div className="flex items-center space-x-3">
                  <span className="text-xs text-slate-400">Incident #{result.incident_id}</span>
                  <span className="px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold capitalize">
                    {result.analysis.rootCauseCategory.replace('_', ' ')}
                  </span>
                  <span className="text-xs text-slate-400">Service: <span className="text-white font-mono">{result.service}</span></span>
                </div>
                <h2 className="text-lg font-bold text-white mt-1 leading-snug">
                  {result.analysis.rootCause}
                </h2>
              </div>

              {/* Confidence Gauge */}
              <div className="flex items-center space-x-3 bg-slate-800/80 px-4 py-2 rounded-xl border border-slate-700/60">
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Confidence</span>
                  <span className={`text-base font-black ${result.analysis.confidence >= 0.8 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {Math.round(result.analysis.confidence * 100)}%
                  </span>
                </div>
                <div className={`w-3 h-3 rounded-full ${result.analysis.confidence >= 0.8 ? 'bg-emerald-500' : 'bg-amber-400'} animate-pulse`} />
              </div>
            </div>

            {/* Causal Chain Visualization */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-indigo-400" />
                <span>Causal Chain (Trigger → Root Cause → Observable Symptoms)</span>
              </span>
              <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
                {result.analysis.causalChain.map((step, idx) => (
                  <div key={idx} className="flex items-center space-x-2">
                    <span className="px-3 py-1 rounded-lg bg-slate-800 text-slate-200 text-xs border border-slate-700/60">
                      {step}
                    </span>
                    {idx < result.analysis.causalChain.length - 1 && (
                      <ArrowRight className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Ranked Hypotheses */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Ranked Hypotheses & Evidence
              </span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {result.analysis.hypotheses.map((h, idx) => (
                  <div key={idx} className="p-3.5 rounded-xl bg-slate-800/40 border border-slate-700/50 text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white">{h.cause}</span>
                      <span className="text-indigo-400 font-mono font-bold">{Math.round(h.confidence * 100)}%</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {h.evidence.map((ev, e_idx) => (
                        <span key={e_idx} className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] border border-slate-700">
                          {ev}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Verify Steps & Fix Steps */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              {/* Verify Steps */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                  <CheckSquare className="w-3.5 h-3.5" />
                  <span>Verification Steps (Confirm Before Acting)</span>
                </span>
                <ul className="space-y-2">
                  {result.analysis.verifySteps.map((step, idx) => (
                    <li key={idx} className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 text-xs text-slate-300 flex items-start space-x-2">
                      <span className="text-cyan-400 font-mono mt-0.5">[{idx + 1}]</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Fix Steps */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                  <ListOrdered className="w-3.5 h-3.5" />
                  <span>Numbered Remediation Steps</span>
                </span>
                <ol className="space-y-2">
                  {result.analysis.steps.map((step, idx) => (
                    <li key={idx} className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 text-xs text-slate-300 flex items-start space-x-2">
                      <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-[10px] mt-0.5 flex-shrink-0">
                        {idx + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            {/* Recalled From Memory Panel */}
            <div className="p-4 rounded-xl bg-indigo-950/20 border border-indigo-900/40 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-300 flex items-center gap-2">
                  <Brain className="w-4 h-4 text-indigo-400" />
                  <span>Recalled From Hindsight Memory Bank ({result.recalled_memories.length} matches)</span>
                </span>
                <span className="text-[10px] text-indigo-400 font-mono">bank: nexus-org</span>
              </div>

              {result.recalled_memories.length > 0 ? (
                <div className="space-y-2">
                  {result.recalled_memories.map((m, idx) => (
                    <div key={idx} className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 text-xs space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-mono text-purple-400">{m.id}</span>
                        <span className="text-slate-400">{Math.round(m.confidence * 100)}% match</span>
                      </div>
                      <p className="text-slate-200">{m.text}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {m.tags.map((t, t_idx) => (
                          <span key={t_idx} className="px-1.5 py-0.2 rounded bg-indigo-950/60 text-indigo-300 text-[9px] border border-indigo-800/40">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">
                  {result.memory_enabled ? "No past memories found for this error signature." : "Memory mode is OFF. Sentinel analyzed logs without past incident context."}
                </p>
              )}
            </div>

            {/* On-Call Resolution Feedback & Learning Trigger */}
            <div className="pt-4 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center space-x-3 text-xs">
                <span className="text-slate-400 font-medium">Minutes to Resolve:</span>
                <input
                  type="number"
                  min={1}
                  value={minutesToResolve}
                  onChange={e => setMinutesToResolve(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-20 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center space-x-3">
                {outcomeStatus === 'RESOLVED_WORKED' ? (
                  <div className="flex items-center space-x-2 text-xs font-semibold text-emerald-400 bg-emerald-950/40 border border-emerald-800/50 px-4 py-2 rounded-xl">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Fix Worked! Sentinel updated MTTR & derived CodeMind review rule.</span>
                  </div>
                ) : outcomeStatus === 'RESOLVED_FAILED' ? (
                  <div className="flex items-center space-x-2 text-xs font-semibold text-amber-300 bg-amber-950/40 border border-amber-800/50 px-4 py-2 rounded-xl">
                    <AlertCircle className="w-4 h-4" />
                    <span>Marked Failed. Hindsight retained lower-ranked negative experience.</span>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => handleOutcome(false)}
                      className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition"
                    >
                      <XCircle className="w-3.5 h-3.5 text-rose-400" />
                      <span>Didn't Work</span>
                    </button>
                    <button
                      onClick={() => handleOutcome(true)}
                      className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium shadow-md shadow-emerald-600/20 transition"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Worked (Trigger Cross-Agent Learning)</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
