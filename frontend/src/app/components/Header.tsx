"use client";

import React, { useState, useEffect, useRef } from "react";
import NetworkSelector from "./NetworkSelector";
import type { NetworkType } from "@/lib/genlayer";

interface HeaderProps {
  walletAddress: string | null;
  isConnecting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  network: NetworkType;
  onNetworkChange: (n: NetworkType) => void;
}

export default function Header({ walletAddress, isConnecting, onConnect, onDisconnect, network, onNetworkChange }: HeaderProps) {
  const [scrolled, setScrolled] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    if (showDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showDropdown]);

  const shortenAddress = (addr: string) => `${addr.slice(0, 6)}···${addr.slice(-4)}`;

  const copyAddress = () => {
    if (walletAddress) navigator.clipboard.writeText(walletAddress);
  };

  return (
    <header
      className={`w-full border-b sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "border-[rgba(45,212,191,0.1)] shadow-lg shadow-teal-500/[0.03]"
          : "border-[rgba(45,212,191,0.04)]"
      }`}
      style={{
        background: "rgba(7, 9, 15, 0.88)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        ...(scrolled ? { animation: "headerGlow 5s ease-in-out infinite" } : {}),
      }}
    >
      {/* Edge light — animated top line */}
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{
          background: "linear-gradient(90deg, transparent 5%, rgba(45, 212, 191, 0.15) 30%, rgba(56, 189, 248, 0.1) 70%, transparent 95%)",
          animation: scrolled ? "edgeGlow 4s ease-in-out infinite" : "none",
        }}
      />

      <div className="max-w-[1600px] mx-auto px-6 py-3.5 flex items-center justify-between">

        {/* Logo & Brand */}
        <div className="flex items-center gap-3.5 group">
          <div className="relative">
            <img
              src="/glens-logo.png"
              alt="GLENS"
              className="w-9 h-9 rounded-lg transition-transform duration-300 group-hover:scale-105"
              style={{
                boxShadow: "0 0 16px rgba(45, 212, 191, 0.15), 0 2px 8px rgba(0,0,0,0.3)",
              }}
            />
            {/* Subtle glow ring */}
            <div
              className="absolute -inset-0.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500"
              style={{
                background: "linear-gradient(135deg, rgba(45, 212, 191, 0.2), rgba(56, 189, 248, 0.1))",
                zIndex: -1,
                filter: "blur(4px)",
              }}
            />
          </div>
          <div>
            <h1
              className="text-[17px] font-extrabold leading-tight tracking-tight"
              style={{
                background: "linear-gradient(135deg, #2dd4bf 0%, #5eead4 40%, #38bdf8 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              GLENS
            </h1>
            <p className="text-[10px] tracking-[0.08em] font-medium" style={{ color: "var(--text-muted)" }}>
              INTELLIGENT CONTRACT ANALYZER
            </p>
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2.5">

          {/* Network Selector */}
          <NetworkSelector network={network} onNetworkChange={onNetworkChange} />

          {/* Network status — Bradbury only for this submission */}

          {/* Wallet Section */}
          {walletAddress ? (
            <div className="relative" ref={dropdownRef}>
              <button
                id="wallet-button"
                onClick={() => setShowDropdown(!showDropdown)}
                className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer"
                style={{
                  background: "rgba(74, 222, 128, 0.06)",
                  border: "1px solid rgba(74, 222, 128, 0.12)",
                  color: "#4ade80",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(74, 222, 128, 0.1)";
                  e.currentTarget.style.borderColor = "rgba(74, 222, 128, 0.2)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(74, 222, 128, 0.06)";
                  e.currentTarget.style.borderColor = "rgba(74, 222, 128, 0.12)";
                }}
              >
                <span className="relative flex h-2 w-2">
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
                </span>
                <span className="font-mono text-[11px]">{shortenAddress(walletAddress)}</span>
                <svg
                  width="10" height="10" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                  className={`transition-transform duration-200 ${showDropdown ? "rotate-180" : ""}`}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {/* Dropdown */}
              {showDropdown && (
                <div
                  className="absolute right-0 top-full mt-2 w-60 rounded-xl overflow-hidden animate-fade-in-up z-50"
                  style={{
                    background: "rgba(11, 14, 22, 0.97)",
                    backdropFilter: "blur(24px)",
                    border: "1px solid rgba(45, 212, 191, 0.08)",
                    boxShadow: "0 16px 48px rgba(0,0,0,0.5), 0 0 1px rgba(45, 212, 191, 0.1)",
                  }}
                >
                  <div className="px-4 py-3" style={{ borderBottom: "1px solid rgba(45, 212, 191, 0.06)" }}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-40" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
                      </span>
                      <span className="text-xs font-bold" style={{ color: "#4ade80" }}>Connected</span>
                    </div>
                    <p className="text-[10px] font-mono break-all" style={{ color: "var(--text-muted)" }}>{walletAddress}</p>
                  </div>

                  <div className="px-4 py-2.5" style={{ borderBottom: "1px solid rgba(45, 212, 191, 0.06)" }}>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>Network</span>
                      <span className="text-[11px] font-bold text-teal-400">
                        GenLayer Bradbury
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>Chain ID</span>
                      <span className="text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>
                        4221
                      </span>
                    </div>
                  </div>

                  <div className="p-2 flex flex-col gap-0.5">
                    <button
                      onClick={() => { copyAddress(); setShowDropdown(false); }}
                      className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-xs transition-all duration-150"
                      style={{ color: "var(--text-secondary)" }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgba(45, 212, 191, 0.06)";
                        e.currentTarget.style.color = "var(--text-primary)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                        e.currentTarget.style.color = "var(--text-secondary)";
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                      Copy Address
                    </button>
                    <button
                      id="disconnect-button"
                      onClick={() => { onDisconnect(); setShowDropdown(false); }}
                      className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-xs transition-all duration-150"
                      style={{ color: "#f97316" }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgba(249, 115, 22, 0.08)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                      </svg>
                      Disconnect
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Not connected */
            <button
              id="connect-wallet-button"
              onClick={onConnect}
              disabled={isConnecting}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer disabled:opacity-40"
              style={{
                background: "linear-gradient(135deg, rgba(45, 212, 191, 0.1), rgba(56, 189, 248, 0.08))",
                border: "1px solid rgba(45, 212, 191, 0.15)",
                color: "#2dd4bf",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "linear-gradient(135deg, rgba(45, 212, 191, 0.16), rgba(56, 189, 248, 0.12))";
                e.currentTarget.style.borderColor = "rgba(45, 212, 191, 0.25)";
                e.currentTarget.style.boxShadow = "0 4px 20px rgba(45, 212, 191, 0.1)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "linear-gradient(135deg, rgba(45, 212, 191, 0.1), rgba(56, 189, 248, 0.08))";
                e.currentTarget.style.borderColor = "rgba(45, 212, 191, 0.15)";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              {isConnecting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-teal-400/40 border-t-teal-400 rounded-full animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="6" width="20" height="12" rx="3" />
                    <path d="M16 12h.01" />
                  </svg>
                  Connect Wallet
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
