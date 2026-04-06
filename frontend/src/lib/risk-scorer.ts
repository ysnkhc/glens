/**
 * GenLayer Contract Risk Scorer — STRICT MODE
 * Assigns risk level (LOW / MEDIUM / HIGH) based on parsed contract analysis.
 *
 * FIX: Now uses extractPrompts() from prompt-utils.ts to see inline prompts
 * inside exec_prompt() calls. Previously only saw long strings (>50 chars)
 * via parser's extractLongStrings(), missing most real prompts.
 */

import type { ParseResult } from "./parser";
import type { RulesReport } from "./rules-engine";
import { extractPrompts, isPromptConstrained } from "./prompt-utils";

export function scoreRisk(parsed: ParseResult, report: RulesReport, sourceCode?: string): "LOW" | "MEDIUM" | "HIGH" {
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
  // Fix #8: Any ERROR-severity issue = broken contract = HIGH risk.
  // Previously required 3+ errors for HIGH, and 1 error gave MEDIUM.
  // In GenLayer, a single ERROR (wrong inheritance, decorated constructor,
  // invalid API) means the contract WILL fail. MEDIUM was misleading.
  if (errorCount >= 1) return "HIGH";

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
    //
    // FIX: Use extractPrompts() for INLINE prompts inside exec_prompt() calls,
    // PLUS parsed.aiUsages.preview for long standalone prompt strings.
    // Previous code only checked parsed.aiUsages.preview (from extractLongStrings >50 chars),
    // which missed prompts like: gl.nondet.exec_prompt(f"Describe: {text}")
    const inlinePrompts = sourceCode ? extractPrompts(sourceCode) : [];
    const previewPrompts = parsed.aiUsages
      .filter(u => u.preview)
      .map(u => u.preview || "");
    const allPrompts = [...inlinePrompts, ...previewPrompts];

    const STRICT_OUTPUT = /\b(ONLY|EXACT|EXACTLY|MUST RETURN|RETURN ONLY|one word|single word|JSON only|valid JSON|GOOD or BAD|YES or NO|TRUE or FALSE|UPPERCASE)\b/i;
    const OPEN_ENDED = /\b(describe|explain|tell me|what do you think|summarize|discuss|analyze in detail|write a paragraph|give your opinion|how would you|random|anything|interesting|creative)\b/i;

    const hasOpenEnded = allPrompts.some(p => OPEN_ENDED.test(p));
    const hasStrictOutput = allPrompts.some(p => STRICT_OUTPUT.test(p));

    if (hasOpenEnded) return "HIGH";

    // FIX: If we have prompts but none are strict, it's HIGH risk
    if (allPrompts.length > 0 && !hasStrictOutput) return "HIGH";

    // FIX: If contract has AI but we can't find ANY prompts (dynamic generation),
    // default to MEDIUM — we can't verify safety without seeing the prompt text
    if (allPrompts.length === 0) return "MEDIUM";

    return "LOW";
  }

  // --- MEDIUM risk conditions ---
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
