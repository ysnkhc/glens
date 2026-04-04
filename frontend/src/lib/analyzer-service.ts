/**
 * GenLayer Analyzer Service — PRODUCTION STRICT MODE
 *
 * Hybrid architecture:
 * - Deterministic analysis (parser, rules, risk) → client-side (instant, free)
 * - AI analysis (analyze, explain, simulate, fix) → on-chain via GenLayer contract
 *
 * STRICT RULES:
 * - NEVER use gl.exec_prompt → must use gl.nondet.exec_prompt
 * - ALWAYS wrap AI calls in gl.eq_principle
 * - NEVER use requests.get → must use gl.nondet.web
 */

import { CONTRACT_ADDRESS, createWalletClient, getLastEvmTxHash, pollForReceipt, extractGenLayerTxId, pollConsensusStatus, STUDIO_DEV_ADDRESS } from "./genlayer";
import type { NetworkType } from "./genlayer";
import { parseContract, buildMetadata } from "./parser";
import { runRules } from "./rules-engine";
import { scoreRisk } from "./risk-scorer";
import { fixGenLayerContract } from "./fixer-engine";
import { computeAnalysisCore, computeImprovement, RISK_SCORES } from "./analysis-core";
import type { AnalysisCore } from "./analysis-core";
import type { ParseResult } from "./parser";
import type { RulesReport } from "./rules-engine";
import { TransactionStatus } from "genlayer-js/types";
import { logGL, inspectPayload, createTxTimer, detectConsensusFailure, showRawResult } from "./genlayer-debug";
import {
  validateArgs,
  truncatePayload,
  safeParseStrict,
  validateAnalysisOutput,
  validateSimulationVerdict,
  validateFixOutput,
  validateFixedCode,
  getReadMethod,
} from "./contract-interface";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GenLayerClient = any;

// ─── Fix 1: Global Nonce Lock ──────────────────────────────────
// Serializes ALL writeContract calls to prevent nonce collisions.
// GenLayer uses a single deployer key, so concurrent transactions
// cause nonce N+1 to revert while nonce N is still pending.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pendingTx: Promise<any> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sendSerialTransaction<T>(fn: () => Promise<T>): Promise<T> {
  // Wait for any in-flight transaction to complete first
  if (pendingTx) await pendingTx.catch(() => {});
  pendingTx = fn();
  try {
    return await pendingTx;
  } finally {
    pendingTx = null;
  }
}

// ─── Execution Source (Truth Mode) ─────────────────────────────

export type ExecutionSource =
  | "ONCHAIN_CONFIRMED"
  | "ONCHAIN_CONSENSUS_FAILURE"
  | "CLIENT_FALLBACK"
  | "CLIENT_DETERMINISTIC";

export type AnalysisSource = "ai_onchain" | "heuristic_client";

export interface ExecutionMeta {
  source: ExecutionSource;
  isReal: boolean;
  txHash?: string;
  trustScore: number; // 0-100
  label: string;      // Human-readable badge text
}

/** Compute trust score from execution source */
export function computeTrust(source: ExecutionSource, validationPassed: boolean = true): ExecutionMeta {
  switch (source) {
    case "ONCHAIN_CONFIRMED":
      return {
        source,
        isReal: true,
        trustScore: validationPassed ? 100 : 70,
        label: validationPassed ? "🟢 ON-CHAIN VERIFIED" : "🟢 ON-CHAIN (weak validation)",
      };
    case "ONCHAIN_CONSENSUS_FAILURE":
      return {
        source,
        isReal: true, // Consensus failure IS real — it's a valid protocol signal
        trustScore: 0,
        label: "🔴 CONSENSUS FAILURE",
      };
    case "CLIENT_FALLBACK":
      return {
        source,
        isReal: false,
        trustScore: 40,
        label: "🟡 CLIENT FALLBACK — not validated by GenLayer consensus",
      };
    case "CLIENT_DETERMINISTIC":
      return {
        source,
        isReal: false,
        trustScore: 60,
        label: "💻 CLIENT (deterministic analysis — no AI needed)",
      };
  }
}

// ─── Response Types ────────────────────────────────────────────

export interface AIAnalysis {
  prompt_quality: string;
  determinism_risk: string;
  consensus_risk: string;
  reasoning: string;
  fix_suggestions: string[];
  [key: string]: unknown;
}

export interface AnalysisResult {
  risk_level: "LOW" | "MEDIUM" | "HIGH";
  issues: string[];
  warnings: string[];
  suggestions: string[];
  ai_analysis: AIAnalysis;
  analysisSource: AnalysisSource;
  core: AnalysisCore;
  execution: ExecutionMeta;
}

export interface SimulationResult {
  validators: {
    id: string;
    name: string;
    style: string;
    output: string;
    temperature: number;
    reason?: string;
  }[];
  consensus: string;
  confidence: number;
  agreement_rate: number;
  risk: string;
  prompts_found: number;
  simulated_prompt?: string;
  message?: string;
  execution: ExecutionMeta;
  // ─── Phase 2: Real Intelligence ────────────
  failureType?: "VALIDATOR_DISAGREEMENT" | "CONTRACT_REVERT" | "NETWORK_ERROR" | "TIMEOUT" | null;
  failureReason?: string;
  rawVerdict?: string;
}

export interface FixResult {
  fixed_code: string;
  changes_made: string[];
  method: string;
  before_risk: string;
  after_risk: string;
  improvement: { before: number; after: number; delta: number; improved: boolean };
  validAfterFix: boolean;
  remainingIssues: number;
  execution: ExecutionMeta;
  aiSuggestions?: string[];
  aiExecution?: ExecutionMeta;
}

export interface ExplainResult {
  text: string;
  execution: ExecutionMeta;
}

