"use client";

import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import Header from "./components/Header";
import ResultsPanel from "./components/ResultsPanel";
import SampleContracts from "./components/SampleContracts";
import CopyButton from "./components/CopyButton";
import DebugPanel from "./components/DebugPanel";
import { SAMPLE_CONTRACTS } from "./components/SampleContracts";
import {
  connectWallet,
  getConnectedAddress,
} from "@/lib/genlayer";
import type { NetworkType } from "@/lib/genlayer";
import {
  analyzeContract,
  explainContract,
  simulateConsensus,
  fixContract,
  computeTrust,
} from "@/lib/analyzer-service";
import { logGL } from "@/lib/genlayer-debug";
import type {
  AnalysisResult,
  SimulationResult,
} from "@/lib/analyzer-service";
import { predictConsensus } from "@/lib/consensus-predictor";
import type { ConsensusPrediction } from "@/lib/consensus-predictor";
import { recordConsensusResult } from "@/lib/consensus-history";

const CodeEditor = dynamic(() => import("./components/CodeEditor"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center rounded-xl" style={{ background: "#0b0e16" }}>
      <div className="flex flex-col items-center gap-3">
        <div className="w-5 h-5 border-2 border-teal-500/30 border-t-teal-400 rounded-full animate-spin" />
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>Loading editor…</span>
      </div>
    </div>
  ),
});

