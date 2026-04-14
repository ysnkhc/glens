/**
 * GenLayer Analyzer Service — v2 ON-CHAIN FIRST
 *
 * Architecture (per GenLayer builder guidelines):
 * - ALL analysis (bug detection, risk scoring, prompt assessment) → ON-CHAIN via exec_prompt
 * - Frontend = thin UI layer that sends full source code and displays on-chain results
 * - Client-side fallback only used when no wallet is connected
 */

import { CONTRACT_ADDRESS, createWriteClient, getLastEvmTxHash, pollForReceipt, extractGenLayerTxId, pollConsensusStatus } from "./genlayer";
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
import { logGL, inspectPayload, createTxTimer, detectConsensusFailure, showRawResult, clearDebugLogs } from "./genlayer-debug";
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

/**
 * Detect if an error is a user wallet rejection.
 * When the user rejects a transaction, we must NOT fall back to
 * client-side analysis — that would make the app appear to work
 * locally when it should require on-chain execution.
 */
function isUserRejection(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("user rejected") ||
    msg.includes("user denied") ||
    msg.includes("rejected the request") ||
    msg.includes("user cancelled") ||
    msg.includes("user canceled") ||
    msg.includes("request rejected") ||
    msg.includes("action_rejected") ||
    msg.includes("user disapproved") ||
    msg.includes("transaction cancelled")
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function safeParseJSON(text: string): any {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    const lines = cleaned.split("\n");
    const filtered = lines.filter((l) => !l.trim().startsWith("```"));
    cleaned = filtered.join("\n").trim();
  }

  // If text has prose before JSON, extract the JSON portion
  if (!cleaned.startsWith("{")) {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }
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
    // Check if prompts are strictly constrained — if so, risk is LOW
    const dPrompts = extractPrompts(code);
    const hasStrict = dPrompts.some(isPromptConstrained);
    determinismRisk = hasStrict ? "LOW" : "MEDIUM";
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
    const OPEN_ENDED = /\b(describe|explain|tell me|what do you think|summarize in your own words|discuss|analyze in detail|write a paragraph|give your opinion|how would you|random|anything|interesting|creative)\b/i;
    const hasOpenEnded = prompts.some(p => OPEN_ENDED.test(p));

    // Strict output constraints ALWAYS override open-ended keywords.
    // e.g. "Return ONLY valid JSON... Input: {user_text}" is constrained despite containing dynamic text
    if (hasStrictConstraint) {
      consensusRisk = "LOW";
    } else if (hasOpenEnded) {
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
  const risk = scoreRisk(parsed, report, code);
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
  const beforeRisk = scoreRisk(beforeParsed, beforeReport, code);

  // After-fix analysis is already done inside fixer, but we need risk score
  const afterParsed = parseContract(result.fixedCode);
  const afterReport = runRules(afterParsed, result.fixedCode);
  const afterRisk = scoreRisk(afterParsed, afterReport, result.fixedCode);

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
  clearDebugLogs();
  logGL("ANALYZE → START", { codeLength: code.length, walletAddress: walletAddress?.slice(0, 10) + "..." });

  // ─── v2: On-chain first — send FULL source code to GenLayer AI ───
  if (isContractReady(walletAddress, network)) {
    try {
      const client = await createWriteClient(walletAddress!, network);
      const timer = createTxTimer("analyze_contract");

      // v2: Send full source code (up to 4KB) — the on-chain AI does ALL analysis
      const safeCode = code.slice(0, 4000);
      logGL("ANALYZE → TX START", { method: "analyze_contract", payloadLength: safeCode.length });

      let genLayerTxId: string | undefined;

      try {
        const txHash = await sendSerialTransaction(() =>
          client.writeContract({
            address: CONTRACT_ADDRESS[network] as `0x${string}`,
            functionName: "analyze_contract",
            args: [safeCode],
            value: 0n,
          })
        );
        genLayerTxId = String(txHash);
      } catch (writeErr) {
        if (isUserRejection(writeErr)) {
          throw new Error("Transaction cancelled. Please approve the wallet popup to continue.");
        }
        const writeMsg = writeErr instanceof Error ? writeErr.message : String(writeErr);
        const evmHash = getLastEvmTxHash();
        if (evmHash) {
          try {
            const receipt = await pollForReceipt(evmHash, 30000, network);
            genLayerTxId = extractGenLayerTxId(receipt) || undefined;
            if (!genLayerTxId) {
              throw new Error(`SDK bypass failed: no txId in receipt logs. SDK error: ${writeMsg}`);
            }
          } catch {
            throw new Error(`writeContract failed and recovery failed: ${writeMsg}`);
          }
        } else {
          throw new Error(`writeContract failed before submission: ${writeMsg}`);
        }
      }

      if (!genLayerTxId || genLayerTxId === "" || genLayerTxId === "0x") {
        throw new Error(`No valid GenLayer txId: "${genLayerTxId}"`);
      }

      logGL("TX submitted", { txId: genLayerTxId });
      logGL("ANALYZE → TX SENT", { genLayerTxId });

      const analyzePollResult = await pollConsensusStatus(
        genLayerTxId, client, undefined, undefined, network,
      );

      if (analyzePollResult.consensus !== "AGREED") {
        throw new Error(`On-chain analysis did not reach consensus (${analyzePollResult.consensus}).`);
      }

      const readFn = getReadMethod("analyze_contract");
      const resultStr = await client.readContract({
        address: CONTRACT_ADDRESS[network] as `0x${string}`,
        functionName: readFn,
        args: [],
      });
      logGL(`ANALYZE → READ ${readFn}`, { rawLength: String(resultStr).length });
      timer.stop();
      showRawResult(String(resultStr), "ANALYZE");

      // ─── v2: Parse comprehensive on-chain result ───
      let onchainResult: Record<string, unknown>;
      let validationOk = true;
      try {
        onchainResult = safeParseStrict(String(resultStr), "analyze_contract") as Record<string, unknown>;
        validationOk = validateAnalysisOutput(onchainResult as AIAnalysis);
      } catch {
        logGL("ANALYZE → STRICT PARSE FAILED, using lenient", {});
        onchainResult = safeParseJSON(String(resultStr));
        validationOk = false;
      }

      // ─── v2: Map on-chain JSON → AnalysisResult ───
      // The on-chain AI is the SOLE authority for risk, issues, warnings
      const riskLevel = mapRiskLevel(String(onchainResult.risk_level || "MEDIUM"));
      const issues = extractIssueMessages(onchainResult.issues);
      const warnings = extractIssueMessages(onchainResult.warnings);
      const suggestions = Array.isArray(onchainResult.fix_suggestions)
        ? (onchainResult.fix_suggestions as string[]).map(s => `🤖 ${s}`)
        : [];

      const aiAnalysis: AIAnalysis = {
        prompt_quality: String(onchainResult.prompt_quality || "N/A"),
        determinism_risk: String(onchainResult.determinism_risk || "MEDIUM"),
        consensus_risk: String(onchainResult.consensus_risk || "MEDIUM"),
        reasoning: String(onchainResult.reasoning || ""),
        fix_suggestions: Array.isArray(onchainResult.fix_suggestions) ? onchainResult.fix_suggestions as string[] : [],
      };

      // Minimal core — on-chain AI is the authority, not client-side detection
      const parsed = parseContract(code);
      const core = computeAnalysisCore(parsed);
      const execution = { ...computeTrust("ONCHAIN_CONFIRMED", validationOk), txHash: genLayerTxId };

      logGL("ANALYZE → RESULT", { riskLevel, source: "ONCHAIN_CONFIRMED", issues: issues.length, warnings: warnings.length });
      return {
        risk_level: riskLevel,
        issues,
        warnings,
        suggestions,
        ai_analysis: aiAnalysis,
        analysisSource: "ai_onchain",
        core,
        execution,
      };
    } catch (err) {
      if (isUserRejection(err)) {
        logGL("ANALYZE → USER REJECTED TX", {});
        throw new Error("Transaction cancelled. Please approve the wallet popup to continue.");
      }
      const failure = detectConsensusFailure(err);
      logGL("ANALYZE → TX ERROR", { error: err instanceof Error ? err.message : err, failure });
      // On-chain failed — fall through to client-side (logged above via logGL)
      // Fall through to client fallback below
    }
  }

  // ─── Fallback: Client-only (no wallet connected or on-chain failed) ───
  logGL("ANALYZE → CLIENT FALLBACK", { walletAddress });
  const parsed = parseContract(code);
  const report = runRules(parsed, code);
  const riskLevel = scoreRisk(parsed, report, code);
  const core = computeAnalysisCore(parsed);
  const aiAnalysis = deriveHeuristicAnalysis(code, parsed, core, report);
  const execution = computeTrust("CLIENT_FALLBACK");

  return {
    risk_level: riskLevel,
    issues: [...report.issueMessages],
    warnings: [...report.warningMessages],
    suggestions: [...report.suggestions],
    ai_analysis: aiAnalysis,
    analysisSource: "heuristic_client",
    core,
    execution,
  };
}

/** Map on-chain risk string to typed risk level */
function mapRiskLevel(raw: string): "LOW" | "MEDIUM" | "HIGH" {
  const upper = raw.toUpperCase().trim();
  if (upper === "LOW") return "LOW";
  if (upper === "HIGH" || upper === "CRITICAL") return "HIGH";
  return "MEDIUM";
}

/** Extract human-readable messages from on-chain issues/warnings array */
function extractIssueMessages(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  return arr.map((item: unknown) => {
    if (typeof item === "string") return item;
    if (item && typeof item === "object") {
      const obj = item as Record<string, unknown>;
      const line = obj.line ? `Line ${obj.line}: ` : "";
      const severity = obj.severity === "ERROR" ? "❌" : "⚠️";
      return `${line}${severity} ${obj.message || obj.rule || "Unknown issue"}`;
    }
    return String(item);
  });
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
    const client = await createWriteClient(walletAddress!, network);
    // v2: Send full source code — the on-chain AI explains the contract
    const safeCode = code.slice(0, 4000);

    const timer = createTxTimer("explain_contract");
    logGL("EXPLAIN → TX START", { method: "explain_contract", payloadLength: safeCode.length });

    const txHash = await sendSerialTransaction(() =>
      client.writeContract({
        address: CONTRACT_ADDRESS[network] as `0x${string}`,
        functionName: "explain_contract",
        args: [safeCode],
        value: 0n,
      })
    );

    // 🔴 AUDIT LOG: After txHash
    logGL("TX submitted", { txId: String(txHash) });
    logGL("EXPLAIN → TX SENT", { txHash });

    // Fix #7: Use pollConsensusStatus — SDK's waitForTransactionReceipt misses FINALIZED
    const explainPollResult = await pollConsensusStatus(
      String(txHash),
      client,
      undefined,
      undefined,
      network,
    );

    if (explainPollResult.consensus !== "AGREED") {
      throw new Error(`Explain did not reach consensus (${explainPollResult.consensus}).`);
    }
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
    // ─── GUARD: User rejected → DO NOT fallback ───
    if (isUserRejection(err)) {
      logGL("EXPLAIN → USER REJECTED TX", {});
      throw new Error("Transaction cancelled. Please approve the wallet popup to continue.");
    }
    const failure = detectConsensusFailure(err);
    logGL("EXPLAIN → TX ERROR", { error: err instanceof Error ? err.message : err, failure });
    // On-chain explain failed — fall through to client-side (logged above via logGL)
    logGL("EXPLAIN → FALLBACK to client-side", { method: "generateExplanation" });
    return { text: generateExplanation(code), execution: computeTrust("CLIENT_FALLBACK") };
  }
}

