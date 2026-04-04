"use client";

import React from "react";
import { TrustBadge, FallbackWarning, TrustBar } from "./TrustBadge";
import type { ExecutionMeta } from "./TrustBadge";

interface SimulationResult {
  validators: { id: string; name: string; style: string; output: string; temperature: number; reason?: string }[];
  consensus: string;
  confidence: number;
  agreement_rate: number;
  risk: string;
  prompts_found: number;
  simulated_prompt?: string;
  explanation?: string[];
  message?: string;
  execution?: ExecutionMeta;
  failureType?: "VALIDATOR_DISAGREEMENT" | "CONTRACT_REVERT" | "NETWORK_ERROR" | "TIMEOUT" | null;
  failureReason?: string;
  rawVerdict?: string;
}

interface SimulationPanelProps {
  result: SimulationResult | null;
  isLoading: boolean;
  onSimulate: () => void;
  predictedRisk?: string | null;
}

// ─── Consensus outcome styling ────────────────────────────────

const consensusBg: Record<string, string> = {
  AGREED: "bg-emerald-500/8 border-emerald-500/20",
  DISAGREED: "bg-red-500/8 border-red-500/20",
  FAILED: "bg-orange-500/8 border-orange-500/20",
  TIMEOUT: "bg-amber-500/8 border-amber-500/20",
  BLOCKED: "bg-purple-500/8 border-purple-500/20",
  "N/A": "bg-slate-500/8 border-slate-500/20",
  ERROR: "bg-red-500/8 border-red-500/20",
};

const consensusColors: Record<string, string> = {
  AGREED: "text-emerald-400",
  DISAGREED: "text-red-400",
  FAILED: "text-orange-400",
  TIMEOUT: "text-amber-400",
  BLOCKED: "text-purple-400",
  "N/A": "text-slate-400",
  ERROR: "text-red-400",
};

const consensusIcon: Record<string, string> = {
  AGREED: "✅",
  DISAGREED: "🚨",
  FAILED: "💥",
  TIMEOUT: "⏱️",
  BLOCKED: "🚫",
  "N/A": "ℹ️",
  ERROR: "❌",
};

const consensusGlow: Record<string, string> = {
  AGREED: "shadow-emerald-500/10",
  DISAGREED: "shadow-red-500/10",
  FAILED: "shadow-orange-500/10",
  TIMEOUT: "shadow-amber-500/10",
  BLOCKED: "shadow-purple-500/10",
  "N/A": "shadow-slate-500/5",
  ERROR: "shadow-red-500/10",
};

// ─── Failure type labels ──────────────────────────────────────

const failureLabels: Record<string, { icon: string; label: string; color: string }> = {
  VALIDATOR_DISAGREEMENT: {
    icon: "🔀",
    label: "Validators produced different outputs",
    color: "text-red-400 bg-red-500/10 border-red-500/20",
  },
  CONTRACT_REVERT: {
    icon: "💥",
    label: "Contract execution failed",
    color: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  },
  NETWORK_ERROR: {
    icon: "🌐",
    label: "Network instability detected",
    color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  },
  TIMEOUT: {
    icon: "⏱️",
    label: "Transaction timed out",
    color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  },
};

