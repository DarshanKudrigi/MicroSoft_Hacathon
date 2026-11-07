import { useState, useEffect, useMemo } from 'react';
import { motion, Variants } from 'framer-motion';
import {
  Database, Search, Filter, RefreshCw, X,
  ShieldAlert, GitPullRequest, BrainCircuit
} from 'lucide-react';

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 320, damping: 26 } }
};

interface MemoryItem {
  id: string;
  scope: string;
  agent: string;
  type: string;
  text: string;
  recalled: number;
  created: string;
}

const initialMemoryData: MemoryItem[] = [
  { id: 'MEM-0892', scope: 'payments', agent: 'Sentinel', type: 'Root Cause Pattern', text: 'HikariCP connection timeouts in payments-svc are strongly correlated with unthrottled Stripe webhook surges and unclosed cursor contexts.', recalled: 19, created: '2 days ago' },
  { id: 'MEM-0891', scope: 'payments', agent: 'CodeMind', type: 'PR Guardrail Rule', text: 'Ensure pool.get_connection() is wrapped in a context manager or try/finally block to prevent connection pool starvation on exception.', recalled: 42, created: '5 days ago' },
  { id: 'MEM-0850', scope: 'auth-gateway', agent: 'Sentinel', type: 'Root Cause Pattern', text: 'Redis OOM crashes occur when ephemeral OAuth state tokens are written without explicit EXPIRE TTL flags during traffic spikes.', recalled: 11, created: '1 week ago' },
  { id: 'MEM-0812', scope: 'user-profile', agent: 'CodeMind', type: 'PR Guardrail Rule', text: 'Block N+1 ORM queries inside serializer loops on /v2/users/batch endpoint; require select_related prefetching.', recalled: 27, created: '2 weeks ago' },
  { id: 'MEM-0744', scope: 'notification-engine', agent: 'Hindsight', type: 'Temporal Anchor', text: 'SendGrid rate-limit 429 cascades happen every Monday 09:00 UTC digest cron unless worker concurrency is capped at 15.', recalled: 8, created: '3 weeks ago' },
];

interface MemoryExplorerViewProps {
  addToast: (message: string, type?: 'success' | 'warning' | 'info') => void;
  externalMemories?: MemoryItem[];
}

