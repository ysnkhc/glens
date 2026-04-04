/**
 * 🧠 GenLayer Consensus Predictor Engine
 *
 * Predicts probability of consensus success BEFORE sending a transaction.
 * Transforms the debugger from reactive → predictive.
 *
 * 100% client-side — NO blockchain calls.
 * Uses: parsed contract structure, prompt analysis, pattern matching.
 */

import { parseContract } from "./parser";
import { computeAnalysisCore } from "./analysis-core";

// ─── Types ─────────────────────────────────────────────────────

export type ConfidenceBand = "LOW_CONFIDENCE" | "UNCERTAIN" | "LIKELY_STABLE";

export interface ConsensusPrediction {
  willPass: boolean;
  band: ConfidenceBand;
  risk: "LOW" | "MEDIUM" | "HIGH";
  issues: string[];
  suggestions: string[];
  factors: PredictionFactor[];
}

export interface PredictionFactor {
  name: string;
  impact: number;  // negative = bad, positive = good
  status: "pass" | "warn" | "fail";
  detail: string;
}

// ─── Prompt Utilities (shared module) ──────────────────────────
import { extractPrompts } from "./prompt-utils";


// ─── Constraint Keywords ───────────────────────────────────────

const STRICT_OUTPUT_KEYWORDS = [
  "ONLY", "EXACT", "EXACTLY", "MUST RETURN", "RETURN ONLY",
  "one word", "single word", "JSON only", "valid JSON",
  "GOOD or BAD", "YES or NO", "TRUE or FALSE",
  "POSITIVE, NEGATIVE, or NEUTRAL",
];

const NORMALIZATION_KEYWORDS = [
  "uppercase", "lowercase", "no punctuation", "no period",
  "no trailing", "strip", "trim", "normalize",
  "no whitespace", "single line",
];

const AMBIGUITY_KEYWORDS = [
  "describe", "explain", "tell me", "what do you think",
  "summarize", "discuss", "analyze in detail", "write a paragraph",
  "give your opinion", "how would you",
];

// ─── Core Predictor ────────────────────────────────────────────

