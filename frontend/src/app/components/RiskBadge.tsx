"use client";

import React from "react";

interface RiskBadgeProps {
  level: "LOW" | "MEDIUM" | "HIGH";
  size?: "sm" | "lg";
  confidence?: number;
}

const config = {
  LOW: {
    label: "LOW RISK",
    dot: "🟢",
    class: "risk-low",
    description: "This contract appears safe and well-structured.",
    dotColor: "bg-emerald-400",
    dotGlow: "shadow-emerald-400/50",
    textColor: "text-emerald-400",
    barColor: "bg-emerald-500",
    barWidth: "100%",
  },
  MEDIUM: {
    label: "MEDIUM RISK",
    dot: "🟡",
    class: "risk-medium",
    description: "Some potential issues detected. Review recommended.",
    dotColor: "bg-amber-400",
    dotGlow: "shadow-amber-400/50",
    textColor: "text-amber-400",
    barColor: "bg-amber-500",
    barWidth: "60%",
  },
  HIGH: {
    label: "HIGH RISK",
    dot: "🔴",
    class: "risk-high",
    description: "Critical issues found. Fixes required before deployment.",
    dotColor: "bg-red-400",
    dotGlow: "shadow-red-400/50",
    textColor: "text-red-400",
    barColor: "bg-red-500",
    barWidth: "100%",
  },
};

export default function RiskBadge({ level, size = "lg", confidence }: RiskBadgeProps) {
  const c = config[level];

  if (size === "sm") {
    return (
      <span
        className={`${c.class} inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold tracking-wide`}
      >
        <span
          className={`w-2 h-2 rounded-full ${c.dotColor} shadow-lg ${c.dotGlow}`}
          style={{ animation: "riskDotPulse 2s ease-in-out infinite" }}
        />
        {c.label}
      </span>
    );
  }

  return (
    <div className={`${c.class} rounded-2xl p-6 animate-scale-in`}>
      <div className="flex items-center justify-between">
        {/* Left — Risk Info */}
        <div className="flex items-center gap-4">
          {/* Pulsing Dot */}
          <div className="relative">
            <div
              className={`w-12 h-12 rounded-full ${c.dotColor} shadow-lg ${c.dotGlow} flex items-center justify-center`}
              style={{ animation: "riskDotPulse 2.5s ease-in-out infinite" }}
            >
              <span className="text-xl">{c.dot}</span>
            </div>
            {/* Outer glow ring */}
            <div
              className={`absolute inset-0 -m-1 rounded-full border-2 ${
                level === "LOW"
                  ? "border-emerald-400/20"
                  : level === "MEDIUM"
                  ? "border-amber-400/20"
                  : "border-red-400/20"
              }`}
              style={{ animation: "riskDotPulse 2.5s ease-in-out infinite 0.3s" }}
            />
          </div>

          {/* Text */}
          <div>
            <div className={`text-2xl font-extrabold tracking-tight ${c.textColor}`}>
              {c.label}
            </div>
            <p className="text-sm text-slate-400 mt-0.5 leading-relaxed">
              {c.description}
            </p>
          </div>
        </div>

        {/* Right — Confidence */}
        {confidence !== undefined && (
          <div className="text-right hidden sm:block">
            <div className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-1">
              Confidence
            </div>
            <div className={`text-2xl font-bold ${c.textColor}`}>
              {Math.round(confidence * 100)}%
            </div>
          </div>
        )}
      </div>

      {/* Risk level bar */}
      <div className="mt-4 progress-track">
        <div
          className={`progress-fill ${c.barColor}`}
          style={{ width: c.barWidth }}
        />
      </div>
    </div>
  );
}
