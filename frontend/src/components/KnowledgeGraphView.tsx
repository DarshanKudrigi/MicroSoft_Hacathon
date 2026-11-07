import { useState, useMemo, useEffect } from 'react';
import { motion, Variants } from 'framer-motion';
import {
  Network, Plus, Minus, Maximize, Lock, Unlock
} from 'lucide-react';

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 320, damping: 26 } }
};

interface GraphNodeItem {
  id: string;
  label: string;
  category: string;
  domain: string;
  x: number;
  y: number;
  color: string;
  desc: string;
}

interface GraphEdgeItem {
  from: string;
  to: string;
}

const defaultGraphNodes: GraphNodeItem[] = [
  { id: 'svc-pay', label: 'payments-svc', category: 'Service', domain: 'payments', x: 240, y: 180, color: '#06b6d4', desc: 'Core Stripe & checkout microservice.' },
  { id: 'inc-12', label: 'Incident #12', category: 'Incident', domain: 'payments', x: 430, y: 110, color: '#f43f5e', desc: 'HikariPool 30s connection starvation outage.' },
  { id: 'cause-leak', label: 'Unclosed DB Cursor', category: 'Cause', domain: 'payments', x: 630, y: 160, color: '#f59e0b', desc: 'Exception path skipped cursor.close().' },
  { id: 'rule-891', label: 'Rule MEM-0891', category: 'Rule', domain: 'payments', x: 580, y: 310, color: '#a855f7', desc: 'Require context manager on pool.get_connection().' },
  { id: 'pr-492', label: 'PR #492 (Blocked)', category: 'PR', domain: 'payments', x: 350, y: 320, color: '#10b981', desc: 'Webhook handler diff caught before merge.' },
  { id: 'svc-auth', label: 'auth-gateway', category: 'Service', domain: 'auth-gateway', x: 170, y: 340, color: '#06b6d4', desc: 'OAuth2 & session token gateway.' },
  { id: 'inc-09', label: 'Incident #09', category: 'Incident', domain: 'auth-gateway', x: 190, y: 460, color: '#f43f5e', desc: 'Redis OOM crash during login surge.' },
  { id: 'rule-850', label: 'Rule MEM-0850', category: 'Rule', domain: 'auth-gateway', x: 410, y: 450, color: '#a855f7', desc: 'Enforce TTL on ephemeral session keys.' },
];

const defaultGraphEdges: GraphEdgeItem[] = [
  { from: 'svc-pay', to: 'inc-12' },
  { from: 'inc-12', to: 'cause-leak' },
  { from: 'cause-leak', to: 'rule-891' },
  { from: 'rule-891', to: 'pr-492' },
  { from: 'pr-492', to: 'svc-pay' },
  { from: 'svc-auth', to: 'inc-09' },
  { from: 'inc-09', to: 'rule-850' },
];

