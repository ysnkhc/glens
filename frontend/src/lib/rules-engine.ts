/**
 * GenLayer Contract Rules Engine — STRICT MODE
 * Deterministic validation rules for GenLayer Intelligent Contracts.
 * Enforces production-ready best practices.
 */

import type { ParseResult } from "./parser";

// ─── Types ─────────────────────────────────────────────────────

export interface RuleResult {
  ruleId: string;
  severity: "ERROR" | "WARNING";
  message: string;
  line: number;
}

export interface RulesReport {
  issues: RuleResult[];
  warnings: RuleResult[];
  suggestions: string[];
  issueMessages: string[];
  warningMessages: string[];
}

// ─── Rule Implementations ──────────────────────────────────────

function checkContractClass(parsed: ParseResult, report: RulesReport): void {
  if (!parsed.contractClassName) {
    report.issues.push({
      ruleId: "no_contract_class",
      severity: "ERROR",
      message:
        "No class inheriting from `gl.Contract` was found. " +
        "GenLayer contracts must define a class that extends `gl.Contract`.",
      line: 0,
    });
  }
}

function checkInheritance(parsed: ParseResult, report: RulesReport): void {
  if (parsed.contractClassName && parsed.baseClasses.length > 0) {
    const validBases = new Set(["gl.Contract", "Contract"]);
    if (!parsed.baseClasses.some((b) => validBases.has(b))) {
      report.issues.push({
        ruleId: "wrong_inheritance",
        severity: "ERROR",
        message: `Class \`${parsed.contractClassName}\` inherits from \`${parsed.baseClasses.join(", ")}\` instead of \`gl.Contract\`.`,
        line: 0,
      });
    }
  }
}

function checkDecorators(parsed: ParseResult, report: RulesReport): void {
  if (!parsed.contractClassName) return;

  const validDecorators = new Set([
    "gl.public.view",
    "gl.public.write",
    "gl.public.write.payable",
  ]);

  for (const method of parsed.methods) {
    if (method.name.startsWith("__") && method.name.endsWith("__")) continue;

    const hasValid = method.decorators.some((d) => validDecorators.has(d));

    if (!hasValid) {
      if (method.decorators.length > 0) {
        report.warnings.push({
          ruleId: "invalid_decorator",
          severity: "WARNING",
          message: `Method \`${method.name}\` (line ${method.lineNumber}) has decorator \`${method.decorators.join("`, `")}\` which is not a standard GenLayer public decorator. Expected \`@gl.public.view\` or \`@gl.public.write\`.`,
          line: method.lineNumber,
        });
      } else {
        report.warnings.push({
          ruleId: "missing_decorator",
          severity: "WARNING",
          message: `Method \`${method.name}\` (line ${method.lineNumber}) is missing a \`@gl.public.view\` or \`@gl.public.write\` decorator. It won't be callable externally.`,
          line: method.lineNumber,
        });
      }
    }
  }
}

function checkConstructor(parsed: ParseResult, report: RulesReport): void {
  if (!parsed.contractClassName) return;

  if (parsed.constructorDecorated) {
    for (const method of parsed.methods) {
      if (method.name === "__init__" && method.decorators.length > 0) {
        report.issues.push({
          ruleId: "constructor_decorated",
          severity: "ERROR",
          message: `Constructor \`__init__\` (line ${method.lineNumber}) should not have \`@gl.public\` decorators. The constructor runs only at deployment.`,
          line: method.lineNumber,
        });
      }
    }
  }
}

function checkStateVariables(
  parsed: ParseResult,
  report: RulesReport
): void {
  if (!parsed.contractClassName) return;

  for (const sv of parsed.stateVariables) {
    if (!sv.annotation) {
      report.warnings.push({
        ruleId: "untyped_state",
        severity: "WARNING",
        message: `State variable \`${sv.name}\` (line ${sv.lineNumber}) is missing a type annotation. GenLayer requires typed state (e.g., \`str\`, \`u256\`, \`TreeMap[str, str]\`).`,
        line: sv.lineNumber,
      });
    }
  }
}

function checkPublicMethods(
  parsed: ParseResult,
  report: RulesReport
): void {
  if (!parsed.contractClassName) return;

  const validDecorators = new Set([
    "gl.public.view",
    "gl.public.write",
    "gl.public.write.payable",
  ]);

  const hasPublic = parsed.methods.some((m) =>
    m.decorators.some((d) => validDecorators.has(d))
  );

  if (!hasPublic) {
    report.warnings.push({
      ruleId: "no_public_methods",
      severity: "WARNING",
      message:
        "Contract has no public methods. Add `@gl.public.view` or `@gl.public.write` decorators to expose contract functionality.",
      line: 0,
    });
  }
}