// ─── Helpers ───────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function safeParseJSON(text: string): any {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    const lines = cleaned.split("\n");
    const filtered = lines.filter((l) => !l.trim().startsWith("```"));
    cleaned = filtered.join("\n").trim();
  }
  try {
    return JSON.parse(cleaned);
  } catch {
    return { error: "Invalid AI response", raw: cleaned.slice(0, 300) };
  }
}

function isContractReady(walletAddress?: string | null, network: NetworkType = "studio"): boolean {
  const addr = CONTRACT_ADDRESS[network];
  if (!addr || addr === "" || !addr.startsWith("0x") || addr.length <= 40 || addr === "YOUR_CONTRACT_ADDRESS") {
    return false;
  }
  // Studio uses a pre-funded local account — no external wallet required
  if (network === "studio") return true;
  return !!walletAddress;
}

// ─── Prompt Utilities (shared module) ──────────────────────────
import { extractPrompts, CONSTRAINED_KEYWORDS, isPromptConstrained } from "./prompt-utils";


// ─── Client-Side AI Analysis (STRICT) ──────────────────────────

function deriveHeuristicAnalysis(
  code: string,
  parsed: ParseResult,
  core: AnalysisCore,
  report: RulesReport,
): AIAnalysis {
  const errorCount = report.issues.length;
  const warnCount = report.warnings.length;

  // STRICT prompt quality
  let promptQuality = "N/A";
  if (core.hasAI) {
    if (core.usesWrongExecPrompt) {
      promptQuality = "INVALID";
    } else if (core.usesCorrectExecPrompt && core.usesEqPrinciple) {
      // Phase 7: Check if prompts are actually constrained
      const prompts = extractPrompts(code);
      const constrained = prompts.some(isPromptConstrained);
      promptQuality = constrained ? "HIGH" : "MEDIUM";
    } else if (core.usesCorrectExecPrompt && !core.usesEqPrinciple) {
      promptQuality = "LOW";
    } else {
      promptQuality = "MEDIUM";
    }
  }

  // STRICT determinism risk
  let determinismRisk = "LOW";
  if (core.usesWrongExecPrompt || core.hasDangerousExternals) {
    determinismRisk = "CRITICAL";
  } else if ((core.hasAI || core.hasExternalCalls) && !core.usesEqPrinciple) {
    determinismRisk = "HIGH";
  } else if (core.hasAI && core.usesEqPrinciple) {
    determinismRisk = "MEDIUM";
  }

  // STRICT consensus risk
  let consensusRisk = "LOW";
  if (core.usesWrongExecPrompt || core.hasDangerousExternals) {
    consensusRisk = "CRITICAL";
  } else if (core.hasAI && !core.usesEqPrinciple) {
    consensusRisk = "HIGH";
  } else if (core.hasAI && core.usesEqPrinciple) {
    // Check if prompts are actually constrained — loose prompts = HIGH risk even with eq_principle
    const prompts = extractPrompts(code);
    const hasStrictConstraint = prompts.length === 0 || prompts.some(isPromptConstrained);
    const OPEN_ENDED = /\b(describe|explain|tell me|what do you think|summarize|discuss|analyze in detail|write a paragraph|give your opinion|how would you|random|anything|interesting|creative)\b/i;
    const hasOpenEnded = prompts.some(p => OPEN_ENDED.test(p));

    if (hasOpenEnded) {
      consensusRisk = "HIGH";
    } else if (!hasStrictConstraint) {
      consensusRisk = "HIGH";
    } else {
      consensusRisk = "MEDIUM";
    }
  }

  // Reasoning
  const reasons: string[] = [];
  if (core.usesWrongExecPrompt) {
    reasons.push("🚨 CRITICAL: Uses `gl.exec_prompt` which does NOT exist. Must use `gl.nondet.exec_prompt()`.");
  }
  if (core.hasDangerousExternals) {
    reasons.push("🚨 CRITICAL: Uses forbidden HTTP library. Must use `gl.nondet.web`.");
  }
  if (core.hasAI && !core.usesEqPrinciple) {
    reasons.push("❌ AI calls found WITHOUT `gl.eq_principle` — validators WILL disagree.");
  }
  if (core.hasAI && core.usesEqPrinciple && core.usesCorrectExecPrompt) {
    reasons.push("✅ AI calls properly wrapped with `gl.eq_principle` using `gl.nondet.exec_prompt`.");
  }
  if (!core.hasAI && !core.hasExternalCalls) {
    reasons.push("✅ Fully deterministic contract — no consensus risks.");
  }
  if (errorCount > 0) reasons.push(`${errorCount} structural error(s) found.`);
  if (warnCount > 0) reasons.push(`${warnCount} warning(s) detected.`);

  // Suggestions
  const suggestions: string[] = [];
  if (core.usesWrongExecPrompt) {
    suggestions.push("Replace ALL `gl.exec_prompt()` with `gl.nondet.exec_prompt()`.");
  }
  if (core.hasAI && !core.usesEqPrinciple) {
    suggestions.push("Wrap ALL AI calls in `gl.eq_principle(lambda: ...)`.");
  }
  if (core.hasDangerousExternals) {
    suggestions.push("Replace `requests.get(url)` with `gl.nondet.web.get(url)`.");
  }
  if (!core.isValidContract) {
    suggestions.push("Create a class inheriting from `gl.Contract`.");
  }
  if (errorCount === 0 && warnCount === 0 && suggestions.length === 0) {
    suggestions.push("✅ Contract looks production-ready!");
  }

  return {
    prompt_quality: promptQuality,
    determinism_risk: determinismRisk,
    consensus_risk: consensusRisk,
    reasoning: reasons.join(" "),
    fix_suggestions: suggestions.length > 0 ? suggestions : ["No critical issues detected."],
  };
}

// ─── Client-Side Explanation ───────────────────────────────────