export default function SimulationPanel({
  result,
  isLoading,
  onSimulate,
  predictedRisk,
}: SimulationPanelProps) {
  const isOnChain = result?.execution?.source === "ONCHAIN_CONFIRMED" ||
                    result?.execution?.source === "ONCHAIN_CONSENSUS_FAILURE";

  // ─── Task 4: Prediction Mismatch Detection ─────────────────
  const hasMismatch = (() => {
    if (!result || !predictedRisk || result.consensus === "N/A") return false;
    const predicted = predictedRisk.toUpperCase();
    const actual = result.consensus;

    // Analyzer says LOW risk but validators DISAGREED or FAILED
    if (predicted === "LOW" && (actual === "DISAGREED" || actual === "FAILED")) return true;
    // Analyzer says HIGH risk but validators AGREED with GOOD verdict
    if (predicted === "HIGH" && actual === "AGREED" && result.risk === "LOW") return true;

    return false;
  })();

  return (
    <div className="space-y-4">
      {/* Run Consensus Button */}
      <button
        onClick={onSimulate}
        disabled={isLoading}
        className="btn-purple w-full flex items-center justify-center gap-2.5 py-3"
      >
        {isLoading ? (
          <>
            <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            <span className="text-sm">Running real consensus...</span>
          </>
        ) : (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polygon points="10,8 16,12 10,16 10,8" />
            </svg>
            <span className="text-sm font-semibold">⛓️ Run Consensus Test</span>
          </>
        )}
      </button>

      {/* How it works — persistent explainer */}
      <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg bg-indigo-500/5 border border-indigo-500/15">
        <span className="text-sm mt-0.5 shrink-0">💡</span>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          Each action triggers a <span className="text-indigo-300 font-medium">real on-chain consensus process</span> involving{" "}
          <span className="text-indigo-300 font-medium">5 validators</span> who independently execute the contract off-chain.
          Validators vote via Optimistic Democracy with up to 3 rotation rounds. <span className="text-slate-500">One click = one wallet signature = one real consensus.</span>
        </p>
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-3 animate-fade-in-up">
          {/* Trust Badge */}
          {result.execution && (
            <TrustBadge execution={result.execution} />
          )}

          {/* Fallback Warning */}
          <FallbackWarning execution={result.execution} />

          {/* ─── Task 4: Prediction Mismatch Alert ─────────────── */}
          {hasMismatch && (
            <div className="rounded-xl p-4 border border-amber-500/25 bg-amber-500/8 animate-scale-in">
              <div className="flex items-center gap-2.5 mb-2">
                <span className="text-lg">⚠️</span>
                <span className="text-sm font-bold text-amber-400">Prediction Mismatch Detected</span>
              </div>
              <p className="text-xs text-amber-300/80 leading-relaxed">
                Analyzer predicted <span className="font-bold text-amber-200">{predictedRisk}</span> risk,
                but validators returned <span className="font-bold text-amber-200">{result.consensus}</span>.
                {predictedRisk?.toUpperCase() === "LOW" && result.consensus === "DISAGREED" && (
                  <> The static analysis missed a consensus-breaking pattern that only real validators caught. This is a <span className="text-amber-200 font-semibold">false negative</span> — the contract is riskier than predicted.</>
                )}
                {predictedRisk?.toUpperCase() === "HIGH" && result.consensus === "AGREED" && (
                  <> The static analysis flagged risks that validators handled correctly. This is a <span className="text-amber-200 font-semibold">false positive</span> — the contract may be safer than predicted.</>
                )}
              </p>
            </div>
          )}

          {/* Consensus Verdict — single outcome */}
          <div
            className={`rounded-xl p-6 text-center border shadow-lg ${
              consensusBg[result.consensus] || consensusBg["N/A"]
            } ${consensusGlow[result.consensus] || ""}`}
          >
            <div className="text-4xl mb-3" style={{ animation: "riskDotPulse 2.5s ease-in-out infinite" }}>
              {consensusIcon[result.consensus] || "❓"}
            </div>
            <div className={`text-xl font-extrabold tracking-tight mb-1 ${consensusColors[result.consensus] || "text-slate-400"}`}>
              Consensus Result: {result.consensus}
            </div>

            {/* Risk indicator */}
            <div className="mt-3 flex items-center justify-center gap-4">
              <div className="text-center">
                <div className={`text-lg font-black ${
                  result.risk === "LOW" ? "text-emerald-400" :
                  result.risk === "MEDIUM" ? "text-amber-400" : "text-red-400"
                }`}>
                  {result.risk}
                </div>
                <div className="text-slate-500 text-[10px] font-medium uppercase tracking-wider">
                  Consensus Risk
                </div>
              </div>
              {result.prompts_found > 0 && (
                <>
                  <div className="w-px h-8 bg-slate-700" />
                  <div className="text-center">
                    <div className="text-lg font-black text-blue-400">
                      {result.prompts_found}
                    </div>
                    <div className="text-slate-500 text-[10px] font-medium uppercase tracking-wider">
                      Prompts Tested
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ─── Task 3: Classified Failure Details ────────────── */}
          {result.failureType && failureLabels[result.failureType] && (
            <div className={`rounded-xl px-4 py-3.5 border ${failureLabels[result.failureType].color}`}>
              <div className="flex items-center gap-2.5 mb-1.5">
                <span className="text-lg">{failureLabels[result.failureType].icon}</span>
                <span className="text-sm font-bold">{failureLabels[result.failureType].label}</span>
              </div>
              {result.failureReason && (
                <p className="text-xs opacity-80 leading-relaxed pl-8">
                  {result.failureReason}
                </p>
              )}
            </div>
          )}

          {/* Raw verdict (if available) */}
          {result.rawVerdict && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700/30">
              <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider shrink-0">Raw Verdict:</span>
              <span className="text-xs text-slate-300 font-mono">{result.rawVerdict}</span>
            </div>
          )}

          {/* Prompt that was tested */}
          {result.simulated_prompt && (
            <div className="space-y-2">
              <h4 className="section-header text-slate-400">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14,2 14,8 20,8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
                Prompt Evaluated by Validators
              </h4>
              <div className="rounded-lg bg-slate-800/50 border border-slate-700/30 p-3">
                <p className="text-xs text-slate-300 font-mono leading-relaxed break-all">
                  {result.simulated_prompt}
                </p>
              </div>
            </div>
          )}

          {/* Source label */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700/30">
            <span className="text-[10px]">⛓️</span>
            <span className="text-[10px] text-slate-500 italic">
              {isOnChain
                ? "Real consensus result — 5 validators executed this prompt independently and voted."
                : "Client-side analysis — connect wallet for real on-chain consensus."}
            </span>
          </div>

          {/* Trust bar */}
          <div className="pt-1 px-1">
            <TrustBar execution={result.execution} label={
              isOnChain ? "On-Chain Consensus (Bradbury)" : "Client Analysis"
            } />
          </div>

          {/* Message */}
          {result.message && (
            <p className="text-xs text-slate-500 italic px-1">{result.message}</p>
          )}
        </div>
      )}
    </div>
  );
}
