"use client";

import React, { useState, useEffect, useCallback } from "react";
import type { DebugLogEntry } from "@/lib/genlayer-debug";
import { subscribeDebugLogs, clearDebugLogs, getDebugLogs, GL_DEBUG } from "@/lib/genlayer-debug";

/* ─── Category Styles ─── */

const categoryStyles: Record<string, { bg: string; text: string; icon: string }> = {
  TX_START:       { bg: "bg-blue-500/10 border-blue-500/20",    text: "text-blue-400",    icon: "🚀" },
  TX_SENT:        { bg: "bg-purple-500/10 border-purple-500/20", text: "text-purple-400",  icon: "⛓️" },
  TX_FINALIZED:   { bg: "bg-emerald-500/10 border-emerald-500/20", text: "text-emerald-400", icon: "✅" },
  TX_READ:        { bg: "bg-cyan-500/10 border-cyan-500/20",    text: "text-cyan-400",    icon: "📖" },
  TX_ERROR:       { bg: "bg-red-500/10 border-red-500/20",      text: "text-red-400",     icon: "❌" },
  CONSENSUS_FAIL: { bg: "bg-red-500/10 border-red-500/20",      text: "text-red-300",     icon: "🔴" },
  FALLBACK:       { bg: "bg-amber-500/10 border-amber-500/20",  text: "text-amber-400",   icon: "⚠️" },
  CLIENT:         { bg: "bg-slate-500/10 border-slate-500/20",  text: "text-slate-400",   icon: "💻" },
  RESULT:         { bg: "bg-emerald-500/8 border-emerald-500/15", text: "text-emerald-300", icon: "📊" },
  INFO:           { bg: "bg-slate-500/8 border-slate-500/15",   text: "text-slate-500",   icon: "ℹ️" },
};

/* ─── Category Filter ─── */

const CATEGORY_LABELS: Record<string, string> = {
  TX_START: "TX Start",
  TX_SENT: "TX Sent",
  TX_FINALIZED: "Finalized",
  TX_READ: "Read",
  TX_ERROR: "Error",
  CONSENSUS_FAIL: "Consensus",
  FALLBACK: "Fallback",
  CLIENT: "Client",
  RESULT: "Result",
  INFO: "Info",
};

/* ─── Serializer for display ─── */

function safeStringify(data: unknown): string {
  try {
    return JSON.stringify(data, (_k, v) =>
      typeof v === "bigint" ? v.toString() + "n" : v
    , 2);
  } catch {
    return String(data);
  }
}

/* ─── Component ─── */

interface DebugPanelProps {
  className?: string;
}

