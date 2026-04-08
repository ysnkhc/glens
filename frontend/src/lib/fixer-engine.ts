/**
 * 🔥 GenLayer Contract Fixer Engine — PRODUCTION VERSION (v2 — Hardened)
 *
 * Deterministic rule-based transformer that produces valid GenLayer code.
 * No AI dependency — pure pattern matching and code transformation.
 *
 * Fixes from audit:
 * - Rule 6: Detects original indent level instead of hardcoding 8 spaces
 * - Rule 7: Smart view/write decorator selection (ported from backend)
 * - Rules 5, 9: Fresh regex per operation (no g-flag state bug)
 * - Rule 4: Improved multi-line exec_prompt support
 * - Post-fix validation step
 */

import { parseContract } from "./parser";
import { runRules } from "./rules-engine";

export interface FixResult {
  fixedCode: string;
  changes: string[];
  validAfterFix: boolean;
  remainingIssues: number;
}

export function fixGenLayerContract(code: string): FixResult {
  let fixed = code;
  const changes: string[] = [];

  // Pre-parse to get structured info for smarter fixes
  const preParsed = parseContract(code);

  ///////////////////////////////////////////
  // RULE 1 — Ensure genlayer import exists
  ///////////////////////////////////////////

  if (!fixed.includes("from genlayer import *")) {
    fixed = "from genlayer import *\n\n" + fixed;
    changes.push("✅ Added missing `from genlayer import *`");
  }

  ///////////////////////////////////////////
  // RULE 2 — Ensure gl.Contract inheritance
  //          (uses ParseResult for reliability)
  ///////////////////////////////////////////

  if (!fixed.includes("(gl.Contract)") && !fixed.includes("(Contract)")) {
    // Re-parse after Rule 1 (import may have been added)
    const freshParsed = parseContract(fixed);

    // Find ALL class definitions in the code
    const classRegex = /^(\s*)class\s+(\w+)\s*(?:\(([^)]*)\))?\s*:/gm;
    let match;
    while ((match = classRegex.exec(fixed)) !== null) {
      const indent = match[1];
      const className = match[2];
      const bases = match[3] || "";
      const fullMatch = match[0];

      // Skip if it already has gl.Contract
      if (bases.includes("gl.Contract") || bases.includes("Contract")) continue;

      // Case A: no base class → class Name:
      if (!bases.trim()) {
        fixed = fixed.replace(fullMatch, `${indent}class ${className}(gl.Contract):`);
        changes.push(`✅ Added \`gl.Contract\` inheritance to \`${className}\``);
        break;
      }

      // Case B: wrong base class → class Name(SomeOther):
      fixed = fixed.replace(fullMatch, `${indent}class ${className}(gl.Contract):`);
      changes.push(`🔧 Fixed \`${className}\` inheritance → \`gl.Contract\``);
      break;
    }
  }

  ///////////////////////////////////////////
  // RULE 3 — Replace gl.exec_prompt → gl.nondet.exec_prompt
  ///////////////////////////////////////////

  if (fixed.includes("gl.exec_prompt") && !fixed.includes("gl.nondet.exec_prompt")) {
    fixed = fixed.replaceAll("gl.exec_prompt", "gl.nondet.exec_prompt");
    changes.push("🔧 Replaced `gl.exec_prompt` → `gl.nondet.exec_prompt`");
  }

  ///////////////////////////////////////////
  // RULE 4 — Wrap naked AI calls with gl.eq_principle
  //          (improved multi-line support)
  ///////////////////////////////////////////

  if (fixed.includes("gl.nondet.exec_prompt") && !fixed.includes("gl.eq_principle")) {
    // Strategy: line-by-line scan for assignment or return patterns
    const lines = fixed.split("\n");
    const newLines: string[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      // Match: varname = gl.nondet.exec_prompt(
      const assignMatch = trimmed.match(/^(\w+)\s*=\s*gl\.nondet\.exec_prompt\(/);
      // Match: return gl.nondet.exec_prompt(
      const returnMatch = trimmed.match(/^return\s+gl\.nondet\.exec_prompt\(/);

      if (assignMatch || returnMatch) {
        const indent = line.match(/^(\s*)/)?.[1] || "    ";

        // Collect all lines of this call (find the matching closing paren)
        let callLines = [line];
        let parenDepth = 0;
        for (const ch of line) {
          if (ch === "(") parenDepth++;
          if (ch === ")") parenDepth--;
        }

        // If parens aren't balanced, collect continuation lines
        let j = i + 1;
        while (parenDepth > 0 && j < lines.length) {
          callLines.push(lines[j]);
          for (const ch of lines[j]) {
            if (ch === "(") parenDepth++;
            if (ch === ")") parenDepth--;
          }
          j++;
        }

        // Extract the full exec_prompt(...) call content
        const fullCall = callLines.join("\n");

        // ─── Smart task/criteria generation based on prompt content ───
        const promptLower = fullCall.toLowerCase();
        let task: string;
        let criteria: string;

        if (/\b(classify|categor|sentiment|positive|negative|label)\b/.test(promptLower)) {
          task = "Classify input into predefined categories";
          criteria = "Output must be exactly one of the defined category strings";
        } else if (/\b(yes|no|true|false|approve|reject|valid|invalid)\b/.test(promptLower) &&
                   /\b(one word|single word|only)\b/.test(promptLower)) {
          task = "Make a binary decision";
          criteria = "Output must be exactly YES or NO (or TRUE/FALSE)";
        } else if (/\b(number|price|amount|count|score|rating|percent)\b/.test(promptLower)) {
          task = "Return a deterministic numeric result";
          criteria = "Output must be an identical number across all validator runs";
        } else if (/\b(json|structure|object|array|\{.*\})\b/.test(promptLower)) {
          task = "Generate structured JSON data";
          criteria = "Output must be valid JSON with identical keys and equivalent values";
        } else if (/\b(summarize|summary|explain|describe)\b/.test(promptLower)) {
          task = "Summarize or explain the given input";
          criteria = "Output must convey the same key facts and conclusions";
        } else {
          // Fallback — honest about weakness
          task = "Process the AI prompt";
          criteria = "Outputs must be semantically equivalent";
        }

        if (assignMatch) {
          const varName = assignMatch[1];
          // Extract everything after "varName = "
          const execStart = fullCall.indexOf("gl.nondet.exec_prompt");
          const execCall = fullCall.slice(execStart);

          newLines.push(
            `${indent}${varName} = gl.eq_principle(`,
            `${indent}    lambda: ${execCall},`,
            `${indent}    task="${task}",`,
            `${indent}    criteria="${criteria}"`,
            `${indent})`
          );
          changes.push(`🔧 Wrapped \`${varName}\` AI call with \`gl.eq_principle\` (${task.toLowerCase()})`);
        } else if (returnMatch) {
          const execStart = fullCall.indexOf("gl.nondet.exec_prompt");
          const execCall = fullCall.slice(execStart);

          newLines.push(
            `${indent}return gl.eq_principle(`,
            `${indent}    lambda: ${execCall},`,
            `${indent}    task="${task}",`,
            `${indent}    criteria="${criteria}"`,
            `${indent})`
          );
          changes.push(`🔧 Wrapped return AI call with \`gl.eq_principle\` (${task.toLowerCase()})`);
        }

        i = j; // Skip past the collected lines
        continue;
      }

      newLines.push(line);
      i++;
    }

    fixed = newLines.join("\n");
  }

  ///////////////////////////////////////////
  // RULE 5 — Replace requests.get/post → gl.nondet.web
  //          (FIX: fresh regex per call — no g-flag state bug)
  ///////////////////////////////////////////

  const httpReplacements: [string, string, string][] = [
    ["requests.get", "gl.nondet.web.get", "requests.get → gl.nondet.web.get"],
    ["requests.post", "gl.nondet.web.post", "requests.post → gl.nondet.web.post"],
    ["requests.put", "gl.nondet.web.put", "requests.put → gl.nondet.web.put"],
    ["requests.delete", "gl.nondet.web.delete", "requests.delete → gl.nondet.web.delete"],
    ["requests.patch", "gl.nondet.web.patch", "requests.patch → gl.nondet.web.patch"],
  ];

  for (const [search, replacement, description] of httpReplacements) {
    if (fixed.includes(search)) {
      // Use a fresh regex each time — avoids lastIndex state bug
      const pattern = new RegExp(
        search.replace(".", "\\.") + "\\(([^)]*)\\)",
        "g"
      );
      fixed = fixed.replace(pattern, `${replacement}($1)`);
      changes.push(`🔧 Replaced \`${description}\``);
    }
  }

  ///////////////////////////////////////////
  // RULE 5b — Wrap naked gl.nondet.web calls in gl.eq_principle
  ///////////////////////////////////////////

  if (fixed.includes("gl.nondet.web.")) {
    // Check if any gl.nondet.web calls are NOT already inside gl.eq_principle
    // Look for lines with "= gl.nondet.web." or "return gl.nondet.web." that are NOT preceded by eq_principle
    const hasUnwrappedWeb = fixed.split("\n").some(line => {
      const t = line.trim();
      return (t.match(/^\w+\s*=\s*gl\.nondet\.web\./) || t.match(/^return\s+gl\.nondet\.web\./))
        && !t.includes("eq_principle");
    });
    if (hasUnwrappedWeb) {
    const lines = fixed.split("\n");
    const newLines: string[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      // Match: varname = gl.nondet.web.get/post/...( 
      const webAssignMatch = trimmed.match(/^(\w+)\s*=\s*gl\.nondet\.web\.\w+\(/);
      // Match: return gl.nondet.web.get/post/...( 
      const webReturnMatch = trimmed.match(/^return\s+gl\.nondet\.web\.\w+\(/);

      if (webAssignMatch || webReturnMatch) {
        const indent = line.match(/^(\s*)/)?.[1] || "    ";

        // Collect all lines of this call (find matching closing paren)
        let callLines = [line];
        let parenDepth = 0;
        for (const ch of line) {
          if (ch === "(") parenDepth++;
          if (ch === ")") parenDepth--;
        }

        let j = i + 1;
        while (parenDepth > 0 && j < lines.length) {
          callLines.push(lines[j]);
          for (const ch of lines[j]) {
            if (ch === "(") parenDepth++;
            if (ch === ")") parenDepth--;
          }
          j++;
        }

        const fullCall = callLines.join("\n");

        if (webAssignMatch) {
          const varName = webAssignMatch[1];
          const execStart = fullCall.indexOf("gl.nondet.web.");
          const execCall = fullCall.slice(execStart);

          newLines.push(
            `${indent}${varName} = gl.eq_principle(`,
            `${indent}    lambda: ${execCall},`,
            `${indent}    task="Fetch external data with consensus",`,
            `${indent}    criteria="All validators must retrieve the same data"`,
            `${indent})`
          );
          changes.push(`🔧 Wrapped \`${varName}\` web call with \`gl.eq_principle\``);
        } else if (webReturnMatch) {
          const execStart = fullCall.indexOf("gl.nondet.web.");
          const execCall = fullCall.slice(execStart);

          newLines.push(
            `${indent}return gl.eq_principle(`,
            `${indent}    lambda: ${execCall},`,
            `${indent}    task="Fetch external data with consensus",`,
            `${indent}    criteria="All validators must retrieve the same data"`,
            `${indent})`
          );
          changes.push(`🔧 Wrapped return web call with \`gl.eq_principle\``);
        }

        i = j;
        continue;
      }

      newLines.push(line);
      i++;
    }

    fixed = newLines.join("\n");
    }
  }

  ///////////////////////////////////////////
  // RULE 6 — Remove forbidden imports
  //          (FIX: preserve original indentation)
  ///////////////////////////////////////////

  const importLines = fixed.split("\n");
  const fixedImportLines: string[] = [];
  for (const line of importLines) {
    const trimmed = line.trim();

    if (trimmed === "import requests" || /^from\s+requests\s+import/.test(trimmed)) {
      // Preserve original indentation, use clean comment that won't trigger pattern matching
      const originalIndent = line.match(/^(\s*)/)?.[1] || "";
      fixedImportLines.push(`${originalIndent}# REMOVED: ${trimmed} (GenLayer: use gl.nondet.web instead)`);
      changes.push(`🔧 Removed \`${trimmed}\` (forbidden in GenLayer)`);
    } else {
      fixedImportLines.push(line);
    }
  }
  fixed = fixedImportLines.join("\n");

  ///////////////////////////////////////////
  // RULE 7 — Add decorators to undecorated methods
  //          (FIX: smart view/write selection)
  ///////////////////////////////////////////

  const decLines = fixed.split("\n");
  const newDecLines: string[] = [];
  for (let i = 0; i < decLines.length; i++) {
    const line = decLines[i];
    const trimmed = line.trim();

    // Match: def method_name( but NOT __init__, __str__, etc.
    const methodMatch = trimmed.match(/^(?:async\s+)?def\s+(\w+)\s*\(/);
    if (methodMatch && !methodMatch[1].startsWith("__")) {
      // Check if previous non-empty line is a decorator
      let hasDecorator = false;
      for (let j = i - 1; j >= 0; j--) {
        const prev = decLines[j].trim();
        if (!prev || prev.startsWith("#")) continue;
        if (prev.startsWith("@")) {
          hasDecorator = true;
        }
        break;
      }

      if (!hasDecorator) {
        const indent = line.match(/^(\s*)/)?.[1] || "    ";
        const methodName = methodMatch[1];

        // Smart decorator selection (ported from backend)
        const isReadMethod = ["get_", "read_", "fetch_", "view_", "is_", "has_", "check_", "count_"].some(
          (prefix) => methodName.startsWith(prefix)
        ) || methodName === "get" || methodName === "read";

        // Also check method body for return-only patterns (no self.X = assignment)
        let bodyHasWrite = false;
        for (let j = i + 1; j < decLines.length && j < i + 15; j++) {
          const bodyLine = decLines[j].trim();
          if (!bodyLine || bodyLine.startsWith("#") || bodyLine.startsWith('"""') || bodyLine.startsWith("'''")) continue;
          // Check if we've left the method (dedented)
          const bodyIndent = decLines[j].match(/^(\s*)/)?.[1]?.length || 0;
          const methodIndent = (line.match(/^(\s*)/)?.[1]?.length || 0) + 4;
          if (bodyIndent < methodIndent && bodyLine.length > 0) break;
          if (bodyLine.includes("self.") && bodyLine.includes("=") && !bodyLine.includes("==")) {
            bodyHasWrite = true;
            break;
          }
        }

        const decorator = isReadMethod && !bodyHasWrite
          ? `${indent}@gl.public.view`
          : `${indent}@gl.public.write`;

        newDecLines.push(decorator);
        const decType = decorator.includes("view") ? "@gl.public.view" : "@gl.public.write";
        changes.push(`🔧 Added \`${decType}\` to \`${methodName}\``);
      }
    }
    newDecLines.push(line);
  }
  fixed = newDecLines.join("\n");

  ///////////////////////////////////////////
  // RULE 8 — Fix untyped state variables
  ///////////////////////////////////////////

  // Match bare state vars in class body: "  data", "    count", "        name"
  // Any 2+ spaces indent, single word, nothing else on line
  // Skip keywords, lambda, and anything that looks like code
  fixed = fixed.replace(
    /^(\s{2,})([a-z]\w*)\s*$/gm,
    (_match, indent, varName) => {
      const skip = new Set([
        "pass", "return", "break", "continue", "raise", "yield",
        "lambda", "def", "class", "import", "from", "if", "else",
        "elif", "for", "while", "try", "except", "finally", "with",
        "self", "True", "False", "None", "and", "or", "not",
      ]);
      if (skip.has(varName)) return _match;
      // Must look like a simple identifier (no dots, parens, etc.)
      if (!/^[a-z_][a-z0-9_]*$/.test(varName)) return _match;

      // Smart type inference based on variable name
      let inferredType = "str";
      if (["count", "total", "amount", "balance", "price", "id", "index", "size", "length", "num", "counter", "query_count"].some(
        (n) => varName.includes(n)
      )) {
        inferredType = "u256";
      } else if (["items", "list", "entries", "records", "values", "results"].some(
        (n) => varName.includes(n)
      )) {
        inferredType = "DynArray[str]";
      } else if (["map", "mapping", "registry", "lookup", "dict"].some(
        (n) => varName.includes(n)
      )) {
        inferredType = "TreeMap[str, str]";
      }

      changes.push(`🔧 Added type annotation \`${inferredType}\` to state variable \`${varName}\``);
      return `${indent}${varName}: ${inferredType}`;
    }
  );

  ///////////////////////////////////////////
  // RULE 9 — Fix Python types → GenLayer types
  //          (FIX: fresh regex per call — no g-flag state bug)
  ///////////////////////////////////////////

  // int → u256 (only in class-level type annotations)
  if (/^\s+\w+\s*:\s*int\s*$/m.test(fixed)) {
    fixed = fixed.replace(/^(\s+\w+)\s*:\s*int\s*$/gm, "$1: u256");
    changes.push("🔧 Replaced `int` → `u256` (GenLayer integer type)");
  }

  // dict → TreeMap[str, str]
  if (/^\s+\w+\s*:\s*dict\s*$/m.test(fixed)) {
    fixed = fixed.replace(/^(\s+\w+)\s*:\s*dict\s*$/gm, "$1: TreeMap[str, str]");
    changes.push("🔧 Replaced `dict` → `TreeMap[str, str]`");
  }

  // list → DynArray[str]
  if (/^\s+\w+\s*:\s*list\s*$/m.test(fixed)) {
    fixed = fixed.replace(/^(\s+\w+)\s*:\s*list\s*$/gm, "$1: DynArray[str]");
    changes.push("🔧 Replaced `list` → `DynArray[str]`");
  }

  ///////////////////////////////////////////
  // RULE 10 — Add Depends header if missing
  ///////////////////////////////////////////

  if (!fixed.includes("Depends")) {
    fixed = `# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }\n` + fixed;
    changes.push("✅ Added Bradbury-compatible `Depends` header");
  }

  ///////////////////////////////////////////
  // POST-FIX VALIDATION
  ///////////////////////////////////////////

  if (changes.length === 0) {
    changes.push("✅ Contract is already valid — no fixes needed.");
  }

  // Re-parse the fixed code to validate
  const afterParsed = parseContract(fixed);
  const afterReport = runRules(afterParsed, fixed);
  const remainingIssues = afterReport.issues.length + afterReport.warnings.length;
  const validAfterFix = afterReport.issues.length === 0;

  if (validAfterFix && changes.length > 1) {
    changes.push("✅ Post-fix validation: Valid GenLayer contract");
  } else if (!validAfterFix) {
    changes.push(`⚠️ Post-fix validation: ${afterReport.issues.length} issue(s) remaining`);
  }

  return {
    fixedCode: fixed,
    changes,
    validAfterFix,
    remainingIssues,
  };
}