export function predictConsensus(code: string): ConsensusPrediction {
  const parsed = parseContract(code);
  const core = computeAnalysisCore(parsed);
  const prompts = extractPrompts(code);

  const issues: string[] = [];
  const suggestions: string[] = [];
  const factors: PredictionFactor[] = [];

  let score = 1.0;

  // ─── Factor 1: eq_principle usage (CRITICAL) ─────────────────

  if (core.hasAI) {
    if (core.usesEqPrinciple) {
      factors.push({
        name: "eq_principle",
        impact: 0,
        status: "pass",
        detail: "AI calls wrapped with gl.eq_principle",
      });
    } else {
      score -= 0.5;
      issues.push("Missing gl.eq_principle — validators WILL disagree");
      suggestions.push("Wrap ALL AI calls with gl.eq_principle(lambda: ..., task=..., criteria=...)");
      factors.push({
        name: "eq_principle",
        impact: -0.5,
        status: "fail",
        detail: "AI calls NOT wrapped — consensus impossible",
      });
    }
  } else {
    // No AI = fully deterministic = perfect consensus
    factors.push({
      name: "deterministic",
      impact: 0.1,
      status: "pass",
      detail: "No AI calls — fully deterministic contract",
    });
    score = Math.min(1, score + 0.1);
  }

  // ─── Factor 2: Correct API (gl.nondet.exec_prompt) ──────────

  if (core.usesWrongExecPrompt) {
    score -= 0.3;
    issues.push("Uses gl.exec_prompt (does not exist) — TX will revert");
    suggestions.push("Replace gl.exec_prompt with gl.nondet.exec_prompt");
    factors.push({
      name: "correct_api",
      impact: -0.3,
      status: "fail",
      detail: "Invalid API: gl.exec_prompt does not exist",
    });
  } else if (core.usesCorrectExecPrompt) {
    factors.push({
      name: "correct_api",
      impact: 0,
      status: "pass",
      detail: "Uses correct gl.nondet.exec_prompt API",
    });
  }

  // ─── Factor 3: Strict output constraint ─────────────────────

  if (prompts.length > 0) {
    const hasStrictOutput = prompts.some((p) => {
      const upper = p.toUpperCase();
      return STRICT_OUTPUT_KEYWORDS.some((kw) => upper.includes(kw.toUpperCase()));
    });

    if (hasStrictOutput) {
      factors.push({
        name: "output_constraint",
        impact: 0.05,
        status: "pass",
        detail: "Prompt enforces strict output format",
      });
      score = Math.min(1, score + 0.05);
    } else {
      score -= 0.25;
      issues.push("Prompt lacks strict output constraint — validators may produce different formats");
      suggestions.push("Add output constraint: 'Return ONLY valid JSON' or 'Return ONLY GOOD or BAD'");
      factors.push({
        name: "output_constraint",
        impact: -0.25,
        status: "fail",
        detail: "No output format constraint found",
      });
    }
  }

  // ─── Factor 4: Prompt entropy (length) ──────────────────────

  if (prompts.length > 0) {
    const maxLen = Math.max(...prompts.map((p) => p.length));
    if (maxLen > 500) {
      score -= 0.15;
      issues.push(`Prompt too long (${maxLen} chars) — increases output variance`);
      suggestions.push("Keep prompts under 300 characters for best consensus");
      factors.push({
        name: "prompt_length",
        impact: -0.15,
        status: "fail",
        detail: `Longest prompt: ${maxLen} chars (>500)`,
      });
    } else if (maxLen > 200) {
      score -= 0.05;
      factors.push({
        name: "prompt_length",
        impact: -0.05,
        status: "warn",
        detail: `Longest prompt: ${maxLen} chars (somewhat long)`,
      });
    } else {
      factors.push({
        name: "prompt_length",
        impact: 0,
        status: "pass",
        detail: `Prompt length OK: ${maxLen} chars`,
      });
    }
  }

  // ─── Factor 5: Ambiguity detection ──────────────────────────

  if (prompts.length > 0) {
    const ambiguousPrompts = prompts.filter((p) => {
      const lower = p.toLowerCase();
      return AMBIGUITY_KEYWORDS.some((kw) => lower.includes(kw));
    });

    if (ambiguousPrompts.length > 0) {
      score -= 0.2;
      issues.push(`${ambiguousPrompts.length} prompt(s) contain ambiguous language`);
      suggestions.push("Replace open-ended questions with specific, constrained instructions");
      factors.push({
        name: "ambiguity",
        impact: -0.2,
        status: "fail",
        detail: `Found keywords like: ${AMBIGUITY_KEYWORDS.filter((kw) =>
          ambiguousPrompts.some((p) => p.toLowerCase().includes(kw))
        ).slice(0, 3).join(", ")}`,
      });
    } else {
      factors.push({
        name: "ambiguity",
        impact: 0,
        status: "pass",
        detail: "No ambiguous language detected",
      });
    }
  }

  // ─── Factor 6: Normalization hints ──────────────────────────

  if (prompts.length > 0) {
    const hasNorm = prompts.some((p) => {
      const lower = p.toLowerCase();
      return NORMALIZATION_KEYWORDS.some((kw) => lower.includes(kw));
    });

    if (hasNorm) {
      factors.push({
        name: "normalization",
        impact: 0.05,
        status: "pass",
        detail: "Output normalization hints present",
      });
      score = Math.min(1, score + 0.05);
    } else {
      score -= 0.1;
      suggestions.push("Add normalization: 'Return in UPPERCASE with no punctuation'");
      factors.push({
        name: "normalization",
        impact: -0.1,
        status: "warn",
        detail: "No output normalization hints found",
      });
    }
  }

  // ─── Factor 7: Dangerous externals ──────────────────────────

  if (core.hasDangerousExternals) {
    score -= 0.3;
    issues.push("Uses forbidden HTTP library (requests) — TX will fail");
    suggestions.push("Replace requests.get/post with gl.nondet.web.get/post");
    factors.push({
      name: "externals",
      impact: -0.3,
      status: "fail",
      detail: "Forbidden `requests` library detected",
    });
  }

  // ─── Factor 8: Contract validity ────────────────────────────

  if (!core.isValidContract) {
    score -= 0.2;
    issues.push("Not a valid GenLayer contract (missing gl.Contract)");
    suggestions.push("Class must inherit from gl.Contract");
    factors.push({
      name: "contract_valid",
      impact: -0.2,
      status: "fail",
      detail: "Missing gl.Contract inheritance",
    });
  }

  // ─── Factor 9: task + criteria in eq_principle ──────────────

  if (core.usesEqPrinciple) {
    const hasTaskCriteria =
      code.includes("task=") && code.includes("criteria=");

    if (hasTaskCriteria) {
      factors.push({
        name: "task_criteria",
        impact: 0.05,
        status: "pass",
        detail: "eq_principle includes task + criteria (gold standard)",
      });
      score = Math.min(1, score + 0.05);
    } else {
      score -= 0.1;
      suggestions.push("Add task= and criteria= parameters to gl.eq_principle for stronger consensus");
      factors.push({
        name: "task_criteria",
        impact: -0.1,
        status: "warn",
        detail: "eq_principle missing task/criteria parameters",
      });
    }
  }

  // ─── Clamp and assign band ──────────────────────────────────

  score = Math.max(0, Math.min(1, score));

  const band: ConfidenceBand =
    score >= 0.7 ? "LIKELY_STABLE" :
    score >= 0.4 ? "UNCERTAIN" :
    "LOW_CONFIDENCE";

  return {
    willPass: score > 0.7,
    band,
    risk: score > 0.7 ? "LOW" : score > 0.4 ? "MEDIUM" : "HIGH",
    issues,
    suggestions,
    factors,
  };
}
