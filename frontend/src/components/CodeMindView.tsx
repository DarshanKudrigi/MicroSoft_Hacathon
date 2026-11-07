import { useState } from 'react'
import {
  GitPullRequest, Brain, Check, X, ShieldAlert,
  Sparkles, FileCode, CheckCircle2
} from 'lucide-react'

const SAMPLE_PAYMENT_DIFF = `diff --git a/services/payments/webhook.py b/services/payments/webhook.py
--- a/services/payments/webhook.py
+++ b/services/payments/webhook.py
@@ -85,6 +85,8 @@ def handle_stripe_event(event):
+    conn = pool.get_connection()
+    cursor = conn.cursor()
+    cursor.execute('INSERT INTO webhook_events VALUES (%s)', [event.id])
+    # Connection not closed if exception occurs
     return {'status': 'processed'}`

interface ReviewComment {
  id: number
  line: number
  severity: string
  issue: string
  suggestion: string
  because: string
  memory_id?: string
  status: string
  fingerprint: string
}

interface ReviewResult {
  review_id: number
  filename: string
  service: string
  summary: string
  comments: ReviewComment[]
  recalled_memories: Array<{ id: string; text: string; tags: string[]; confidence: number }>
  memory_enabled: boolean
}

export default function CodeMindView() {
  const [filename, setFilename] = useState('services/payments/webhook.py')
  const [service, setService] = useState('payments')
  const [diff, setDiff] = useState(SAMPLE_PAYMENT_DIFF)
  const [memoryEnabled, setMemoryEnabled] = useState(true)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ReviewResult | null>(null)
  const [actionFeedbacks, setActionFeedbacks] = useState<Record<number, string>>({})
  const [error, setError] = useState<string | null>(null)

  const handleRunReview = async () => {
    if (!diff.trim()) {
      setError('Paste a unified diff before running a review.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/codemind/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename,
          service,
          diff,
          memory_enabled: memoryEnabled
        })
      })
      if (!res.ok) throw new Error(`Review request failed (${res.status})`)
      const data = await res.json()
      setResult(data)
    } catch (e) {
      console.error('Review failed:', e)
      setError('CodeMind could not review this diff. Check the backend connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleFeedback = async (commentId: number, accepted: boolean) => {
    try {
      const res = await fetch(`/api/codemind/comments/${commentId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accepted })
      })
      if (res.ok) {
        setActionFeedbacks(prev => ({
          ...prev,
          [commentId]: accepted ? 'ACCEPTED' : 'REJECTED'
        }))
        if (!accepted && result) {
          // Visibly remove rejected comment to demonstrate deterministic exclusion
          setResult({
            ...result,
            comments: result.comments.filter(c => c.id !== commentId)
          })
        }
      } else {
        setError('That review comment could not be updated. Please try again.')
      }
    } catch (e) {
      console.error('Feedback failed:', e)
      setError('That review comment could not be updated. Please try again.')
    }
  }

  return (
    <div className="space-y-8 animate-fadeIn max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <div className="flex items-center space-x-3 mb-1">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
            <GitPullRequest className="w-5 h-5" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">CodeMind — Outage-Aware PR Code Review</h1>
        </div>
        <p className="text-slate-400 text-sm">
          Reviews code diffs using cross-agent rules derived from Sentinel's past production incidents.
        </p>
      </div>
      {error && <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>}

      {/* Input Section */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="space-y-1">
              <label className="text-[11px] text-slate-400">File Path:</label>
              <input
                type="text"
                value={filename}
                onChange={e => setFilename(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500 font-mono w-64"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-slate-400">Service Domain:</label>
              <select
                value={service}
                onChange={e => setService(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500"
              >
                <option value="payments">payments</option>
                <option value="auth">auth</option>
                <option value="orders">orders</option>
              </select>
            </div>
          </div>

          {/* Memory Toggle */}
          <div className="flex items-center space-x-3 bg-slate-800/60 px-4 py-1.5 rounded-xl border border-slate-700/60">
            <Brain className={`w-4 h-4 ${memoryEnabled ? 'text-indigo-400' : 'text-slate-500'}`} />
            <span className="text-xs font-medium text-slate-300">Outage Rule Memory</span>
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

        {/* Diff Input */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs text-slate-400 flex items-center gap-1.5">
              <FileCode className="w-3.5 h-3.5 text-indigo-400" />
              <span>Git Unified Diff (Pasted or PR Sourced):</span>
            </label>
            <button
              type="button"
              onClick={() => setDiff(SAMPLE_PAYMENT_DIFF)}
              className="text-xs text-indigo-400 hover:text-indigo-300 transition"
            >
              Reset to Sample Webhook Diff
            </button>
          </div>
          <textarea
            rows={8}
            value={diff}
            onChange={e => setDiff(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs text-slate-200 focus:outline-none focus:border-indigo-500 leading-relaxed resize-y"
          />
        </div>

        {/* Review Action Button */}
        <div className="flex justify-end">
          <button
            onClick={handleRunReview}
            disabled={loading || !diff.trim()}
            className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs shadow-lg shadow-indigo-600/20 transition disabled:opacity-50"
          >
            {loading ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>CodeMind Reviewing Diff & Cross-Checking Rules...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>Run CodeMind Review</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Review Results & Inline Comments */}
      {result && (
        <div className="space-y-6 animate-fadeIn">
          {/* Summary Banner */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400">Review Summary:</span>
              <p className="text-sm font-semibold text-white">{result.summary}</p>
            </div>
            <span className="text-xs px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-medium">
              {result.comments.length} issues flagged
            </span>
          </div>

          {/* Comments List */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
              Inline Review Comments
            </h3>

            {result.comments.length > 0 ? (
              result.comments.map(c => (
                <div key={c.id} className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <span className="font-mono text-xs px-2.5 py-1 rounded bg-slate-800 text-indigo-300 border border-slate-700">
                        Line {c.line}
                      </span>
                      <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${
                        c.severity === 'critical' ? 'bg-rose-500/20 text-rose-300 border-rose-500/30' :
                        c.severity === 'warning' ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' :
                        'bg-blue-500/20 text-blue-300 border-blue-500/30'
                      }`}>
                        {c.severity}
                      </span>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center space-x-2">
                      {actionFeedbacks[c.id] === 'ACCEPTED' ? (
                        <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Accepted (Rule Reinforced)
                        </span>
                      ) : (
                        <>
                          <button
                            onClick={() => handleFeedback(c.id, false)}
                            className="flex items-center space-x-1 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs border border-slate-700 transition"
                          >
                            <X className="w-3 h-3 text-rose-400" />
                            <span>Reject (Exclude Pattern)</span>
                          </button>
                          <button
                            onClick={() => handleFeedback(c.id, true)}
                            className="flex items-center space-x-1 px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition"
                          >
                            <Check className="w-3 h-3" />
                            <span>Accept</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Issue & Suggestion */}
                  <div className="space-y-1.5">
                    <p className="text-sm font-semibold text-white">{c.issue}</p>
                    <p className="text-xs text-slate-300 bg-slate-950 p-2.5 rounded-lg border border-slate-800 font-mono">
                      Suggested Fix: {c.suggestion}
                    </p>
                  </div>

                  {/* Because Citation */}
                  <div className="p-3 rounded-xl bg-purple-950/20 border border-purple-900/40 text-xs flex items-start space-x-2">
                    <ShieldAlert className="w-4 h-4 text-purple-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <span className="font-semibold text-purple-300">Why CodeMind flagged this: </span>
                      <span className="text-purple-200/90">{c.because}</span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 rounded-2xl bg-slate-900/40 border border-slate-800 text-center space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                <p className="text-sm font-semibold text-white">No Issues Flagged</p>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  CodeMind detected zero regressions matching team outage rules, or previously rejected noisy patterns were excluded.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
