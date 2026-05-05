"use client";

import React from "react";

interface ConsensusStatusBarProps {
  status: string;
  elapsed: number;
  onCancel: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  WAITING:       "Submitting transaction…",
  PENDING:       "Waiting for validators to start…",
  PROPOSING:     "Lead validator running AI…",
  COMMITTING:    "Validators posting votes…",
  REVEALING:     "Counting validator votes…",
  FINALIZED:     "Consensus reached!",
  ACCEPTED:      "Consensus accepted!",
  UNDETERMINED:  "Validators could not agree",
  LEADER_TIMEOUT:"Lead validator timed out",
  CANCELED:      "Transaction cancelled",
  UNKNOWN_STATUS: "Waiting for status update…",
  RPC_RETRYING:  "Network retrying… RPC temporarily unavailable",
  RPC_FAILED:    "Bradbury RPC failed. Tx may still complete on-chain.",
};

const STATUS_COLOR: Record<string, string> = {
  WAITING:       "var(--color-primary)",
  PENDING:       "var(--color-primary)",
  PROPOSING:     "var(--color-secondary)",
  COMMITTING:    "var(--color-secondary)",
  REVEALING:     "#fbbf24",
  FINALIZED:     "#4ade80",
  ACCEPTED:      "#4ade80",
  UNDETERMINED:  "#f97316",
  LEADER_TIMEOUT:"#f97316",
  CANCELED:      "var(--text-muted)",
  UNKNOWN_STATUS: "var(--color-primary)",
  RPC_RETRYING:  "#fbbf24",
  RPC_FAILED:    "#ef4444",
};

const TERMINAL = ["FINALIZED", "ACCEPTED", "UNDETERMINED", "LEADER_TIMEOUT", "CANCELED", "RPC_FAILED"];

export default function ConsensusStatusBar({ status, elapsed, onCancel }: ConsensusStatusBarProps) {
  const seconds = Math.floor(elapsed / 1000);
  const label = STATUS_LABEL[status] ?? "Processing…";
  const isTerminal = TERMINAL.includes(status);
  const isSuccess = status === "FINALIZED" || status === "ACCEPTED";
  const isFailed = status === "UNDETERMINED" || status === "LEADER_TIMEOUT" || status === "RPC_FAILED";
  const statusColor = STATUS_COLOR[status] || "var(--color-primary)";

  return (
    <div
      className="rounded-lg px-4 py-3 flex items-center gap-4 animate-fade-in-up"
      style={{
        background: "var(--bg-depth-2)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      {/* Animated indicator */}
      <div className="shrink-0">
        {isSuccess ? (
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "rgba(74, 222, 128, 0.08)", border: "1px solid rgba(74, 222, 128, 0.15)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        ) : isFailed ? (
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "rgba(249, 115, 22, 0.08)", border: "1px solid rgba(249, 115, 22, 0.15)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </div>
        ) : (
          <div className="relative w-8 h-8">
            {/* Track ring */}
            <svg width="32" height="32" className="absolute inset-0">
              <circle cx="16" cy="16" r="13" fill="none" stroke="var(--border-subtle)" strokeWidth="2" />
            </svg>
            {/* Spinner ring */}
            <svg width="32" height="32" className="absolute inset-0" style={{ animation: "ringSpinner 1.2s linear infinite" }}>
              <circle
                cx="16" cy="16" r="13"
                fill="none"
                stroke={statusColor}
                strokeWidth="2"
                strokeDasharray="82"
                strokeDashoffset="60"
                strokeLinecap="round"
                style={{ filter: `drop-shadow(0 0 3px ${statusColor})` }}
              />
            </svg>
          </div>
        )}
      </div>

      {/* Label + timer */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>{label}</p>
        <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
          <span className="font-mono" style={{ color: "var(--text-secondary)" }}>{seconds}s</span>
          <span> elapsed</span>
          {!isTerminal && seconds > 10 && (
            <span style={{ color: "var(--text-faint)" }}> · Bradbury validators may take 1–5 min</span>
          )}
        </p>
      </div>

      {/* Cancel */}
      {!isTerminal && (
        <button
          onClick={onCancel}
          className="shrink-0 px-3 py-1.5 text-xs font-semibold rounded-md transition-all duration-150"
          style={{
            background: "var(--bg-depth-3)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-muted)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(249, 115, 22, 0.06)";
            e.currentTarget.style.borderColor = "rgba(249, 115, 22, 0.15)";
            e.currentTarget.style.color = "#f97316";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "var(--bg-depth-3)";
            e.currentTarget.style.borderColor = "var(--border-subtle)";
            e.currentTarget.style.color = "var(--text-muted)";
          }}
        >
          Cancel
        </button>
      )}
    </div>
  );
}