export default function Home() {
  const [code, setCode] = useState(SAMPLE_CONTRACTS[0].code);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [isExplaining, setIsExplaining] = useState(false);
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [fixToast, setFixToast] = useState<string | null>(null);
  const [fixResult, setFixResult] = useState<any | null>(null);
  const [activePanel, setActivePanel] = useState<"editor" | "results">("editor");

  // Consensus polling state
  const [consensusStatus, setConsensusStatus] = useState<string | null>(null);
  const [consensusElapsed, setConsensusElapsed] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  // Consensus Prediction — computed reactively from code
  const prediction: ConsensusPrediction | null = useMemo(() => {
    if (!code.trim()) return null;
    try {
      return predictConsensus(code);
    } catch {
      return null;
    }
  }, [code]);

  // Network selection — default to Studio (reliable local env)
  const [network, setNetwork] = useState<NetworkType>("studio");

  // Wallet state
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);

  // Auto-detect wallet on mount (same flow for both networks)
  useEffect(() => {
    getConnectedAddress().then((addr) => {
      if (addr) setWalletAddress(addr);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for account changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ethereum = (window as any).ethereum;
    if (!ethereum) return;

    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length > 0) {
        setWalletAddress(accounts[0]);
      } else {
        setWalletAddress(null);
      }
    };

    ethereum.on("accountsChanged", handleAccountsChanged);
    return () => {
      ethereum.removeListener?.("accountsChanged", handleAccountsChanged);
    };
  }, []);

  // ─── ?debug=1 URL flag ─────────────────────────────────────────
  const [showDebug, setShowDebug] = useState(false);
  useEffect(() => {
    setShowDebug(window.location.search.includes("debug=1"));
  }, []);

  // ─── Ctrl+Enter → Analyze ──────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        const analyzeBtn = document.getElementById("analyze-button");
        if (analyzeBtn && !(analyzeBtn as HTMLButtonElement).disabled) analyzeBtn.click();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // ─── Human-readable error transformer ────────────────────────
  function transformError(raw: string): string {
    if (/chainId|chain_id|wrong.*chain|switch.*chain/i.test(raw))
      return "Please switch your wallet to the " + (network === "studio" ? "Studio" : "Bradbury") + " network and try again.";
    if (/user rejected|user denied|rejected the request/i.test(raw))
      return "Transaction cancelled. Please approve the wallet popup to continue.";
    if (/insufficient funds|not enough.*balance/i.test(raw))
      return "Your wallet doesn't have enough funds to pay for this transaction.";
    if (/timeout|timed out/i.test(raw))
      return "The network took too long to respond. Try again — Studio validators usually finish in ~35 seconds.";
    if (/no wallet|install.*metamask|install.*rabby/i.test(raw))
      return "No wallet detected. Please install Rabby or MetaMask and refresh the page.";
    return raw;
  }

  // ─── Network Switch ──────────────────────────────────────────

  const handleNetworkChange = useCallback((newNetwork: NetworkType) => {
    setNetwork(newNetwork);
    setResult(null);
    setSimulationResult(null);
    setExplanation(null);
    setFixResult(null);
    setFixToast(null);
    setError(null);
    setConsensusStatus(null);
    getConnectedAddress().then((addr) => setWalletAddress(addr));
    logGL("ACTION → Network changed", { network: newNetwork });
  }, []);

  // ─── Connect Wallet ──────────────────────────────────────────

  const handleConnect = useCallback(async () => {
    setIsConnecting(true);
    setWalletError(null);
    try {
      const address = await connectWallet(network);
      if (address) setWalletAddress(address);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Connection failed";
      setWalletError(message);
      setTimeout(() => setWalletError(null), 5000);
    } finally {
      setIsConnecting(false);
    }
  }, [network]);

  // ─── Disconnect Wallet ───────────────────────────────────────

  const handleDisconnect = useCallback(() => {
    setWalletAddress(null);
    setResult(null);
    setSimulationResult(null);
    setExplanation(null);
    setFixResult(null);
    setFixToast(null);
    setError(null);
    logGL("ACTION → Wallet Disconnected", {});
  }, []);

  // ─── Single-TX enforcement ──────────────────────────────────
  const isBusy = isLoading || isExplaining || isSimulating || isFixing;

  // ─── Analyze (passes walletAddress for on-chain AI) ──────────

  const handleAnalyze = useCallback(async () => {
    if (isBusy) {
      logGL("BLOCKED: Analyze", { reason: "Another action is in progress" });
      return;
    }
    if (!code.trim()) {
      setError("Please enter some code to analyze.");
      return;
    }
    if (!walletAddress) {
      setError("Please connect your wallet to use the debugger.");
      return;
    }
    logGL("ACTION → Analyze", { codeLength: code.length, walletAddress: walletAddress.slice(0, 10) + "..." });
    setIsLoading(true);
    setError(null);
    setResult(null);
    setExplanation(null);
    setSimulationResult(null);
    setFixToast(null);
    setFixResult(null);
    setActivePanel("results");

    try {
      const data = await analyzeContract(code, walletAddress, network);
      setResult(data);
      logGL("ACTION ✅ Analyze complete", { riskLevel: data.risk_level, issues: data.issues.length });
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : "Analysis failed.";
      setError(transformError(raw));
      logGL("ACTION ❌ Analyze failed", { error: raw });
    } finally {
      setIsLoading(false);
    }
  }, [code, walletAddress, isBusy]);

  // ─── Explain ─────────────────────────────────────────────────

  const handleExplain = useCallback(async () => {
    if (isBusy) {
      logGL("BLOCKED: Explain", { reason: "Another action is in progress" });
      return;
    }
    if (!code.trim() || !walletAddress) return;
    logGL("ACTION → Explain", { codeLength: code.length });
    setIsExplaining(true);
    try {
      const result = await explainContract(code, walletAddress, network);
      setExplanation(result.text);
      logGL("ACTION ✅ Explain complete", { resultLength: result.text.length, source: result.execution.source });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("Transaction cancelled") || msg.includes("user rejected")) {
        // Show a brief toast — do NOT wipe analysis results
        setFixToast("Explain cancelled — approve the wallet popup to continue.");
        setTimeout(() => setFixToast(null), 5000);
        logGL("ACTION ✘ Explain rejected by user", {});
      } else {
        setExplanation("Could not generate explanation.");
        logGL("ACTION ❌ Explain failed", {});
      }
    } finally {
      setIsExplaining(false);
    }
  }, [code, walletAddress, isBusy]);

  // ─── Simulate ────────────────────────────────────────────────

  const handleSimulate = useCallback(async () => {
    if (isBusy) {
      logGL("BLOCKED: Simulate", { reason: "Another action is in progress" });
      return;
    }
    if (!code.trim() || !walletAddress) return;
    logGL("ACTION → Simulate", { codeLength: code.length });
    setIsSimulating(true);
    setConsensusStatus(null);
    setConsensusElapsed(0);

    // Create abort controller for cancellation
    const controller = new AbortController();
    abortRef.current = controller;

    const currentPrediction = result?.risk_level || prediction?.risk || "UNKNOWN";
    try {
      const data = await simulateConsensus(
        code,
        walletAddress,
        (status, elapsed) => {
          setConsensusStatus(status);
          setConsensusElapsed(elapsed);
        },
        controller.signal,
        network,
      );

      if (data.consensus === "CANCELLED") {
        setSimulationResult(null);
        setConsensusStatus(null);
        logGL("ACTION ✘ Simulate cancelled by user", {});
        return;
      }

      setSimulationResult(data);
      setConsensusStatus(null);
      logGL("ACTION ✓ Simulate complete", { consensus: data.consensus, confidence: data.confidence, source: data.execution.source });

      // Record to consensus history
      const actualOutcome = data.consensus as "AGREED" | "DISAGREED" | "ERROR";
      const isMismatch = (
        (currentPrediction === "LOW" && (actualOutcome === "DISAGREED" || data.failureType === "CONTRACT_REVERT")) ||
        (currentPrediction === "HIGH" && actualOutcome === "AGREED" && data.risk === "LOW")
      );
      recordConsensusResult({
        prompt: data.simulated_prompt || code.slice(0, 200),
        predictedRisk: currentPrediction,
        actualOutcome,
        failureType: data.failureType || undefined,
        failureReason: data.failureReason || undefined,
        txHash: data.execution?.txHash || undefined,
        mismatch: isMismatch,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("Transaction cancelled") || msg.includes("user rejected")) {
        // Show a brief toast — keep analysis results visible
        setConsensusStatus(null);
        setFixToast("Consensus cancelled — approve the wallet popup to run the test.");
        setTimeout(() => setFixToast(null), 5000);
        logGL("ACTION ✘ Simulate rejected by user", {});
      } else {
        const fallbackResult = {
          validators: [],
          consensus: "ERROR",
          confidence: 0,
          agreement_rate: 0,
          risk: "HIGH",
          prompts_found: 0,
          message: "Consensus test failed.",
          execution: computeTrust("CLIENT_FALLBACK"),
          failureType: "NETWORK_ERROR" as const,
          failureReason: "Unhandled error during consensus execution.",
        };
        setSimulationResult(fallbackResult);
        setConsensusStatus(null);
        logGL("ACTION ✘ Simulate failed", {});

        recordConsensusResult({
          prompt: code.slice(0, 200),
          predictedRisk: currentPrediction,
          actualOutcome: "NETWORK_ERROR",
          failureType: "NETWORK_ERROR",
          failureReason: "Unhandled error during consensus execution.",
          mismatch: currentPrediction === "LOW",
        });
      }
    } finally {
      setIsSimulating(false);
      abortRef.current = null;
    }
  }, [code, walletAddress, isBusy, result?.risk_level, prediction?.risk]);

  const handleCancelConsensus = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
  }, []);

  const handleFix = useCallback(async () => {
    if (isBusy) {
      logGL("BLOCKED: Fix", { reason: "Another action is in progress" });
      return;
    }
    if (!code.trim() || !walletAddress) return;
    logGL("ACTION → Fix", { codeLength: code.length });
    setIsFixing(true);
    setFixToast(null);
    setFixResult(null);
    try {
      const data = await fixContract(code, walletAddress, network);
      setCode(data.fixed_code);
      setFixResult(data);
      const localChanges = data.changes_made.filter((c) => !c.startsWith("🤖 AI:") && !c.startsWith("✅ Contract is already"));
      const aiChanges = data.aiSuggestions || [];
      const changeCount = localChanges.length;
      logGL("ACTION ✅ Fix complete", { changeCount, aiSuggestions: aiChanges.length, method: data.method, beforeRisk: data.before_risk, afterRisk: data.after_risk });
      
      // Show improvement score + validation status + source separation
      let toast = "";
      const validStatus = data.validAfterFix ? "✓ Valid" : `${data.remainingIssues} issue(s) remain`;
      if (data.improvement.improved) {
        toast = `Fixed! Risk: ${data.before_risk} → ${data.after_risk} · ${changeCount} fix(es)`;
        if (aiChanges.length > 0) toast += ` · ${aiChanges.length} AI suggestion(s)`;
        toast += ` · ${validStatus}`;
      } else if (data.improvement.delta === 0 && changeCount === 0) {
        toast = `Contract is already valid — no fixes needed.`;
      } else {
        toast = `${changeCount} fix(es) applied`;
        if (aiChanges.length > 0) toast += ` + ${aiChanges.length} AI suggestion(s)`;
        toast += ` · ${validStatus}`;
      }
      setFixToast(toast);
      setExplanation(null);
      setSimulationResult(null);
      setTimeout(() => setFixToast(null), 10000);

      // Auto re-analyze the fixed code
      logGL("ACTION → Fix: auto re-analyze starting", { fixedCodeLength: data.fixed_code.length });
      setIsLoading(true);
      setActivePanel("results");
      try {
        const newResult = await analyzeContract(data.fixed_code, walletAddress, network);
        setResult(newResult);
        logGL("ACTION ✅ Fix: auto re-analyze complete", { riskLevel: newResult.risk_level });
      } catch (reErr: unknown) {
        const reMsg = reErr instanceof Error ? reErr.message : "";
        if (reMsg.includes("Transaction cancelled") || reMsg.includes("user rejected")) {
          // Toast only — keep existing results
          setFixToast("Re-analysis cancelled — approve the wallet popup to continue.");
          setTimeout(() => setFixToast(null), 5000);
        } else {
          setResult(null);
        }
        logGL("ACTION ❌ Fix: auto re-analyze failed", {});
      } finally {
        setIsLoading(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("Transaction cancelled") || msg.includes("user rejected")) {
        // Show a brief toast — keep analysis results visible
        setFixToast("Fix cancelled — approve the wallet popup to continue.");
        setTimeout(() => setFixToast(null), 5000);
        logGL("ACTION ✘ Fix rejected by user", {});
      } else {
        setFixToast("Could not fix contract.");
        setTimeout(() => setFixToast(null), 5000);
        logGL("ACTION ❌ Fix failed", {});
      }
    } finally {
      setIsFixing(false);
    }
  }, [code, walletAddress, isBusy]);

  // ─── Sample Select ───────────────────────────────────────────

  const handleSampleSelect = useCallback((sampleCode: string) => {
    setCode(sampleCode);
    setResult(null);
    setError(null);
    setExplanation(null);
    setSimulationResult(null);
    setFixToast(null);
    setActivePanel("editor");
  }, []);

  // ─── Render ──────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen">
      <Header
        walletAddress={walletAddress}
        isConnecting={isConnecting}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        network={network}
        onNetworkChange={handleNetworkChange}
      />

      {/* Wallet Error Toast */}
      {walletError && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 animate-fade-in-up">
          <div
            className="px-5 py-3 text-sm max-w-lg rounded-lg"
            style={{
              background: "rgba(249, 115, 22, 0.08)",
              border: "1px solid rgba(249, 115, 22, 0.15)",
              color: "#fb923c",
              boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
              backdropFilter: "blur(16px)",
            }}
          >
            {walletError}
          </div>
        </div>
      )}

      {/* Fix Toast */}
      {fixToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 animate-fade-in-up">
          <div
            className="px-5 py-3 text-sm max-w-lg rounded-lg flex items-center gap-3"
            style={{
              background: "rgba(74, 222, 128, 0.06)",
              border: "1px solid rgba(74, 222, 128, 0.12)",
              color: "#e4e8ef",
              boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
              backdropFilter: "blur(16px)",
            }}
          >
            <span>{fixToast}</span>
            <button
              onClick={() => setFixToast(null)}
              className="ml-auto shrink-0 transition-colors duration-150"
              style={{ color: "var(--text-muted)" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
              aria-label="Dismiss"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 overflow-hidden">
        <div className="max-w-[1600px] mx-auto h-full p-4 md:p-6 flex flex-col">
          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 shrink-0 animate-stagger delay-100">
            <SampleContracts onSelect={handleSampleSelect} />

            {/* Bradbury warning banner */}
            {network === "bradbury" && (
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-md text-[11px] font-medium"
                style={{
                  background: "rgba(251, 191, 36, 0.05)",
                  border: "1px solid rgba(251, 191, 36, 0.1)",
                  color: "#fbbf24",
                }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                Uses real LLM validators — may take 2–5 minutes. Switch to Studio for fast results.
              </div>
            )}

            <button
              id="analyze-button"
              onClick={handleAnalyze}
              disabled={isBusy || !code.trim() || !walletAddress}
              title={!walletAddress ? "Connect wallet to analyze" : isBusy ? "Another action is in progress" : ""}
              className={`btn-primary flex items-center gap-2.5 text-sm whitespace-nowrap ${
                isLoading ? "animate-pulse-glow" : ""
              } ${!walletAddress || isBusy ? "opacity-35 cursor-not-allowed" : ""}`}
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-[#07090f]/40 border-t-[#07090f] rounded-full animate-spin" />
                  Analyzing…
                </>
              ) : (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2L2 7l10 5 10-5-10-5z" />
                    <path d="M2 17l10 5 10-5" />
                    <path d="M2 12l10 5 10-5" />
                  </svg>
                  Analyze Contract
                </>
              )}
            </button>
          </div>

          {/* Editor + Results */}
          <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0 animate-stagger delay-200">
            {/* Editor Panel */}
            <div
              className={`glass-card lg:w-[60%] min-h-[400px] lg:min-h-0 flex flex-col overflow-hidden transition-all duration-300 ${activePanel === "editor" ? "glow-blue" : ""}`}
              onClick={() => setActivePanel("editor")}
            >
              <div
                className="flex items-center justify-between px-4 py-2.5"
                style={{ borderBottom: "1px solid var(--border-subtle)" }}
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: "rgba(249, 115, 22, 0.5)" }} />
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: "rgba(251, 191, 36, 0.5)" }} />
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: "rgba(74, 222, 128, 0.5)" }} />
                  </div>
                  <span className="text-[11px] font-mono" style={{ color: "var(--text-muted)" }}>contract.py</span>
                </div>
                <CopyButton text={code} label="Copy code" />
              </div>
              <div className="flex-1 min-h-0">
                <CodeEditor code={code} onChange={setCode} />
              </div>
            </div>

            {/* Results Panel */}
            <div
              className={`glass-card lg:w-[40%] min-h-[400px] lg:min-h-0 overflow-auto p-5 transition-all duration-300 ${activePanel === "results" ? "glow-blue" : ""}`}
              onClick={() => setActivePanel("results")}
            >
              <ResultsPanel
                result={result}
                isLoading={isLoading}
                error={error}
                onExplain={handleExplain}
                explanation={explanation}
                isExplaining={isExplaining}
                onSimulate={handleSimulate}
                simulationResult={simulationResult}
                isSimulating={isSimulating}
                onFix={handleFix}
                isFixing={isFixing}
                fixResult={fixResult}
                consensusStatus={consensusStatus}
                consensusElapsed={consensusElapsed}
                onCancelConsensus={handleCancelConsensus}
                network={network}
              />
            </div>
          </div>

          {/* ─── GenLayer Flow Inspector (hidden unless ?debug=1) ─── */}
          {showDebug && <DebugPanel className="mt-4 shrink-0" />}
        </div>
      </main>
    </div>
  );
}
