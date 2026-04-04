"use client";

import React from "react";
import type { ConsensusPrediction, PredictionFactor, ConfidenceBand } from "@/lib/consensus-predictor";

const riskColors: Record<string, { text: string; bg: string; border: string; glow: string }> = {
  LOW: {
    text: "text-emerald-400",
    bg: "bg-emerald-500/8",
    border: "border-emerald-500/20",
    glow: "shadow-emerald-500/10",
  },
  MEDIUM: {
    text: "text-amber-400",
    bg: "bg-amber-500/8",
    border: "border-amber-500/20",
    glow: "shadow-amber-500/10",
  },
  HIGH: {
    text: "text-red-400",
    bg: "bg-red-500/8",
    border: "border-red-500/20",
    glow: "shadow-red-500/10",
  },
};

const riskEmoji: Record<string, string> = {
  LOW: "🟢",
  MEDIUM: "🟡",
  HIGH: "🔴",
};

const bandConfig: Record<ConfidenceBand, { label: string; emoji: string; color: string; description: string }> = {
  LIKELY_STABLE: {
    label: "LIKELY STABLE",
    emoji: "✅",
    color: "text-emerald-400",
    description: "Contract structure suggests consensus should succeed",
  },
  UNCERTAIN: {
    label: "UNCERTAIN",
    emoji: "⚠️",
    color: "text-amber-400",
    description: "Some risk factors present — consensus outcome is unclear",
  },
  LOW_CONFIDENCE: {
    label: "LOW CONFIDENCE",
    emoji: "🚨",
    color: "text-red-400",
    description: "Multiple issues detected — consensus will likely fail",
  },
};

const factorStatusIcon: Record<string, string> = {
  pass: "✅",
  warn: "⚠️",
  fail: "❌",
};

function FactorRow({ factor }: { factor: PredictionFactor }) {
  const bg =
    factor.status === "pass"
      ? "bg-emerald-500/5 border-emerald-500/10"
      : factor.status === "warn"
      ? "bg-amber-500/5 border-amber-500/10"
      : "bg-red-500/5 border-red-500/10";

  return (
    <div className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border ${bg} transition-all hover:brightness-110`}>
      <span className="text-sm shrink-0">{factorStatusIcon[factor.status]}</span>
      <div className="flex-1 min-w-0">
        <span className="text-[11px] text-slate-300 font-medium">{factor.name.replace(/_/g, " ")}</span>
        <span className="text-[10px] text-slate-500 ml-1.5">{factor.detail}</span>
      </div>
      {factor.impact !== 0 && (
        <span className={`text-[10px] font-bold shrink-0 ${factor.impact > 0 ? "text-emerald-400" : "text-red-400"}`}>
          {factor.impact > 0 ? "+" : ""}{Math.round(factor.impact * 100)}%
        </span>
      )}
    </div>
  );
}

interface ConsensusPredictionPanelProps {
  prediction: ConsensusPrediction | null;
}

export default function ConsensusPredictionPanel({ prediction }: ConsensusPredictionPanelProps) {
  if (!prediction) return null;

  const colors = riskColors[prediction.risk] || riskColors.MEDIUM;
  const band = bandConfig[prediction.band];

  return (
    <div className={`rounded-xl border shadow-lg p-4 space-y-3 animate-scale-in ${colors.bg} ${colors.border} ${colors.glow}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">🧠</span>
          <h4 className="text-sm font-bold text-slate-200">Consensus Prediction</h4>
        </div>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${colors.bg} ${colors.border} border ${colors.text}`}>
          {riskEmoji[prediction.risk]} {prediction.risk} RISK
        </span>
      </div>

      {/* Band Verdict — replaces fake percentage circle */}
      <div className="flex items-center gap-4">
        {/* Band Icon */}
        <div className={`w-16 h-16 shrink-0 rounded-2xl flex items-center justify-center text-2xl ${colors.bg} border ${colors.border}`}>
          {band.emoji}
        </div>

        {/* Verdict Text */}
        <div className="flex-1">
          <div className={`text-base font-extrabold ${band.color}`}>
            {band.label}
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
            {band.description}
          </p>
        </div>
      </div>

      {/* Static Analysis Disclaimer */}
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700/30">
        <span className="text-[10px]">💡</span>
        <span className="text-[10px] text-slate-500 italic">
          Based on static code analysis — not validated by GenLayer consensus
        </span>
      </div>

      {/* Issues */}
      {prediction.issues.length > 0 && (
        <div className="space-y-1.5">
          <h5 className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Issues Found</h5>
          {prediction.issues.map((issue, i) => (
            <div key={i} className="flex items-start gap-2 text-[11px] text-red-300/80">
              <span className="text-red-500/60 mt-0.5 shrink-0">•</span>
              <span>{issue}</span>
            </div>
          ))}
        </div>
      )}

      {/* Suggestions */}
      {prediction.suggestions.length > 0 && (
        <div className="space-y-1.5">
          <h5 className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Suggestions</h5>
          {prediction.suggestions.map((sug, i) => (
            <div key={i} className="flex items-start gap-2 text-[11px] text-blue-300/80">
              <span className="text-blue-500/60 mt-0.5 shrink-0">→</span>
              <span>{sug}</span>
            </div>
          ))}
        </div>
      )}

      {/* Factor Breakdown */}
      {prediction.factors.length > 0 && (
        <details className="group">
          <summary className="text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-400 transition-colors select-none">
            Factor Breakdown ({prediction.factors.filter(f => f.status === "pass").length}/{prediction.factors.length} passing)
          </summary>
          <div className="space-y-1 mt-2">
            {prediction.factors.map((f, i) => (
              <FactorRow key={i} factor={f} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
