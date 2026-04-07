/**
 * GenLayer Analysis Core — DERIVED from ParseResult (Single Source of Truth)
 *
 * All detection flags are now computed FROM parser.ts output.
 * No independent code scanning — parser.ts is the canonical source.
 */

import type { ParseResult } from "./parser";

export interface AnalysisCore {
  hasAI: boolean;
  usesEqPrinciple: boolean;
  hasExternalCalls: boolean;
  hasDangerousExternals: boolean;
  isValidContract: boolean;
  usesCorrectExecPrompt: boolean;
  usesWrongExecPrompt: boolean;
  hasGenlayerImport: boolean;
  contractClassName: string | null;
}

/** Correct GenLayer exec_prompt API */
const CORRECT_EXEC = "gl.nondet.exec_prompt";

/** Wrong exec_prompt that must be replaced */
const WRONG_EXEC = "gl.exec_prompt";

/** Dangerous external patterns — anything NOT going through gl.nondet.web */
const DANGEROUS_EXTERNALS = new Set([
  "requests.get",
  "requests.post",
  "requests.put",
  "requests.delete",
  "requests.patch",
  "urllib",
  "http.client",
  "httpx",
  "aiohttp",
  "fetch(",
]);

/**
 * Derive AnalysisCore from ParseResult — the ONLY way to get these flags.
 */
export function computeAnalysisCore(parsed: ParseResult): AnalysisCore {
  // AI detection: derived from parser's aiUsages
  const aiCalls = parsed.aiUsages.map((u) => u.call);

  const usesCorrectExecPrompt = aiCalls.some((c) => c === CORRECT_EXEC || c.includes("gl.nondet.exec_prompt"));
  const usesWrongExecPrompt = aiCalls.some(
    (c) => c === WRONG_EXEC || (c === "gl.exec_prompt" && !c.includes("nondet"))
  );
  const hasBareExecPrompt = aiCalls.some(
    (c) => c === "exec_prompt"
  );

  // Parser detects eq_principle, prompt_string, llm, completion as AI too
  const hasAI = parsed.aiUsages.length > 0;
  const usesEqPrinciple = parsed.usesEqPrinciple;

  // External calls: derived from parser's externalCalls
  const externalCallNames = parsed.externalCalls.map((c) => c.call);

  const hasDangerousExternals = externalCallNames.some((c) =>
    DANGEROUS_EXTERNALS.has(c)
  );

  const hasExternalCalls = parsed.externalCalls.length > 0;

  // Contract validity: from parser
  const isValidContract = !!parsed.contractClassName;
  const contractClassName = parsed.contractClassName;

  // Import check: from parser
  const hasGenlayerImport = parsed.imports.some((imp) =>
    imp.includes("genlayer")
  );

  return {
    hasAI,
    usesEqPrinciple,
    hasExternalCalls,
    hasDangerousExternals,
    isValidContract,
    usesCorrectExecPrompt: usesCorrectExecPrompt || false,
    usesWrongExecPrompt: usesWrongExecPrompt || false,
    hasGenlayerImport,
    contractClassName,
  };
}

/**
 * Risk score values for improvement calculation.
 */
export const RISK_SCORES: Record<string, number> = {
  LOW: 90,
  MEDIUM: 60,
  HIGH: 30,
  CRITICAL: 10,
};

/**
 * Compute improvement between before/after risk levels.
 */
export function computeImprovement(
  beforeRisk: string,
  afterRisk: string
): { before: number; after: number; delta: number; improved: boolean } {
  const before = RISK_SCORES[beforeRisk] ?? 0;
  const after = RISK_SCORES[afterRisk] ?? 0;
  return {
    before,
    after,
    delta: after - before,
    improved: after > before,
  };
}