export default function KnowledgeGraphView() {
  const [nodes, setNodes] = useState<GraphNodeItem[]>(defaultGraphNodes);
  const [edges, setEdges] = useState<GraphEdgeItem[]>(defaultGraphEdges);
  const [domainFilter, setDomainFilter] = useState('All Domains');
  const [zoom, setZoom] = useState(1);
  const [isLocked, setIsLocked] = useState(false);
  const [selectedNode, setSelectedNode] = useState<GraphNodeItem | null>(defaultGraphNodes[1]);
  const [nodeDetail, setNodeDetail] = useState<{
    memory_text?: string | null;
    related?: Record<string, any>;
  } | null>(null);

  useEffect(() => {
    if (!selectedNode?.id) {
      setNodeDetail(null);
      return;
    }
    fetch(`/api/graph/nodes/${encodeURIComponent(selectedNode.id)}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) {
          setNodeDetail({
            memory_text: data.memory_text,
            related: data.related
          });
        }
      })
      .catch(() => {
        setNodeDetail(null);
      });
  }, [selectedNode?.id]);

  useEffect(() => {
    let url = '/api/graph';
    if (domainFilter !== 'All Domains') {
      url += `?service=${domainFilter}`;
    }
    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch graph');
        return res.json();
      })
      .then(data => {
        if (Array.isArray(data.nodes) && data.nodes.length > 0) {
          const catColors: Record<string, string> = {
            service: '#06b6d4',
            incident: '#f43f5e',
            root_cause: '#f59e0b',
            rule: '#a855f7',
            pr: '#10b981'
          };
          const mappedNodes: GraphNodeItem[] = data.nodes.map((n: any, idx: number) => {
            const angle = (idx / data.nodes.length) * 2 * Math.PI;
            const radius = 180 + (idx % 3) * 60;
            return {
              id: n.id,
              label: n.label || n.id,
              category: (n.type || 'Service').replace('root_cause', 'Cause').toUpperCase(),
              domain: n.meta?.service || 'payments',
              x: Math.round(410 + Math.cos(angle) * radius),
              y: Math.round(270 + Math.sin(angle) * radius),
              color: catColors[n.type] || '#6366f1',
              desc: n.meta?.description || `Knowledge graph entity linked to ${n.meta?.service || 'services'}.`
            };
          });
          setNodes(mappedNodes);

          if (Array.isArray(data.edges)) {
            setEdges(data.edges.map((e: any) => ({ from: e.src, to: e.dst })));
          }
        }
      })
      .catch(() => {
        // Retain default nodes seamlessly
      });
  }, [domainFilter]);

  const visibleNodes = useMemo(() => {
    if (domainFilter === 'All Domains') return nodes;
    return nodes.filter(n => n.domain.toLowerCase() === domainFilter.toLowerCase());
  }, [nodes, domainFilter]);

  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map(n => n.id)), [visibleNodes]);

  const visibleEdges = useMemo(() => {
    return edges.filter(e => visibleNodeIds.has(e.from) && visibleNodeIds.has(e.to));
  }, [edges, visibleNodeIds]);

  const legendItems = [
    { label: 'Service', color: 'bg-cyan-500' },
    { label: 'Incident', color: 'bg-rose-500' },
    { label: 'Cause', color: 'bg-amber-500' },
    { label: 'Rule', color: 'bg-purple-500' },
    { label: 'PR', color: 'bg-emerald-500' },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <motion.div variants={itemVariants} className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl border border-indigo-500/20">
              <Network className="w-6 h-6" />
            </div>
            Interactive Knowledge Graph
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm sm:text-base font-medium">
            Graph nodes connect services, incidents, root-cause categories, derived rules, PRs, and review comments.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 bg-white dark:bg-slate-900 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            {legendItems.map((item) => (
              <span key={item.label} className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300">
                <span className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
                {item.label}
              </span>
            ))}
          </div>

          <select
            value={domainFilter}
            onChange={(e) => setDomainFilter(e.target.value)}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-bold rounded-xl px-3.5 py-2 outline-none shadow-sm cursor-pointer"
          >
            <option value="All Domains">All Domains</option>
            <option value="payments">payments</option>
            <option value="auth-gateway">auth-gateway</option>
          </select>
        </div>
      </motion.div>

      <motion.div
        variants={itemVariants}
        className="h-[540px] bg-white dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-inner relative overflow-hidden flex items-center justify-center select-none"
        style={{
          backgroundImage: 'radial-gradient(rgba(148, 163, 184, 0.22) 1px, transparent 1px)',
          backgroundSize: '24px 24px'
        }}
      >
        <svg
          viewBox="0 0 820 540"
          className="w-full h-full transition-transform duration-300"
          style={{ transform: `scale(${zoom})` }}
        >
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="26" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#6366f1" fillOpacity="0.6" />
            </marker>
          </defs>

          {/* Edges */}
          {visibleEdges.map((edge, idx) => {
            const fromNode = nodes.find(n => n.id === edge.from);
            const toNode = nodes.find(n => n.id === edge.to);
            if (!fromNode || !toNode) return null;
            return (
              <g key={idx}>
                <line
                  x1={fromNode.x}
                  y1={fromNode.y}
                  x2={toNode.x}
                  y2={toNode.y}
                  stroke="#6366f1"
                  strokeOpacity="0.45"
                  strokeWidth="2"
                  strokeDasharray="5 5"
                  markerEnd="url(#arrow)"
                />
              </g>
            );
          })}

          {/* Nodes */}
          {visibleNodes.map((node) => {
            const isSelected = selectedNode?.id === node.id;
            return (
              <g
                key={node.id}
                onClick={() => !isLocked && setSelectedNode(node)}
                className="cursor-pointer group"
              >
                {isSelected && (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r="30"
                    fill={node.color}
                    fillOpacity="0.18"
                  />
                )}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r="20"
                  fill={node.color}
                  stroke="#ffffff"
                  strokeWidth="3"
                />
                <text
                  x={node.x}
                  y={node.y + 36}
                  textAnchor="middle"
                  className="fill-slate-700 dark:fill-slate-200 text-[12px] font-bold select-none"
                >
                  {node.label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Bottom-Left Zoom Controls */}
        <div className="absolute bottom-5 left-5 flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg overflow-hidden z-20">
          <button
            onClick={() => setZoom(z => Math.min(z + 0.15, 1.6))}
            title="Zoom In"
            className="p-2.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border-b border-slate-100 dark:border-slate-800 transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={() => setZoom(z => Math.max(z - 0.15, 0.7))}
            title="Zoom Out"
            className="p-2.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border-b border-slate-100 dark:border-slate-800 transition-colors"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            onClick={() => setZoom(1)}
            title="Reset Viewport"
            className="p-2.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border-b border-slate-100 dark:border-slate-800 transition-colors"
          >
            <Maximize className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsLocked(!isLocked)}
            title={isLocked ? 'Unlock Selection' : 'Lock Selection'}
            className={`p-2.5 transition-colors ${isLocked ? 'text-indigo-600 bg-indigo-50 dark:bg-indigo-500/20' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
          >
            {isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
          </button>
        </div>

        {/* Bottom-Right Selected Node Inspector */}
        {selectedNode && (
          <div className="absolute bottom-5 right-5 w-80 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xl z-20 max-h-60 overflow-y-auto">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                {selectedNode.category}
              </span>
              <span className="text-xs font-mono text-slate-400">{selectedNode.domain}</span>
            </div>
            <div className="text-sm font-black text-slate-900 dark:text-white">{selectedNode.label}</div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1">{selectedNode.desc}</p>
            {nodeDetail?.memory_text && (
              <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-300">
                <span className="font-bold text-indigo-600 dark:text-indigo-400">Memory Text: </span>
                {nodeDetail.memory_text}
              </div>
            )}
            {nodeDetail?.related?.incident && (
              <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                <span className="font-semibold text-slate-700 dark:text-slate-300">Incident: </span>
                {nodeDetail.related.incident.root_cause} ({nodeDetail.related.incident.minutes_to_resolve}m MTTR)
              </div>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
