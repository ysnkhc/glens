"use client";

import React from "react";

interface ConsensusStatusBarProps {
  status: string;
  elapsed: number;
  onCancel: () => void;
}

const STATUS_CONFIG: Record<string, { icon: string; label: string; color: string; bg: string }> = {
  WAITING: {
    icon: "⏳",
    label: "Waiting for transaction...",
    color: "text-slate-400",
    bg: "bg-slate-500/10 border-slate-500/20",
  },
  PENDING: {
    icon: "🔄",
    label: "Queued — waiting for validators to pick up",
    color: "text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/20",
  },
  PROPOSING: {
    icon: "📝",
    label: "Leader validator is proposing output",
    color: "text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/20",
  },
  COMMITTING: {
    icon: "🔐",
    label: "Validators are committing their votes",
    color: "text-indigo-400",
    bg: "bg-indigo-500/10 border-indigo-500/20",
  },
  REVEALING: {
    icon: "🔓",
    label: "Validators are revealing their votes",
    color: "text-purple-400",
    bg: "bg-purple-500/10 border-purple-500/20",
  },
  FINALIZED: {
    icon: "✅",
    label: "Consensus reached — finalized!",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/20",
  },
  ACCEPTED: {
    icon: "✅",
    label: "Consensus accepted!",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/20",
  },
  UNDETERMINED: {
    icon: "❓",
    label: "Validators could not reach agreement",
    color: "text-orange-400",
    bg: "bg-orange-500/10 border-orange-500/20",
  },
  LEADER_TIMEOUT: {
    icon: "⏱️",
    label: "Leader validator timed out",
    color: "text-red-400",
    bg: "bg-red-500/10 border-red-500/20",
  },
  CANCELED: {
    icon: "🚫",
    label: "Transaction was canceled",
    color: "text-slate-400",
    bg: "bg-slate-500/10 border-slate-500/20",
  },
};

const DEFAULT_STATUS = {
  icon: "⏳",
  label: "Processing...",
  color: "text-slate-400",
  bg: "bg-slate-500/10 border-slate-500/20",
};

// Progress steps for the visual pipeline
const STEPS = ["PENDING", "PROPOSING", "COMMITTING", "REVEALING", "FINALIZED"];

function getStepIndex(status: string): number {
  const idx = STEPS.indexOf(status);
  return idx >= 0 ? idx : 0;
}

export default function ConsensusStatusBar({ status, elapsed, onCancel }: ConsensusStatusBarProps) {
  const cfg = STATUS_CONFIG[status] || DEFAULT_STATUS;
  const seconds = Math.floor(elapsed / 1000);
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const timeStr = minutes > 0 ? `${minutes}m ${secs}s` : `${seconds}s`;
  const stepIdx = getStepIndex(status);
  const isTerminal = ["FINALIZED", "ACCEPTED", "UNDETERMINED", "LEADER_TIMEOUT", "CANCELED"].includes(status);

  return (
    <div className={`rounded-xl border ${cfg.bg} p-4 space-y-3 animate-fade-in-up`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="text-lg">{cfg.icon}</span>
          <div>
            <p className={`text-sm font-semibold ${cfg.color}`}>{cfg.label}</p>
            <p className="text-[11px] text-slate-500">Elapsed: {timeStr}</p>
          </div>
        </div>
        {!isTerminal && (
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-red-400 
                       bg-slate-800/50 hover:bg-red-500/10 border border-slate-700/50 hover:border-red-500/30 
                       rounded-lg transition-all duration-200"
          >
            ✕ Cancel
          </button>
        )}
      </div>

      {/* Progress Pipeline */}
      <div className="flex items-center gap-1">
        {STEPS.map((step, i) => {
          const isActive = i === stepIdx && !isTerminal;
          const isDone = i < stepIdx || isTerminal;
          return (
            <div key={step} className="flex-1 flex flex-col items-center gap-1">
              <div
                className={`h-1.5 w-full rounded-full transition-all duration-500 ${
                  isDone
                    ? "bg-emerald-500/60"
                    : isActive
                    ? "bg-blue-500/60 animate-pulse"
                    : "bg-slate-700/40"
                }`}
              />
              <span
                className={`text-[9px] font-medium uppercase tracking-wider ${
                  isDone
                    ? "text-emerald-500/70"
                    : isActive
                    ? "text-blue-400"
                    : "text-slate-600"
                }`}
              >
                {step === "FINALIZED" ? "DONE" : step}
              </span>
            </div>
          );
        })}
      </div>

      {/* Long wait hint */}
      {seconds > 120 && !isTerminal && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/15">
          <span className="text-xs mt-0.5">💡</span>
          <p className="text-[10px] text-amber-400/80 leading-relaxed">
            GenLayer consensus typically takes 60–180s. Validators are processing your request.
            You can continue waiting or cancel and try again later.
          </p>
        </div>
      )}
    </div>
  );
}