export default function MemoryExplorerView({ addToast, externalMemories }: MemoryExplorerViewProps) {
  const [memories, setMemories] = useState<MemoryItem[]>(externalMemories || initialMemoryData);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAgent, setSelectedAgent] = useState('All Agents');
  const [selectedService, setSelectedService] = useState('All Services');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Sync with backend API
  const fetchBackendMemories = async () => {
    try {
      let url = '/api/memories?';
      if (searchQuery) url += `q=${encodeURIComponent(searchQuery)}&`;
      if (selectedAgent !== 'All Agents') url += `agent=${encodeURIComponent(selectedAgent.toLowerCase())}&`;
      if (selectedService !== 'All Services') url += `service=${encodeURIComponent(selectedService)}&`;

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.memories) && data.memories.length > 0) {
          const mapped: MemoryItem[] = data.memories.map((m: any) => ({
            id: m.id,
            scope: m.service || 'payments',
            agent: m.agent === 'sentinel' ? 'Sentinel' : m.agent === 'codemind' ? 'CodeMind' : 'Hindsight',
            type: m.derived ? 'PR Guardrail Rule' : 'Root Cause Pattern',
            text: m.text,
            recalled: m.recalled_count || 12,
            created: 'Recently'
          }));
          setMemories(mapped);
          return;
        }
      }
    } catch {
      // Retain existing memories
    }
  };

  useEffect(() => {
    fetchBackendMemories();
  }, [selectedAgent, selectedService]);

  const filteredMemories = useMemo(() => {
    return memories.filter((mem) => {
      const q = searchQuery.trim().toLowerCase();
      const matchesQuery =
        !q ||
        mem.id.toLowerCase().includes(q) ||
        mem.text.toLowerCase().includes(q) ||
        mem.scope.toLowerCase().includes(q) ||
        mem.type.toLowerCase().includes(q);

      const matchesAgent = selectedAgent === 'All Agents' || mem.agent.toLowerCase() === selectedAgent.toLowerCase();
      const matchesService = selectedService === 'All Services' || mem.scope.toLowerCase() === selectedService.toLowerCase();

      return matchesQuery && matchesAgent && matchesService;
    });
  }, [memories, searchQuery, selectedAgent, selectedService]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchBackendMemories();
    setTimeout(() => {
      setIsRefreshing(false);
      addToast('Synced latest memory anchors from bank nexus-org', 'info');
    }, 600);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <motion.div variants={itemVariants}>
        <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
          <div className="p-2.5 bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded-xl border border-purple-500/20">
            <Database className="w-6 h-6" />
          </div>
          Hindsight Memory Explorer
        </h2>
        <p className="text-slate-500 dark:text-slate-400 mt-1.5 text-sm sm:text-base font-medium">
          Inspect persistent knowledge, derived incident rules, recall frequency counters, and temporal anchors in bank{' '}
          <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">nexus-org</span>.
        </p>
      </motion.div>

      <motion.div variants={itemVariants} className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-md overflow-hidden">
        {/* Search & Filter Bar */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search memories by semantic topic, incident number, or ID..."
              className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 text-sm rounded-xl pl-10 pr-9 py-2 outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <Filter className="w-4 h-4 text-slate-400 hidden sm:block" />
            <select
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value)}
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs sm:text-sm rounded-xl px-3.5 py-2 outline-none font-bold"
            >
              <option value="All Agents">All Agents</option>
              <option value="Sentinel">Sentinel</option>
              <option value="CodeMind">CodeMind</option>
              <option value="Hindsight">Hindsight</option>
            </select>

            <select
              value={selectedService}
              onChange={(e) => setSelectedService(e.target.value)}
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs sm:text-sm rounded-xl px-3.5 py-2 outline-none font-bold"
            >
              <option value="All Services">All Services</option>
              <option value="payments">payments</option>
              <option value="auth-gateway">auth-gateway</option>
              <option value="user-profile">user-profile</option>
              <option value="notification-engine">notification-engine</option>
            </select>

            <button
              onClick={handleRefresh}
              title="Refresh Memory Bank"
              className="p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-indigo-500' : ''}`} />
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50/80 dark:bg-slate-950/60 border-b border-slate-200/70 dark:border-slate-800">
              <tr>
                <th className="px-6 py-3.5 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Memory ID & Scope</th>
                <th className="px-6 py-3.5 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Agent / Type</th>
                <th className="px-6 py-3.5 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Memory Text & Rules</th>
                <th className="px-6 py-3.5 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-right">Recalled</th>
                <th className="px-6 py-3.5 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-right">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
              {filteredMemories.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-300">No memories match your active filters.</p>
                    <button
                      onClick={() => { setSearchQuery(''); setSelectedAgent('All Agents'); setSelectedService('All Services'); }}
                      className="mt-2 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                    >
                      Reset all filters
                    </button>
                  </td>
                </tr>
              ) : (
                filteredMemories.map((mem) => {
                  const AgentIcon = mem.agent === 'Sentinel' ? ShieldAlert : mem.agent === 'CodeMind' ? GitPullRequest : BrainCircuit;
                  const iconColor = mem.agent === 'Sentinel' ? 'text-rose-500' : mem.agent === 'CodeMind' ? 'text-indigo-500' : 'text-purple-500';

                  return (
                    <tr key={mem.id} className="hover:bg-indigo-50/30 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-mono text-sm font-bold text-indigo-600 dark:text-indigo-400">{mem.id}</div>
                        <div className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-0.5">{mem.scope}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700">
                          <AgentIcon className={`w-3.5 h-3.5 ${iconColor}`} />
                          {mem.agent}
                        </span>
                        <div className="text-[11px] font-medium text-slate-400 mt-1">{mem.type}</div>
                      </td>
                      <td className="px-6 py-4 max-w-xl">
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-200 leading-relaxed">{mem.text}</p>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-mono text-xs font-bold">
                          {mem.recalled}x
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-xs font-semibold text-slate-400 dark:text-slate-500">
                        {mem.created}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}