function generateExplanation(code: string): string {
  const parsed = parseContract(code);
  const report = runRules(parsed, code);
  const risk = scoreRisk(parsed, report);
  const core = computeAnalysisCore(parsed);

  const parts: string[] = [];

  if (core.isValidContract && core.contractClassName) {
    parts.push(`📋 **${core.contractClassName}** is a GenLayer Intelligent Contract.`);
  } else if (parsed.contractClassName) {
    parts.push(`📋 **${parsed.contractClassName}** — ⚠️ missing \`gl.Contract\` inheritance.`);
  } else {
    return "⚠️ No valid GenLayer contract class detected. The class must inherit from `gl.Contract`.";
  }

  const publicMethods = parsed.methods.filter((m) => !m.name.startsWith("__"));
  if (publicMethods.length > 0) {
    parts.push(`\n\n🔧 **Methods** (${publicMethods.length}): ${publicMethods.map((m) => `\`${m.name}\``).join(", ")}.`);
  }

  if (parsed.stateVariables.length > 0) {
    parts.push(`\n\n📦 **State**: ${parsed.stateVariables.map((s) => `\`${s.name}: ${s.annotation || "untyped"}\``).join(", ")}.`);
  }

  if (core.hasAI) {
    parts.push(`\n\n🤖 **AI Usage**: Detected.`);
    if (core.usesWrongExecPrompt) {
      parts.push(" 🚨 **CRITICAL**: Uses invalid `gl.exec_prompt`.");
    } else if (core.usesEqPrinciple) {
      parts.push(" ✅ Properly wrapped with `gl.eq_principle`.");
    } else {
      parts.push(" ❌ **Missing** `gl.eq_principle` wrapping.");
    }
  } else {
    parts.push("\n\n✅ Fully deterministic — no AI calls.");
  }

  if (core.hasDangerousExternals) {
    parts.push("\n\n🚨 **Dangerous**: Uses forbidden HTTP libraries — must use `gl.nondet.web`.");
  }

  const riskEmoji = risk === "LOW" ? "🟢" : risk === "MEDIUM" ? "🟡" : "🔴";
  parts.push(`\n\n${riskEmoji} **Risk Level**: ${risk}`);

  parts.push(
    "\n\n---\n💡 *GenLayer uses Optimistic Democracy — validators independently execute AI calls and reach consensus via `gl.eq_principle`.*"
  );

  return parts.join("");
}

// ─── Fixer (delegated to fixer-engine.ts) ──────────────────────

function ruleBasedFix(code: string): FixResult {
  const result = fixGenLayerContract(code);

  // Re-analyze before fix for comparison
  const beforeParsed = parseContract(code);
  const beforeReport = runRules(beforeParsed, code);
  const beforeRisk = scoreRisk(beforeParsed, beforeReport);

  // After-fix analysis is already done inside fixer, but we need risk score
  const afterParsed = parseContract(result.fixedCode);
  const afterReport = runRules(afterParsed, result.fixedCode);
  const afterRisk = scoreRisk(afterParsed, afterReport);

  const improvement = computeImprovement(beforeRisk, afterRisk);

  // Compliance validation — verify fixed code meets GenLayer minimum requirements
  const compliance = validateFixedCode(result.fixedCode);
  const changes = [...result.changes];
  if (!compliance.valid) {
    for (const m of compliance.missing) {
      changes.push(`⚠️ Compliance: fixed code still missing ${m}`);
    }
  }
  for (const w of compliance.warnings) {
    changes.push(`⚠️ Compliance: ${w}`);
  }

  return {
    fixed_code: result.fixedCode,
    changes_made: changes,
    method: "rules",
    before_risk: beforeRisk,
    after_risk: afterRisk,
    improvement,
    validAfterFix: result.validAfterFix && compliance.valid,
    remainingIssues: result.remainingIssues + compliance.missing.length,
    execution: computeTrust("CLIENT_DETERMINISTIC"),
  };
}


// ─── Public API ────────────────────────────────────────────────

/**
 * Analyze a GenLayer contract.
 */
export async function analyzeContract(code: string, walletAddress?: string | null, network: NetworkType = "studio"): Promise<AnalysisResult> {
  logGL("ANALYZE → CLIENT START", { codeLength: code.length, walletAddress: walletAddress?.slice(0, 10) + "..." });
  const parsed = parseContract(code);
  const report = runRules(parsed, code);
  const riskLevel = scoreRisk(parsed, report);
  const core = computeAnalysisCore(parsed);
  logGL("ANALYZE → CLIENT DONE", { riskLevel, issues: report.issues.length, warnings: report.warnings.length, core });

  let aiAnalysis: AIAnalysis;
  let execution: ExecutionMeta;

  if (isContractReady(walletAddress, network)) {
    try {
      const client = createWalletClient(walletAddress || STUDIO_DEV_ADDRESS, network);
      const summary = buildMetadata(parsed);
      const safeSummary = summary.slice(0, 200);

      const timer = createTxTimer("analyze_contract");

      logGL("ANALYZE → TX START", { method: "analyze_contract", payloadLength: safeSummary.length });



      const txHash = await sendSerialTransaction(() =>
        client.writeContract({
          address: CONTRACT_ADDRESS[network] as `0x${string}`,
          functionName: "analyze_contract",
          args: [safeSummary],
          value: 0n,
        })
      );

      // 🔴 AUDIT LOG: After txHash
      console.log("TX HASH:", txHash);
      logGL("ANALYZE → TX SENT", { txHash });

      const receipt = await client.waitForTransactionReceipt({
        hash: txHash,
        status: TransactionStatus.ACCEPTED,
      });

      // 🔴 AUDIT LOG: After receipt
      console.log("RECEIPT:", receipt);
      await new Promise(resolve => setTimeout(resolve, 1200));
      logGL("ANALYZE → TX ACCEPTED", { txHash });

      const readFn = getReadMethod("analyze_contract");
      const resultStr = await client.readContract({
        address: CONTRACT_ADDRESS[network] as `0x${string}`,
        functionName: readFn,
        args: [],
      });
      logGL(`ANALYZE → READ ${readFn}`, { rawLength: String(resultStr).length });

      timer.stop();
      showRawResult(String(resultStr), "ANALYZE");
      let validationOk = true;
      try {
        aiAnalysis = safeParseStrict(String(resultStr), "analyze_contract") as AIAnalysis;
        validationOk = validateAnalysisOutput(aiAnalysis);
      } catch {
        logGL("ANALYZE → STRICT PARSE FAILED, using lenient", {});
        aiAnalysis = safeParseJSON(String(resultStr));
        validationOk = false;
      }
      execution = { ...computeTrust("ONCHAIN_CONFIRMED", validationOk), txHash: String(txHash) };
    } catch (err) {
      const failure = detectConsensusFailure(err);
      logGL("ANALYZE → TX ERROR", { error: err instanceof Error ? err.message : err, failure });
      console.warn("On-chain analysis failed, using client-side fallback:", err);
      aiAnalysis = deriveHeuristicAnalysis(code, parsed, core, report);
      execution = computeTrust("CLIENT_FALLBACK");
      logGL("ANALYZE → FALLBACK to client-side", { method: "deriveAIAnalysis", source: execution.source });
    }
  } else {
    logGL("ANALYZE → CLIENT-ONLY (no wallet/contract)", { walletAddress });
    aiAnalysis = deriveHeuristicAnalysis(code, parsed, core, report);
    execution = computeTrust("CLIENT_FALLBACK");
  }

  const analysisSource: AnalysisSource = execution.source === "ONCHAIN_CONFIRMED" ? "ai_onchain" : "heuristic_client";

  logGL("ANALYZE → RESULT", { riskLevel, source: execution.source, trustScore: execution.trustScore });
  return {
    risk_level: riskLevel,
    issues: report.issueMessages,
    warnings: report.warningMessages,
    suggestions: report.suggestions,
    ai_analysis: aiAnalysis,
    analysisSource,
    core,
    execution,
  };
}

/**
 * Explain a contract.
 */
export async function explainContract(code: string, walletAddress?: string | null, network: NetworkType = "studio"): Promise<ExplainResult> {
  if (!isContractReady(walletAddress, network)) {
    logGL("EXPLAIN → CLIENT-ONLY (no wallet/contract)", { walletAddress });
    return { text: generateExplanation(code), execution: computeTrust("CLIENT_FALLBACK") };
  }

  try {
    const client = createWalletClient(walletAddress || STUDIO_DEV_ADDRESS, network);
    const parsed = parseContract(code);
    const summary = buildMetadata(parsed);
    const safeSummary = summary.slice(0, 200);

    const timer = createTxTimer("explain_contract");
    console.log("DEBUG_ARGS explain_contract:", safeSummary);
    logGL("EXPLAIN → TX START", { method: "explain_contract", payloadLength: safeSummary.length });

    // 🔴 AUDIT LOG: Before writeContract
    console.log("CALLING writeContract:", {
      functionName: "explain_contract",
      args: [safeSummary],
      contractAddress: CONTRACT_ADDRESS[network],
      note: "SDK routes this through GenLayer Router (0x0112Bf6e...), NOT directly to contract"
    });

    const txHash = await sendSerialTransaction(() =>
      client.writeContract({
        address: CONTRACT_ADDRESS[network] as `0x${string}`,
        functionName: "explain_contract",
        args: [safeSummary],
        value: 0n,
      })
    );

    // 🔴 AUDIT LOG: After txHash
    console.log("TX HASH:", txHash);
    logGL("EXPLAIN → TX SENT", { txHash });

    const receipt = await client.waitForTransactionReceipt({
      hash: txHash,
      status: TransactionStatus.ACCEPTED,
    });

    // 🔴 AUDIT LOG: After receipt
    console.log("RECEIPT:", receipt);
    await new Promise(resolve => setTimeout(resolve, 1200));
    logGL("EXPLAIN → TX ACCEPTED", { txHash });

    const readFn = getReadMethod("explain_contract");
    const result = await client.readContract({
      address: CONTRACT_ADDRESS[network] as `0x${string}`,
      functionName: readFn,
      args: [],
    });
    logGL(`EXPLAIN → READ ${readFn}`, { rawLength: String(result).length });
    timer.stop();
    showRawResult(String(result), "EXPLAIN");

    const text = (result as string) || generateExplanation(code);
    const source = result ? "ONCHAIN_CONFIRMED" : "CLIENT_FALLBACK";
    return { text, execution: { ...computeTrust(source as ExecutionSource), txHash: String(txHash) } };
  } catch (err) {
    const failure = detectConsensusFailure(err);
    logGL("EXPLAIN → TX ERROR", { error: err instanceof Error ? err.message : err, failure });
    console.warn("On-chain explain failed:", err);
    logGL("EXPLAIN → FALLBACK to client-side", { method: "generateExplanation" });
    return { text: generateExplanation(code), execution: computeTrust("CLIENT_FALLBACK") };
  }
}

/**
 * Simulate consensus — Single TX, Real Consensus, Real Intelligence.
 *
 * GenLayer consensus happens INSIDE one transaction:
 * - 5 validators independently execute the contract off-chain
 * - They vote via Optimistic Democracy
 * - Up to 3 rotation rounds if they disagree
 * - Result is committed on-chain
 *
 * ONE call. ONE popup. ONE real consensus.
 * Now with: failure classification, raw extraction, history tracking.
 */
export async function simulateConsensus(
  code: string,
  walletAddress?: string | null,
  onStatusChange?: (status: string, elapsed: number) => void,
  signal?: AbortSignal,
  network: NetworkType = "studio",
): Promise<SimulationResult> {
  logGL("SIMULATE → START", { codeLength: code.length });
  const parsed = parseContract(code);
  const core = computeAnalysisCore(parsed);

  // If no AI, simulation is not needed
  if (!core.hasAI) {
    logGL("SIMULATE → SKIP (no AI)", { hasAI: false });
    return {
      validators: [],
      consensus: "N/A",
      confidence: 1.0,
      agreement_rate: 1.0,
      risk: "LOW",
      prompts_found: 0,
      message: "ℹ️ No AI usage detected — simulation not required. Contract is fully deterministic.",
      execution: computeTrust("CLIENT_DETERMINISTIC"),
      failureType: null,
    };
  }

  const prompts = extractPrompts(code);
  logGL("SIMULATE → PROMPTS EXTRACTED", { count: prompts.length, prompts: prompts.map(p => p.slice(0, 80)) });
  if (prompts.length === 0) {
    logGL("SIMULATE → SKIP (no prompts)", { usesEqPrinciple: core.usesEqPrinciple });
    return {
      validators: [],
      consensus: "N/A",
      confidence: 1.0,
      agreement_rate: 1.0,
      risk: core.usesEqPrinciple ? "LOW" : "HIGH",
      prompts_found: 0,
      message: core.usesEqPrinciple
        ? "ℹ️ AI detected but prompts are dynamically generated. Wrapped with eq_principle — safe."
        : "⚠️ AI detected but prompts are dynamically generated. Missing eq_principle wrapping.",
      execution: computeTrust("CLIENT_DETERMINISTIC"),
      failureType: null,
    };
  }

  if (!isContractReady(walletAddress, network)) {
    logGL("SIMULATE → BLOCKED (no wallet/contract)", { walletAddress, network });
    return {
      validators: [],
      consensus: "N/A",
      confidence: 0,
      agreement_rate: 0,
      risk: "HIGH",
      prompts_found: prompts.length,
      message: network === "studio"
        ? "🔒 Studio contract not deployed yet — deploy to GenLayer Studio first."
        : "🔒 Consensus test requires on-chain execution — connect your wallet.",
      execution: computeTrust("CLIENT_DETERMINISTIC"),
      failureType: null,
    };
  }

  // ─── Single-TX Real Consensus ──────────────────────────────
  const client = createWalletClient(walletAddress || STUDIO_DEV_ADDRESS, network);
  const safePrompt = prompts[0].slice(0, 200);
  const timer = createTxTimer("simulate_consensus");
  const startTime = Date.now();

  // ─── Task 3: Hard filter non-deterministic prompts ─────────
  const NON_DETERMINISTIC_PATTERN = /\b(random|anything|interesting|creative|surprise|whatever|unique|original|invent|imagine|opinion|feel|think about)\b/i;
  if (NON_DETERMINISTIC_PATTERN.test(safePrompt)) {
    logGL("SIMULATE → BLOCKED (non-deterministic prompt)", { prompt: safePrompt.slice(0, 100) });
    return {
      validators: [],
      consensus: "BLOCKED",
      confidence: 0,
      agreement_rate: 0,
      risk: "HIGH",
      prompts_found: prompts.length,
      simulated_prompt: safePrompt.slice(0, 200),
      failureType: "VALIDATOR_DISAGREEMENT",
      failureReason: "Prompt contains non-deterministic language — validators will NEVER agree on this.",
      message: "🚫 Prompt is non-deterministic — cannot run consensus. Remove words like 'random', 'creative', 'interesting'.",
      execution: computeTrust("CLIENT_DETERMINISTIC"),
    };
  }

  // ─── Task 2: Force output normalization ────────────────────
  const normalizedPrompt = `${safePrompt}

IMPORTANT:
- Return output in UPPERCASE
- No punctuation
- No extra spaces
- No newline
- No explanation`;

  logGL("SIMULATE → TX START", { method: "simulate_consensus", promptLength: normalizedPrompt.length, originalLength: safePrompt.length });





  // Hoist txHash so catch block can access it for receipt lookup
  let txHash: string | undefined;

  try {
    console.log("⏳ writeContract STARTING — Rabby popup should appear now...");
    
    let genLayerTxId: string | undefined;

    try {
      const validUntil = BigInt(Math.floor(Date.now() / 1000) + 3600);

      txHash = await sendSerialTransaction(() =>
        client.writeContract({
          address: CONTRACT_ADDRESS[network] as `0x${string}`,
          functionName: "simulate_consensus",
          args: [normalizedPrompt],
          value: 0n,
          validUntil,
        })
      );
      genLayerTxId = txHash;
    } catch (writeErr) {
      const writeMsg = writeErr instanceof Error ? writeErr.message : String(writeErr);

      // ─── SDK BYPASS: Recover txId from EVM receipt ─────────
      const evmHash = getLastEvmTxHash();
      if (evmHash) {
        try {
          const receipt = await pollForReceipt(evmHash);
          genLayerTxId = extractGenLayerTxId(receipt) || undefined;
          if (!genLayerTxId) {
            throw new Error(`SDK bypass failed: no txId in receipt logs. SDK error: ${writeMsg}`);
          }
        } catch (receiptErr) {
          throw new Error(`writeContract failed and recovery failed: ${writeMsg}`);
        }
      } else {
        // No EVM hash = Rabby rejected or never sent
        throw new Error(`writeContract failed before submission: ${writeMsg}`);
      }
    }

    // ✅ GUARD: Validate we have a GenLayer txId
    if (!genLayerTxId || genLayerTxId === "" || genLayerTxId === "0x") {
      throw new Error(`No valid GenLayer txId: "${genLayerTxId}"`);
    }

    console.log("🔗 GenLayer txId CONFIRMED:", genLayerTxId);
    logGL("SIMULATE → TX SENT", { genLayerTxId, evmHash: getLastEvmTxHash() });

    // ─── DIRECT CONSENSUS POLLING (bypasses SDK waitForTransactionReceipt) ───
    logGL("SIMULATE → POLLING CONSENSUS", { genLayerTxId });

    const consensusResult = await pollConsensusStatus(
      genLayerTxId,
      client,
      (status, elapsed) => {
        if (onStatusChange) onStatusChange(status, elapsed);
      },
      signal,
    );

    const durationMs = Date.now() - startTime;
    timer.stop();

    console.log("🏁 CONSENSUS COMPLETE:", consensusResult);
    logGL("SIMULATE → CONSENSUS RESULT", {
      consensus: consensusResult.consensus,
      status: consensusResult.statusName,
      result: consensusResult.resultName,
      durationMs,
    });

    if (consensusResult.consensus === "AGREED") {
      // Read the actual result from the contract
      let rawVerdict = "";
      try {
        const readFn = getReadMethod("simulate_consensus");
        const resultStr = await client.readContract({
          address: CONTRACT_ADDRESS[network] as `0x${string}`,
          functionName: readFn,
          args: [],
        });
        rawVerdict = String(resultStr).trim();
        showRawResult(rawVerdict, "SIMULATE");
      } catch (readErr) {
        console.warn("Read after consensus failed:", readErr);
        rawVerdict = consensusResult.resultName || "AGREED";
      }

      return {
        validators: [],
        consensus: "AGREED",
        confidence: 1.0,
        agreement_rate: 1.0,
        risk: "LOW",
        prompts_found: prompts.length,
        simulated_prompt: safePrompt.slice(0, 200),
        rawVerdict,
        failureType: null,
        message: `✅ Validators produced identical outputs (${(durationMs / 1000).toFixed(0)}s). Output: "${rawVerdict.slice(0, 80)}"`,
        execution: {
          ...computeTrust("ONCHAIN_CONFIRMED"),
          txHash: genLayerTxId,
        },
      };
    }

    if (consensusResult.consensus === "DISAGREED") {
      return {
        validators: [],
        consensus: "DISAGREED",
        confidence: 0,
        agreement_rate: 0,
        risk: "HIGH",
        prompts_found: prompts.length,
        simulated_prompt: safePrompt.slice(0, 200),
        failureType: "VALIDATOR_DISAGREEMENT" as const,
        failureReason: `Validators could not agree (status: ${consensusResult.statusName}, ${(durationMs / 1000).toFixed(0)}s).`,
        message: `🔀 Validators could not agree after ${(durationMs / 1000).toFixed(0)}s — outputs were different.`,
        execution: {
          ...computeTrust("ONCHAIN_CONSENSUS_FAILURE"),
          txHash: genLayerTxId,
        },
      };
    }

    // TIMEOUT or ERROR
    return {
      validators: [],
      consensus: consensusResult.consensus,
      confidence: 0,
      agreement_rate: 0,
      risk: "HIGH",
      prompts_found: prompts.length,
      simulated_prompt: safePrompt.slice(0, 200),
      failureType: "TIMEOUT" as const,
      failureReason: `Consensus status: ${consensusResult.statusName} after ${(durationMs / 1000).toFixed(0)}s.`,
      message: `⏱️ Consensus: ${consensusResult.statusName} after ${(durationMs / 1000).toFixed(0)}s.`,
      execution: {
        ...computeTrust("CLIENT_FALLBACK"),
        txHash: genLayerTxId,
      },
    };
  } catch (err) {
    timer.stop();
    const durationMs = Date.now() - startTime;
    const errMsg = err instanceof Error ? err.message : String(err);
    const errFull = err instanceof Error ? err.stack || err.message : String(err);

    // 🔴 FULL ERROR LOG
    console.log("FULL ERROR:", {
      message: errMsg,
      stack: errFull,
      txHash: txHash || "NONE — writeContract never returned a hash",
      durationMs,
      raw: err,
    });

    // ─── Fix 2: Duration Guard ─────────────────────────────────
    // Under 5 seconds = EVM-layer error, NOT a real consensus result.
    // Real consensus takes 30-120 seconds. If it fails in 1-2s,
    // no validators ever ran — it's a submission/nonce/ABI issue.
    if (durationMs < 5000) {
      logGL("SIMULATE → EVM SUBMISSION ERROR (under 5s)", { durationMs, errMsg: errMsg.slice(0, 200) });
      return {
        validators: [],
        consensus: "ERROR",
        confidence: 0,
        agreement_rate: 0,
        risk: "HIGH",
        prompts_found: prompts.length,
        simulated_prompt: safePrompt.slice(0, 200),
        failureType: "NETWORK_ERROR" as const,
        failureReason: `Transaction failed before reaching consensus engine (${durationMs}ms) — likely a nonce collision or RPC issue. No validators ran.`,
        message: `⚠️ Submission failed (${(durationMs / 1000).toFixed(1)}s) — no validators executed. Retry in a few seconds.`,
        execution: {
          ...computeTrust("CLIENT_FALLBACK"),
          txHash: txHash || "",
        },
      };
    }

    // ─── Over 5 seconds = real consensus failure, classify properly ───
    let actualStatus: string | null = null;
    if (txHash && txHash.length > 2) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const failedReceipt = await (client as any).getTransactionReceipt({ hash: txHash });
        actualStatus = failedReceipt?.status || null;
        console.log("ACTUAL FAILED STATUS:", actualStatus);
        logGL("SIMULATE → ACTUAL STATUS", { actualStatus, txHash });
      } catch (_) {
        console.log("RECEIPT LOOKUP FAILED — using error string classifier");
      }
    } else {
      console.log("NO TXHASH — writeContract failed before submission. Skipping receipt lookup.");
      logGL("SIMULATE → NO TXHASH", { errMsg: errMsg.slice(0, 200) });
    }

    // ─── Status-based classification (ground truth) ──────────
    if (actualStatus === "UNDETERMINED") {
      logGL("SIMULATE → UNDETERMINED (real disagreement)", { durationMs, txHash });
      return {
        validators: [],
        consensus: "DISAGREED",
        confidence: 0,
        agreement_rate: 0,
        risk: "HIGH",
        prompts_found: prompts.length,
        simulated_prompt: safePrompt.slice(0, 200),
        failureType: "VALIDATOR_DISAGREEMENT",
        failureReason: "Validators ran out of rotation rounds without reaching supermajority.",
        message: "🔀 Validators could not agree after 3 rotation rounds — outputs were different.",
        execution: {
          ...computeTrust("ONCHAIN_CONSENSUS_FAILURE"),
          txHash: txHash || "",
        },
      };
    }

    if (actualStatus === "LEADER_TIMEOUT") {
      logGL("SIMULATE → LEADER_TIMEOUT (network issue)", { durationMs, txHash });
      return {
        validators: [],
        consensus: "TIMEOUT",
        confidence: 0,
        agreement_rate: 0,
        risk: "HIGH",
        prompts_found: prompts.length,
        simulated_prompt: safePrompt.slice(0, 200),
        failureType: "TIMEOUT",
        failureReason: "Leader validator timed out — this is a network issue, not a contract issue.",
        message: "⏱️ Leader validator timed out. This is a network issue — retry the transaction.",
        execution: {
          ...computeTrust("CLIENT_FALLBACK"),
          txHash: txHash || "",
        },
      };
    }

    // ─── Fallback: string-based classifier (when receipt unavailable) ─
    const classified = classifyConsensusFailure(errMsg);

    logGL("SIMULATE → TX ERROR (CLASSIFIED)", {
      error: errMsg.slice(0, 300),
      actualStatus,
      txHash: txHash || "NONE",
      failureType: classified.type,
      failureReason: classified.reason,
      durationMs,
    });

    return {
      validators: [],
      consensus: classified.consensus,
      confidence: 0,
      agreement_rate: 0,
      risk: "HIGH",
      prompts_found: prompts.length,
      simulated_prompt: safePrompt.slice(0, 200),
      failureType: classified.type,
      failureReason: classified.reason,
      message: classified.message,
      execution: {
        ...computeTrust(classified.executionSource as ExecutionSource),
        txHash: txHash || "",
      },
    };
  }
}

/**
 * Classify consensus failures into distinct categories.
 * Not all failures are equal — this is the intelligence layer.
 */
function classifyConsensusFailure(errMsg: string): {
  type: "VALIDATOR_DISAGREEMENT" | "CONTRACT_REVERT" | "NETWORK_ERROR" | "TIMEOUT";
  consensus: string;
  reason: string;
  message: string;
  executionSource: string;
} {
  const lower = errMsg.toLowerCase();

  // 1. VALIDATOR DISAGREEMENT — the most meaningful signal
  if (
    lower.includes("not processed by consensus") ||
    lower.includes("consensus") && lower.includes("disagree") ||
    lower.includes("validators") && lower.includes("disagree") ||
    lower.includes("optimistic democracy") && lower.includes("fail")
  ) {
    return {
      type: "VALIDATOR_DISAGREEMENT",
      consensus: "DISAGREED",
      reason: "Validators produced different outputs — execution is not deterministic.",
      message: "❌ Validators produced different outputs — execution is not deterministic. Tighten the prompt with strict output constraints.",
      executionSource: "ONCHAIN_CONSENSUS_FAILURE",
    };
  }

  // 2. CONTRACT REVERT — the contract itself errored
  if (
    lower.includes("revert") ||
    lower.includes("execution reverted") ||
    lower.includes("out of gas") ||
    lower.includes("invalid opcode") ||
    lower.includes("stack overflow") ||
    lower.includes("contract error")
  ) {
    // Try to extract revert reason
    const revertMatch = errMsg.match(/reason:\s*["']?([^"'\n]+)["']?/i) ||
                        errMsg.match(/reverted with[:\s]+["']?([^"'\n]+)["']?/i) ||
                        errMsg.match(/error:\s*["']?([^"'\n]+)["']?/i);
    const revertReason = revertMatch ? revertMatch[1].trim() : "Unknown revert reason";

    return {
      type: "CONTRACT_REVERT",
      consensus: "FAILED",
      reason: `Contract execution reverted: ${revertReason}`,
      message: `❌ Contract execution failed — ${revertReason.slice(0, 120)}`,
      executionSource: "ONCHAIN_CONSENSUS_FAILURE",
    };
  }

  // 3. TIMEOUT — transaction didn't finalize
  if (
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("deadline exceeded") ||
    lower.includes("took too long")
  ) {
    return {
      type: "TIMEOUT",
      consensus: "TIMEOUT",
      reason: "Transaction did not finalize within the expected timeframe.",
      message: "⚠️ Network instability detected — transaction timed out before consensus was reached.",
      executionSource: "CLIENT_FALLBACK",
    };
  }

  // 4. NETWORK ERROR — infrastructure level
  if (
    lower.includes("network") ||
    lower.includes("fetch") ||
    lower.includes("econnrefused") ||
    lower.includes("econnreset") ||
    lower.includes("socket") ||
    lower.includes("dns") ||
    lower.includes("rpc") && (lower.includes("error") || lower.includes("fail")) ||
    lower.includes("503") ||
    lower.includes("502") ||
    lower.includes("connection")
  ) {
    return {
      type: "NETWORK_ERROR",
      consensus: "ERROR",
      reason: "Network or RPC connection failed during execution.",
      message: "⚠️ Network instability detected — could not reach GenLayer validators.",
      executionSource: "CLIENT_FALLBACK",
    };
  }

  // 5. FALLBACK — unknown error, still classify
  // Check if it might still be consensus-related
  if (lower.includes("consensus")) {
    return {
      type: "VALIDATOR_DISAGREEMENT",
      consensus: "DISAGREED",
      reason: `Validators produced different outputs: ${errMsg.slice(0, 150)}`,
      message: `❌ Validators produced different outputs — ${errMsg.slice(0, 120)}`,
      executionSource: "ONCHAIN_CONSENSUS_FAILURE",
    };
  }

  return {
    type: "NETWORK_ERROR",
    consensus: "ERROR",
    reason: `Unclassified error: ${errMsg.slice(0, 150)}`,
    message: `❌ Consensus execution failed: ${errMsg.slice(0, 120)}`,
    executionSource: "CLIENT_FALLBACK",
  };
}

/**
 * Fix a contract — Phase 3+4+5: conditional fix + re-analyze + improvement score.
 */
export async function fixContract(code: string, walletAddress?: string | null, network: NetworkType = "studio"): Promise<FixResult> {
  logGL("FIX → CLIENT START", { codeLength: code.length });
  const parsed = parseContract(code);
  const report = runRules(parsed, code);
  const allIssues = [...report.issueMessages, ...report.warningMessages];
  logGL("FIX → ISSUES FOUND", { issueCount: report.issues.length, warningCount: report.warnings.length, totalMessages: allIssues.length });

  // Phase 3: Only fix if there are actual issues
  if (allIssues.length === 0 && report.issues.length === 0) {
    logGL("FIX → CLIENT SKIP (no issues)", { reason: "Contract already valid" });
    const risk = scoreRisk(parsed, report);
    return {
      fixed_code: code,
      changes_made: ["✅ Contract is already valid — no fixes needed."],
      method: "none",
      before_risk: risk,
      after_risk: risk,
      improvement: { before: RISK_SCORES[risk], after: RISK_SCORES[risk], delta: 0, improved: false },
      validAfterFix: true,
      remainingIssues: 0,
      execution: computeTrust("CLIENT_DETERMINISTIC"),
    };
  }

  // Run the fixer (Phase 4: includes re-analysis)
  logGL("FIX → CLIENT RULE ENGINE", { method: "fixGenLayerContract" });
  const ruleFix = ruleBasedFix(code);
  logGL("FIX → CLIENT RULE RESULT", { changes: ruleFix.changes_made.length, beforeRisk: ruleFix.before_risk, afterRisk: ruleFix.after_risk, validAfterFix: ruleFix.validAfterFix });

  // Optionally enhance with on-chain AI suggestions
  if (isContractReady(walletAddress, network)) {
    try {
      const client = createWalletClient(walletAddress || STUDIO_DEV_ADDRESS, network);
      const safeIssues = allIssues.map((i) => `- ${i}`).join("\n").slice(0, 200);

      const timer = createTxTimer("fix_contract");
      console.log("DEBUG_ARGS fix_contract:", safeIssues);
      logGL("FIX → TX START", { method: "fix_contract", payloadLength: safeIssues.length });

      // 🔴 AUDIT LOG: Before writeContract
      console.log("CALLING writeContract:", {
        functionName: "fix_contract",
        args: [safeIssues],
        contractAddress: CONTRACT_ADDRESS[network],
        note: "SDK routes this through GenLayer Router (0x0112Bf6e...), NOT directly to contract"
      });

      const txHash = await sendSerialTransaction(() =>
        client.writeContract({
          address: CONTRACT_ADDRESS[network] as `0x${string}`,
          functionName: "fix_contract",
          args: [safeIssues],
          value: 0n,
        })
      );

      // 🔴 AUDIT LOG: After txHash
      console.log("TX HASH:", txHash);
      logGL("FIX → TX SENT", { txHash });

      const fixReceipt = await client.waitForTransactionReceipt({
        hash: txHash,
        status: TransactionStatus.ACCEPTED,
      });

      // 🔴 AUDIT LOG: After receipt
      console.log("RECEIPT:", fixReceipt);
      await new Promise(resolve => setTimeout(resolve, 1200));
      logGL("FIX → TX ACCEPTED", { txHash });

      const readFn = getReadMethod("fix_contract");
      const resultStr = await client.readContract({
        address: CONTRACT_ADDRESS[network] as `0x${string}`,
        functionName: readFn,
        args: [],
      });
      logGL(`FIX → READ ${readFn}`, { rawLength: String(resultStr).length });
      timer.stop();
      showRawResult(String(resultStr), "FIX");

      let data;
      try {
        data = safeParseStrict(String(resultStr), "fix_contract");
        validateFixOutput(data);
      } catch {
        logGL("FIX → STRICT PARSE FAILED, using lenient", {});
        data = safeParseJSON(String(resultStr));
      }
      const aiSuggestions = (data.changes_made as string[]) || [];
      logGL("FIX → AI SUGGESTIONS", { count: aiSuggestions.length, suggestions: aiSuggestions });

      return {
        ...ruleFix,
        changes_made: [...ruleFix.changes_made, ...aiSuggestions.map((s: string) => `🤖 AI: ${s}`)],
        method: "rules+ai-onchain",
        execution: computeTrust("CLIENT_DETERMINISTIC"),
        aiSuggestions,
        aiExecution: { ...computeTrust("ONCHAIN_CONFIRMED"), txHash: String(txHash) },
      };
    } catch (err) {
      const failure = detectConsensusFailure(err);
      logGL("FIX → TX ERROR", { error: err instanceof Error ? err.message : err, failure });
      console.warn("On-chain fix failed:", err);
      logGL("FIX → FALLBACK to rules-only", { method: "ruleBasedFix" });
    }
  } else {
    logGL("FIX → CLIENT-ONLY (no wallet/contract)", { walletAddress });
  }

  return ruleFix;
}
