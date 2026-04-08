/**
 * 🔒 GenLayer Contract Interface — Strict Compatibility Layer
 *
 * Enforces:
 * - Exact argument count per contract method
 * - Payload size limits matching contract truncation
 * - Correct read function per write method
 * - Strict JSON parsing for AI responses
 * - Consensus output validation
 * - Fixed code compliance validation
 *
 * NO CONTRACT CALL WITHOUT:
 * - arg validation
 * - payload inspection
 * - result validation
 * OTHERWISE → BLOCK EXECUTION
 */

import { logGL } from "./genlayer-debug";

// ─── Contract Method Map ───────────────────────────────────────

export interface ContractMethodSpec {
  args: string[];
  maxPayload: number;
  readMethod: string;
  returns: "json" | "text" | "word";
}

/**
 * Canonical interface map — matches deployed ai_debugger.py EXACTLY.
 *
 * Contract address is defined in genlayer.ts (CONTRACT_ADDRESS).
 * Network: GenLayer Testnet Bradbury
 * Router: 0x0112Bf6e83497965A5fdD6Dad1E447a6E004271D (consensusMainContract)
 */
export const CONTRACT_METHODS: Record<string, ContractMethodSpec> = {
  analyze_contract: {
    args: ["summary"],
    maxPayload: 500,     // contract does summary[:500]
    readMethod: "get_last_analysis",
    returns: "json",
  },
  explain_contract: {
    args: ["summary"],
    maxPayload: 500,     // contract does summary[:500]
    readMethod: "get_last_explanation",
    returns: "text",
  },
  simulate_consensus: {
    args: ["prompt_text"],
    maxPayload: 300,     // contract does prompt_text[:300]
    readMethod: "get_last_simulation",
    returns: "word",     // returns "GOOD" or "BAD"
  },
  fix_contract: {
    args: ["issues"],
    maxPayload: 400,     // contract does issues[:400]
    readMethod: "get_last_analysis",
    returns: "json",
  },
};

// ─── Arg Validation ────────────────────────────────────────────

/**
 * Validates that args match the expected contract method signature.
 * Throws if mismatch — prevents invalid TX submission.
 */
export function validateArgs(method: string, args: unknown[]): void {
  const spec = CONTRACT_METHODS[method];
  if (!spec) {
    throw new Error(`❌ Unknown contract method: ${method}`);
  }

  if (args.length !== spec.args.length) {
    throw new Error(
      `❌ Invalid args for ${method}. Expected ${spec.args.length} (${spec.args.join(", ")}), got ${args.length}`
    );
  }

  // Validate each arg is a string and within payload limit
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (typeof arg !== "string") {
      throw new Error(
        `❌ Arg[${i}] (${spec.args[i]}) for ${method} must be a string, got ${typeof arg}`
      );
    }
    if (arg.length > spec.maxPayload) {
      logGL(`WARN: ${method} arg[${i}] truncated`, {
        original: arg.length,
        max: spec.maxPayload,
        truncatedTo: spec.maxPayload,
      });
    }
  }

  logGL(`VALIDATED args for ${method}`, {
    method,
    argCount: args.length,
    argLengths: args.map((a) => (typeof a === "string" ? a.length : "?")),
    maxPayload: spec.maxPayload,
  });
}

/**
 * Get the correct read method for a write method.
 */
export function getReadMethod(writeMethod: string): string {
  const spec = CONTRACT_METHODS[writeMethod];
  if (!spec) {
    throw new Error(`❌ Unknown contract method: ${writeMethod}`);
  }
  return spec.readMethod;
}

/**
 * Truncate payload to contract's safe limit.
 */
export function truncatePayload(method: string, payload: string): string {
  const spec = CONTRACT_METHODS[method];
  if (!spec) return payload;
  return payload.slice(0, spec.maxPayload);
}

// ─── Strict JSON Parsing ───────────────────────────────────────

/**
 * Extract the JSON object from a string that may contain prose/markdown around it.
 * AI models sometimes prepend explanatory text before the JSON.
 */
function extractJSONFromText(str: string): string {
  let cleaned = str.trim();

  // Strip markdown code fences if present
  if (cleaned.startsWith("```")) {
    const lines = cleaned.split("\n");
    const filtered = lines.filter((l) => !l.trim().startsWith("```"));
    cleaned = filtered.join("\n").trim();
  }

  // If it already starts with '{', return as-is
  if (cleaned.startsWith("{")) return cleaned;

  // AI sometimes prepends explanatory text before the JSON.
  // Find the first '{' and last '}' to extract the JSON object.
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return cleaned.slice(firstBrace, lastBrace + 1);
  }

  return cleaned;
}

