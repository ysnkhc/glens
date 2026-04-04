"use client";

import React, { useState } from "react";
import SimulationPanel from "./SimulationPanel";
import ConsensusStatusBar from "./ConsensusStatusBar";
import CopyButton from "./CopyButton";
import type { ExecutionMeta } from "./TrustBadge";
import type { ConsensusPrediction } from "@/lib/consensus-predictor";

// ─── Types ───────────────────────────────────────────────────────

interface AIAnalysis {
  prompt_quality?: string;
  determinism_risk?: string;
  consensus_risk?: string;
  reasoning?: string;
  fix_suggestions?: string[];
  error?: string;
  [key: string]: unknown;
}

interface SimulationResult {
  validators: { id: string; name: string; style: string; output: string; temperature: number }[];
  consensus: string;
  confidence: number;
  agreement_rate: number;
  risk: string;
  prompts_found: number;
  simulated_prompt?: string;
  explanation?: string[];
  mock?: boolean;
  message?: string;
  ai_calls?: number;
}

interface AnalysisResult {
  risk_level: "LOW" | "MEDIUM" | "HIGH";
  issues: string[];
  warnings: string[];
  suggestions: string[];
  ai_analysis: AIAnalysis;
  analysisSource?: "ai_onchain" | "heuristic_client";
  execution?: ExecutionMeta;
}

interface FixResult {
  fixed_code: string;
  changes_made: string[];
  aiSuggestions?: string[];
}

interface ResultsPanelProps {
  result: AnalysisResult | null;
  isLoading: boolean;
  error: string | null;
  onExplain?: () => void;
  explanation?: string | null;
  isExplaining?: boolean;
  onSimulate?: () => void;
  simulationResult?: SimulationResult | null;
  isSimulating?: boolean;
  onFix?: () => void;
  isFixing?: boolean;
  code?: string;
  prediction?: ConsensusPrediction | null;
  fixResult?: FixResult | null;
  consensusStatus?: string | null;
  consensusElapsed?: number;
  onCancelConsensus?: () => void;
  network?: "studio" | "bradbury";
}

// ─── Risk config ──────────────────────────────────────────────────

const RISK_CONFIG = {
  HIGH:   { bg: "bg-red-500/8 border-red-500/20",    dot: "bg-red-500",    text: "text-red-400",    icon: "🔴" },
  MEDIUM: { bg: "bg-amber-500/8 border-amber-500/20", dot: "bg-amber-400",  text: "text-amber-400",  icon: "🟡" },
  LOW:    { bg: "bg-emerald-500/8 border-emerald-500/20", dot: "bg-emerald-500", text: "text-emerald-400", icon: "🟢" },
};

// ─── Loading skeleton ─────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-4 animate-fade-in-up pt-2">
      <div className="flex gap-2">
        <div className="skeleton h-10 flex-1 rounded-xl" />
        <div className="skeleton h-10 flex-1 rounded-xl" />
      </div>
      <div className="skeleton h-24 rounded-2xl" />
      <div className="skeleton h-32 rounded-2xl" />
      <div className="skeleton h-20 rounded-2xl" />
    </div>
  );
}

// ─── Empty state ───────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center py-16 px-6 animate-fade-in-up">
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/15 flex items-center justify-center mb-6 animate-scale-in">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-400">
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline points="14,2 14,8 20,8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      </div>
      <h3 className="text-base font-bold text-slate-200 mb-2">Ready to Analyze</h3>
      <p className="text-sm text-slate-500 max-w-[260px] leading-relaxed">
        Paste your GenLayer contract and press{" "}
        <span className="text-blue-400 font-semibold">Analyze Contract</span>
        {" "}— or try an example above.
      </p>
      <div className="mt-6 flex items-center gap-2 text-slate-600 text-xs">
        <kbd className="px-2 py-1 rounded bg-slate-800 border border-slate-700 font-mono text-[10px] text-slate-400">Ctrl</kbd>
        <span>+</span>
        <kbd className="px-2 py-1 rounded bg-slate-800 border border-slate-700 font-mono text-[10px] text-slate-400">Enter</kbd>
        <span className="text-slate-600">to analyze</span>
      </div>
    </div>
  );
}