// ─── NEW: Strict GenLayer-Specific Rules ───────────────────────

/**
 * RULE: NEVER use gl.exec_prompt — must use gl.nondet.exec_prompt
 */
function checkIncorrectExecPrompt(
  sourceCode: string,
  report: RulesReport
): void {
  const lines = sourceCode.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) continue; // skip comments (including # REMOVED: lines)

    // Check for gl.exec_prompt (WRONG) but NOT gl.nondet.exec_prompt (CORRECT)
    if (line.includes("gl.exec_prompt") && !line.includes("gl.nondet.exec_prompt")) {
      report.issues.push({
        ruleId: "wrong_exec_prompt",
        severity: "ERROR",
        message: `Line ${i + 1}: ❌ \`gl.exec_prompt\` is INVALID. Use \`gl.nondet.exec_prompt()\` instead. The \`gl.exec_prompt\` function does not exist in GenLayer.`,
        line: i + 1,
      });
    }

    // Check for bare exec_prompt (not prefixed with gl.nondet.)
    if (
      line.includes("exec_prompt") &&
      !line.includes("gl.nondet.exec_prompt") &&
      !line.includes("gl.exec_prompt") &&
      !trimmed.startsWith("#") &&
      !trimmed.startsWith("\"") &&
      !trimmed.startsWith("'")
    ) {
      report.warnings.push({
        ruleId: "bare_exec_prompt",
        severity: "WARNING",
        message: `Line ${i + 1}: ⚠️ Bare \`exec_prompt\` call. Use the full path \`gl.nondet.exec_prompt()\` for clarity and consensus safety.`,
        line: i + 1,
      });
    }
  }
}

/**
 * RULE: NEVER use requests.get/post — must use gl.nondet.web
 */
function checkDangerousExternalCalls(
  sourceCode: string,
  report: RulesReport
): void {
  const dangerousPatterns = [
    { pattern: "requests.get", fix: "gl.nondet.web.get" },
    { pattern: "requests.post", fix: "gl.nondet.web.post" },
    { pattern: "requests.put", fix: "gl.nondet.web.put" },
    { pattern: "requests.delete", fix: "gl.nondet.web.delete" },
    { pattern: "requests.patch", fix: "gl.nondet.web.patch" },
    { pattern: "urllib", fix: "gl.nondet.web" },
    { pattern: "httpx", fix: "gl.nondet.web" },
    { pattern: "aiohttp", fix: "gl.nondet.web" },
    { pattern: "http.client", fix: "gl.nondet.web" },
  ];

  const lines = sourceCode.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) continue; // skip comments and # REMOVED: lines

    for (const { pattern, fix } of dangerousPatterns) {
      if (line.includes(pattern)) {
        report.issues.push({
          ruleId: "dangerous_external_call",
          severity: "ERROR",
          message: `Line ${i + 1}: ❌ \`${pattern}\` is NOT allowed in GenLayer contracts. Use \`${fix}\` instead. Direct HTTP calls break consensus — validators must fetch data through the GenLayer proxy.`,
          line: i + 1,
        });
      }
    }
  }
}

/**
 * RULE: AI calls WITHOUT eq_principle = consensus failure
 */
function checkMissingEqPrinciple(
  sourceCode: string,
  parsed: ParseResult,
  report: RulesReport
): void {
  if (!parsed.contractClassName) return;

  // Use parsed data instead of raw sourceCode.includes()
  const hasAICalls = parsed.aiUsages.some(
    (u) => u.call.includes("exec_prompt") || u.call === "gl.nondet.exec_prompt" || u.call === "gl.exec_prompt"
  );
  const hasEqPrinciple = parsed.usesEqPrinciple;

  if (hasAICalls && !hasEqPrinciple) {
    report.issues.push({
      ruleId: "ai_without_eq_principle",
      severity: "ERROR",
      message:
        "❌ AI/LLM calls detected but NO `gl.eq_principle` wrapping found. " +
        "ALL non-deterministic operations MUST be wrapped in `gl.eq_principle.prompt_non_comparative()` or similar. " +
        "Without it, validators will disagree and the transaction will FAIL.",
      line: 0,
    });
  }
}

/**
 * RULE: External data calls without gl.nondet.web
 */
