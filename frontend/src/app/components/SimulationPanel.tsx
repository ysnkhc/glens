"use client";

import React from "react";

interface SimulationResult {
  consensus: string;
  confidence: number;
  agreement_rate: number;
  risk: string;
  prompts_found: number;
  simulated_prompt?: string;
  message?: string;
  execution?: { source: string; trustScore: number; txHash?: string };
  failureType?: string | null;
  failureReason?: string;
}

interface SimulationPanelProps {
  result: SimulationResult | null;
  isLoading: boolean;
  onSimulate: () => void;
  predictedRisk?: string | null;
  network?: "studio" | "bradbury";
}

const VERDICT: Record<string, { emoji: string; headline: string; sub: string; ring: string; glow: string }> = {
  AGREED: {
    emoji: "✅",
    headline: "Consensus Reached",
    sub: "All validators produced consistent outputs",
    ring: "border-emerald-500/30",
    glow: "bg-emerald-500/6",
  },
  DISAGREED: {
    emoji: "🚨",
    headline: "No Consensus",
    sub: "Validators produced conflicting outputs",
    ring: "border-red-500/30",
    glow: "bg-red-500/6",
  },
  FAILED: {
    emoji: "💥",
    headline: "Execution Failed",
    sub: "The contract could not be executed",
    ring: "border-orange-500/30",
    glow: "bg-orange-500/6",
  },
  TIMEOUT: {
    emoji: "⏱️",
    headline: "Timed Out",
    sub: "Validators did not respond in time",
    ring: "border-amber-500/30",
    glow: "bg-amber-500/6",
  },
  BLOCKED: {
    emoji: "🚫",
    headline: "Prompt Blocked",
    sub: "Prompt contains non-deterministic language",
    ring: "border-purple-500/30",
    glow: "bg-purple-500/6",
  },
};

const HEADLINE_COLOR: Record<string, string> = {
  AGREED: "text-emerald-400",
  DISAGREED: "text-red-400",
  FAILED: "text-orange-400",
  TIMEOUT: "text-amber-400",
  BLOCKED: "text-purple-400",
};

export default function SimulationPanel({ result, isLoading, onSimulate, network = "studio" }: SimulationPanelProps) {
  const networkLabel = network === "studio" ? "Studio" : "Bradbury";
  const verdict = result ? (VERDICT[result.consensus] ?? VERDICT["FAILED"]) : null;
  const headColor = result ? (HEADLINE_COLOR[result.consensus] ?? "text-slate-300") : "";
  const isOnChain =
    result?.execution?.source === "ONCHAIN_CONFIRMED" ||
    result?.execution?.source === "ONCHAIN_CONSENSUS_FAILURE";

  return (
    <div className="space-y-3">
      {/* ─── Button ──────────────────────────────── */}
      <button
        onClick={onSimulate}
        disabled={isLoading}
        className="btn-purple w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold"
      >
        {isLoading ? (
          <>
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Running consensus…
          </>
        ) : (
          <>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polygon points="10,8 16,12 10,16 10,8" />
            </svg>
            ⛓️ Run Consensus Test
          </>
        )}
      </button>

      {/* ─── Compact explainer ───────────────────── */}
      <p className="text-center text-[11px] text-slate-500 leading-relaxed px-2">
        5 independent {networkLabel} validators each run the AI prompt and vote — one wallet signature required
      </p>

      {/* ─── Verdict card ────────────────────────── */}
      {result && verdict && (
        <div className={`rounded-2xl border ${verdict.ring} ${verdict.glow} p-6 text-center animate-fade-in-up`}>
          <div className="text-4xl mb-3" style={{ animation: "riskDotPulse 3s ease-in-out infinite" }}>
            {verdict.emoji}
          </div>
          <div className={`text-2xl font-extrabold tracking-tight ${headColor} mb-1`}>
            {verdict.headline}
          </div>
          <div className="text-xs text-slate-500 mb-5">{verdict.sub}</div>

          {/* ─── Stats ─── */}
          <div className="flex items-center justify-center gap-6">
            <div className="text-center">
              <div className="text-lg font-black text-slate-200">5</div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wider">Validators</div>
            </div>
            {result.prompts_found > 0 && (
              <>
                <div className="w-px h-7 bg-slate-700/60" />
                <div className="text-center">
                  <div className="text-lg font-black text-blue-400">{result.prompts_found}</div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider">Prompts</div>
                </div>
              </>
            )}
            {result.risk && result.risk !== "N/A" && (
              <>
                <div className="w-px h-7 bg-slate-700/60" />
                <div className="text-center">
                  <div className={`text-lg font-black ${
                    result.risk === "LOW" ? "text-emerald-400" :
                    result.risk === "MEDIUM" ? "text-amber-400" : "text-red-400"
                  }`}>{result.risk}</div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider">Risk</div>
                </div>
              </>
            )}
          </div>

          {/* ─── On-chain badge ─── */}
          {isOnChain && (
            <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-medium bg-slate-800/60 border border-slate-700/30 text-slate-400">
              <span>⛓️</span>
              On-chain verified · {networkLabel} network
            </div>
          )}

          {/* ─── Human-readable failure hint ─── */}
          {result.failureReason && result.consensus !== "AGREED" && result.consensus !== "BLOCKED" && (
            <p className="text-[11px] text-slate-500 mt-3 italic">{result.failureReason}</p>
          )}
          {result.message && result.consensus === "BLOCKED" && (
            <p className="text-xs text-purple-400/80 mt-3">{result.message}</p>
          )}
        </div>
      )}
    </div>
  );
}
