import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, ShieldAlert, CheckCircle2,
  GitPullRequest, Search, Bell,
  BrainCircuit, Database, Network,
  X, Info, Sun, Moon, AlertTriangle
} from 'lucide-react';

import DashboardView from './components/DashboardView';
import SentinelView from './components/SentinelView';
import CodeMindView from './components/CodeMindView';
import MemoryExplorerView from './components/MemoryExplorerView';
import KnowledgeGraphView from './components/KnowledgeGraphView';

interface ToastItem {
  id: string;
  message: string;
  type: 'success' | 'warning' | 'info';
}

const Toast: React.FC<{
  message: string;
  type: 'success' | 'warning' | 'info';
  onClose: () => void;
}> = ({ message, type, onClose }) => (
  <motion.div
    initial={{ opacity: 0, y: 40, scale: 0.95 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
    className="mb-3 flex items-center gap-3 bg-slate-900/95 dark:bg-white/95 backdrop-blur-md border border-slate-700/60 dark:border-slate-200/80 text-white dark:text-slate-900 px-4 py-3 rounded-xl shadow-[0_12px_36px_-8px_rgba(0,0,0,0.4)] z-50 pointer-events-auto"
  >
    {type === 'success' ? (
      <CheckCircle2 className="w-5 h-5 text-emerald-400 dark:text-emerald-600 shrink-0" />
    ) : type === 'warning' ? (
      <AlertTriangle className="w-5 h-5 text-amber-400 dark:text-amber-600 shrink-0" />
    ) : (
      <Info className="w-5 h-5 text-indigo-400 dark:text-indigo-600 shrink-0" />
    )}
    <span className="text-sm font-semibold">{message}</span>
    <button
      onClick={onClose}
      className="ml-3 text-slate-400 hover:text-white dark:text-slate-500 dark:hover:text-slate-900 transition-colors p-1 rounded-lg"
    >
      <X className="w-4 h-4" />
    </button>
  </motion.div>
);

const sampleMemories = [
  { id: 'MEM-0892', scope: 'payments', agent: 'Sentinel', type: 'Root Cause Pattern', text: 'HikariCP connection timeouts in payments-svc are strongly correlated with unthrottled Stripe webhook surges and unclosed cursor contexts.', recalled: 19, created: '2 days ago' },
  { id: 'MEM-0891', scope: 'payments', agent: 'CodeMind', type: 'PR Guardrail Rule', text: 'Ensure pool.get_connection() is wrapped in a context manager or try/finally block to prevent connection pool starvation on exception.', recalled: 42, created: '5 days ago' },
  { id: 'MEM-0850', scope: 'auth-gateway', agent: 'Sentinel', type: 'Root Cause Pattern', text: 'Redis OOM crashes occur when ephemeral OAuth state tokens are written without explicit EXPIRE TTL flags during traffic spikes.', recalled: 11, created: '1 week ago' },
  { id: 'MEM-0812', scope: 'user-profile', agent: 'CodeMind', type: 'PR Guardrail Rule', text: 'Block N+1 ORM queries inside serializer loops on /v2/users/batch endpoint; require select_related prefetching.', recalled: 27, created: '2 weeks ago' },
  { id: 'MEM-0744', scope: 'notification-engine', agent: 'Hindsight', type: 'Temporal Anchor', text: 'SendGrid rate-limit 429 cascades happen every Monday 09:00 UTC digest cron unless worker concurrency is capped at 15.', recalled: 8, created: '3 weeks ago' },
];

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  setCurrentView: (view: string) => void;
  addToast: (message: string, type?: 'success' | 'warning' | 'info') => void;
  toggleTheme: () => void;
  theme: string;
  memories: typeof sampleMemories;
}

const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  setCurrentView,
  addToast,
  toggleTheme,
  theme,
  memories
}) => {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (isOpen) setQuery('');
  }, [isOpen]);

  const quickActions = useMemo(() => [
    { id: 'act-dash', title: 'Go to Engineering Intelligence Dashboard', category: 'Navigation', icon: Activity, action: () => setCurrentView('dashboard') },
    { id: 'act-sentinel', title: 'Run Sentinel Autonomous Incident RCA', category: 'Navigation', icon: ShieldAlert, action: () => setCurrentView('sentinel') },
    { id: 'act-codemind', title: 'Open CodeMind Outage-Aware PR Review', category: 'Navigation', icon: GitPullRequest, action: () => setCurrentView('codemind') },
    { id: 'act-memory', title: 'Search Hindsight Memory Explorer', category: 'Navigation', icon: Database, action: () => setCurrentView('memory') },
    { id: 'act-graph', title: 'Explore Interactive Knowledge Graph', category: 'Navigation', icon: Network, action: () => setCurrentView('graph') },
    { id: 'act-theme', title: `Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`, category: 'Preferences', icon: theme === 'dark' ? Sun : Moon, action: () => { toggleTheme(); addToast(`Switched to ${theme === 'dark' ? 'Light' : 'Dark'} theme`, 'info'); } },
  ], [setCurrentView, toggleTheme, theme, addToast]);

  const filteredActions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return quickActions;
    return quickActions.filter(item =>
      item.title.toLowerCase().includes(q) || item.category.toLowerCase().includes(q)
    );
  }, [query, quickActions]);

  const filteredMemories = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return memories.slice(0, 2);
    return memories.filter(m =>
      m.id.toLowerCase().includes(q) ||
      m.text.toLowerCase().includes(q) ||
      m.scope.toLowerCase().includes(q) ||
      m.agent.toLowerCase().includes(q)
    ).slice(0, 4);
  }, [query, memories]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (filteredActions.length > 0) {
        filteredActions[0].action();
        onClose();
      } else if (filteredMemories.length > 0) {
        setCurrentView('memory');
        onClose();
      }
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/50 dark:bg-black/70 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -15 }}
            transition={{ type: "spring", duration: 0.3, bounce: 0.15 }}
            className="relative w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden z-10"
          >
            <div className="flex items-center px-4 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60">
              <Search className="w-5 h-5 text-indigo-500 mr-3 shrink-0" />
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search views, commands, or Hindsight memories (e.g. 'Hikari', 'MEM-0891')..."
                className="w-full bg-transparent text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-sm font-medium outline-none"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 mr-2"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <kbd className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded shadow-sm">
                ESC
              </kbd>
            </div>

            <div className="max-h-80 overflow-y-auto p-2 divide-y divide-slate-100 dark:divide-slate-800/60">
              <div className="py-1">
                <div className="text-[11px] font-bold text-slate-400 dark:text-slate-500 px-3 py-1.5 uppercase tracking-wider">
                  Quick Actions ({filteredActions.length})
                </div>
                {filteredActions.length === 0 ? (
                  <div className="px-3 py-3 text-xs text-slate-400 dark:text-slate-500">
                    No matching commands found.
                  </div>
                ) : (
                  filteredActions.map((item) => {
                    const ActionIcon = item.icon;
                    return (
                      <button
                        key={item.id}
                        onClick={() => { item.action(); onClose(); }}
                        className="w-full flex items-center justify-between px-3 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-xl font-semibold transition-colors group text-left"
                      >
                        <span className="flex items-center gap-3">
                          <ActionIcon className="w-4 h-4 text-slate-400 group-hover:text-indigo-500 shrink-0" />
                          <span>{item.title}</span>
                        </span>
                        <span className="text-[11px] font-medium text-slate-400 group-hover:text-indigo-400">
                          {item.category}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>

              <div className="py-1 pt-2">
                <div className="text-[11px] font-bold text-slate-400 dark:text-slate-500 px-3 py-1.5 uppercase tracking-wider">
                  Hindsight Memory Matches ({filteredMemories.length})
                </div>
                {filteredMemories.length === 0 ? (
                  <div className="px-3 py-3 text-xs text-slate-400 dark:text-slate-500">
                    No memory rules matching "{query}".
                  </div>
                ) : (
                  filteredMemories.map((mem) => (
                    <button
                      key={mem.id}
                      onClick={() => { setCurrentView('memory'); onClose(); }}
                      className="w-full flex flex-col gap-1 px-3 py-2.5 text-left hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-xl transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400">{mem.id} • {mem.scope}</span>
                        <span className="text-[11px] text-slate-400">Recalled {mem.recalled}x</span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-1">{mem.text}</p>
                    </button>
                  ))
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

interface TopNavProps {
  currentView: string;
  setCurrentView: (view: string) => void;
  openCommand: () => void;
  theme: string;
  toggleTheme: () => void;
  isBackendHealthy: boolean;
}

const TopNav: React.FC<TopNavProps> = ({
  currentView,
  setCurrentView,
  openCommand,
  theme,
  toggleTheme,
  isBackendHealthy
}) => {
  const [notifOpen, setNotifOpen] = useState(false);

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: Activity },
    { id: 'sentinel', label: 'Sentinel (RCA)', icon: ShieldAlert },
    { id: 'codemind', label: 'CodeMind (Review)', icon: GitPullRequest },
    { id: 'memory', label: 'Memory Explorer', icon: Database },
    { id: 'graph', label: 'Knowledge Graph', icon: Network },
  ];

  return (
    <nav className="sticky top-0 z-40 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl border-b border-slate-200/80 dark:border-slate-800/80 px-4 lg:px-6 py-3 transition-colors">
      <div className="max-w-[1440px] mx-auto flex items-center justify-between flex-nowrap gap-3">
        {/* Brand */}
        <div className="flex items-center gap-3 cursor-pointer group shrink-0" onClick={() => setCurrentView('dashboard')}>
          <div className="bg-gradient-to-br from-indigo-600 to-violet-600 p-2 rounded-xl shadow-md shadow-indigo-500/20 group-hover:scale-105 transition-transform">
            <BrainCircuit className="w-5 h-5 text-white" />
          </div>
          <div className="whitespace-nowrap">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-black text-slate-900 dark:text-white tracking-tight">NEXUS AI</h1>
              <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/20 px-2 py-0.5 rounded-full border border-indigo-200/60 dark:border-indigo-500/30">
                Hindsight v2
              </span>
            </div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 hidden xl:block">
              Cross-Agent Incident Learning System
            </p>
          </div>
        </div>

        {/* Center Navigation Pills - Strictly 1 Straight Line */}
        <div className="flex items-center justify-center flex-nowrap gap-1 bg-slate-100/80 dark:bg-slate-900/90 p-1 rounded-2xl border border-slate-200/70 dark:border-slate-800 shrink-0">
          {tabs.map(tab => {
            const isActive = currentView === tab.id;
            const TabIcon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setCurrentView(tab.id)}
                className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
                  isActive
                    ? 'text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="active-nav-pill"
                    className="absolute inset-0 bg-indigo-600 rounded-xl shadow-md shadow-indigo-500/25"
                    initial={false}
                    transition={{ type: "spring", stiffness: 450, damping: 34 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-1.5 whitespace-nowrap">
                  <TabIcon className="w-3.5 h-3.5 shrink-0" />
                  <span>{tab.label}</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Right Controls */}
        <div className="flex items-center flex-nowrap gap-2 shrink-0">
          <button
            onClick={openCommand}
            className="hidden 2xl:flex items-center gap-2 px-3 py-1.5 bg-slate-100/80 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl hover:border-indigo-300 dark:hover:border-slate-700 transition-all text-xs text-slate-500 dark:text-slate-400 font-semibold whitespace-nowrap"
          >
            <Search className="w-3.5 h-3.5 text-slate-400" />
            <span>Quick Search...</span>
            <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-[10px] font-bold text-slate-500 dark:text-slate-400">
              ⌘K
            </kbd>
          </button>

          <button
            onClick={toggleTheme}
            title="Toggle Light/Dark Mode"
            className="p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white bg-slate-100/80 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl transition-colors"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
          </button>

          <div className="relative">
            <button
              onClick={() => setNotifOpen(!notifOpen)}
              className="p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white bg-slate-100/80 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl transition-colors relative"
            >
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-emerald-500 rounded-full"></span>
            </button>
            <AnimatePresence>
              {notifOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.96 }}
                  className="absolute right-0 mt-2 w-80 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-4 z-50"
                >
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">System Activity</span>
                    <button onClick={() => setNotifOpen(false)} className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold">Close</button>
                  </div>
                  <div className="space-y-2.5 text-xs">
                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                      <div className="font-bold text-slate-800 dark:text-slate-200">Hindsight Bank Synced</div>
                      <div className="text-slate-500 dark:text-slate-400 mt-0.5">5 active cross-agent rules verified across 4 services.</div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20">
                      <div className="font-bold text-emerald-800 dark:text-emerald-300">All Agents Operational</div>
                      <div className="text-emerald-600 dark:text-emerald-400 mt-0.5">PostgreSQL & Vector Memory latency: 14ms.</div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="hidden lg:flex items-center gap-2 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-200/80 dark:border-emerald-500/20 whitespace-nowrap">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
              {isBackendHealthy ? 'All Systems Operational' : 'Offline Demonstration Mode'}
            </span>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default function App() {
  const [currentView, setCurrentView] = useState('dashboard');
  const [cmdOpen, setCmdOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [theme, setTheme] = useState(() => localStorage.getItem('nexus-theme') || 'light');
  const [isBackendHealthy, setIsBackendHealthy] = useState(true);
  const [memories, setMemories] = useState(sampleMemories);

  // Synchronize root document classes for theme
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.body.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('nexus-theme', theme);
  }, [theme]);

  // Check backend health and prefetch memories
  useEffect(() => {
    fetch('/api/health')
      .then(res => {
        if (!res.ok) throw new Error('Health check error');
        return res.json();
      })
      .then(data => {
        setIsBackendHealthy(data.status === 'ok');
      })
      .catch(() => {
        setIsBackendHealthy(false);
      });

    fetch('/api/memories')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (Array.isArray(data?.memories) && data.memories.length > 0) {
          setMemories(data.memories.map((m: any) => ({
            id: m.id,
            scope: m.service || 'payments',
            agent: m.agent === 'sentinel' ? 'Sentinel' : m.agent === 'codemind' ? 'CodeMind' : 'Hindsight',
            type: m.derived ? 'PR Guardrail Rule' : 'Root Cause Pattern',
            text: m.text,
            recalled: m.recalled_count || 12,
            created: 'Recently'
          })));
        }
      })
      .catch(() => {});
  }, []);

  const toggleTheme = () => setTheme(prev => (prev === 'light' ? 'dark' : 'light'));

  const addToast = (message: string, type: 'success' | 'warning' | 'info' = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen(open => !open);
      }
      if (e.key === 'Escape') {
        setCmdOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className={theme === 'dark' ? 'dark' : ''}>
      <div className="min-h-screen font-sans bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 selection:bg-indigo-500/20 selection:text-indigo-600 dark:selection:text-indigo-300 flex flex-col relative overflow-x-hidden transition-colors duration-300">
        {/* Ambient Subtle Background Glows */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
          <div className="absolute -top-40 left-1/4 w-[550px] h-[550px] bg-indigo-500/[0.06] dark:bg-indigo-500/[0.08] rounded-full blur-[130px]" />
          <div className="absolute top-1/3 -right-20 w-[450px] h-[450px] bg-purple-500/[0.05] dark:bg-purple-500/[0.07] rounded-full blur-[120px]" />
        </div>

        <TopNav
          currentView={currentView}
          setCurrentView={setCurrentView}
          openCommand={() => setCmdOpen(true)}
          theme={theme}
          toggleTheme={toggleTheme}
          isBackendHealthy={isBackendHealthy}
        />

        <CommandPalette
          isOpen={cmdOpen}
          onClose={() => setCmdOpen(false)}
          setCurrentView={setCurrentView}
          addToast={addToast}
          toggleTheme={toggleTheme}
          theme={theme}
          memories={memories}
        />

        {/* Floating Toasts */}
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end pointer-events-none">
          <AnimatePresence>
            {toasts.map(t => (
              <Toast
                key={t.id}
                message={t.message}
                type={t.type}
                onClose={() => setToasts(prev => prev.filter(toast => toast.id !== t.id))}
              />
            ))}
          </AnimatePresence>
        </div>

        {/* Main Content Area */}
        <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-8 py-8 relative z-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentView}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="w-full"
            >
              {currentView === 'dashboard' && (
                <DashboardView
                  theme={theme}
                  setCurrentView={setCurrentView}
                  addToast={addToast}
                />
              )}
              {currentView === 'sentinel' && <SentinelView addToast={addToast} />}
              {currentView === 'codemind' && <CodeMindView addToast={addToast} />}
              {currentView === 'memory' && <MemoryExplorerView addToast={addToast} />}
              {currentView === 'graph' && <KnowledgeGraphView />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
