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
  HIGH: {
    bg: "rgba(249, 115, 22, 0.05)",
    border: "rgba(249, 115, 22, 0.15)",
    dot: "#f97316",
    text: "#fb923c",
    label: "HIGH RISK",
    ring: "rgba(249, 115, 22, 0.3)",
  },
  MEDIUM: {
    bg: "rgba(251, 191, 36, 0.05)",
    border: "rgba(251, 191, 36, 0.15)",
    dot: "#fbbf24",
    text: "#fbbf24",
    label: "MEDIUM RISK",
    ring: "rgba(251, 191, 36, 0.3)",
  },
  LOW: {
    bg: "rgba(74, 222, 128, 0.05)",
    border: "rgba(74, 222, 128, 0.15)",
    dot: "#4ade80",
    text: "#4ade80",
    label: "LOW RISK",
    ring: "rgba(74, 222, 128, 0.3)",
  },
};

// ─── SVG Risk Indicator ───────────────────────────────────────────

function RiskRing({ color, size = 48 }: { color: string; size?: number }) {
  const r = size / 2 - 4;
  const circumference = 2 * Math.PI * r;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* Outer pulse ring */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          border: `2px solid ${color}`,
          opacity: 0.15,
          animation: "breathe 2.5s ease-in-out infinite",
        }}
      />
      {/* Main ring */}
      <svg width={size} height={size} className="absolute inset-0">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * 0.15}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 4px ${color})` }}
        />
      </svg>
      {/* Center dot */}
      <div
        className="absolute rounded-full"
        style={{
          width: 8,
          height: 8,
          background: color,
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          boxShadow: `0 0 8px ${color}`,
        }}
      />
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-4 animate-fade-in-up pt-2">
      <div className="flex gap-2">
        <div className="skeleton h-10 flex-1 rounded-lg" />
        <div className="skeleton h-10 flex-1 rounded-lg" />
      </div>
      <div className="skeleton h-24 rounded-xl" />
      <div className="skeleton h-32 rounded-xl" />
      <div className="skeleton h-20 rounded-xl" />
    </div>
  );
}

// ─── Empty state ───────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center py-16 px-6 animate-fade-in-up">
      {/* Animated grid icon */}
      <div
        className="w-16 h-16 rounded-xl flex items-center justify-center mb-6 animate-scale-in"
        style={{
          background: "linear-gradient(135deg, rgba(45, 212, 191, 0.06), rgba(56, 189, 248, 0.04))",
          border: "1px solid rgba(45, 212, 191, 0.1)",
        }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-primary)" }}>
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline points="14,2 14,8 20,8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      </div>
      <h3 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>Ready to Analyze</h3>
      <p className="text-sm max-w-[260px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
        Paste your GenLayer contract and press{" "}
        <span className="font-bold" style={{ color: "var(--color-primary)" }}>Analyze Contract</span>
        {" "}— or try an example above.
      </p>
      <div className="mt-5 flex items-center gap-2 text-xs" style={{ color: "var(--text-faint)" }}>
        <kbd
          className="px-2 py-1 rounded font-mono text-[10px]"
          style={{ background: "var(--bg-depth-3)", border: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}
        >Ctrl</kbd>
        <span>+</span>
        <kbd
          className="px-2 py-1 rounded font-mono text-[10px]"
          style={{ background: "var(--bg-depth-3)", border: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}
        >Enter</kbd>
        <span>to analyze</span>
      </div>
    </div>
  );
}

// ─── Metric pill ──────────────────────────────────────────────────

function MetricPill({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  const colorMap: Record<string, { text: string; bg: string; border: string }> = {
    HIGH: { text: "#fb923c", bg: "rgba(249, 115, 22, 0.06)", border: "rgba(249, 115, 22, 0.15)" },
    MEDIUM: { text: "#fbbf24", bg: "rgba(251, 191, 36, 0.06)", border: "rgba(251, 191, 36, 0.15)" },
    LOW: { text: "#4ade80", bg: "rgba(74, 222, 128, 0.06)", border: "rgba(74, 222, 128, 0.15)" },
    GOOD: { text: "#4ade80", bg: "rgba(74, 222, 128, 0.06)", border: "rgba(74, 222, 128, 0.15)" },
    POOR: { text: "#fb923c", bg: "rgba(249, 115, 22, 0.06)", border: "rgba(249, 115, 22, 0.15)" },
  };
  const colors = colorMap[value] || { text: "var(--text-secondary)", bg: "var(--bg-depth-3)", border: "var(--border-subtle)" };
  return (
    <div className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
      <span className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</span>
      <span
        className="text-xs font-bold px-2 py-0.5 rounded-full"
        style={{ color: colors.text, background: colors.bg, border: `1px solid ${colors.border}` }}
      >
        {value}
      </span>
    </div>
  );
}

// ─── Severity icon ────────────────────────────────────────────────

function SeverityDot({ type }: { type: "issue" | "warning" | "suggestion" }) {
  const colors = {
    issue: "#f97316",
    warning: "#fbbf24",
    suggestion: "var(--color-primary)",
  };
  return (
    <span
      className="w-1.5 h-1.5 rounded-full shrink-0 mt-1.5"
      style={{ background: colors[type] }}
    />
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
        <div className="flex items-center gap-3 pt-1" style={{ color: "var(--color-primary)" }}>
          <div className="w-4 h-4 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-bold">Analyzing your contract…</span>
        </div>
        <LoadingSkeleton />
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────
  if (error) {
    return (
      <div
        className="p-5 animate-scale-in rounded-xl"
        style={{
          background: "rgba(249, 115, 22, 0.04)",
          border: "1px solid rgba(249, 115, 22, 0.12)",
        }}
      >
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold"
            style={{ background: "rgba(249, 115, 22, 0.08)", color: "#f97316" }}
          >
            ✕
          </div>
          <span className="font-bold text-sm" style={{ color: "#fb923c" }}>Analysis Failed</span>
        </div>
        <p className="text-sm leading-relaxed" style={{ color: "rgba(251, 146, 60, 0.8)" }}>{error}</p>
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
      <div
        className="sticky top-0 z-10 pb-3 pt-0.5"
        style={{ background: "linear-gradient(to bottom, var(--bg-base) 80%, transparent)" }}
      >
        <div className="flex gap-2">
          {onFix && (
            <button
              onClick={onFix}
              disabled={isFixing}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-bold transition-all duration-200 disabled:opacity-35"
              style={{
                background: "linear-gradient(135deg, rgba(249, 115, 22, 0.08), rgba(239, 68, 68, 0.06))",
                border: "1px solid rgba(249, 115, 22, 0.15)",
                color: "#fb923c",
              }}
              onMouseEnter={(e) => {
                if (!isFixing) {
                  e.currentTarget.style.background = "linear-gradient(135deg, rgba(249, 115, 22, 0.14), rgba(239, 68, 68, 0.1))";
                  e.currentTarget.style.borderColor = "rgba(249, 115, 22, 0.25)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "linear-gradient(135deg, rgba(249, 115, 22, 0.08), rgba(239, 68, 68, 0.06))";
                e.currentTarget.style.borderColor = "rgba(249, 115, 22, 0.15)";
              }}
            >
              {isFixing ? (
                <><div className="w-3 h-3 border-2 border-orange-400/40 border-t-orange-400 rounded-full animate-spin" />Fixing…</>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                  </svg>
                  Fix &amp; Re-analyze
                </>
              )}
            </button>
          )}
          {onExplain && (
            <button
              onClick={onExplain}
              disabled={isExplaining}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-bold transition-all duration-200 disabled:opacity-35"
              style={{
                background: "linear-gradient(135deg, rgba(45, 212, 191, 0.08), rgba(56, 189, 248, 0.06))",
                border: "1px solid rgba(45, 212, 191, 0.15)",
                color: "#2dd4bf",
              }}
              onMouseEnter={(e) => {
                if (!isExplaining) {
                  e.currentTarget.style.background = "linear-gradient(135deg, rgba(45, 212, 191, 0.14), rgba(56, 189, 248, 0.1))";
                  e.currentTarget.style.borderColor = "rgba(45, 212, 191, 0.25)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "linear-gradient(135deg, rgba(45, 212, 191, 0.08), rgba(56, 189, 248, 0.06))";
                e.currentTarget.style.borderColor = "rgba(45, 212, 191, 0.15)";
              }}
            >
              {isExplaining ? (
                <><div className="w-3 h-3 border-2 border-teal-400/40 border-t-teal-400 rounded-full animate-spin" />Explaining…</>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  Explain
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* ── Fix Results ──────────────────────────────────────────── */}
      {fixResult && (
        <div
          className="rounded-xl p-4 animate-scale-in space-y-3"
          style={{
            background: "rgba(56, 189, 248, 0.04)",
            border: "1px solid rgba(56, 189, 248, 0.1)",
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-secondary)" }}>
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
              </svg>
              <span className="text-sm font-bold" style={{ color: "#38bdf8" }}>Fixes Applied</span>
            </div>
            <button
              onClick={() => setShowFixedCode(v => !v)}
              className="text-[11px] flex items-center gap-1 transition-colors duration-150"
              style={{ color: "var(--text-muted)" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
            >
              {showFixedCode ? "Hide code ↑" : "View fixed code ↓"}
            </button>
          </div>

          {localChanges.length > 0 ? (
            <ul className="space-y-1.5">
              {localChanges.map((change, i) => (
                <li key={i} className="flex items-start gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                  <span className="mt-0.5 shrink-0" style={{ color: "var(--color-primary)", opacity: 0.7 }}>✓</span>
                  <span>{change.replace("🔧 ", "")}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs italic" style={{ color: "var(--text-muted)" }}>No deterministic fixes needed.</p>
          )}

          {aiSuggestions.length > 0 && (
            <div className="pt-2 space-y-1.5" style={{ borderTop: "1px solid rgba(56, 189, 248, 0.08)" }}>
              <p className="text-[11px] font-semibold" style={{ color: "var(--text-muted)" }}>AI Suggestions</p>
              {aiSuggestions.map((s, i) => (
                <div key={i} className="flex items-start gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                  <span className="mt-0.5 shrink-0" style={{ color: "#38bdf8", opacity: 0.6 }}>→</span>
                  <span>{s}</span>
                </div>
              ))}
            </div>
          )}

          {showFixedCode && fixResult.fixed_code && (
            <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border-subtle)" }}>
              <div
                className="flex items-center justify-between px-3 py-1.5"
                style={{ background: "var(--bg-depth-3)", borderBottom: "1px solid var(--border-subtle)" }}
              >
                <span className="text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>fixed_contract.py</span>
                <CopyButton text={fixResult.fixed_code} label="Copy" />
              </div>
              <pre
                className="p-3 max-h-[200px] overflow-y-auto text-[11px] font-mono leading-relaxed whitespace-pre-wrap break-all"
                style={{ background: "var(--bg-depth-1)", color: "var(--text-secondary)" }}
              >
                {fixResult.fixed_code}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* ── Risk card ─────────────────────────────────────────────── */}
      <div
        className="rounded-xl p-5 animate-scale-in"
        style={{ background: riskCfg.bg, border: `1px solid ${riskCfg.border}` }}
      >
        <div className="flex items-center gap-4">
          <RiskRing color={riskCfg.dot} />
          <div className="flex-1">
            <div className="text-lg font-black tracking-tight" style={{ color: riskCfg.text }}>
              {riskCfg.label}
            </div>
            <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              {totalIssues > 0
                ? `${result.issues.length} issue${result.issues.length !== 1 ? "s" : ""}${result.warnings.length > 0 ? ` · ${result.warnings.length} warning${result.warnings.length !== 1 ? "s" : ""}` : ""}`
                : "No critical issues found"}
              {isOnChain && <span className="ml-2" style={{ color: "rgba(45, 212, 191, 0.6)" }}>· AI-powered</span>}
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
        <div
          className="rounded-xl overflow-hidden animate-fade-in-up"
          style={{ background: "var(--bg-depth-2)", border: "1px solid var(--border-subtle)" }}
        >
          {result.issues.map((issue, i) => (
            <div
              key={`issue-${i}`}
              className="flex items-start gap-3 px-4 py-3 transition-colors duration-150"
              style={{ borderBottom: "1px solid var(--border-subtle)" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-depth-3)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <SeverityDot type="issue" />
              <span className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{issue}</span>
            </div>
          ))}
          {result.warnings.map((w, i) => (
            <div
              key={`warn-${i}`}
              className="flex items-start gap-3 px-4 py-3 transition-colors duration-150"
              style={{ borderBottom: "1px solid var(--border-subtle)" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-depth-3)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <SeverityDot type="warning" />
              <span className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{w}</span>
            </div>
          ))}
          {result.suggestions.map((s, i) => (
            <div
              key={`sug-${i}`}
              className="flex items-start gap-3 px-4 py-3 transition-colors duration-150"
              style={{ borderBottom: i < result.suggestions.length - 1 ? "1px solid var(--border-subtle)" : "none" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-depth-3)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <SeverityDot type="suggestion" />
              <span className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>{s}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── AI Reasoning (collapsible) ────────────────────────────── */}
      {result.ai_analysis && (result.ai_analysis.reasoning || result.ai_analysis.prompt_quality) && (
        <div
          className="rounded-xl overflow-hidden animate-fade-in-up"
          style={{ background: "var(--bg-depth-2)", border: "1px solid var(--border-subtle)" }}
        >
          <button
            onClick={() => setShowReasoning(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 transition-colors duration-150"
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-depth-3)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <div className="flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-primary)" }}>
                {isOnChain ? (
                  <>
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </>
                ) : (
                  <>
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </>
                )}
              </svg>
              <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{isOnChain ? "AI Analysis" : "Static Analysis"}</span>
            </div>
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              className={`transition-transform duration-200 ${showReasoning ? "rotate-180" : ""}`}
              style={{ color: "var(--text-muted)" }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {showReasoning && (
            <div className="px-4 pb-4 space-y-3 pt-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
              <MetricPill label="Prompt Quality" value={result.ai_analysis.prompt_quality} />
              <MetricPill label="Determinism Risk" value={result.ai_analysis.determinism_risk} />
              <MetricPill label="Consensus Risk" value={result.ai_analysis.consensus_risk} />
              {result.ai_analysis.reasoning && (
                <p className="text-xs leading-relaxed pt-1" style={{ color: "var(--text-secondary)" }}>
                  {result.ai_analysis.reasoning}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Contract Explanation ──────────────────────────────────── */}
      {explanation && (
        <div
          className="rounded-xl p-4 animate-scale-in"
          style={{
            background: "rgba(45, 212, 191, 0.04)",
            border: "1px solid rgba(45, 212, 191, 0.1)",
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-primary)" }}>
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
              </svg>
              <span className="text-sm font-bold" style={{ color: "var(--color-primary)" }}>Contract Explanation</span>
            </div>
            <CopyButton text={explanation} label="Copy" />
          </div>
          <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>
            {explanation.replace(/\*\*(.*?)\*\*/g, "$1").replace(/^#+\s/gm, "")}
          </p>
        </div>
      )}

      {/* ── Consensus Test ────────────────────────────────────────── */}
      {onSimulate && (
        <div className="space-y-3 animate-fade-in-up">
          <div className="flex items-center gap-2 px-1">
            <div className="h-px flex-1" style={{ background: "var(--border-subtle)" }} />
            <span className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--text-faint)" }}>Consensus Test</span>
            <div className="h-px flex-1" style={{ background: "var(--border-subtle)" }} />
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
