"use client";

import React, { useState } from "react";

interface IssueListProps {
  title: string;
  items: string[];
  type: "error" | "warning" | "suggestion";
  delay?: number;
}

const icons = {
  error: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  ),
  warning: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  suggestion: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  ),
};

const colors = {
  error: {
    icon: "text-red-400",
    bg: "bg-red-500/5",
    border: "border-red-500/15",
    title: "text-red-400",
    bullet: "bg-red-400",
    bulletGlow: "shadow-red-400/40",
    hoverBg: "hover:bg-red-500/8",
  },
  warning: {
    icon: "text-amber-400",
    bg: "bg-amber-500/5",
    border: "border-amber-500/15",
    title: "text-amber-400",
    bullet: "bg-amber-400",
    bulletGlow: "shadow-amber-400/40",
    hoverBg: "hover:bg-amber-500/8",
  },
  suggestion: {
    icon: "text-blue-400",
    bg: "bg-blue-500/5",
    border: "border-blue-500/15",
    title: "text-blue-400",
    bullet: "bg-blue-400",
    bulletGlow: "shadow-blue-400/40",
    hoverBg: "hover:bg-blue-500/8",
  },
};

export default function IssueList({ title, items, type, delay = 0 }: IssueListProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (items.length === 0) return null;

  const c = colors[type];

  return (
    <div
      className={`glass-card-sm ${c.bg} border ${c.border} p-4 animate-fade-in-up`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Collapsible Header */}
      <div
        className="collapsible-header"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className={`flex items-center gap-2 ${c.icon}`}>
          {icons[type]}
          <h3 className={`font-bold text-sm ${c.title}`}>
            {title}
            <span className="ml-2 opacity-50 font-medium text-xs">
              ({items.length})
            </span>
          </h3>
        </div>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`collapsible-chevron text-slate-500 ${isExpanded ? "expanded" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {/* Content */}
      {isExpanded && (
        <ul className="space-y-2 mt-3">
          {items.map((item, i) => (
            <li
              key={i}
              className={`flex items-start gap-3 text-sm text-slate-300 leading-relaxed rounded-lg px-2 py-1.5 -mx-2 transition-colors ${c.hoverBg} animate-fade-in-up`}
              style={{ animationDelay: `${delay + (i + 1) * 60}ms` }}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${c.bullet} mt-2 shrink-0 shadow-sm ${c.bulletGlow}`}
              />
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