// ─── Metric pill ──────────────────────────────────────────────────

function MetricPill({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  const color =
    value === "HIGH"   ? "text-red-400 bg-red-500/8 border-red-500/20" :
    value === "MEDIUM" ? "text-amber-400 bg-amber-500/8 border-amber-500/20" :
    value === "LOW"    ? "text-emerald-400 bg-emerald-500/8 border-emerald-500/20" :
    value === "GOOD"   ? "text-emerald-400 bg-emerald-500/8 border-emerald-500/20" :
    value === "POOR"   ? "text-red-400 bg-red-500/8 border-red-500/20" :
    "text-slate-400 bg-slate-500/8 border-slate-500/20";
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-800/60 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${color}`}>{value}</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────

export default function ResultsPanel({
  result,
  isLoading,
  error,
  onExplain,
  explanation,
  isExplaining,
  onSimulate,
  simulationResult,
  isSimulating,
  onFix,
  isFixing,
  fixResult,
  consensusStatus,
  consensusElapsed,
  onCancelConsensus,
  network = "studio",
}: ResultsPanelProps) {
  const [showFixedCode, setShowFixedCode] = useState(false);
  const [showReasoning, setShowReasoning] = useState(false);

  // ── Loading ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3 text-blue-400 pt-1">
          <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-semibold">Analyzing your contract…</span>
        </div>
        <LoadingSkeleton />
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="glass-card-sm bg-red-500/5 border border-red-500/15 p-5 animate-scale-in rounded-2xl">
        <div className="flex items-center gap-3 text-red-400 mb-3">
          <div className="w-8 h-8 rounded-xl bg-red-500/10 flex items-center justify-center text-sm">✕</div>
          <span className="font-bold text-sm">Analysis Failed</span>
        </div>
        <p className="text-sm text-red-300/80 leading-relaxed">{error}</p>
      </div>
    );
  }

  // ── Empty ─────────────────────────────────────────────────────────
  if (!result) return <EmptyState />;

  // ── Derived values ────────────────────────────────────────────────
  const riskCfg = RISK_CONFIG[result.risk_level] || RISK_CONFIG.MEDIUM;
  const totalIssues = result.issues.length + result.warnings.length;
  const localChanges = (fixResult?.changes_made || []).filter(
    c => !c.startsWith("🤖 AI:") && !c.startsWith("✅ Contract is already")
  );
  const aiSuggestions = fixResult?.aiSuggestions || [];
  const isOnChain = result.analysisSource === "ai_onchain";

  // ── Results ───────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* ── Sticky action bar ─────────────────────────────────────── */}
      <div className="sticky top-0 z-10 pb-3 pt-0.5" style={{ background: "linear-gradient(to bottom, #060a14 80%, transparent)" }}>
        <div className="flex gap-2">
          {onFix && (
            <button
              onClick={onFix}
              disabled={isFixing}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold border transition-all duration-200 bg-gradient-to-r from-orange-500/15 to-red-500/15 border-orange-500/25 text-orange-300 hover:from-orange-500/25 hover:to-red-500/25 hover:border-orange-500/40 disabled:opacity-40"
            >
              {isFixing ? (
                <><div className="w-3 h-3 border-2 border-orange-400/40 border-t-orange-400 rounded-full animate-spin" />Fixing…</>
              ) : (
                <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>Fix &amp; Re-analyze</>
              )}
            </button>
          )}
          {onExplain && (
            <button
              onClick={onExplain}
              disabled={isExplaining}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold border transition-all duration-200 bg-gradient-to-r from-cyan-500/15 to-blue-500/15 border-cyan-500/25 text-cyan-300 hover:from-cyan-500/25 hover:to-blue-500/25 hover:border-cyan-500/40 disabled:opacity-40"
            >
              {isExplaining ? (
                <><div className="w-3 h-3 border-2 border-cyan-400/40 border-t-cyan-400 rounded-full animate-spin" />Explaining…</>
              ) : (
                <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>Explain</>
              )}
            </button>
          )}
        </div>
      </div>

      {/* ── Fix Results ──────────────────────────────────────────── */}
      {fixResult && (
        <div className="rounded-2xl border border-blue-500/15 bg-blue-500/5 p-4 animate-scale-in space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm">🛠️</span>
              <span className="text-sm font-bold text-blue-300">Fixes Applied</span>
            </div>
            <button
              onClick={() => setShowFixedCode(v => !v)}
              className="text-[11px] text-slate-500 hover:text-slate-300 flex items-center gap-1 transition-colors"
            >
              {showFixedCode ? "Hide code ↑" : "View fixed code ↓"}
            </button>
          </div>

          {/* Bullet list of changes */}
          {localChanges.length > 0 ? (
            <ul className="space-y-1.5">
              {localChanges.map((change, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                  <span className="text-blue-400/70 mt-0.5 shrink-0">✓</span>
                  <span>{change.replace("🔧 ", "")}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-500 italic">No deterministic fixes needed.</p>
          )}

          {aiSuggestions.length > 0 && (
            <div className="pt-2 border-t border-blue-500/10 space-y-1.5">
              <p className="text-[11px] text-slate-500 font-medium">AI Suggestions</p>
              {aiSuggestions.map((s, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-slate-400">
                  <span className="text-purple-400/70 mt-0.5 shrink-0">→</span>
                  <span>{s}</span>
                </div>
              ))}
            </div>
          )}

          {/* Expandable code block */}
          {showFixedCode && fixResult.fixed_code && (
            <div className="rounded-xl overflow-hidden border border-slate-700/50 bg-[#1e1e1e]">
              <div className="flex items-center justify-between bg-slate-800/80 px-3 py-1.5 border-b border-slate-700/50">
                <span className="text-[10px] font-mono text-slate-400">fixed_contract.py</span>
                <CopyButton text={fixResult.fixed_code} label="Copy" />
              </div>
              <pre className="p-3 max-h-[200px] overflow-y-auto text-[11px] font-mono text-slate-300 leading-relaxed whitespace-pre-wrap break-all">
                {fixResult.fixed_code}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* ── Risk card ─────────────────────────────────────────────── */}
      <div className={`rounded-2xl border ${riskCfg.bg} p-5 animate-scale-in`}>
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-xl ${riskCfg.bg} border ${riskCfg.bg.split(" ")[1]} flex items-center justify-center text-xl`}>
            {riskCfg.icon}
          </div>
          <div className="flex-1">
            <div className={`text-lg font-extrabold ${riskCfg.text}`}>
              {result.risk_level} RISK
            </div>
            <div className="text-[11px] text-slate-500">
              {totalIssues > 0
                ? `${result.issues.length} issue${result.issues.length !== 1 ? "s" : ""}${result.warnings.length > 0 ? ` · ${result.warnings.length} warning${result.warnings.length !== 1 ? "s" : ""}` : ""}`
                : "No critical issues found"}
              {isOnChain && <span className="ml-2 text-indigo-400/70">· AI-powered</span>}
            </div>
          </div>
          <CopyButton
            text={[...result.issues, ...result.warnings, ...result.suggestions].join("\n")}
            label="Copy"
          />
        </div>
      </div>

      {/* ── Issues list ───────────────────────────────────────────── */}
      {(result.issues.length > 0 || result.warnings.length > 0 || result.suggestions.length > 0) && (
        <div className="rounded-2xl border border-slate-700/30 bg-slate-800/20 overflow-hidden animate-fade-in-up">
          {result.issues.map((issue, i) => (
            <div key={`issue-${i}`} className="flex items-start gap-3 px-4 py-3 border-b border-slate-800/60 last:border-0 hover:bg-slate-800/30 transition-colors">
              <span className="text-red-400 text-xs mt-0.5 shrink-0">●</span>
              <span className="text-xs text-slate-300 leading-relaxed">{issue}</span>
            </div>
          ))}
          {result.warnings.map((w, i) => (
            <div key={`warn-${i}`} className="flex items-start gap-3 px-4 py-3 border-b border-slate-800/60 last:border-0 hover:bg-slate-800/30 transition-colors">
              <span className="text-amber-400 text-xs mt-0.5 shrink-0">▲</span>
              <span className="text-xs text-slate-300 leading-relaxed">{w}</span>
            </div>
          ))}
          {result.suggestions.map((s, i) => (
            <div key={`sug-${i}`} className="flex items-start gap-3 px-4 py-3 border-b border-slate-800/60 last:border-0 hover:bg-slate-800/30 transition-colors">
              <span className="text-blue-400 text-xs mt-0.5 shrink-0">ℹ</span>
              <span className="text-xs text-slate-400 leading-relaxed">{s}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── AI Reasoning (collapsible) ────────────────────────────── */}
      {result.ai_analysis && (result.ai_analysis.reasoning || result.ai_analysis.prompt_quality) && (
        <div className="rounded-2xl border border-slate-700/30 bg-slate-800/20 overflow-hidden animate-fade-in-up">
          <button
            onClick={() => setShowReasoning(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-800/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm">{isOnChain ? "🤖" : "📊"}</span>
              <span className="text-sm font-semibold text-slate-300">{isOnChain ? "AI Analysis" : "Static Analysis"}</span>
            </div>
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              className={`text-slate-500 transition-transform duration-200 ${showReasoning ? "rotate-180" : ""}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {showReasoning && (
            <div className="px-4 pb-4 space-y-3 border-t border-slate-800/60 pt-3">
              <MetricPill label="Prompt Quality" value={result.ai_analysis.prompt_quality} />
              <MetricPill label="Determinism Risk" value={result.ai_analysis.determinism_risk} />
              <MetricPill label="Consensus Risk" value={result.ai_analysis.consensus_risk} />
              {result.ai_analysis.reasoning && (
                <p className="text-xs text-slate-400 leading-relaxed pt-1">
                  {result.ai_analysis.reasoning}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Contract Explanation ──────────────────────────────────── */}
      {explanation && (
        <div className="rounded-2xl border border-cyan-500/15 bg-cyan-500/5 p-4 animate-scale-in">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-sm">📖</span>
              <span className="text-sm font-bold text-cyan-300">Contract Explanation</span>
            </div>
            <CopyButton text={explanation} label="Copy" />
          </div>
          <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
            {explanation.replace(/\*\*(.*?)\*\*/g, "$1").replace(/^#+\s/gm, "")}
          </p>
        </div>
      )}

      {/* ── Consensus Test ────────────────────────────────────────── */}
      {onSimulate && (
        <div className="space-y-3 animate-fade-in-up">
          <div className="flex items-center gap-2 px-1">
            <div className="h-px flex-1 bg-slate-800" />
            <span className="text-[11px] text-slate-600 font-medium uppercase tracking-wider">Consensus Test</span>
            <div className="h-px flex-1 bg-slate-800" />
          </div>
          <SimulationPanel
            result={simulationResult || null}
            isLoading={isSimulating || false}
            onSimulate={onSimulate}
            predictedRisk={result.risk_level}
            network={network}
          />
          {consensusStatus && isSimulating && onCancelConsensus && (
            <ConsensusStatusBar
              status={consensusStatus}
              elapsed={consensusElapsed || 0}
              onCancel={onCancelConsensus}
            />
          )}
        </div>
      )}
    </div>
  );
}
