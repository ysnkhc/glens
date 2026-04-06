/**
 * GenLayer Contract Parser — TypeScript Port
 * Pattern-based analysis of GenLayer Intelligent Contracts.
 * Replaces the Python AST-based parser with regex analysis.
 */

// ─── Types ─────────────────────────────────────────────────────

export interface MethodInfo {
  name: string;
  decorators: string[];
  args: string[];
  hasReturnType: boolean;
  lineNumber: number;
}

export interface StateVariable {
  name: string;
  annotation: string | null;
  lineNumber: number;
}

export interface AIUsage {
  call: string;
  line: number;
  preview?: string;
}

export interface ExternalCall {
  call: string;
  line: number;
}

export interface ParseResult {
  isValidPython: boolean;
  parseError: string | null;
  contractClassName: string | null;
  baseClasses: string[];
  methods: MethodInfo[];
  stateVariables: StateVariable[];
  hasConstructor: boolean;
  constructorDecorated: boolean;
  aiUsages: AIUsage[];
  externalCalls: ExternalCall[];
  usesEqPrinciple: boolean;
  imports: string[];
}

// ─── Patterns ──────────────────────────────────────────────────

/** Correct AI patterns (proper GenLayer API) */
const CORRECT_AI_PATTERNS = [
  "gl.nondet.exec_prompt",
  "gl.eq_principle.prompt_non_comparative",
  "gl.eq_principle.prompt_comparative",
  "gl.eq_principle.strict_eq",
];

/** Deprecated/incorrect AI patterns that should be flagged */
const INCORRECT_AI_PATTERNS = [
  "gl.exec_prompt",   // WRONG — must use gl.nondet.exec_prompt
  "exec_prompt",      // Ambiguous — needs gl.nondet prefix
];

/** All AI-related patterns for detection */
const AI_PATTERNS = [
  ...CORRECT_AI_PATTERNS,
  ...INCORRECT_AI_PATTERNS,
  "gl.eq_principle",
  "eq_principle",
  "llm",
  "completion",
];

/** Dangerous external call patterns (must use gl.nondet.web) */
const DANGEROUS_EXTERNAL_PATTERNS = [
  "requests.get",
  "requests.post",
  "requests.put",
  "requests.delete",
  "requests.patch",
  "urllib",
  "http.client",
  "httpx",
  "aiohttp",
  "fetch",
];

/** Correct GenLayer external call patterns */
const CORRECT_EXTERNAL_PATTERNS = [
  "gl.nondet.web",
  "gl.get_webpage",
  "get_webpage",
];

const EXTERNAL_CALL_PATTERNS = [
  ...DANGEROUS_EXTERNAL_PATTERNS,
  ...CORRECT_EXTERNAL_PATTERNS,
];

const PROMPT_KEYWORDS = [
  "analyze",
  "determine",
  "evaluate",
  "respond",
  "output",
  "answer",
  "classify",
  "extract",
  "summarize",
  "generate",
  "return",
];

// ─── Parser ────────────────────────────────────────────────────