/**
 * Strict JSON parser — rejects non-object results.
 * Used for AI responses that MUST return valid JSON objects.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function safeParseStrict(str: string, context: string = "result"): Record<string, any> {
  const cleaned = extractJSONFromText(str);

  try {
    const parsed = JSON.parse(cleaned);

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      logGL(`STRICT PARSE FAIL [${context}]`, { reason: "Not a JSON object", type: typeof parsed, raw: cleaned.slice(0, 200) });
      throw new Error(`Invalid JSON structure for ${context}: expected object, got ${typeof parsed}`);
    }

    logGL(`STRICT PARSE OK [${context}]`, { keys: Object.keys(parsed) });
    return parsed;
  } catch (e) {
    if (e instanceof SyntaxError) {
      logGL(`STRICT PARSE FAIL [${context}]`, { reason: "Invalid JSON syntax", raw: cleaned.slice(0, 200) });
      throw new Error(`❌ Invalid AI JSON response for ${context} — consensus unsafe: ${e.message}`);
    }
    throw e;
  }
}

// ─── Consensus Output Validation ───────────────────────────────

/**
 * Validates AI analysis output has required fields.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function validateAnalysisOutput(result: any): boolean {
  if (!result || typeof result !== "object") {
    logGL("VALIDATION FAIL: Analysis output", { reason: "Not an object", result });
    return false;
  }

  const requiredFields = ["prompt_quality", "determinism_risk", "consensus_risk", "reasoning"];
  const missing = requiredFields.filter((f) => !(f in result));

  if (missing.length > 0) {
    logGL("VALIDATION WARN: Analysis output missing fields", { missing, hasFields: Object.keys(result) });
    return false;
  }

  logGL("VALIDATION OK: Analysis output", { fields: Object.keys(result) });
  return true;
}

/**
 * Validates simulate_consensus output is exactly "GOOD" or "BAD".
 */
export function validateSimulationVerdict(verdict: string): boolean {
  const normalized = verdict.trim().toUpperCase();
  const valid = normalized === "GOOD" || normalized === "BAD";

  if (!valid) {
    logGL("VALIDATION FAIL: Simulation verdict", { verdict, normalized, expected: "GOOD or BAD" });
  } else {
    logGL("VALIDATION OK: Simulation verdict", { verdict: normalized });
  }

  return valid;
}

/**
 * Validates fix_contract output has changes_made array.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function validateFixOutput(result: any): boolean {
  if (!result || typeof result !== "object") {
    logGL("VALIDATION FAIL: Fix output", { reason: "Not an object" });
    return false;
  }

  if (!Array.isArray(result.changes_made)) {
    logGL("VALIDATION WARN: Fix output missing changes_made array", { hasFields: Object.keys(result) });
    return false;
  }

  logGL("VALIDATION OK: Fix output", { changeCount: result.changes_made.length });
  return true;
}

// ─── Fixed Code Compliance Validation ──────────────────────────

export interface ComplianceResult {
  valid: boolean;
  missing: string[];
  warnings: string[];
}

/**
 * Validates that fixed code meets GenLayer minimum compliance.
 * Does NOT require gl.nondet.exec_prompt — not all contracts use AI.
 */
export function validateFixedCode(code: string): ComplianceResult {
  const missing: string[] = [];
  const warnings: string[] = [];

  // Required: genlayer import
  if (!code.includes("from genlayer import")) {
    missing.push("from genlayer import *");
  }

  // Required: gl.Contract inheritance
  if (!code.includes("gl.Contract") && !code.includes("(Contract)")) {
    missing.push("gl.Contract inheritance");
  }

  // Required: at least one public decorator
  if (!code.includes("@gl.public")) {
    missing.push("@gl.public decorator");
  }

  // Warning: uses gl.exec_prompt (wrong API)
  if (code.includes("gl.exec_prompt") && !code.includes("gl.nondet.exec_prompt")) {
    warnings.push("Uses gl.exec_prompt (should be gl.nondet.exec_prompt)");
  }

  // Warning: AI without eq_principle
  if (code.includes("exec_prompt") && !code.includes("eq_principle")) {
    warnings.push("AI calls without gl.eq_principle wrapping");
  }

  // Warning: dangerous imports (skip comment lines)
  const hasRealImport = code.split("\n").some(line => {
    const t = line.trim();
    if (t.startsWith("#")) return false; // skip comments
    return t === "import requests" || /^from\s+requests\s+import/.test(t);
  });
  if (hasRealImport) {
    warnings.push("Forbidden import: requests (use gl.nondet.web)");
  }

  const valid = missing.length === 0;

  logGL("FIXED CODE VALIDATION", { valid, missing, warnings });

  return { valid, missing, warnings };
}

// ─── Flow Summary ──────────────────────────────────────────────

import type { DebugLogEntry } from "./genlayer-debug";

export interface FlowSummary {
  txStarted: number;
  txSent: number;
  txFinalized: number;
  txErrors: number;
  consensusFailures: number;
  fallbacks: number;
  reads: number;
  clientOnly: number;
}

/**
 * Summarizes debug logs into a flow report.
 */
export function summarizeFlow(logs: DebugLogEntry[]): FlowSummary {
  return {
    txStarted: logs.filter((l) => l.category === "TX_START").length,
    txSent: logs.filter((l) => l.category === "TX_SENT").length,
    txFinalized: logs.filter((l) => l.category === "TX_FINALIZED").length,
    txErrors: logs.filter((l) => l.category === "TX_ERROR").length,
    consensusFailures: logs.filter((l) => l.category === "CONSENSUS_FAIL").length,
    fallbacks: logs.filter((l) => l.category === "FALLBACK").length,
    reads: logs.filter((l) => l.category === "TX_READ").length,
    clientOnly: logs.filter((l) => l.category === "CLIENT").length,
  };
}