export default function DebugPanel({ className = "" }: DebugPanelProps) {
  const [logs, setLogs] = useState<DebugLogEntry[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedEntries, setExpandedEntries] = useState<Set<number>>(new Set());
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [autoScroll, setAutoScroll] = useState(true);

  // Don't render if debug is off
  if (!GL_DEBUG) return null;

  // Subscribe to log updates
  useEffect(() => {
    setLogs(getDebugLogs());
    const unsubscribe = subscribeDebugLogs((newLogs) => {
      setLogs(newLogs);
    });
    return unsubscribe;
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && isExpanded) {
      const el = document.getElementById("debug-panel-log-container");
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [logs, autoScroll, isExpanded]);

  const toggleEntry = useCallback((id: number) => {
    setExpandedEntries((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleFilter = useCallback((cat: string) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  const filteredLogs = activeFilters.size === 0
    ? logs
    : logs.filter((l) => activeFilters.has(l.category));

  const txCount = logs.filter((l) => l.category === "TX_START").length;
  const errorCount = logs.filter((l) => l.category === "TX_ERROR" || l.category === "CONSENSUS_FAIL").length;
  const latestStep = logs.length > 0 ? logs[logs.length - 1].step : "Idle";

  return (
    <div className={`${className}`}>
      {/* ─── Collapsed Bar ─── */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full glass-card flex items-center justify-between px-4 py-2.5 hover:border-indigo-500/30 transition-all group cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm">🧠</span>
          <span className="text-xs font-bold text-slate-300 group-hover:text-slate-200 transition-colors">
            GenLayer Flow Inspector
          </span>
          {/* Live status pills */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] bg-blue-500/10 border border-blue-500/15 text-blue-400 px-1.5 py-0.5 rounded-md font-mono">
              {txCount} TX
            </span>
            {errorCount > 0 && (
              <span className="text-[10px] bg-red-500/10 border border-red-500/15 text-red-400 px-1.5 py-0.5 rounded-md font-mono animate-pulse">
                {errorCount} ERR
              </span>
            )}
            <span className="text-[10px] text-slate-600 font-mono truncate max-w-[200px]">
              {latestStep}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-600">{logs.length} logs</span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={`text-slate-500 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {/* ─── Expanded Panel ─── */}
      {isExpanded && (
        <div className="glass-card mt-1 overflow-hidden animate-fade-in-up border-indigo-500/15">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700/30">
            {/* Category filters */}
            <div className="flex items-center gap-1 flex-wrap">
              {Object.entries(CATEGORY_LABELS).map(([cat, label]) => {
                const style = categoryStyles[cat] || categoryStyles.INFO;
                const isActive = activeFilters.size === 0 || activeFilters.has(cat);
                return (
                  <button
                    key={cat}
                    onClick={() => toggleFilter(cat)}
                    className={`text-[9px] px-1.5 py-0.5 rounded border transition-all ${
                      isActive
                        ? `${style.bg} ${style.text} border-current/20`
                        : "bg-slate-800/30 text-slate-600 border-slate-700/20 opacity-50"
                    }`}
                  >
                    {style.icon} {label}
                  </button>
                );
              })}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 shrink-0 ml-2">
              <button
                onClick={() => setAutoScroll(!autoScroll)}
                className={`text-[9px] px-1.5 py-0.5 rounded border transition-all ${
                  autoScroll
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    : "bg-slate-800/30 text-slate-500 border-slate-700/20"
                }`}
                title={autoScroll ? "Auto-scroll ON" : "Auto-scroll OFF"}
              >
                ↓ Auto
              </button>
              <button
                onClick={() => clearDebugLogs()}
                className="text-[9px] text-red-400/60 hover:text-red-400 px-1.5 py-0.5 rounded border border-red-500/10 hover:border-red-500/20 transition-all"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Log entries */}
          <div
            id="debug-panel-log-container"
            className="max-h-[350px] overflow-y-auto p-2 space-y-1 scrollbar-thin"
          >
            {filteredLogs.length === 0 ? (
              <div className="text-center py-8 text-slate-600 text-xs">
                No debug logs yet. Perform an action to start tracing.
              </div>
            ) : (
              filteredLogs.map((entry) => {
                const style = categoryStyles[entry.category] || categoryStyles.INFO;
                const isOpen = expandedEntries.has(entry.id);
                const timeStr = entry.timestamp.split("T")[1]?.split(".")[0] || "";

                return (
                  <div key={entry.id} className={`rounded-lg border ${style.bg} transition-all`}>
                    <button
                      onClick={() => toggleEntry(entry.id)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-white/[0.02] transition-colors cursor-pointer"
                    >
                      <span className="text-xs shrink-0">{style.icon}</span>
                      <span className={`text-[10px] font-bold ${style.text} truncate flex-1`}>
                        {entry.step}
                      </span>
                      <span className="text-[9px] text-slate-600 font-mono shrink-0">
                        {timeStr}
                      </span>
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className={`text-slate-600 transition-transform duration-150 shrink-0 ${
                          isOpen ? "rotate-180" : ""
                        }`}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>

                    {isOpen && (
                      <div className="px-3 pb-2 animate-fade-in-up">
                        <pre className="text-[10px] text-slate-400 font-mono whitespace-pre-wrap break-all bg-black/20 rounded-md p-2 max-h-[200px] overflow-auto">
                          {safeStringify(entry.data)}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer stats */}
          <div className="flex items-center justify-between px-4 py-1.5 border-t border-slate-700/30 text-[9px] text-slate-600">
            <span>
              {filteredLogs.length} / {logs.length} entries shown
            </span>
            <div className="flex items-center gap-3">
              <span>
                🚀 {logs.filter((l) => l.category === "TX_START").length} started
              </span>
              <span>
                ✅ {logs.filter((l) => l.category === "TX_FINALIZED").length} finalized
              </span>
              <span>
                ❌ {errorCount} errors
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
