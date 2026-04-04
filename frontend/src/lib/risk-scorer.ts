/**
 * GenLayer Contract Risk Scorer — STRICT MODE
 * Assigns risk level (LOW / MEDIUM / HIGH) based on parsed contract analysis.
 */

import type { ParseResult } from "./parser";
import type { RulesReport } from "./rules-engine";

export function scoreRisk(parsed: ParseResult, report: RulesReport): "LOW" | "MEDIUM" | "HIGH" {
  const errorCount = report.issues.length;
  const warningCount = report.warnings.length;

  // --- HIGH risk conditions ---
  if (!parsed.isValidPython) return "HIGH";
  if (!parsed.contractClassName) return "HIGH";

  // Check for critical GenLayer violations (forbidden APIs)
  const criticalRuleIds = new Set([
    "wrong_exec_prompt",
    "dangerous_external_call",
    "ai_without_eq_principle",
    "missing_nondet_web",
    "dangerous_import",
  ]);

  const hasCriticalViolation = report.issues.some(
    (issue) => criticalRuleIds.has(issue.ruleId)
  );
  if (hasCriticalViolation) return "HIGH";

  const hasAI = parsed.aiUsages.length > 0;
  const hasExternal = parsed.externalCalls.length > 0;

  if ((hasAI || hasExternal) && !parsed.usesEqPrinciple) return "HIGH";
  if (errorCount >= 3) return "HIGH";

  // --- LOW risk: Gold standard pattern ---
  // AI/external with eq_principle + correct API + no critical issues = LOW
  const usesCorrectExecPrompt = parsed.aiUsages.some(
    (u) => u.call === "gl.nondet.exec_prompt" || u.call.includes("nondet.exec_prompt")
  );
  const hasDangerousImports = report.issues.some(
    (i) => i.ruleId === "dangerous_import" || i.ruleId === "dangerous_external_call"
  );

  if (hasAI && parsed.usesEqPrinciple && usesCorrectExecPrompt && !hasDangerousImports && errorCount === 0) {
    // Gold standard pattern — BUT check prompt quality before granting LOW
    const promptStrings = parsed.aiUsages
      .filter(u => u.preview)
      .map(u => u.preview || "");

    const STRICT_OUTPUT = /\b(ONLY|EXACT|EXACTLY|MUST RETURN|RETURN ONLY|one word|single word|JSON only|valid JSON|GOOD or BAD|YES or NO|TRUE or FALSE|UPPERCASE)\b/i;
    const OPEN_ENDED = /\b(describe|explain|tell me|what do you think|summarize|discuss|analyze in detail|write a paragraph|give your opinion|how would you|random|anything|interesting|creative)\b/i;

    const hasOpenEnded = promptStrings.some(p => OPEN_ENDED.test(p));
    const hasStrictOutput = promptStrings.length === 0 || promptStrings.some(p => STRICT_OUTPUT.test(p));

    if (hasOpenEnded) return "HIGH";
    if (!hasStrictOutput && promptStrings.length > 0) return "HIGH";

    return "LOW";
  }

  // --- MEDIUM risk conditions ---
  if (errorCount >= 1) return "MEDIUM";
  if (warningCount >= 3) return "MEDIUM";

  const promptUsages = parsed.aiUsages.filter((u) => u.call === "prompt_string");
  if (promptUsages.length > 0) return "MEDIUM";

  // AI with eq_principle but missing correct API or has warnings
  if (hasAI && parsed.usesEqPrinciple) return "MEDIUM";
  if (hasExternal && parsed.usesEqPrinciple) return "MEDIUM";

  // --- LOW risk ---
  // Fully deterministic OR properly wrapped with no errors
  return "LOW";
}
