"use client";

import React from "react";

interface ValidatorInfo {
  id: string;
  name: string;
  style: string;
  output: string;
  temperature: number;
  reason?: string;
}

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
  validators?: ValidatorInfo[];
  rawVerdict?: string;
}

interface SimulationPanelProps {
  result: SimulationResult | null;
  isLoading: boolean;
  onSimulate: () => void;
  predictedRisk?: string | null;
  network?: "studio" | "bradbury";
}

const VERDICT: Record<string, { headline: string; sub: string; color: string; ringColor: string; bgColor: string }> = {
  AGREED: {
    headline: "Consensus Reached",
    sub: "All validators produced consistent outputs",
    color: "#4ade80",
    ringColor: "rgba(74, 222, 128, 0.25)",
    bgColor: "rgba(74, 222, 128, 0.04)",
  },
  DISAGREED: {
    headline: "No Consensus",
    sub: "Validators produced conflicting outputs",
    color: "#f97316",
    ringColor: "rgba(249, 115, 22, 0.25)",
    bgColor: "rgba(249, 115, 22, 0.04)",
  },
  FAILED: {
    headline: "Execution Failed",
    sub: "The contract could not be executed",
    color: "#ef4444",
    ringColor: "rgba(239, 68, 68, 0.25)",
    bgColor: "rgba(239, 68, 68, 0.04)",
  },
  TIMEOUT: {
    headline: "Timed Out",
    sub: "Validators did not respond in time",
    color: "#fbbf24",
    ringColor: "rgba(251, 191, 36, 0.25)",
    bgColor: "rgba(251, 191, 36, 0.04)",
  },
  BLOCKED: {
    headline: "Prompt Blocked",
    sub: "Prompt contains non-deterministic language",
    color: "#a78bfa",
    ringColor: "rgba(167, 139, 250, 0.25)",
    bgColor: "rgba(167, 139, 250, 0.04)",
  },
};

