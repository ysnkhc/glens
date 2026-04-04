"use client";

import React, { useState, useEffect } from "react";

interface AIAnalysis {
  prompt_quality?: string;
  determinism_risk?: string;
  consensus_risk?: string;
  reasoning?: string;
  fix_suggestions?: string[];
  error?: string;
}

interface AIAnalysisPanelProps {
  analysis: AIAnalysis;
  isOnChain?: boolean;
  delay?: number;
}

const riskColor: Record<string, string> = {
  LOW: "text-emerald-400",
  MEDIUM: "text-amber-400",
  HIGH: "text-red-400",
  CRITICAL: "text-red-500",
  INVALID: "text-red-500",
  "N/A": "text-slate-500",
  UNKNOWN: "text-slate-500",
};

const riskDot: Record<string, string> = {
  LOW: "🟢",
  MEDIUM: "🟡",
  HIGH: "🔴",
  CRITICAL: "🔴",
  INVALID: "🚨",
  "N/A": "⚪",
  UNKNOWN: "⚪",
};

const barGradient: Record<string, string> = {
  LOW: "from-emerald-500 to-emerald-400",
  MEDIUM: "from-amber-500 to-amber-400",
  HIGH: "from-red-500 to-red-400",
  CRITICAL: "from-red-600 to-red-500",
  INVALID: "from-red-600 to-red-500",
  "N/A": "from-slate-600 to-slate-500",
  UNKNOWN: "from-slate-600 to-slate-500",
};

const barWidthPercent: Record<string, number> = {
  LOW: 25,
  MEDIUM: 55,
  HIGH: 85,
  CRITICAL: 95,
  INVALID: 95,
  "N/A": 5,
  UNKNOWN: 5,
};

function AnimatedRiskBar({
  label,
  level,
  animDelay = 0,
}: {
  label: string;
  level: string;
  animDelay?: number;
}) {
  const normalizedLevel = level?.toUpperCase() || "UNKNOWN";
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), animDelay);
    return () => clearTimeout(timer);
  }, [animDelay]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400 font-semibold">{label}</span>
        <span className={`font-bold ${riskColor[normalizedLevel] || riskColor.UNKNOWN}`}>
          {riskDot[normalizedLevel] || "⚪"} {normalizedLevel}
        </span>
      </div>
      <div className="progress-track">
        <div
          className={`progress-fill bg-gradient-to-r ${barGradient[normalizedLevel] || barGradient.UNKNOWN}`}
          style={{
            width: mounted ? `${barWidthPercent[normalizedLevel] || 5}%` : "0%",
            transition: `width 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${animDelay}ms`,
          }}
        />
      </div>
    </div>
  );
}

export default function AIAnalysisPanel({ analysis, isOnChain = false, delay = 0 }: AIAnalysisPanelProps) {
  // Header content based on source
  const headerIcon = isOnChain ? "🤖" : "📊";
  const headerTitle = isOnChain ? "AI Analysis" : "Static Analysis";
  const headerColor = isOnChain ? "text-purple-400" : "text-slate-400";
  const panelBg = isOnChain
    ? "bg-purple-500/5 border-purple-500/15"
    : "bg-slate-500/5 border-slate-500/15";
  const panelAccent = isOnChain ? "border-purple-500/10" : "border-slate-500/10";
  const suggestionsTitle = isOnChain ? "AI Suggestions" : "Suggestions";

  // Handle error or plain text fallback
  if (analysis.error) {
    return (
      <div
        className={`glass-card-sm ${panelBg} border p-5 animate-fade-in-up`}
        style={{ animationDelay: `${delay}ms` }}
      >
        <div className={`section-header ${headerColor}`}>
          <span>{headerIcon}</span>
          <span>{headerTitle}</span>
        </div>
        <p className="text-sm text-slate-400">{analysis.error}</p>
        {analysis.reasoning && (
          <p className="text-sm text-slate-400 mt-2">{analysis.reasoning}</p>
        )}
      </div>
    );
  }

  const hasStructured =
    analysis.prompt_quality && analysis.prompt_quality !== "UNKNOWN";

  return (
    <div
      className={`glass-card-sm ${panelBg} border p-5 animate-fade-in-up space-y-5`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Header */}
      <div className={`flex items-center gap-2.5 ${headerColor}`}>
        <div className={`w-7 h-7 rounded-lg ${isOnChain ? "bg-purple-500/15 border-purple-500/20" : "bg-slate-500/15 border-slate-500/20"} border flex items-center justify-center text-sm`}>
          {headerIcon}
        </div>
        <h3 className="font-bold text-sm">{headerTitle}</h3>
        {isOnChain && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 ml-auto">
            CONSENSUS VERIFIED
          </span>
        )}
      </div>

      {/* Source warning for heuristic analysis */}
      {!isOnChain && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/5 border border-amber-500/15">
          <span className="text-[10px]">🟡</span>
          <span className="text-[10px] text-amber-400 font-medium">
            Pattern-matching analysis — not validated by AI or consensus
          </span>
        </div>
      )}

      {/* Risk Bars — Animated */}
      <div className="space-y-4">
        {hasStructured ? (
          <>
            <AnimatedRiskBar label="Prompt Quality" level={analysis.prompt_quality || "UNKNOWN"} animDelay={100} />
            <AnimatedRiskBar label="Determinism Risk" level={analysis.determinism_risk || "UNKNOWN"} animDelay={250} />
            <AnimatedRiskBar label="Consensus Risk" level={analysis.consensus_risk || "UNKNOWN"} animDelay={400} />
          </>
        ) : (
          <>
            <AnimatedRiskBar label="Prompt Quality" level="UNKNOWN" animDelay={100} />
            <AnimatedRiskBar label="Determinism Risk" level="UNKNOWN" animDelay={250} />
            <AnimatedRiskBar label="Consensus Risk" level="UNKNOWN" animDelay={400} />
          </>
        )}
      </div>

      {/* Reasoning */}
      {analysis.reasoning && (
        <div className={`pt-3 border-t ${panelAccent}`}>
          <p className="text-sm text-slate-300 leading-relaxed">
            {analysis.reasoning}
          </p>
        </div>
      )}

      {/* Fix Suggestions */}
      {analysis.fix_suggestions && analysis.fix_suggestions.length > 0 && (
        <div className={`pt-3 border-t ${panelAccent}`}>
          <h4 className={`text-xs font-bold ${isOnChain ? "text-purple-300" : "text-slate-400"} mb-2.5 uppercase tracking-wider`}>
            {suggestionsTitle}
          </h4>
          <ul className="space-y-2">
            {analysis.fix_suggestions.map((s, i) => (
              <li
                key={i}
                className="flex items-start gap-2.5 text-xs text-slate-400 leading-relaxed animate-fade-in-up"
                style={{ animationDelay: `${delay + 500 + i * 80}ms` }}
              >
                <span className={`${isOnChain ? "text-purple-400" : "text-slate-500"} mt-0.5 font-bold`}>→</span>
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
