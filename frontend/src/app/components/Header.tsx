"use client";

import React, { useState, useEffect, useRef } from "react";

interface HeaderProps {
  walletAddress: string | null;
  isConnecting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}

export default function Header({ walletAddress, isConnecting, onConnect, onDisconnect }: HeaderProps) {
  const [scrolled, setScrolled] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close dropdown on outside click
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

  const shortenAddress = (addr: string) =>
    `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const copyAddress = () => {
    if (walletAddress) {
      navigator.clipboard.writeText(walletAddress);
    }
  };

  return (
    <header
      className={`w-full border-b bg-[#060a14]/85 backdrop-blur-xl sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "border-indigo-500/15 shadow-lg shadow-blue-500/5"
          : "border-indigo-500/8"
      }`}
      style={scrolled ? { animation: "headerGlow 4s ease-in-out infinite" } : {}}
    >
      <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between">
        {/* Logo & Brand */}
        <div className="flex items-center gap-3.5">
          <img
            src="/glens-logo.png"
            alt="GLENS"
            className="w-10 h-10 rounded-xl shadow-lg shadow-blue-500/25 transition-transform duration-300 hover:scale-105"
          />
          <div>
            <h1 className="text-lg font-extrabold bg-gradient-to-r from-blue-400 via-cyan-300 to-blue-400 bg-clip-text text-transparent leading-tight tracking-tight">
              GLENS
            </h1>
            <p className="text-[11px] text-slate-500 tracking-wide font-medium">
              GenLayer Intelligent Contract Analyzer
            </p>
          </div>
        </div>

        {/* Right side: badges + wallet */}
        <div className="flex items-center gap-3">

          {/* Depends Hash Badge */}
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[10px] font-mono text-slate-600 bg-slate-800/20 border border-slate-800/30" title="Bradbury Depends hash">
            <span className="text-slate-500">📦</span>
            <span>1jb45a...09h6</span>
          </div>

          {/* Powered by Bradbury — visible when wallet connected */}
          {walletAddress ? (
            <div className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-full text-xs font-semibold border bg-gradient-to-r from-purple-500/10 to-blue-500/10 border-purple-500/20 text-purple-300 animate-fade-in-up">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-50" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-400" />
              </span>
              Powered by GenLayer Bradbury
            </div>
          ) : (
            <>
              {/* On-Chain Badge (when not connected) */}
              <div className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-full text-xs font-semibold border bg-purple-500/10 border-purple-500/20 text-purple-300">
                <span>⛓️</span>
                <span>On-Chain</span>
              </div>

              {/* Network Badge */}
              <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500 bg-slate-800/30 px-3 py-2 rounded-full border border-slate-700/30">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                </span>
                <span className="font-medium">Bradbury</span>
              </div>
            </>
          )}

          {/* Wallet Section */}
          {walletAddress ? (
            <div className="relative" ref={dropdownRef}>
              {/* Connected wallet button — click to toggle dropdown */}
              <button
                id="wallet-button"
                onClick={() => setShowDropdown(!showDropdown)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold border bg-emerald-500/10 border-emerald-500/20 text-emerald-300 transition-all duration-300 hover:bg-emerald-500/15 hover:border-emerald-500/30 cursor-pointer"
              >
                <span className="relative flex h-2 w-2">
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                </span>
                <span className="font-mono">{shortenAddress(walletAddress)}</span>
                <svg
                  width="10" height="10" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="3" strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`transition-transform duration-200 ${showDropdown ? "rotate-180" : ""}`}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {/* Wallet Dropdown */}
              {showDropdown && (
                <div className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-slate-700/40 bg-[#0c1222]/95 backdrop-blur-xl shadow-2xl shadow-black/40 overflow-hidden animate-fade-in-up z-50">
                  {/* Network info */}
                  <div className="px-4 py-3 border-b border-slate-700/30">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                      </span>
                      <span className="text-xs font-semibold text-emerald-300">Connected</span>
                    </div>
                    <p className="text-[10px] font-mono text-slate-500 break-all">
                      {walletAddress}
                    </p>
                  </div>

                  {/* Network */}
                  <div className="px-4 py-2.5 border-b border-slate-700/30">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-500">Network</span>
                      <span className="text-[11px] font-semibold text-purple-300">
                        GenLayer Bradbury
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px] text-slate-600">Chain ID</span>
                      <span className="text-[10px] font-mono text-slate-500">4221</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="p-2 flex flex-col gap-1">
                    <button
                      onClick={() => { copyAddress(); setShowDropdown(false); }}
                      className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700/30 transition-all duration-200"
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
                      className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all duration-200"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                      </svg>
                      Disconnect Wallet
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              id="connect-wallet-button"
              onClick={onConnect}
              disabled={isConnecting}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border transition-all duration-300 cursor-pointer bg-gradient-to-r from-blue-500/20 to-cyan-500/20 border-blue-500/30 text-blue-300 hover:from-blue-500/30 hover:to-cyan-500/30 hover:border-blue-500/40 hover:text-blue-200 hover:shadow-lg hover:shadow-blue-500/10 disabled:opacity-50"
            >
              {isConnecting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-blue-400/40 border-t-blue-400 rounded-full animate-spin" />
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
