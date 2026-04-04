"use client";

import React from "react";
import type { NetworkType } from "@/lib/genlayer";

interface NetworkSelectorProps {
  network: NetworkType;
  onNetworkChange: (network: NetworkType) => void;
}

export default function NetworkSelector({ network, onNetworkChange }: NetworkSelectorProps) {
  return (
    <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900/60 border border-slate-700/30 backdrop-blur-sm">
      {/* Studio button */}
      <button
        id="network-studio-btn"
        onClick={() => onNetworkChange("studio")}
        title="GenLayer Studio — fast local development"
        className={`
          relative flex flex-col items-start px-3 py-1.5 rounded-lg text-left transition-all duration-200 cursor-pointer
          ${network === "studio"
            ? "bg-emerald-500/15 border border-emerald-500/30 shadow-sm shadow-emerald-500/10"
            : "hover:bg-slate-800/50 border border-transparent hover:border-slate-700/30"}
        `}
      >
        <div className="flex items-center gap-1.5">
          {/* Status dot */}
          <span className="relative flex h-1.5 w-1.5">
            {network === "studio" && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
            )}
            <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${
              network === "studio" ? "bg-emerald-400" : "bg-slate-600"
            }`} />
          </span>
          <span className={`text-[11px] font-semibold ${
            network === "studio" ? "text-emerald-300" : "text-slate-500"
          }`}>
            🏠 Studio
          </span>
        </div>
        <span className={`text-[9px] pl-3 ${
          network === "studio" ? "text-emerald-500/80" : "text-slate-600"
        }`}>
          Local · Fast
        </span>
      </button>

      {/* Bradbury button */}
      <button
        id="network-bradbury-btn"
        onClick={() => onNetworkChange("bradbury")}
        title="Bradbury testnet — live on-chain, may be slow"
        className={`
          relative flex flex-col items-start px-3 py-1.5 rounded-lg text-left transition-all duration-200 cursor-pointer
          ${network === "bradbury"
            ? "bg-amber-500/15 border border-amber-500/30 shadow-sm shadow-amber-500/10"
            : "hover:bg-slate-800/50 border border-transparent hover:border-slate-700/30"}
        `}
      >
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-1.5 w-1.5">
            {network === "bradbury" && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-60" />
            )}
            <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${
              network === "bradbury" ? "bg-amber-400" : "bg-slate-600"
            }`} />
          </span>
          <span className={`text-[11px] font-semibold ${
            network === "bradbury" ? "text-amber-300" : "text-slate-500"
          }`}>
            ⛓️ Bradbury
          </span>
        </div>
        <span className={`text-[9px] pl-3 ${
          network === "bradbury" ? "text-amber-500/80" : "text-slate-600"
        }`}>
          Testnet · Live
        </span>
      </button>
    </div>
  );
}