function checkMissingNondetWeb(
  sourceCode: string,
  parsed: ParseResult,
  report: RulesReport
): void {
  if (!parsed.contractClassName) return;

  // Use parsed data: external calls that aren't through gl.nondet
  const hasDangerousWebCalls = parsed.externalCalls.some(
    (c) =>
      !c.call.includes("gl.nondet") &&
      !c.call.includes("gl.get_webpage") &&
      !c.call.includes("get_webpage")
  );

  // Check if gl.nondet.web is present anywhere in the code (safe replacement)
  const hasNondetWeb = sourceCode.includes("gl.nondet.web");

  if (hasDangerousWebCalls && !hasNondetWeb) {
    report.issues.push({
      ruleId: "missing_nondet_web",
      severity: "ERROR",
      message:
        "❌ External HTTP calls detected without `gl.nondet.web`. " +
        "Direct network requests (requests, urllib, httpx) are FORBIDDEN in GenLayer. " +
        "Use `gl.nondet.web.get(url)` to route through the GenLayer consensus proxy.",
      line: 0,
    });
  }
}

/**
 * RULE: Check for import requests (should not be imported)
 */
function checkDangerousImports(
  parsed: ParseResult,
  report: RulesReport
): void {
  const dangerousImports = ["requests", "urllib", "httpx", "aiohttp", "http.client"];
  for (const imp of parsed.imports) {
    for (const dangerous of dangerousImports) {
      if (imp.startsWith(dangerous) || imp.includes(`.${dangerous}`)) {
        report.issues.push({
          ruleId: "dangerous_import",
          severity: "ERROR",
          message: `❌ Import \`${imp}\` is NOT allowed. GenLayer contracts cannot use external HTTP libraries. Use \`gl.nondet.web\` from the genlayer SDK instead.`,
          line: 0,
        });
      }
    }
  }
}

/**
 * RULE: Check Python int usage (should be u256)
 */
function checkIntType(
  sourceCode: string,
  parsed: ParseResult,
  report: RulesReport
): void {
  if (!parsed.contractClassName) return;

  for (const sv of parsed.stateVariables) {
    if (sv.annotation === "int") {
      report.warnings.push({
        ruleId: "python_int_type",
        severity: "WARNING",
        message: `State variable \`${sv.name}\` (line ${sv.lineNumber}) uses Python \`int\`. GenLayer recommends \`u256\` for unsigned integers or \`i256\` for signed integers.`,
        line: sv.lineNumber,
      });
    }
    if (sv.annotation === "dict") {
      report.warnings.push({
        ruleId: "python_dict_type",
        severity: "WARNING",
        message: `State variable \`${sv.name}\` (line ${sv.lineNumber}) uses Python \`dict\`. Use \`TreeMap[K, V]\` for GenLayer persistent state.`,
        line: sv.lineNumber,
      });
    }
    if (sv.annotation === "list") {
      report.warnings.push({
        ruleId: "python_list_type",
        severity: "WARNING",
        message: `State variable \`${sv.name}\` (line ${sv.lineNumber}) uses Python \`list\`. Use \`DynArray[T]\` for GenLayer persistent state.`,
        line: sv.lineNumber,
      });
    }
  }
}

/**
 * RULE: Methods missing parameter or return type annotations (Fix #4)
 */
function checkMethodAnnotations(
  parsed: ParseResult,
  sourceCode: string,
  report: RulesReport
): void {
  if (!parsed.contractClassName) return;

  const lines = sourceCode.split("\n");
  for (const method of parsed.methods) {
    if (method.name.startsWith("__") && method.name.endsWith("__")) continue;

    // Missing return type annotation
    if (!method.hasReturnType) {
      report.warnings.push({
        ruleId: "missing_return_type",
        severity: "WARNING",
        message: `Method \`${method.name}\` (line ${method.lineNumber}) is missing a return type annotation (e.g., \`-> str\`, \`-> None\`).`,
        line: method.lineNumber,
      });
    }

    // Missing parameter type annotations
    if (method.lineNumber > 0 && method.lineNumber <= lines.length) {
      const defLine = lines[method.lineNumber - 1];
      const paramsMatch = defLine.match(/def\s+\w+\s*\(([^)]*)\)/);
      if (paramsMatch) {
        const params = paramsMatch[1]
          .split(",")
          .map(p => p.trim())
          .filter(p => p && p !== "self");
        for (const param of params) {
          if (!param.includes(":")) {
            const paramName = param.split("=")[0].trim();
            if (paramName) {
              report.warnings.push({
                ruleId: "missing_param_type",
                severity: "WARNING",
                message: `Parameter \`${paramName}\` in method \`${method.name}\` (line ${method.lineNumber}) is missing a type annotation (e.g., \`${paramName}: str\`).`,
                line: method.lineNumber,
              });
            }
          }
        }
      }
    }
  }
}