export function parseContract(sourceCode: string): ParseResult {
  const result: ParseResult = {
    isValidPython: true,
    parseError: null,
    contractClassName: null,
    baseClasses: [],
    methods: [],
    stateVariables: [],
    hasConstructor: false,
    constructorDecorated: false,
    aiUsages: [],
    externalCalls: [],
    usesEqPrinciple: false,
    imports: [],
  };

  const lines = sourceCode.split("\n");

  // Basic syntax check (look for obvious syntax errors)
  const unmatchedParens = checkBalancedParens(sourceCode);
  if (unmatchedParens) {
    result.isValidPython = false;
    result.parseError = `Potential syntax error: ${unmatchedParens}`;
    return result;
  }

  // Extract imports
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip comment lines (especially "# REMOVED:" from fixer)
    if (line.startsWith("#")) continue;

    // from X import Y
    const fromImport = line.match(/^from\s+(\S+)\s+import\s+(.+)/);
    if (fromImport) {
      const module = fromImport[1];
      const names = fromImport[2].split(",").map((n) => n.trim());
      for (const name of names) {
        if (name === "*") {
          result.imports.push(`${module}.*`);
        } else {
          result.imports.push(`${module}.${name}`);
        }
      }
    }

    // import X
    const directImport = line.match(/^import\s+(\S+)/);
    if (directImport && !line.startsWith("from")) {
      result.imports.push(directImport[1]);
    }
  }

  // Extract class definition — ONLY gl.Contract subclasses are contracts
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // class Name(Base1, Base2):
    const classMatch = line.match(/^class\s+(\w+)\s*(?:\(([^)]*)\))?\s*:/);
    if (classMatch) {
      const className = classMatch[1];
      const basesStr = classMatch[2] || "";
      const bases = basesStr
        .split(",")
        .map((b) => b.trim())
        .filter(Boolean);

      const isContract = bases.some(
        (b) => b === "gl.Contract" || b === "Contract"
      );

      // Fix #3: Always capture the first class — rules engine validates inheritance.
      // Previously only captured gl.Contract subclasses, so VotingContract(dict)
      // triggered 'no_contract_class' instead of 'wrong_inheritance'.
      if (!result.contractClassName) {
        result.contractClassName = className;
        result.baseClasses = bases;
        extractClassBody(lines, i, result);
        if (isContract) break; // Found the real contract, stop searching
        // Otherwise keep looking — a later class might inherit gl.Contract
      }
    }
  }

  // Extract AI usages from full source
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    // Skip comment lines (including "# REMOVED:" from fixer)
    if (trimmed.startsWith("#")) continue;

    // Check AI patterns
    for (const pattern of AI_PATTERNS) {
      if (line.includes(pattern)) {
        result.aiUsages.push({ call: pattern, line: lineNum });
        if (pattern.includes("eq_principle")) {
          result.usesEqPrinciple = true;
        }
        break;
      }
    }

    // Check external call patterns
    for (const pattern of EXTERNAL_CALL_PATTERNS) {
      if (line.includes(pattern)) {
        result.externalCalls.push({ call: pattern, line: lineNum });
        break;
      }
    }
  }

  // Detect prompt strings (long strings with prompt keywords)
  const longStrings = extractLongStrings(sourceCode);
  for (const ls of longStrings) {
    const lower = ls.text.toLowerCase();
    if (PROMPT_KEYWORDS.some((kw) => lower.includes(kw))) {
      result.aiUsages.push({
        call: "prompt_string",
        line: ls.line,
        preview: ls.text.length > 80 ? ls.text.slice(0, 80) + "..." : ls.text,
      });
    }
  }

  return result;
}

// ─── Helpers ───────────────────────────────────────────────────

function extractClassBody(
  lines: string[],
  classLineIdx: number,
  result: ParseResult
): void {
  const classIndent = getIndent(lines[classLineIdx]);
  let currentDecorators: string[] = [];
  let lastDecoratorLine = -1;

  for (let i = classLineIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Empty line or comment
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Check if we've left the class (dedented back to class level or less)
    const indent = getIndent(line);
    if (indent <= classIndent && trimmed.length > 0 && !trimmed.startsWith("#")) {
      break;
    }

    // Decorator
    if (trimmed.startsWith("@")) {
      currentDecorators.push(trimmed.replace("@", ""));
      lastDecoratorLine = i;
      continue;
    }

    // State variable (annotation): name: type
    const stateMatch = trimmed.match(/^(\w+)\s*:\s*(.+)/);
    if (stateMatch && !trimmed.startsWith("def ") && !trimmed.startsWith("self.")) {
      const varName = stateMatch[1];
      const annotation = stateMatch[2].trim();
      // Filter out assignments like x: int = 5 -> just get type
      const cleanAnnotation = annotation.split("=")[0].trim();
      result.stateVariables.push({
        name: varName,
        annotation: cleanAnnotation || null,
        lineNumber: i + 1,
      });
      currentDecorators = [];
      continue;
    }

    // Method definition
    const methodMatch = trimmed.match(
      /^(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*(.+))?\s*:/
    );
    if (methodMatch) {
      const methodName = methodMatch[1];
      const argsStr = methodMatch[2] || "";
      const hasReturn = !!methodMatch[3];

      const args = argsStr
        .split(",")
        .map((a) => a.trim().split(":")[0].trim().split("=")[0].trim())
        .filter((a) => a && a !== "self");

      result.methods.push({
        name: methodName,
        decorators: [...currentDecorators],
        args,
        hasReturnType: hasReturn,
        lineNumber: i + 1,
      });

      if (methodName === "__init__") {
        result.hasConstructor = true;
        if (currentDecorators.length > 0) {
          result.constructorDecorated = true;
        }
      }

      currentDecorators = [];
    }
  }
}

