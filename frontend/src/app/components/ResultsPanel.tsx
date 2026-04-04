"use client";

import React from "react";
import RiskBadge from "./RiskBadge";
import IssueList from "./IssueList";
import AIAnalysisPanel from "./AIAnalysisPanel";
import SimulationPanel from "./SimulationPanel";
import ConsensusStatusBar from "./ConsensusStatusBar";
import CopyButton from "./CopyButton";
import { TrustBadge, FallbackWarning } from "./TrustBadge";
import type { ExecutionMeta } from "./TrustBadge";
import ConsensusPredictionPanel from "./ConsensusPredictionPanel";
import type { ConsensusPrediction } from "@/lib/consensus-predictor";

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
}

/* ─── Skeleton Loading Cards ─── */
function LoadingSkeleton() {
  return (
    <div className="space-y-5 animate-fade-in-up">
      {/* Risk skeleton */}
      <div className="glass-card-sm p-6 space-y-3">
        <div className="flex items-center gap-4">
          <div className="skeleton w-12 h-12 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-6 w-36" />
            <div className="skeleton h-3 w-56" />
          </div>
        </div>
        <div className="skeleton h-2 w-full rounded-full mt-3" />
      </div>
      {/* Issues skeleton */}
      <div className="glass-card-sm p-4 space-y-3">
        <div className="skeleton h-4 w-24" />
        <div className="skeleton h-3 w-full" />
        <div className="skeleton h-3 w-5/6" />
        <div className="skeleton h-3 w-4/6" />
      </div>
      {/* AI Analysis skeleton */}
      <div className="glass-card-sm p-4 space-y-3">
        <div className="skeleton h-4 w-28" />
        <div className="space-y-2">
          <div className="skeleton h-2 w-full rounded-full" />
          <div className="skeleton h-2 w-full rounded-full" />
          <div className="skeleton h-2 w-full rounded-full" />
        </div>
      </div>
      {/* Button skeleton */}
      <div className="grid grid-cols-2 gap-3">
        <div className="skeleton h-11 rounded-xl" />
        <div className="skeleton h-11 rounded-xl" />
      </div>
    </div>
  );
}

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
  code,
  prediction,
  fixResult,
  consensusStatus,
  consensusElapsed,
  onCancelConsensus,
}: ResultsPanelProps) {
  // Build a copy-friendly text summary of results
  const buildResultsSummary = (): string => {
    if (!result) return "";
    const parts: string[] = [];
    parts.push(`Risk Level: ${result.risk_level}`);
    if (result.issues.length) parts.push(`\nIssues:\n${result.issues.map(i => `  • ${i}`).join("\n")}`);
    if (result.warnings.length) parts.push(`\nWarnings:\n${result.warnings.map(w => `  • ${w}`).join("\n")}`);
    if (result.suggestions.length) parts.push(`\nSuggestions:\n${result.suggestions.map(s => `  • ${s}`).join("\n")}`);
    if (result.ai_analysis?.reasoning) parts.push(`\nAI Reasoning: ${result.ai_analysis.reasoning}`);
    return parts.join("\n");
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3 text-blue-400">
          <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-semibold">Analyzing contract...</span>
        </div>
        <LoadingSkeleton />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="glass-card-sm bg-red-500/5 border border-red-500/15 p-5 animate-scale-in">
        <div className="flex items-center gap-2.5 text-red-400 mb-3">
          <div className="w-8 h-8 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <span className="font-bold text-sm">Analysis Error</span>
        </div>
        <p className="text-sm text-red-300/80 leading-relaxed">{error}</p>
      </div>
    );
  }

  // Empty state — enhanced
  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center py-16 px-6">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/15 flex items-center justify-center mb-6 animate-scale-in">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-400">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
            <polyline points="14,2 14,8 20,8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <line x1="10" y1="9" x2="8" y2="9" />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-slate-200 mb-2 animate-fade-in-up">
          Ready to Analyze
        </h3>
        <p className="text-sm text-slate-500 max-w-[300px] leading-relaxed animate-fade-in-up delay-100">
          Paste your GenLayer contract in the editor and click{" "}
          <span className="text-blue-400 font-semibold">Analyze Contract</span>{" "}
          to begin analysis.
        </p>

        {/* Visual hint */}
        <div className="mt-8 flex items-center gap-3 text-slate-600 animate-fade-in-up delay-300">
          <div className="h-px w-8 bg-gradient-to-r from-transparent to-slate-700" />
          <span className="text-xs">or select an example above</span>
          <div className="h-px w-8 bg-gradient-to-l from-transparent to-slate-700" />
        </div>
      </div>
    );
  }

  // Results — grouped into clear sections
  return (
    <div className="space-y-5">
      {/* ─── Section: Fix Results (If Available) ─── */}
      {fixResult && (
        <div className="space-y-4 mb-6">
          <div className="section-header animate-fade-in-up">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
            <span>Fix Results</span>
          </div>

          {/* Section A: Local Fix */}
          <div className="glass-card-sm border border-blue-500/15 bg-blue-500/5 p-4 rounded-xl animate-scale-in">
            <h4 className="text-sm font-bold text-blue-400 mb-2">🔧 Local Fix (Deterministic)</h4>
            <div className="flex items-center gap-2 mb-3 px-2 py-1.5 rounded bg-blue-500/10 border border-blue-500/20 w-fit">
              <span className="text-[10px]">💻</span>
              <span className="text-[10px] text-blue-300 font-medium tracking-wide">
                Generated locally — NOT validated by GenLayer consensus
              </span>
            </div>
            
            {(() => {
              const localChanges = fixResult.changes_made.filter(
                (c) => !c.startsWith("🤖 AI:") && !c.startsWith("✅ Contract is already")
              );
              if (localChanges.length === 0) {
                return <p className="text-sm text-slate-400 italic mt-2">No deterministic fixes applied.</p>;
              }
              return (
                <>
                  <ul className="space-y-1.5 mb-4">
                    {localChanges.map((change, i) => (
                      <li key={i} className="text-xs text-slate-300 flex items-start gap-2">
                        <span className="text-blue-500/60 mt-0.5 shrink-0">•</span>
                        <span>{change.replace("🔧 ", "")}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="rounded-lg overflow-hidden border border-slate-700/50 bg-[#1e1e1e] mt-2">
                    <div className="bg-slate-800/80 px-3 py-1.5 border-b border-slate-700/50 text-[10px] text-slate-400 font-mono flex items-center justify-between">
                      <span>fixed_code_snippet</span>
                    </div>
                    <div className="p-3 max-h-[150px] overflow-y-auto w-full text-[11px] font-mono text-slate-300 bg-[#1e1e1e]/50 whitespace-pre-wrap break-all whitespace-pre overflow-x-hidden">
                      {fixResult.fixed_code}
                    </div>
                  </div>
                </>
              );
            })()}
          </div>

          {/* Section B: AI Suggestions (Only if they exist) */}
          {fixResult.aiSuggestions && fixResult.aiSuggestions.length > 0 && (
            <div className="glass-card-sm border border-purple-500/15 bg-purple-500/5 p-4 rounded-xl animate-scale-in delay-100">
              <h4 className="text-sm font-bold text-purple-400 mb-2">🤖 AI Suggestions (On-chain)</h4>
              <div className="flex items-center gap-2 mb-3 px-2 py-1.5 rounded bg-purple-500/10 border border-purple-500/20 w-fit">
                <span className="text-[10px]">⛓️</span>
                <span className="text-[10px] text-purple-300 font-medium tracking-wide">
                  Generated via GenLayer consensus
                </span>
              </div>
              <ul className="space-y-1.5">
                {fixResult.aiSuggestions.map((sug, i) => (
                  <li key={i} className="text-xs text-slate-300 flex items-start gap-2">
                    <span className="text-purple-500/60 mt-0.5 shrink-0">→</span>
                    <span>{sug}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ─── Section: Risk Overview ─── */}
      <div className="animate-scale-in">
        <RiskBadge level={result.risk_level} />
      </div>

      {/* ─── Section: Trust Level ─── */}
      {result.execution && (
        <div className="space-y-2 animate-fade-in-up">
          <TrustBadge execution={result.execution} />
          <FallbackWarning execution={result.execution} />
        </div>
      )}

      {/* ─── Section: Issues ─── */}
      {(result.issues.length > 0 || result.warnings.length > 0 || result.suggestions.length > 0) && (
        <div className="space-y-3">
          <div className="section-header animate-fade-in-up delay-100">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14,2 14,8 20,8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            <span>Issues & Suggestions</span>
            {result && (
              <CopyButton
                text={buildResultsSummary()}
                label="Copy results"
                className="ml-auto"
              />
            )}
          </div>

          <IssueList title="Issues" items={result.issues} type="error" delay={150} />
          <IssueList title="Warnings" items={result.warnings} type="warning" delay={250} />
          <IssueList title="Suggestions" items={result.suggestions} type="suggestion" delay={350} />
        </div>
      )}

      {/* ─── Section: Analysis ─── */}
      {(() => {
        const isOnChain = result.analysisSource === "ai_onchain";
        return (
          <div className="space-y-3">
            <div className="section-header animate-fade-in-up delay-300">
              <span>{isOnChain ? "🤖" : "📊"}</span>
              <span>{isOnChain ? "AI Analysis" : "Static Analysis"}</span>
            </div>
            <AIAnalysisPanel analysis={result.ai_analysis} isOnChain={isOnChain} delay={400} />
          </div>
        );
      })()}

      {/* ─── Section: Consensus Prediction ─── */}
      {prediction && (
        <div className="animate-fade-in-up" style={{ animationDelay: "450ms" }}>
          <ConsensusPredictionPanel prediction={prediction} />
        </div>
      )}

      {/* ─── Action Buttons ─── */}
      <div
        className="grid grid-cols-2 gap-3 animate-fade-in-up"
        style={{ animationDelay: "500ms" }}
      >
        {/* Fix Button — danger gradient */}
        {onFix && (
          <button
            onClick={onFix}
            disabled={isFixing}
            className="btn-danger flex items-center justify-center gap-2 py-3 text-sm"
          >
            {isFixing ? (
              <>
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                <span>Fixing & Analyzing...</span>
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                </svg>
                <span>🛠️ Fix &amp; Re-analyze</span>
              </>
            )}
          </button>
        )}

        {/* Explain Button — cyan gradient */}
        {onExplain && (
          <button
            onClick={onExplain}
            disabled={isExplaining}
            className="btn-cyan flex items-center justify-center gap-2 py-3 text-sm"
          >
            {isExplaining ? (
              <>
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                <span>Explaining...</span>
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <span>📖 Explain</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* ─── Explanation Result ─── */}
      {explanation && (
        <div className="glass-card-sm bg-cyan-500/5 border border-cyan-500/15 p-5 animate-scale-in">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-bold text-cyan-400 flex items-center gap-2">
              <span>📖</span> Contract Explanation
            </h4>
            <CopyButton text={explanation} label="Copy explanation" />
          </div>
          <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
            {explanation}
          </p>
        </div>
      )}

      {/* ─── Section: Simulation ─── */}
      {onSimulate && (
        <div className="space-y-3">
          <div className="section-header animate-fade-in-up delay-500">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polygon points="10,8 16,12 10,16 10,8" />
            </svg>
            <span>Consensus Test</span>
          </div>
          <div className="animate-fade-in-up delay-600">
            <SimulationPanel
              result={simulationResult || null}
              isLoading={isSimulating || false}
              onSimulate={onSimulate}
              predictedRisk={result?.risk_level || null}
            />
            {/* Live consensus status bar during polling */}
            {consensusStatus && isSimulating && onCancelConsensus && (
              <div className="mt-3">
                <ConsensusStatusBar
                  status={consensusStatus}
                  elapsed={consensusElapsed || 0}
                  onCancel={onCancelConsensus}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