// Animated ring indicator for verdict
function VerdictRing({ color, size = 56 }: { color: string; size?: number }) {
  const r = size / 2 - 5;
  const circumference = 2 * Math.PI * r;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <div
        className="absolute inset-0 rounded-full"
        style={{
          border: `2px solid ${color}`,
          opacity: 0.12,
          animation: "breathe 3s ease-in-out infinite",
        }}
      />
      <svg width={size} height={size} className="absolute inset-0" style={{ transform: "rotate(-90deg)" }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * 0.08}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 6px ${color})`, transition: "stroke-dashoffset 1s ease" }}
        />
      </svg>
      {/* Center icon */}
      <div className="absolute inset-0 flex items-center justify-center">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          {color === "#4ade80" ? (
            <polyline points="20 6 9 17 4 12" />
          ) : color === "#f97316" || color === "#ef4444" ? (
            <>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </>
          ) : (
            <>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </>
          )}
        </svg>
      </div>
    </div>
  );
}

export default function SimulationPanel({ result, isLoading, onSimulate, network = "studio" }: SimulationPanelProps) {
  const networkLabel = network === "studio" ? "Studio" : "Bradbury";
  const verdict = result ? (VERDICT[result.consensus] ?? VERDICT["FAILED"]) : null;
  const isOnChain =
    result?.execution?.source === "ONCHAIN_CONFIRMED" ||
    result?.execution?.source === "ONCHAIN_CONSENSUS_FAILURE";

  return (
    <div className="space-y-3">
      {/* ─── Button ──────────────────────────────── */}
      <button
        onClick={onSimulate}
        disabled={isLoading}
        className="btn-purple w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-bold"
      >
        {isLoading ? (
          <>
            <div className="w-4 h-4 border-2 border-[#07090f]/30 border-t-[#07090f] rounded-full animate-spin" />
            Running consensus…
          </>
        ) : (
          <>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polygon points="10,8 16,12 10,16 10,8" />
            </svg>
            Run Consensus Test
          </>
        )}
      </button>

      {/* ─── Compact explainer ───────────────────── */}
      <p className="text-center text-[11px] leading-relaxed px-2" style={{ color: "var(--text-muted)" }}>
        5 independent {networkLabel} validators each run the AI prompt and vote — one wallet signature required
      </p>

      {/* ─── Verdict card ────────────────────────── */}
      {result && verdict && (
        <div
          className="rounded-xl p-6 text-center animate-fade-in-up"
          style={{
            background: verdict.bgColor,
            border: `1px solid ${verdict.ringColor}`,
          }}
        >
          <div className="flex justify-center mb-4">
            <VerdictRing color={verdict.color} />
          </div>
          <div className="text-xl font-black tracking-tight mb-1" style={{ color: verdict.color }}>
            {verdict.headline}
          </div>
          <div className="text-xs mb-5" style={{ color: "var(--text-muted)" }}>{verdict.sub}</div>

          {/* ─── Stats ─── */}
          <div className="flex items-center justify-center gap-6">
            <div className="text-center">
              <div className="text-lg font-black font-mono" style={{ color: "var(--text-primary)" }}>{result.validators && result.validators.length > 0 ? result.validators.length : 5}</div>
              <div className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--text-faint)" }}>Validators</div>
            </div>
            {result.prompts_found > 0 && (
              <>
                <div className="w-px h-6" style={{ background: "var(--border-subtle)" }} />
                <div className="text-center">
                  <div className="text-lg font-black font-mono" style={{ color: "var(--color-primary)" }}>{result.prompts_found}</div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--text-faint)" }}>Prompts</div>
                </div>
              </>
            )}
            {result.risk && result.risk !== "N/A" && (
              <>
                <div className="w-px h-6" style={{ background: "var(--border-subtle)" }} />
                <div className="text-center">
                  <div className={`text-lg font-black font-mono`} style={{
                    color: result.risk === "LOW" ? "#4ade80" : result.risk === "MEDIUM" ? "#fbbf24" : "#f97316",
                  }}>{result.risk}</div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--text-faint)" }}>Risk</div>
                </div>
              </>
            )}
          </div>

          {/* ─── Validator Outputs ─── */}
          {result.validators && result.validators.length > 0 && (
            <div className="mt-5 space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-left mb-2" style={{ color: "var(--text-faint)" }}>Validator Outputs</div>
              {result.validators.map((v, i) => {
                const agreed = result.consensus === "AGREED";
                const majorityOutput = result.rawVerdict || (result.validators && result.validators.length > 0 ? result.validators[0]?.output : "");
                const isMatch = agreed || v.output.trim().toUpperCase() === (majorityOutput || "").trim().toUpperCase();
                return (
                  <div
                    key={v.id || i}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-left"
                    style={{
                      background: "var(--bg-depth-3)",
                      border: `1px solid ${isMatch ? "rgba(74, 222, 128, 0.15)" : "rgba(249, 115, 22, 0.15)"}`,
                    }}
                  >
                    <div className="flex-shrink-0 text-sm">{isMatch ? "✅" : "❌"}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-semibold truncate" style={{ color: "var(--text-secondary)" }}>{v.name}</div>
                      <div className="text-[10px] font-mono truncate" style={{ color: isMatch ? "#4ade80" : "#f97316" }}>
                        {v.output || "(empty)"}
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <div className="text-[9px]" style={{ color: "var(--text-faint)" }}>{v.style}</div>
                      {v.reason && <div className="text-[9px] font-mono" style={{ color: isMatch ? "#4ade80" : "#f97316" }}>{v.reason}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ─── Raw verdict ─── */}
          {result.rawVerdict && (
            <div className="mt-3 px-3 py-2 rounded-lg text-left" style={{ background: "var(--bg-depth-3)", border: "1px solid var(--border-subtle)" }}>
              <div className="text-[10px] font-bold uppercase tracking-[0.1em] mb-1" style={{ color: "var(--text-faint)" }}>Consensus Output</div>
              <div className="text-sm font-mono font-bold" style={{ color: verdict.color }}>{result.rawVerdict}</div>
            </div>
          )}

          {/* ─── On-chain badge ─── */}
          {isOnChain && (
            <div
              className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-semibold"
              style={{
                background: "var(--bg-depth-3)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-muted)",
              }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              On-chain verified · {networkLabel} network
            </div>
          )}

          {/* ─── Human-readable failure hint ─── */}
          {result.failureReason && result.consensus !== "AGREED" && result.consensus !== "BLOCKED" && (
            <p className="text-[11px] mt-3 italic" style={{ color: "var(--text-muted)" }}>{result.failureReason}</p>
          )}
          {result.message && result.consensus === "BLOCKED" && (
            <p className="text-xs mt-3" style={{ color: "rgba(167, 139, 250, 0.7)" }}>{result.message}</p>
          )}
        </div>
      )}
    </div>
  );
}
