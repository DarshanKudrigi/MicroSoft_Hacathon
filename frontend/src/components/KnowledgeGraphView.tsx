import { useState, useEffect, useCallback } from 'react'
import {
  ReactFlow, Background, Controls, MiniMap,
  Node, Edge, useNodesState, useEdgesState
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { GitGraph, Filter, X, Sparkles } from 'lucide-react'

// Node type color mapping
const NODE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  service: { bg: '#083344', border: '#06b6d4', text: '#67e8f9' },
  incident: { bg: '#4c0519', border: '#f43f5e', text: '#fda4af' },
  root_cause: { bg: '#451a03', border: '#f59e0b', text: '#fde68a' },
  rule: { bg: '#3b0764', border: '#a855f7', text: '#e9d5ff' },
  pr: { bg: '#022c22', border: '#10b981', text: '#6ee7b7' },
  file: { bg: '#0f172a', border: '#3b82f6', text: '#93c5fd' },
  comment: { bg: '#431407', border: '#f97316', text: '#fdba74' },
}

interface NodeDetail {
  node: {
    id: string
    type: string
    label: string
    ref_id: string
    memory_id?: string
    meta: Record<string, any>
  }
  memory_text?: string
  related_records: Record<string, any>
}

export default function KnowledgeGraphView() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [selectedNode, setSelectedNode] = useState<NodeDetail | null>(null)
  const [, setLoading] = useState(true)
  const [serviceFilter, setServiceFilter] = useState('all')

  const fetchGraph = () => {
    setLoading(true)
    let url = '/api/graph?limit=150'
    if (serviceFilter !== 'all') {
      url += `&service=${serviceFilter}`
    }

    fetch(url)
      .then(res => res.json())
      .then(data => {
        // Layout nodes in a clean radial or layered distribution
        const flowNodes: Node[] = (data.nodes || []).map((n: any, idx: number) => {
          const colors = NODE_COLORS[n.type] || { bg: '#1e293b', border: '#64748b', text: '#e2e8f0' }
          const angle = (idx / (data.nodes.length || 1)) * 2 * Math.PI
          const radius = 240 + (idx % 3) * 90
          const x = 400 + Math.cos(angle) * radius
          const y = 300 + Math.sin(angle) * radius

          return {
            id: n.id,
            position: { x, y },
            data: { label: n.label, ...n },
            style: {
              background: colors.bg,
              borderColor: colors.border,
              color: colors.text,
              borderWidth: '2px',
              borderRadius: '12px',
              padding: '10px 14px',
              fontSize: '11px',
              fontWeight: 600,
              boxShadow: '0 4px 14px 0 rgba(0, 0, 0, 0.3)',
              cursor: 'pointer'
            }
          }
        })

        const flowEdges: Edge[] = (data.edges || []).map((e: any) => ({
          id: e.id,
          source: e.src,
          target: e.dst,
          label: e.type.replace('_', ' '),
          animated: e.type === 'derived_rule' || e.type === 'cited_by',
          style: { stroke: '#6366f1', strokeWidth: 1.5 },
          labelStyle: { fill: '#94a3b8', fontSize: '9px', fontWeight: 500 }
        }))

        setNodes(flowNodes)
        setEdges(flowEdges)
        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to load graph:', err)
        setLoading(false)
      })
  }

  useEffect(() => {
    fetchGraph()
  }, [serviceFilter])

  const onNodeClick = useCallback((_: any, node: Node) => {
    fetch(`/api/graph/nodes/${encodeURIComponent(node.id)}`)
      .then(res => res.json())
      .then(detail => {
        setSelectedNode(detail)
      })
      .catch(err => {
        console.error('Failed to fetch node detail:', err)
      })
  }, [])

  return (
    <div className="space-y-4 animate-fadeIn h-[calc(100vh-140px)] flex flex-col">
      {/* Header & Filter Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <GitGraph className="w-5 h-5 text-indigo-400" />
            <span>Interactive Knowledge Graph</span>
          </h1>
          <p className="text-xs text-slate-400">
            Graph nodes connect services, incidents, root-cause categories, derived rules, PRs, and review comments.
          </p>
        </div>

        {/* Legend & Filter */}
        <div className="flex items-center space-x-3 text-xs">
          <div className="flex items-center space-x-1.5 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" title="Service" />
            <span className="text-[11px] text-slate-300">Service</span>
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 ml-2" title="Incident" />
            <span className="text-[11px] text-slate-300">Incident</span>
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 ml-2" title="Cause" />
            <span className="text-[11px] text-slate-300">Cause</span>
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500 ml-2" title="Rule" />
            <span className="text-[11px] text-slate-300">Rule</span>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ml-2" title="PR" />
            <span className="text-[11px] text-slate-300">PR</span>
          </div>

          <div className="flex items-center space-x-2">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={serviceFilter}
              onChange={e => setServiceFilter(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
            >
              <option value="all">All Domains</option>
              <option value="payments">payments</option>
              <option value="auth">auth</option>
              <option value="orders">orders</option>
            </select>
          </div>
        </div>
      </div>

      {/* Canvas & Side Panel Container */}
      <div className="flex-1 relative rounded-2xl border border-slate-800 overflow-hidden bg-slate-950 shadow-2xl">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          fitView
          minZoom={0.2}
          maxZoom={2.0}
        >
          <Background color="#1e293b" gap={20} size={1} />
          <Controls className="bg-slate-900 border-slate-800 text-slate-300" />
          <MiniMap
            nodeColor={(node: any) => NODE_COLORS[node.data?.type]?.border || '#64748b'}
            maskColor="rgba(2, 6, 23, 0.8)"
            className="rounded-xl border border-slate-800 bg-slate-900"
          />
        </ReactFlow>

        {/* Selected Node Drawer / Side Panel */}
        {selectedNode && (
          <div className="absolute right-0 top-0 bottom-0 w-96 bg-slate-900/95 backdrop-blur-md border-l border-slate-800 p-6 overflow-y-auto space-y-4 shadow-2xl animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {selectedNode.node.type}
              </span>
              <button
                onClick={() => setSelectedNode(null)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <h3 className="text-base font-bold text-white">{selectedNode.node.label}</h3>
              <p className="font-mono text-xs text-slate-400 mt-0.5">ID: {selectedNode.node.id}</p>
            </div>

            {/* Memory Text */}
            {selectedNode.memory_text && (
              <div className="p-3.5 rounded-xl bg-purple-950/20 border border-purple-900/40 space-y-1.5">
                <span className="text-[11px] font-semibold text-purple-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                  <span>Hindsight Memory Text:</span>
                </span>
                <p className="text-xs text-purple-100 leading-relaxed">
                  {selectedNode.memory_text}
                </p>
              </div>
            )}

            {/* Related Incident Details */}
            {selectedNode.related_records?.incident && (
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
                <span className="font-semibold text-rose-400">Incident Details:</span>
                <p className="text-slate-200"><span className="text-slate-400">Root Cause:</span> {selectedNode.related_records.incident.root_cause}</p>
                <p className="text-slate-200"><span className="text-slate-400">MTTR:</span> {selectedNode.related_records.incident.minutes_to_resolve}m</p>
              </div>
            )}

            {/* Related PR Details */}
            {selectedNode.related_records?.pull_request && (
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
                <span className="font-semibold text-emerald-400">Pull Request Details:</span>
                <p className="text-slate-200"><span className="text-slate-400">Title:</span> {selectedNode.related_records.pull_request.title}</p>
                <p className="text-slate-200"><span className="text-slate-400">Author:</span> {selectedNode.related_records.pull_request.author}</p>
              </div>
            )}

            {/* In / Out Edge Connections */}
            {selectedNode.related_records?.connections && (
              <div className="space-y-2 text-xs">
                <span className="font-semibold text-slate-400 uppercase tracking-wider block text-[11px]">
                  Graph Relationships
                </span>
                <div className="space-y-1 font-mono text-[11px]">
                  {selectedNode.related_records.connections.outgoing.map((e: any, idx: number) => (
                    <div key={idx} className="p-2 rounded bg-slate-800/60 text-slate-300">
                      → <span className="text-indigo-400">{e.type}</span> to {e.dst}
                    </div>
                  ))}
                  {selectedNode.related_records.connections.incoming.map((e: any, idx: number) => (
                    <div key={idx} className="p-2 rounded bg-slate-800/60 text-slate-300">
                      ← <span className="text-indigo-400">{e.type}</span> from {e.src}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
