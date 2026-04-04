"use client";

import React from "react";

export type ExecutionSource =
  | "ONCHAIN_CONFIRMED"
  | "ONCHAIN_CONSENSUS_FAILURE"
  | "CLIENT_FALLBACK"
  | "CLIENT_DETERMINISTIC";

export interface ExecutionMeta {
  source: ExecutionSource;
  isReal: boolean;
  txHash?: string;
  trustScore: number;
  label: string;
}

const sourceConfig: Record<ExecutionSource, { bg: string; text: string; border: string; glow: string }> = {
  ONCHAIN_CONFIRMED: {
    bg: "bg-emerald-500/8",
    text: "text-emerald-400",
    border: "border-emerald-500/20",
    glow: "shadow-emerald-500/10",
  },
  ONCHAIN_CONSENSUS_FAILURE: {
    bg: "bg-red-500/8",
    text: "text-red-400",
    border: "border-red-500/20",
    glow: "shadow-red-500/10",
  },
  CLIENT_FALLBACK: {
    bg: "bg-amber-500/8",
    text: "text-amber-400",
    border: "border-amber-500/20",
    glow: "shadow-amber-500/10",
  },
  CLIENT_DETERMINISTIC: {
    bg: "bg-blue-500/8",
    text: "text-blue-400",
    border: "border-blue-500/20",
    glow: "shadow-blue-500/10",
  },
};

function getTrustColor(score: number): string {
  if (score >= 80) return "text-emerald-400";
  if (score >= 50) return "text-blue-400";
  if (score >= 30) return "text-amber-400";
  return "text-red-400";
}

function getTrustBarColor(score: number): string {
  if (score >= 80) return "bg-gradient-to-r from-emerald-500 to-emerald-400";
  if (score >= 50) return "bg-gradient-to-r from-blue-500 to-blue-400";
  if (score >= 30) return "bg-gradient-to-r from-amber-500 to-amber-400";
  return "bg-gradient-to-r from-red-500 to-red-400";
}

/** Compact trust badge showing execution source and trust score */
export function TrustBadge({ execution }: { execution?: ExecutionMeta }) {
  if (!execution) return null;

  const config = sourceConfig[execution.source] || sourceConfig.CLIENT_FALLBACK;

  return (
    <div
      className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border shadow-lg ${config.bg} ${config.border} ${config.glow} animate-fade-in-up`}
    >
      {/* Trust Score Circle */}
      <div className="relative w-8 h-8 shrink-0">
        <svg className="w-8 h-8 -rotate-90" viewBox="0 0 32 32">
          <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-800" />
          <circle
            cx="16" cy="16" r="13" fill="none"
            strokeWidth="2.5"
            strokeLinecap="round"
            className={getTrustColor(execution.trustScore)}
            stroke="currentColor"
            strokeDasharray={`${(execution.trustScore / 100) * 81.7} 81.7`}
          />
        </svg>
        <span className={`absolute inset-0 flex items-center justify-center text-[8px] font-bold ${getTrustColor(execution.trustScore)}`}>
          {execution.trustScore}
        </span>
      </div>

      {/* Label */}
      <div className="flex-1 min-w-0">
        <div className={`text-[11px] font-bold ${config.text} truncate`}>
          {execution.label}
        </div>
        {execution.txHash && (
          <div className="text-[9px] text-slate-600 font-mono truncate">
            TX: {execution.txHash.slice(0, 10)}...{execution.txHash.slice(-6)}
          </div>
        )}
      </div>
    </div>
  );
}

/** Full-width trust bar for section headers */
export function TrustBar({ execution, label }: { execution?: ExecutionMeta; label?: string }) {
  if (!execution) return null;

  return (
    <div className="flex items-center gap-3 text-[10px] animate-fade-in-up">
      <span className={`font-bold ${getTrustColor(execution.trustScore)}`}>
        Trust: {execution.trustScore}%
      </span>
      <div className="flex-1 h-1 rounded-full bg-slate-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${getTrustBarColor(execution.trustScore)}`}
          style={{ width: `${execution.trustScore}%` }}
        />
      </div>
      <span className={`${sourceConfig[execution.source]?.text || "text-slate-500"} font-semibold`}>
        {label || execution.source.replace(/_/g, " ")}
      </span>
    </div>
  );
}

/** Warning banner for non-real results */
export function FallbackWarning({ execution }: { execution?: ExecutionMeta }) {
  if (!execution || execution.isReal) return null;

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-lg border text-[11px] font-medium animate-fade-in-up bg-amber-500/5 border-amber-500/15 text-amber-400"
    >
      <span className="text-sm">🟡</span>
      <span>
        Result generated locally — not validated by GenLayer consensus
      </span>
    </div>
  );
}
