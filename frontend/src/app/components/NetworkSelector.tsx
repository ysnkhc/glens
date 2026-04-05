"use client";

import React from "react";
import type { NetworkType } from "@/lib/genlayer";

interface NetworkSelectorProps {
  network: NetworkType;
  onNetworkChange: (network: NetworkType) => void;
}

export default function NetworkSelector({ network, onNetworkChange }: NetworkSelectorProps) {
  return (
    <div
      className="flex items-center gap-0.5 p-0.5 rounded-lg"
      style={{
        background: "var(--bg-depth-2)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      {/* Studio button */}
      <button
        id="network-studio-btn"
        onClick={() => onNetworkChange("studio")}
        title="GenLayer Studio — fast & stable public network"
        className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-left transition-all duration-200 cursor-pointer"
        style={{
          background: network === "studio" ? "rgba(74, 222, 128, 0.08)" : "transparent",
          border: network === "studio" ? "1px solid rgba(74, 222, 128, 0.15)" : "1px solid transparent",
          boxShadow: network === "studio" ? "0 0 12px rgba(74, 222, 128, 0.06)" : "none",
        }}
      >
        <span className="relative flex h-1.5 w-1.5">
          {network === "studio" && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-50" />
          )}
          <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${
            network === "studio" ? "bg-green-400" : "bg-slate-600"
          }`} />
        </span>
        <div>
          <span className={`text-[11px] font-semibold block leading-tight ${
            network === "studio" ? "text-green-400" : "text-slate-500"
          }`}>
            Studio
          </span>
          <span className={`text-[8px] block leading-tight ${
            network === "studio" ? "text-green-500/60" : "text-slate-700"
          }`}>
            Fast
          </span>
        </div>
      </button>

      {/* Bradbury button */}
      <button
        id="network-bradbury-btn"
        onClick={() => onNetworkChange("bradbury")}
        title="Bradbury testnet — real LLM validators, may be slow"
        className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-left transition-all duration-200 cursor-pointer"
        style={{
          background: network === "bradbury" ? "rgba(251, 191, 36, 0.08)" : "transparent",
          border: network === "bradbury" ? "1px solid rgba(251, 191, 36, 0.15)" : "1px solid transparent",
          boxShadow: network === "bradbury" ? "0 0 12px rgba(251, 191, 36, 0.06)" : "none",
        }}
      >
        <span className="relative flex h-1.5 w-1.5">
          {network === "bradbury" && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-50" />
          )}
          <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${
            network === "bradbury" ? "bg-amber-400" : "bg-slate-600"
          }`} />
        </span>
        <div>
          <span className={`text-[11px] font-semibold block leading-tight ${
            network === "bradbury" ? "text-amber-300" : "text-slate-500"
          }`}>
            Bradbury
          </span>
          <span className={`text-[8px] block leading-tight ${
            network === "bradbury" ? "text-amber-500/60" : "text-slate-700"
          }`}>
            Testnet
          </span>
        </div>
      </button>
    </div>
  );
}