/**
 * RULE: Missing # { "Depends": "py-genlayer:<hash>" } header (Fix #6)
 * Required for Bradbury testnet deployment.
 */
function checkDependsHeader(
  sourceCode: string,
  report: RulesReport
): void {
  const headerPattern = /^#\s*\{\s*"Depends"\s*:\s*"py-genlayer:[^"]+"\s*\}/m;
  if (!headerPattern.test(sourceCode)) {
    report.warnings.push({
      ruleId: "missing_depends_header",
      severity: "WARNING",
      message: 'Missing `# { "Depends": "py-genlayer:<hash>" }` header. Required for Bradbury testnet deployment.',
      line: 1,
    });
  }
}

function generateSuggestions(
  parsed: ParseResult,
  report: RulesReport
): void {
  // Missing import
  const hasGenlayerImport = parsed.imports.some((imp) =>
    imp.includes("genlayer")
  );
  if (parsed.contractClassName && !hasGenlayerImport) {
    report.suggestions.push(
      "Add `from genlayer import *` at the top of your contract."
    );
  }

  // No return types
  const methodsWithoutReturn = parsed.methods.filter(
    (m) => !m.name.startsWith("__") && !m.hasReturnType
  );
  if (methodsWithoutReturn.length > 0) {
    const names = methodsWithoutReturn
      .slice(0, 3)
      .map((m) => `\`${m.name}\``)
      .join(", ");
    report.suggestions.push(
      `Add return type annotations to methods ${names} for better code clarity.`
    );
  }

  // AI prompt quality
  const promptStrings = parsed.aiUsages.filter(
    (u) => u.call === "prompt_string"
  );
  if (promptStrings.length > 0) {
    report.suggestions.push(
      "Review AI prompt strings for clarity and specificity. " +
        "Vague prompts increase the risk of validator disagreement."
    );
  }

  // eq_principle usage
  if (parsed.usesEqPrinciple) {
    report.suggestions.push(
      "✅ You're using `eq_principle` for consensus. Consider using " +
        "`prompt_non_comparative` for AI outputs or `strict_eq` for exact matching."
    );
  }

  // No state variables but has write methods
  const writeMethods = parsed.methods.filter((m) =>
    m.decorators.some((d) => d.includes("gl.public.write"))
  );
  if (writeMethods.length > 0 && parsed.stateVariables.length === 0) {
    report.suggestions.push(
      "You have write methods but no declared state variables. " +
        "Declare class-level typed attributes (e.g., `data: str`, `count: u256`) for persistent state."
    );
  }
  // Fix #6: Removed always-on generic Depends suggestion — now handled by checkDependsHeader rule
}

// ─── Main Entry Point ──────────────────────────────────────────

export function runRules(parsed: ParseResult, sourceCode?: string): RulesReport {
  const report: RulesReport = {
    issues: [],
    warnings: [],
    suggestions: [],
    issueMessages: [],
    warningMessages: [],
  };

  if (!parsed.isValidPython) {
    report.issues.push({
      ruleId: "syntax_error",
      severity: "ERROR",
      message: parsed.parseError || "Invalid Python syntax.",
      line: 0,
    });
    report.issueMessages = report.issues.map((r) => r.message);
    report.warningMessages = report.warnings.map((r) => r.message);
    return report;
  }

  // Core structural rules
  // Fix #3: Run checkInheritance FIRST so wrong_inheritance fires before no_contract_class
  checkInheritance(parsed, report);
  checkContractClass(parsed, report);
  checkDecorators(parsed, report);
  checkConstructor(parsed, report);
  checkStateVariables(parsed, report);
  checkPublicMethods(parsed, report);

  // NEW: Strict GenLayer rules (source-level analysis)
  if (sourceCode) {
    checkMethodAnnotations(parsed, sourceCode, report); // Fix #4
    checkDependsHeader(sourceCode, report); // Fix #6
    checkIncorrectExecPrompt(sourceCode, report);
    checkDangerousExternalCalls(sourceCode, report);
    checkMissingEqPrinciple(sourceCode, parsed, report);
    checkMissingNondetWeb(sourceCode, parsed, report);
    checkIntType(sourceCode, parsed, report);
  }
  checkDangerousImports(parsed, report);

  generateSuggestions(parsed, report);

  // Build message arrays
  report.issueMessages = report.issues.map((r) => r.message);
  report.warningMessages = report.warnings.map((r) => r.message);

  return report;
}