// ─── Base64 Decoder ─────────────────────────────────────────────
// GenLayer encodes validator results as base64 strings.
// The raw bytes may have leading control/length bytes that need stripping.
function decodeBase64Safe(b64: string): string {
  try {
    const raw = atob(b64);
    // Strip leading non-printable bytes (length prefixes, etc.)
    let start = 0;
    while (start < raw.length && raw.charCodeAt(start) < 32) start++;
    const decoded = raw.slice(start).trim();
    return decoded || raw.trim();
  } catch {
    return b64; // Not valid base64, return as-is
  }
}

// ─── Validator Output Extraction ──────────────────────────────────
// Extract real validator outputs from GenLayer transaction data.
// The eq_blocks_outputs field contains each validator's exec_prompt result.

type ValidatorEntry = {
  id: string;
  name: string;
  style: string;
  output: string;
  temperature: number;
  reason?: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractValidatorOutputs(txData: any): ValidatorEntry[] {
  if (!txData) return [];

  const validators: ValidatorEntry[] = [];

  try {
    // ─── Source 1: eq_blocks_outputs ───
    // Contains the outputs from each validator's eq_principle execution
    const eqOutputs = txData.eq_blocks_outputs || txData.eqBlocksOutputs;
    if (eqOutputs && typeof eqOutputs === "object") {
      const sample = Array.isArray(eqOutputs) 
        ? JSON.stringify(eqOutputs.slice(0, 2)).slice(0, 800)
        : JSON.stringify(eqOutputs).slice(0, 800);
      logGL("SIMULATE → RAW eq_blocks_outputs", { 
        type: typeof eqOutputs, isArray: Array.isArray(eqOutputs), 
        length: Array.isArray(eqOutputs) ? eqOutputs.length : Object.keys(eqOutputs).length,
        keys: Object.keys(eqOutputs).slice(0, 10),
        sample,
      });

      // Handle array format: [{output: "...", ...}, ...]
      if (Array.isArray(eqOutputs)) {
        for (let i = 0; i < eqOutputs.length; i++) {
          const entry = eqOutputs[i];
          if (entry && typeof entry === "object") {
            // Each entry might have: output, result, vote, leader, validator_address, etc.
            const output = String(entry.output || entry.result || entry.vote || entry.value || JSON.stringify(entry));
            validators.push({
              id: entry.validator_address || entry.address || `validator-${i + 1}`,
              name: entry.validator_address ? `${String(entry.validator_address).slice(0, 6)}...${String(entry.validator_address).slice(-4)}` : `Validator ${i + 1}`,
              style: entry.model || entry.llm_model || "GenLayer LLM",
              output: output.slice(0, 200),
              temperature: entry.temperature ?? 0.7,
              reason: entry.reason || undefined,
            });
          } else if (typeof entry === "string") {
            validators.push({
              id: `validator-${i + 1}`,
              name: `Validator ${i + 1}`,
              style: "GenLayer LLM",
              output: entry.slice(0, 200),
              temperature: 0.7,
            });
          }
        }
      }
      // Handle object format: { "0": {...}, "1": {...} } or { "block_0": [...] }
      else {
        const keys = Object.keys(eqOutputs);
        for (let i = 0; i < keys.length; i++) {
          const val = eqOutputs[keys[i]];
          if (Array.isArray(val)) {
            // Nested arrays: each block might have sub-outputs
            for (let j = 0; j < val.length; j++) {
              const subVal = val[j];
              const output = typeof subVal === "string" ? subVal : String(subVal?.output || subVal?.result || JSON.stringify(subVal));
              validators.push({
                id: `validator-${validators.length + 1}`,
                name: `Validator ${validators.length + 1}`,
                style: "GenLayer LLM",
                output: output.slice(0, 200),
                temperature: 0.7,
              });
            }
          } else if (typeof val === "string") {
            validators.push({
              id: `validator-${i + 1}`,
              name: `Validator ${i + 1}`,
              style: "GenLayer LLM",
              output: val.slice(0, 200),
              temperature: 0.7,
            });
          }
        }
      }
    }

    // ─── Source 2: consensus_data ───
    // May contain vote records with validator outputs
    const consensusData = txData.consensus_data || txData.consensusData;
    if (validators.length === 0 && consensusData) {
      logGL("SIMULATE → RAW consensus_data", { type: typeof consensusData, keys: typeof consensusData === "object" ? Object.keys(consensusData).slice(0, 10) : [] });

      if (typeof consensusData === "object" && !Array.isArray(consensusData)) {
        const votes = consensusData.votes;            // {address: "agree"|"disagree"}
        const validatorsList = consensusData.validators; // [{mode, vote, result, node_config}]
        const leaderReceipt = consensusData.leader_receipt; // [{mode: "leader", result: {payload}}]

        // ─── Extract leader from leader_receipt ───
        if (Array.isArray(leaderReceipt)) {
          for (const lr of leaderReceipt) {
            if (lr && typeof lr === "object") {
              const addr = lr.node_config?.address || "";
              const model = lr.node_config?.primary_model?.model || "GenLayer LLM";
              const vote = lr.vote || "leader";
              // Decode result: {raw (base64), status, payload}
              let output = "";
              if (lr.result && typeof lr.result === "object") {
                output = lr.result.payload || lr.result.status || "";
              } else if (typeof lr.result === "string") {
                output = decodeBase64Safe(lr.result);
              }
              const voteFromMap = votes && typeof votes === "object" ? (votes as Record<string, string>)[addr] : undefined;
              validators.push({
                id: addr || "leader",
                name: addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "Leader",
                style: model.split("/").pop() || model,
                output: output || vote || "executed",
                temperature: 0.7,
                reason: voteFromMap ? `vote: ${voteFromMap}` : "leader",
              });
            }
          }
        }

        // ─── Extract validators from validators array ───
        if (Array.isArray(validatorsList)) {
          for (const v of validatorsList) {
            if (v && typeof v === "object") {
              const addr = v.node_config?.address || "";
              const model = v.node_config?.primary_model?.model || "GenLayer LLM";
              const vote = v.vote || "";
              // Decode result (base64 string)
              let output = "";
              if (typeof v.result === "string") {
                output = decodeBase64Safe(v.result);
              } else if (v.result && typeof v.result === "object") {
                output = v.result.payload || v.result.status || "";
              }
              const voteFromMap = votes && typeof votes === "object" ? (votes as Record<string, string>)[addr] : undefined;
              validators.push({
                id: addr || `validator-${validators.length + 1}`,
                name: addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : `Validator ${validators.length + 1}`,
                style: model.split("/").pop() || model,
                output: output || vote || "executed",
                temperature: 0.7,
                reason: `vote: ${voteFromMap || vote}`,
              });
            }
          }
        }

        // ─── Fallback: If we only have votes map, extract from that ───
        if (validators.length === 0 && votes && typeof votes === "object" && !Array.isArray(votes)) {
          const voteEntries = Object.entries(votes as Record<string, string>);
          for (let i = 0; i < voteEntries.length; i++) {
            const [addr, vote] = voteEntries[i];
            validators.push({
              id: addr,
              name: `${addr.slice(0, 6)}...${addr.slice(-4)}`,
              style: "GenLayer LLM",
              output: String(vote),
              temperature: 0.7,
            });
          }
        }
      }
    }

    // ─── Source 4: Bradbury-specific fields ───
    // Bradbury uses consumedValidators (address list) + result + lastRound
    if (validators.length === 0) {
      const consumed = txData.consumedValidators;
      const result = txData.result;
      const lastRound = txData.lastRound;
      
      // Log all available Bradbury data for debugging
      if (consumed || lastRound) {
        logGL("SIMULATE → BRADBURY DATA", {
          consumedValidators: consumed ? JSON.stringify(consumed).slice(0, 500) : "null",
          result: String(result || ""),
          lastRound: lastRound ? JSON.stringify(lastRound).slice(0, 500) : "null",
          numOfRounds: txData.numOfRounds,
          txExecutionResult: txData.txExecutionResult,
        });
      }

      // consumedValidators is an array of addresses
      if (Array.isArray(consumed) && consumed.length > 0) {
        const resultStr = typeof result === "string" ? result : String(result || "");
        for (let i = 0; i < consumed.length; i++) {
          const addr = consumed[i];
          if (typeof addr === "string" && addr.startsWith("0x")) {
            validators.push({
              id: addr,
              name: `${addr.slice(0, 6)}...${addr.slice(-4)}`,
              style: "Bradbury Validator",
              output: resultStr || "executed",
              temperature: 0.7,
              reason: i === 0 ? "leader" : "vote: agree",
            });
          }
        }
      }
    }

    if (validators.length > 0) {
      logGL("SIMULATE → VALIDATORS EXTRACTED", { count: validators.length, outputs: validators.map(v => v.output.slice(0, 50)) });
    } else {
      logGL("SIMULATE → NO VALIDATOR DATA FOUND", { 
        availableKeys: Object.keys(txData).filter(k => txData[k] !== null && txData[k] !== "" && txData[k] !== undefined).slice(0, 20),
        eqBlocksOutputs_raw: txData.eqBlocksOutputs ? JSON.stringify(txData.eqBlocksOutputs).slice(0, 300) : "null",
      });
    }
  } catch (err) {
    console.warn("Failed to extract validator outputs:", err);
  }

  return validators;
}

function computeAgreementRate(validators: ValidatorEntry[]): number {
  if (validators.length === 0) return 0;
  const outputs = validators.map(v => v.output.trim().toUpperCase());
  const counts: Record<string, number> = {};
  for (const o of outputs) {
    counts[o] = (counts[o] || 0) + 1;
  }
  const maxCount = Math.max(...Object.values(counts));
  return maxCount / validators.length;
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
  const client = await createWriteClient(walletAddress!, network);
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

  // Fix #1 (CRITICAL): Send the REAL prompt to validators — not a hardcoded "say YES".
  // The non-deterministic pre-filter above already blocks obviously bad prompts.
  // Constrained prompts (YES/NO, single word, decimal number) will AGREE.
  // Open-ended prompts will DISAGREE — which is the correct, honest result.
  logGL("SIMULATE → TX START", { method: "simulate_consensus", promptLength: safePrompt.length });





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
          args: [safePrompt],
          value: 0n,
          validUntil,
        })
      );
      genLayerTxId = txHash;
    } catch (writeErr) {
      // ─── GUARD: User rejected → surface immediately, no recovery ───
      if (isUserRejection(writeErr)) {
        logGL("SIMULATE → USER REJECTED TX", {});
        throw new Error("Transaction cancelled. Please approve the wallet popup to continue.");
      }
      const writeMsg = writeErr instanceof Error ? writeErr.message : String(writeErr);

      // ─── SDK BYPASS: Recover txId from EVM receipt ─────────
      const evmHash = getLastEvmTxHash();
      if (evmHash) {
        try {
          const receipt = await pollForReceipt(evmHash, 30000, network);
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
      network,
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

    // ─── v2: Extract real validator data from on-chain transaction ───
    const realValidators = extractValidatorOutputs(consensusResult.data);

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
        // Fix #9: Fall back to resultName when read returns empty
        if (!rawVerdict && consensusResult.resultName) {
          rawVerdict = consensusResult.resultName;
        }
        showRawResult(rawVerdict, "SIMULATE");
      } catch (readErr) {
        console.warn("Read after consensus failed:", readErr);
        rawVerdict = consensusResult.resultName || "AGREED";
      }

      return {
        validators: realValidators,
        consensus: "AGREED",
        confidence: 1.0,
        agreement_rate: realValidators.length > 0 ? 1.0 : 1.0,
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
        validators: realValidators,
        consensus: "DISAGREED",
        confidence: 0,
        agreement_rate: realValidators.length > 0 ? computeAgreementRate(realValidators) : 0,
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

    // ─── GUARD: User rejected → re-throw, never show fake results ───
    if (isUserRejection(err)) {
      throw new Error("Transaction cancelled. Please approve the wallet popup to continue.");
    }
    // Also catch the re-thrown message from the inner catch
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.includes("Transaction cancelled")) {
      throw err;
    }

    const durationMs = Date.now() - startTime;
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

  // Optionally enhance with on-chain AI suggestions (category-based)
  if (isContractReady(walletAddress, network)) {
    try {
      const client = await createWriteClient(walletAddress!, network);
      // v5: Send source code + analysis summary for smarter AI suggestions
      const safeCode = code.slice(0, 4000);
      // Build analysis summary from the rule engine for AI context
      const analysisSummary = [
        `Issues: ${report.issues.map(i => i.message).join("; ")}`,
        `Warnings: ${report.warnings.map(w => w.message).join("; ")}`,
        `Risk: ${scoreRisk(parsed, report, code)}`,
      ].join("\n").slice(0, 1000);

      const timer = createTxTimer("fix_contract");
      logGL("FIX → TX START", { method: "fix_contract", payloadLength: safeCode.length, analysisSummaryLength: analysisSummary.length });

      const txHash = await sendSerialTransaction(() =>
        client.writeContract({
          address: CONTRACT_ADDRESS[network] as `0x${string}`,
          functionName: "fix_contract",
          args: [safeCode, analysisSummary],
          value: 0n,
        })
      );

      // 🔴 AUDIT LOG: After txHash
      logGL("TX submitted", { txId: String(txHash) });
      logGL("FIX → TX SENT", { txHash });

      // Fix #7: Use pollConsensusStatus — SDK's waitForTransactionReceipt misses FINALIZED
      const fixPollResult = await pollConsensusStatus(
        String(txHash),
        client,
        undefined,
        undefined,
        network,
      );

      if (fixPollResult.consensus !== "AGREED") {
        throw new Error(`Fix did not reach consensus (${fixPollResult.consensus}).`);
      }
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
      } catch {
        logGL("FIX → STRICT PARSE FAILED, using lenient", {});
        data = safeParseJSON(String(resultStr));
      }

      // ─── v6: AI returns minimal fix categories (category + severity only) ───
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const aiCategories: Array<{category: string; severity: string}> = Array.isArray(data.fixes) ? data.fixes : [];

      logGL("FIX → AI CATEGORIES", {
        categoryCount: aiCategories.length,
        categories: aiCategories.map(c => c.category),
      });

      if (aiCategories.length > 0) {
        // Merge AI insights into the rule fix — AI adds context, rules apply code changes
        const aiInsights: string[] = aiCategories
          .map(c => `🤖 AI [${c.severity}]: ${c.category}`);

        return {
          ...ruleFix,
          changes_made: [
            ...ruleFix.changes_made.filter(c => !c.startsWith("✅ Contract is already")),
            ...aiInsights,
          ],
          method: "rules+ai-categories",
          execution: computeTrust("CLIENT_DETERMINISTIC"),
          aiSuggestions: aiInsights,
          aiExecution: { ...computeTrust("ONCHAIN_CONFIRMED"), txHash: String(txHash) },
        };
      }

      // No useful AI data — just use rule fix
      logGL("FIX → AI RETURNED NO CATEGORIES, using rules", {});
      return {
        ...ruleFix,
        method: "rules+ai-attempted",
        aiExecution: { ...computeTrust("ONCHAIN_CONFIRMED"), txHash: String(txHash) },
      };
    } catch (err) {
      // ─── GUARD: User rejected → DO NOT fallback ───
      if (isUserRejection(err)) {
        logGL("FIX → USER REJECTED TX", {});
        throw new Error("Transaction cancelled. Please approve the wallet popup to continue.");
      }
      const failure = detectConsensusFailure(err);
      logGL("FIX → TX ERROR", { error: err instanceof Error ? err.message : err, failure });
      // On-chain fix failed — fall through to rules-only (logged above via logGL)
      logGL("FIX → FALLBACK to rules-only", { method: "ruleBasedFix" });
    }
  } else {
    logGL("FIX → CLIENT-ONLY (no wallet/contract)", { walletAddress });
  }

  return ruleFix;
}
