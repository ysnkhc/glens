"use client";

import React from "react";

interface ConsensusStatusBarProps {
  status: string;
  elapsed: number;
  onCancel: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  WAITING:       "Submitting transaction…",
  PENDING:       "Waiting for validators to start…",
  PROPOSING:     "Lead validator running AI…",
  COMMITTING:    "Validators posting votes…",
  REVEALING:     "Counting validator votes…",
  FINALIZED:     "Consensus reached!",
  ACCEPTED:      "Consensus accepted!",
  UNDETERMINED:  "Validators could not agree",
  LEADER_TIMEOUT:"Lead validator timed out",
  CANCELED:      "Transaction cancelled",
};

const TERMINAL = ["FINALIZED", "ACCEPTED", "UNDETERMINED", "LEADER_TIMEOUT", "CANCELED"];

export default function ConsensusStatusBar({ status, elapsed, onCancel }: ConsensusStatusBarProps) {
  const seconds = Math.floor(elapsed / 1000);
  const label = STATUS_LABEL[status] ?? "Processing…";
  const isTerminal = TERMINAL.includes(status);
  const isSuccess = status === "FINALIZED" || status === "ACCEPTED";
  const isFailed = status === "UNDETERMINED" || status === "LEADER_TIMEOUT";

  return (
    <div className="rounded-xl border border-slate-700/40 bg-slate-800/30 px-4 py-3 flex items-center gap-4 animate-fade-in-up">
      {/* Animated indicator */}
      <div className="shrink-0">
        {isSuccess ? (
          <div className="w-8 h-8 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-sm">✅</div>
        ) : isFailed ? (
          <div className="w-8 h-8 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center text-sm">🚨</div>
        ) : (
          <div className="relative w-8 h-8">
            <div className="absolute inset-0 rounded-full border-2 border-slate-700" />
            <div className="absolute inset-0 rounded-full border-2 border-t-violet-500 border-r-transparent border-b-transparent border-l-transparent animate-spin" />
          </div>
        )}
      </div>

      {/* Label + timer */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-200 truncate">{label}</p>
        <p className="text-[11px] text-slate-500 mt-0.5">
          {seconds}s elapsed
          {!isTerminal && seconds > 10 && (
            <span className="ml-1.5 text-slate-600">· Studio validators usually finish in ~35s</span>
          )}
        </p>
      </div>

      {/* Cancel */}
      {!isTerminal && (
        <button
          onClick={onCancel}
          className="shrink-0 px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-red-400 bg-slate-800/60 hover:bg-red-500/10 border border-slate-700/50 hover:border-red-500/30 rounded-lg transition-all duration-200"
        >
          ✕ Cancel
        </button>
      )}
    </div>
  );
}