function getIndent(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? match[1].length : 0;
}

function checkBalancedParens(code: string): string | null {
  const stack: { char: string; line: number }[] = [];
  const pairs: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
  const closers = new Set([")", "]", "}"]);
  const lines = code.split("\n");
  let inString = false;
  let stringChar = "";
  let inTriple = false;

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];

      // Handle triple quotes
      if (!inString && i + 2 < line.length) {
        const triple = line.slice(i, i + 3);
        if (triple === '"""' || triple === "'''") {
          if (inTriple && stringChar === triple[0]) {
            inTriple = false;
            inString = false;
            i += 2;
            continue;
          } else if (!inTriple) {
            inTriple = true;
            inString = true;
            stringChar = triple[0];
            i += 2;
            continue;
          }
        }
      }

      if (inTriple) continue;

      // Handle regular strings
      if (!inString && (ch === '"' || ch === "'")) {
        inString = true;
        stringChar = ch;
        continue;
      }
      if (inString && ch === stringChar) {
        inString = false;
        continue;
      }
      if (inString) continue;

      // Handle comments
      if (ch === "#") break;

      // Handle parens
      if (pairs[ch]) {
        stack.push({ char: ch, line: lineNum + 1 });
      } else if (closers.has(ch)) {
        if (stack.length === 0) {
          return `Unexpected '${ch}' at line ${lineNum + 1}`;
        }
        const top = stack.pop()!;
        if (pairs[top.char] !== ch) {
          return `Mismatched '${top.char}' at line ${top.line} and '${ch}' at line ${lineNum + 1}`;
        }
      }
    }
  }

  if (stack.length > 0) {
    return `Unclosed '${stack[stack.length - 1].char}' at line ${stack[stack.length - 1].line}`;
  }

  return null;
}

function extractLongStrings(
  code: string
): { text: string; line: number }[] {
  const results: { text: string; line: number }[] = [];
  const lines = code.split("\n");

  // Match triple-quoted strings
  const tripleRegex = /"""([\s\S]*?)"""|'''([\s\S]*?)'''/g;
  let match;
  while ((match = tripleRegex.exec(code)) !== null) {
    const text = (match[1] || match[2] || "").trim();
    if (text.length > 50) {
      const line = code.slice(0, match.index).split("\n").length;
      results.push({ text, line });
    }
  }

  // Match f-strings and regular strings on single lines
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const strRegex = /[f]?"([^"]{50,})"|[f]?'([^']{50,})'/g;
    let strMatch;
    while ((strMatch = strRegex.exec(line)) !== null) {
      const text = (strMatch[1] || strMatch[2] || "").trim();
      if (text.length > 50) {
        results.push({ text, line: i + 1 });
      }
    }
  }

  return results;
}

/**
 * Build a metadata string from parsed results (for AI analysis context).
 */
export function buildMetadata(parsed: ParseResult): string {
  const methodNames = parsed.methods.map((m) => m.name);
  const parts: string[] = [];
  parts.push(`Contract: ${parsed.contractClassName || "Unknown"}`);
  if (methodNames.length > 0) parts.push(`Methods: ${methodNames.join(", ")}`);
  if (parsed.aiUsages.length > 0) parts.push(`AI calls: ${parsed.aiUsages.length}`);
  if (parsed.externalCalls.length > 0) parts.push(`External calls: ${parsed.externalCalls.length}`);
  parts.push(`Uses eq_principle: ${parsed.usesEqPrinciple ? "yes" : "no"}`);
  // Fix #2: Include prompt previews so on-chain AI can assess constraint quality
  const promptPreviews = parsed.aiUsages
    .filter(u => u.preview)
    .map(u => u.preview!)
    .slice(0, 2);
  if (promptPreviews.length > 0) {
    parts.push(`Prompts: ${promptPreviews.join(" | ")}`);
  }
  return parts.join(". ");
}
