"use client";

import React from "react";
import type { NetworkType } from "@/lib/genlayer";

interface NetworkSelectorProps {
  network: NetworkType;
  onNetworkChange: (network: NetworkType) => void;
}

export default function NetworkSelector({ network: _network, onNetworkChange: _onNetworkChange }: NetworkSelectorProps) {
  // Bradbury is the only verified network for this submission.
  // Studio code is kept internally but hidden from the public selector.
  void _network;
  void _onNetworkChange;

  return (
    <div
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
      style={{
        background: "rgba(45, 212, 191, 0.06)",
        border: "1px solid rgba(45, 212, 191, 0.12)",
      }}
    >
      <span className="relative flex h-1.5 w-1.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-50" />
        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-teal-400" />
      </span>
      <div>
        <span className="text-[11px] font-semibold block leading-tight text-teal-300">
          Bradbury
        </span>
        <span className="text-[8px] block leading-tight text-teal-500/60">
          Verified on-chain
        </span>
      </div>
    </div>
  );
}
