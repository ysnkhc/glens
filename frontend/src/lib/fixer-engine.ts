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

        // ─── Strict task/criteria generation for non-comparative consensus ───
        const promptLower = fullCall.toLowerCase();
        let task: string;
        let criteria: string;

        if (/\b(classify|categor|sentiment|positive|negative|label)\b/.test(promptLower)) {
          task = "classification";
          criteria = "Approve if output is valid JSON with exactly keys 'category' (lowercase string) and 'confidence' (integer 0-100), no other keys, no markdown, no extra text. Reject otherwise.";
        } else if (/\b(yes|no|true|false|approve|reject|valid|invalid)\b/.test(promptLower) &&
                   /\b(one word|single word|only)\b/.test(promptLower)) {
          task = "binary decision";
          criteria = "Approve if output is valid JSON with exactly one key 'decision' whose value is exactly 'YES' or 'NO', no other keys, no markdown, no extra text. Reject otherwise.";
        } else if (/\b(number|price|amount|count|score|rating|percent)\b/.test(promptLower)) {
          task = "numeric extraction";
          criteria = "Approve if output is valid JSON with exactly one key 'value' (a number), no other keys, no markdown, no extra text. Reject otherwise.";
        } else if (/\b(json|structure|object|array|\{.*\})\b/.test(promptLower)) {
          task = "structured data extraction";
          criteria = "Approve if output is valid JSON with keys in deterministic order, no markdown, no extra text. Reject otherwise.";
        } else if (/\b(summarize|summary|explain|describe)\b/.test(promptLower)) {
          task = "summarization";
          criteria = "Approve if output is valid JSON with keys 'summary' (string) and 'key_points' (array of strings), no other keys, no markdown, no extra text. Reject otherwise.";
        } else {
          task = "AI processing";
          criteria = "Approve ONLY if output is valid JSON with exactly one key 'result' (a short string under 20 words), no other keys, no markdown, no extra text. Reject otherwise.";
        }

        if (assignMatch) {
          const varName = assignMatch[1];
          // Extract everything after "varName = "
          const execStart = fullCall.indexOf("gl.nondet.exec_prompt");
          const execCall = fullCall.slice(execStart);

          newLines.push(
            `${indent}${varName} = gl.eq_principle.prompt_non_comparative(`,
            `${indent}    lambda: ${execCall},`,
            `${indent}    task="${task}",`,
            `${indent}    criteria="${criteria}"`,
            `${indent})`
          );
          changes.push(`🔧 Wrapped \`${varName}\` AI call with \`gl.eq_principle.prompt_non_comparative\` (${task.toLowerCase()})`);
        } else if (returnMatch) {
          const execStart = fullCall.indexOf("gl.nondet.exec_prompt");
          const execCall = fullCall.slice(execStart);

          newLines.push(
            `${indent}return gl.eq_principle.prompt_non_comparative(`,
            `${indent}    lambda: ${execCall},`,
            `${indent}    task="${task}",`,
            `${indent}    criteria="${criteria}"`,
            `${indent})`
          );
          changes.push(`🔧 Wrapped return AI call with \`gl.eq_principle.prompt_non_comparative\` (${task.toLowerCase()}, strict byte-identical)`);
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
  // RULE 5b — Wrap ALL unwrapped gl.nondet.web calls in gl.eq_principle
  //           HARDENED: handles var, self.var, return, standalone
  //           Forces .text inside lambda for consensus safety
  //           Context-aware: checks multi-line eq_principle blocks
  ///////////////////////////////////////////

  if (fixed.includes("gl.nondet.web.")) {
    const lines = fixed.split("\n");
    const newLines: string[] = [];
    let changed5b = false;
    let i = 0;
    // Track which variables were wrapped so we can clean up follow-up .json()/.text
    const wrappedVars = new Set<string>();

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip comments
      if (trimmed.startsWith("#")) {
        newLines.push(line);
        i++;
        continue;
      }

      // Check if this line contains a gl.nondet.web call
      if (trimmed.includes("gl.nondet.web.")) {

        // Skip if this line is already inside a lambda (lambda: gl.nondet.web... is correct)
        const webIdx = trimmed.indexOf("gl.nondet.web.");
        const lambdaIdx = trimmed.indexOf("lambda:");
        if (lambdaIdx >= 0 && lambdaIdx < webIdx) {
          newLines.push(line);
          i++;
          continue;
        }

        // Skip if this line itself contains eq_principle (already wrapped inline)
        if (trimmed.includes("eq_principle")) {
          newLines.push(line);
          i++;
          continue;
        }

        // Check backward: are we inside a multi-line gl.eq_principle block?
        let insideEqPrinciple = false;
        // Track paren depth going backward to see if an eq_principle( opened but hasn't closed
        let backParenDepth = 0;
        for (let k = i - 1; k >= Math.max(0, i - 20); k--) {
          const prevTrimmed = lines[k].trim();
          if (prevTrimmed.startsWith("#")) continue;
          // Count parens on this line (in reverse — closing adds, opening subtracts)
          for (const ch of lines[k]) {
            if (ch === ")") backParenDepth++;
            if (ch === "(") backParenDepth--;
          }
          // If we find eq_principle and we're still inside its parens, we're wrapped
          if (prevTrimmed.includes("eq_principle") && backParenDepth < 0) {
            insideEqPrinciple = true;
            break;
          }
          // If parens balanced/closed, we've left any wrapping block
          if (backParenDepth >= 0 && (prevTrimmed.startsWith("def ") || prevTrimmed.startsWith("@gl.") || prevTrimmed.startsWith("class "))) {
            break;
          }
        }

        if (insideEqPrinciple) {
          newLines.push(line);
          i++;
          continue;
        }

        // ─── This is an UNWRAPPED web call — wrap it ───
        const indent = line.match(/^(\s*)/)?.[1] || "    ";

        // Detect LHS pattern:
        //   self.xxx = gl.nondet.web.get(...)   → self-assignment
        //   varname = gl.nondet.web.get(...)    → local assignment
        //   return gl.nondet.web.get(...)       → return
        //   gl.nondet.web.get(...)              → standalone
        const selfAssignMatch = trimmed.match(/^(self\.\w+)\s*=\s*gl\.nondet\.web\./);
        const varAssignMatch = !selfAssignMatch ? trimmed.match(/^(\w+)\s*=\s*gl\.nondet\.web\./) : null;
        const returnMatch = trimmed.match(/^return\s+gl\.nondet\.web\./);

        // Collect multi-line call (paren counting)
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

        // Extract the web call part: everything from gl.nondet.web. onward
        const webStart = fullCall.indexOf("gl.nondet.web.");
        let webCall = fullCall.slice(webStart).trim();

        // Strip any trailing .json() or .text — we'll add .text ourselves inside the lambda
        webCall = webCall.replace(/\.(json\(\)|text)\s*$/, "");
        // Also strip if .json() or .text appears before a trailing comma/paren
        webCall = webCall.replace(/\.(json\(\)|text)\s*([,)])\s*$/, "$2");

        // Build the wrapped call with .text inside lambda
        const webCallWithText = webCall + ".text";
        const task = "external data fetch";
        const criteria = "Approve if response is valid non-empty text. Reject if empty or error.";

        if (selfAssignMatch) {
          const lhs = selfAssignMatch[1]; // "self.xxx"
          newLines.push(
            `${indent}${lhs} = gl.eq_principle.prompt_non_comparative(`,
            `${indent}    lambda: ${webCallWithText},`,
            `${indent}    task="${task}",`,
            `${indent}    criteria="${criteria}"`,
            `${indent})`
          );
          wrappedVars.add(lhs.replace("self.", ""));
          changed5b = true;
          changes.push(`🔧 Wrapped \`${lhs}\` web call with \`gl.eq_principle.prompt_non_comparative\``);
        } else if (varAssignMatch) {
          const varName = varAssignMatch[1];
          newLines.push(
            `${indent}${varName} = gl.eq_principle.prompt_non_comparative(`,
            `${indent}    lambda: ${webCallWithText},`,
            `${indent}    task="${task}",`,
            `${indent}    criteria="${criteria}"`,
            `${indent})`
          );
          wrappedVars.add(varName);
          changed5b = true;
          changes.push(`🔧 Wrapped \`${varName}\` web call with \`gl.eq_principle.prompt_non_comparative\``);
        } else if (returnMatch) {
          newLines.push(
            `${indent}return gl.eq_principle.prompt_non_comparative(`,
            `${indent}    lambda: ${webCallWithText},`,
            `${indent}    task="${task}",`,
            `${indent}    criteria="${criteria}"`,
            `${indent})`
          );
          changed5b = true;
          changes.push("🔧 Wrapped return web call with `gl.eq_principle.prompt_non_comparative`");
        } else {
          // Standalone call (no assignment, no return)
          newLines.push(
            `${indent}gl.eq_principle.prompt_non_comparative(`,
            `${indent}    lambda: ${webCallWithText},`,
            `${indent}    task="${task}",`,
            `${indent}    criteria="${criteria}"`,
            `${indent})`
          );
          changed5b = true;
          changes.push("🔧 Wrapped standalone web call with `gl.eq_principle.prompt_non_comparative`");
        }

        i = j;
        continue;
      }

      newLines.push(line);
      i++;
    }

    if (changed5b) {
      fixed = newLines.join("\n");
    }

    // ─── Post-wrap cleanup: fix .json()/.text on wrapped variables ───
    // After wrapping with .text, the variable holds a plain string.
    // .text calls → just strip (already a string)
    // .json() calls → replace with json.loads() so dict key access still works
    // Chained: response.json()["key"] → json.loads(response)["key"]
    if (wrappedVars.size > 0) {
      const cleanupLines = fixed.split("\n");
      let cleanupChanged = false;
      let needsJsonImport = false;

      for (let idx = 0; idx < cleanupLines.length; idx++) {
        const t = cleanupLines[idx].trim();
        for (const v of wrappedVars) {
          // Case 1: varname.json() → json.loads(varname)
          // Handles both `data = response.json()` and `data = response.json()["key"]`
          if (t.includes(`${v}.json()`)) {
            cleanupLines[idx] = cleanupLines[idx]
              .replace(new RegExp(`\\b${v}\\.json\\(\\)`, "g"), `json.loads(${v})`);
            cleanupChanged = true;
            needsJsonImport = true;
          }
          // Case 2: varname.text → just varname (already a string)
          if (t.includes(`${v}.text`)) {
            cleanupLines[idx] = cleanupLines[idx]
              .replace(new RegExp(`\\b${v}\\.text`, "g"), v);
            cleanupChanged = true;
          }
        }
      }

      if (cleanupChanged) {
        fixed = cleanupLines.join("\n");
        changes.push("🔧 Replaced `.json()` with `json.loads()` on wrapped variable (response is text from consensus)");
      }

      // Add `import json` if needed and not already present
      if (needsJsonImport && !fixed.includes("import json")) {
        // Insert after the genlayer import line
        const genlayerImportIdx = fixed.indexOf("from genlayer import *");
        if (genlayerImportIdx >= 0) {
          const insertPos = fixed.indexOf("\n", genlayerImportIdx);
          if (insertPos >= 0) {
            fixed = fixed.slice(0, insertPos) + "\nimport json" + fixed.slice(insertPos);
          }
        } else {
          // Fallback: add at top after Depends header
          const dependsMatch = fixed.match(/^#\s*\{.*"Depends".*\}\s*\n/m);
          if (dependsMatch) {
            fixed = fixed.replace(dependsMatch[0], dependsMatch[0] + "import json\n");
          } else {
            fixed = "import json\n" + fixed;
          }
        }
        changes.push("✅ Added `import json` for safe JSON parsing of web responses");
      }
    }
  }

  ///////////////////////////////////////////
  // RULE 5c — Safety net: ensure .text inside ALL lambda web calls
  //           Catches any pre-existing or Rule-4-produced lambdas
  //           that have bare web calls without an accessor
  ///////////////////////////////////////////

  {
    const r5cLines = fixed.split("\n");
    let r5cChanged = false;

    for (let i = 0; i < r5cLines.length; i++) {
      const trimmed = r5cLines[i].trim();

      // Only target lambda lines that contain a web call
      if (!trimmed.includes("lambda:") || !trimmed.includes("gl.nondet.web.")) continue;

      // Skip if already has .text or .json()
      if (trimmed.includes(".text") || trimmed.includes(".json()")) continue;

      // Try to add .text before the trailing comma
      // Handle nested parens: find the LAST closing paren of the web call
      const lambdaStart = trimmed.indexOf("lambda:");
      const webStart = trimmed.indexOf("gl.nondet.web.", lambdaStart);
      if (webStart < 0) continue;

      // Find the end of the web call by counting parens from the first ( after gl.nondet.web.xxxx
      const afterMethod = trimmed.indexOf("(", webStart);
      if (afterMethod < 0) continue;

      let depth = 0;
      let endIdx = -1;
      for (let ci = afterMethod; ci < trimmed.length; ci++) {
        if (trimmed[ci] === "(") depth++;
        if (trimmed[ci] === ")") {
          depth--;
          if (depth === 0) {
            endIdx = ci;
            break;
          }
        }
      }

      if (endIdx > 0) {
        // Insert .text right after the closing paren of the web call
        const originalLine = r5cLines[i];
        // Find the same position in the original (non-trimmed) line
        const origWebStart = originalLine.indexOf("gl.nondet.web.", originalLine.indexOf("lambda:"));
        const origAfterMethod = originalLine.indexOf("(", origWebStart);
        let origDepth = 0;
        let origEndIdx = -1;
        for (let ci = origAfterMethod; ci < originalLine.length; ci++) {
          if (originalLine[ci] === "(") origDepth++;
          if (originalLine[ci] === ")") {
            origDepth--;
            if (origDepth === 0) {
              origEndIdx = ci;
              break;
            }
          }
        }
        if (origEndIdx > 0) {
          r5cLines[i] = originalLine.slice(0, origEndIdx + 1) + ".text" + originalLine.slice(origEndIdx + 1);
          r5cChanged = true;
          changes.push("🔧 Added `.text` to web call inside lambda (consensus safety)");
        }
      }
    }

    if (r5cChanged) {
      fixed = r5cLines.join("\n");
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
      // Delete the forbidden import line entirely — no noisy comments
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

        // Also check method body for write indicators
        let bodyHasWrite = false;
        let bodyHasNondet = false;
        let bodyHasNonSelfReturn = false;
        for (let j = i + 1; j < decLines.length && j < i + 15; j++) {
          const bodyLine = decLines[j].trim();
          if (!bodyLine || bodyLine.startsWith("#") || bodyLine.startsWith('"""') || bodyLine.startsWith("'''")) continue;
          // Check if we've left the method (dedented)
          const bodyIndent = decLines[j].match(/^(\s*)/)?.[1]?.length || 0;
          const methodIndent = (line.match(/^(\s*)/)?.[1]?.length || 0) + 4;
          if (bodyIndent < methodIndent && bodyLine.length > 0) break;
          if (bodyLine.includes("self.") && bodyLine.includes("=") && !bodyLine.includes("==")) {
            bodyHasWrite = true;
          }
          // Non-deterministic/consensus operations REQUIRE @gl.public.write
          if (bodyLine.includes("gl.nondet") || bodyLine.includes("gl.eq_principle") || bodyLine.includes("exec_prompt")) {
            bodyHasNondet = true;
          }
          // Return of non-self data (e.g., from web calls or AI) indicates write method
          if (bodyLine.startsWith("return ") && !bodyLine.includes("self.")) {
            bodyHasNonSelfReturn = true;
          }
        }

        // Non-deterministic operations always require @gl.public.write
        // View methods are for local state reads only — they can't reach consensus
        // Methods returning external/computed data also need write (consensus validation)
        const decorator = (isReadMethod && !bodyHasWrite && !bodyHasNondet && !bodyHasNonSelfReturn)
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
  // RULE 8b — Initialize uninitialized state variables in __init__
  ///////////////////////////////////////////

  {
    const stateVarRegex = /^\s+(\w+)\s*:\s*(str|u256|i256|bool|TreeMap\[[^\]]*\]|DynArray\[[^\]]*\])\s*$/gm;
    const typedStateVars: {name: string; type: string}[] = [];
    let svMatch;
    while ((svMatch = stateVarRegex.exec(fixed)) !== null) {
      typedStateVars.push({ name: svMatch[1], type: svMatch[2] });
    }

    if (typedStateVars.length > 0) {
      const initLines = fixed.split("\n");
      let initDefIdx = -1;
      let lastSelfIdx = -1;
      let defIndentLen = 0;
      let bodyIndent = "        ";

      for (let idx = 0; idx < initLines.length; idx++) {
        if (/^\s*def __init__\(self\)\s*(?:->[^:]*)?:/.test(initLines[idx])) {
          initDefIdx = idx;
          defIndentLen = (initLines[idx].match(/^(\s*)/)?.[1] || "").length;
          bodyIndent = " ".repeat(defIndentLen + 4);
          for (let j = idx + 1; j < initLines.length; j++) {
            const t = initLines[j].trim();
            if (!t || t.startsWith("#")) continue;
            const jLen = (initLines[j].match(/^(\s*)/)?.[1] || "").length;
            if (jLen <= defIndentLen) break;
            if (t.startsWith("self.")) lastSelfIdx = j;
          }
          break;
        }
      }

      // Gather __init__ body to check existing initializations
      let initBody = "";
      if (initDefIdx >= 0) {
        for (let j = initDefIdx + 1; j < initLines.length; j++) {
          const t = initLines[j].trim();
          if (t && !t.startsWith("#")) {
            const jLen = (initLines[j].match(/^(\s*)/)?.[1] || "").length;
            if (jLen <= defIndentLen) break;
          }
          initBody += initLines[j] + "\n";
        }
      }

      const missing = typedStateVars.filter(sv => !initBody.includes(`self.${sv.name}`));

      if (missing.length > 0) {
        const defaultValue = (type: string): string => {
          if (type === "u256" || type === "i256") return `${type}(0)`;
          if (type === "bool") return "False";
          if (type.startsWith("TreeMap")) return `${type}()`;
          if (type.startsWith("DynArray")) return `${type}()`;
          return '""';
        };

        const newInits = missing.map(sv =>
          `${bodyIndent}self.${sv.name} = ${defaultValue(sv.type)}`
        );

        if (initDefIdx >= 0 && lastSelfIdx >= 0) {
          // Insert after the last self.xxx = line in existing __init__
          initLines.splice(lastSelfIdx + 1, 0, ...newInits);
        } else if (initDefIdx >= 0) {
          // __init__ exists but no self. lines — insert after def line
          initLines.splice(initDefIdx + 1, 0, ...newInits);
        } else {
          // No __init__ — create one after state variable declarations
          const classMatch = fixed.match(/^(\s*)class\s+\w+/m);
          const clsIndent = classMatch ? classMatch[1] + "    " : "    ";
          const methIndent = clsIndent + "    ";
          let insertAt = 0;
          for (let idx = 0; idx < initLines.length; idx++) {
            if (/^\s+\w+\s*:\s*(str|u256|i256|bool|TreeMap|DynArray)/.test(initLines[idx])) {
              insertAt = idx;
            }
          }
          const initBlock = [
            "",
            `${clsIndent}def __init__(self):`,
            ...missing.map(sv => `${methIndent}self.${sv.name} = ${defaultValue(sv.type)}`),
          ];
          initLines.splice(insertAt + 1, 0, ...initBlock);
        }

        fixed = initLines.join("\n");
        changes.push(`✅ Initialized ${missing.map(m => "\`" + m.name + "\`").join(", ")} in \`__init__\``);
      }
    }
  }

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
    fixed = `# { "Depends": "py-genlayer:latest" }\n` + fixed;
    changes.push("✅ Added `Depends` header (py-genlayer:latest)");
  }
  ///////////////////////////////////////////
  // RULE 11 — Add parameter type annotations
  //           (except self)
  ///////////////////////////////////////////

  {
    const paramBefore = fixed;
    fixed = fixed.replace(
      /def\s+(\w+)\s*\(\s*(self(?:,\s*)?)?([^)]*)\s*\)/g,
      (match, methodName, selfPart, params) => {
        if (!params || !params.trim()) return match; // no params beyond self

        const paramList = params.split(",").map((p: string) => p.trim()).filter(Boolean);
        let anyChanged = false;

        const typedParams = paramList.map((param: string) => {
          if (param.includes(":")) return param; // already typed
          if (param === "self") return "self";

          anyChanged = true;
          // Inference by name
          if (["num", "amount", "id", "count", "price", "index", "size", "total", "balance"].some(
            (n) => param.includes(n)
          )) {
            return `${param}: u256`;
          }
          if (["flag", "is_", "has_", "enabled", "active", "valid"].some(
            (n) => param.includes(n)
          )) {
            return `${param}: bool`;
          }
          return `${param}: str`; // safe default
        });

        if (!anyChanged) return match;

        const selfPrefix = selfPart ? "self, " : "";
        return `def ${methodName}(${selfPrefix}${typedParams.join(", ")})`;
      }
    );
    if (fixed !== paramBefore) {
      changes.push("🔧 Added parameter type annotations to untyped method parameters");
    }
  }

  ///////////////////////////////////////////
  // RULE 12 — Add return type annotations
  //           to decorated public methods
  ///////////////////////////////////////////

  {
    const retBefore = fixed;
    // Match @gl.public.view/write followed by def ... ) :  (no -> present)
    // Use line-by-line scan for reliability
    const retLines = fixed.split("\n");
    const newRetLines: string[] = [];
    for (let i = 0; i < retLines.length; i++) {
      const line = retLines[i];
      const trimmed = line.trim();

      // Check if this is a def line WITHOUT return type annotation
      const defMatch = trimmed.match(/^(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)\s*:\s*$/);
      if (defMatch && !trimmed.includes("->")) {
        const methodName = defMatch[1];
        // Handle __init__ specifically — always -> None
        if (methodName === "__init__") {
          const newLine = line.replace(/\)\s*:\s*$/, `) -> None:`);
          newRetLines.push(newLine);
          continue;
        }
        // Skip other dunder methods
        if (!methodName.startsWith("__")) {
          // Look back for decorator to determine view/write
          let isView = false;
          for (let j = i - 1; j >= 0; j--) {
            const prev = retLines[j].trim();
            if (!prev || prev.startsWith("#")) continue;
            if (prev.includes("@gl.public.view")) { isView = true; break; }
            if (prev.includes("@gl.public.write")) { isView = false; break; }
            break;
          }

          // Scan method body to infer return type
          let hasReturn = false;
          let returnsSelf = false;
          for (let j = i + 1; j < retLines.length && j < i + 20; j++) {
            const bodyLine = retLines[j].trim();
            const bodyIndent = retLines[j].match(/^(\s*)/)?.[1]?.length || 0;
            const methodIndent = (line.match(/^(\s*)/)?.[1]?.length || 0) + 4;
            if (bodyIndent < methodIndent && bodyLine.length > 0 && !bodyLine.startsWith("#") && !bodyLine.startsWith('"""')) break;
            if (bodyLine.startsWith("return ")) {
              hasReturn = true;
              if (bodyLine.includes("self.")) returnsSelf = true;
            }
          }

          let returnType = "None";
          if (isView || hasReturn) {
            returnType = "str"; // conservative default for views/returns
          }

          // Replace the line — add -> Type before the colon
          const indent = line.match(/^(\s*)/)?.[1] || "";
          const newLine = line.replace(/\)\s*:\s*$/, `) -> ${returnType}:`);
          newRetLines.push(newLine);
          continue;
        }
      }
      newRetLines.push(line);
    }
    fixed = newRetLines.join("\n");
    if (fixed !== retBefore) {
      changes.push("🔧 Added return type annotations to public methods");
    }
  }

  ///////////////////////////////////////////
  // RULE 13 — Make vague AI prompts strict
  //           (non-comparative consensus friendly)
  ///////////////////////////////////////////

  {
    const promptBefore = fixed;
    const promptLines = fixed.split("\n");
    const strictPromptLines: string[] = [];

    // Shared preamble enforced on ALL generated prompts
    const STRICT_PREAMBLE = "Return ONLY the raw JSON object. No markdown. No code fencing. No explanation. No preamble. No trailing text. Output must start with { and end with }.";

    for (let i = 0; i < promptLines.length; i++) {
      const line = promptLines[i];
      const trimmed = line.trim();

      // Match any exec_prompt call with a vague/open-ended prompt
      const execMatch = trimmed.match(/gl\.nondet\.exec_prompt\(\s*f?["'](.*?)["']\s*\)/);
      if (execMatch) {
        const promptText = execMatch[1];
        const promptLower = promptText.toLowerCase();

        // Check if the prompt already has strict JSON output constraints
        const isAlreadyStrict =
          (promptLower.includes("return only") && promptLower.includes("json")) ||
          promptLower.includes("exact json schema") ||
          promptLower.includes("raw json object") ||
          promptLower.includes("no markdown");

        if (!isAlreadyStrict) {
          const indent = line.match(/^(\s*)/)?.[1] || "        ";

          // Extract any f-string variables from the original prompt
          const fVars = [...promptText.matchAll(/\{(\w+)\}/g)].map(m => m[1]);
          const inputRef = fVars.length > 0 ? `{${fVars[0]}}` : "{input}";

          // Detect the intent to pick the right strict template
          let strictPrompt: string;
          if (/\b(classify|categor|sentiment|label)\b/.test(promptLower)) {
            strictPrompt = `f"${STRICT_PREAMBLE} Exact JSON schema (keys in this order): {{\\"category\\": \\"<lowercase_single_word>\\", \\"confidence\\": <integer_0_to_100>}}. Do not add any other keys. Input: ${inputRef}"`;
          } else if (/\b(yes|no|true|false|approve|reject)\b/.test(promptLower)) {
            strictPrompt = `f"${STRICT_PREAMBLE} Exact JSON schema (keys in this order): {{\\"decision\\": \\"YES\\" or \\"NO\\"}}. Use exactly YES or NO, uppercase, no other value. Do not add any other keys. Input: ${inputRef}"`;
          } else if (/\b(number|price|amount|score|rating)\b/.test(promptLower)) {
            strictPrompt = `f"${STRICT_PREAMBLE} Exact JSON schema (keys in this order): {{\\"value\\": <number_no_commas>}}. Output the number as a plain decimal (e.g. 42.5). Do not add any other keys. Input: ${inputRef}"`;
          } else if (/\b(summarize|summary|explain|describe)\b/.test(promptLower)) {
            strictPrompt = `f"${STRICT_PREAMBLE} Exact JSON schema (keys in this order): {{\\"summary\\": \\"<one_sentence_max_20_words>\\"}}. Keep summary deterministic and factual. Do not add any other keys. Input: ${inputRef}"`;
          } else {
            // General strict prompt — single key for maximum consensus
            strictPrompt = `f"${STRICT_PREAMBLE} Exact JSON schema: {{\\"result\\": \\"<one_sentence_max_20_words>\\"}}. Do not add any other keys. Keep the result factual and deterministic. Input: ${inputRef}"`;
          }

          // Replace the exec_prompt line with the strict version
          strictPromptLines.push(line.replace(
            /gl\.nondet\.exec_prompt\(\s*f?["'].*?["']\s*\)/,
            `gl.nondet.exec_prompt(${strictPrompt})`
          ));
          continue;
        }
      }

      strictPromptLines.push(line);
    }

    fixed = strictPromptLines.join("\n");
    if (fixed !== promptBefore) {
      changes.push("🔧 Replaced vague AI prompt(s) with strict JSON-only format (consensus-hardened)");
    }
  }

  ///////////////////////////////////////////
  // RULE 14 — Clean up stale/misleading comments
  //           that contradict the fixed code
  ///////////////////////////////////////////

  {
    const commentBefore = fixed;
    const commentLines = fixed.split("\n");
    const cleanedLines: string[] = [];
    for (const line of commentLines) {
      const trimmed = line.trim();
      // Remove comments that describe bugs that have been fixed
      if (trimmed.startsWith("#") && !trimmed.startsWith("# {")) {
        const lower = trimmed.toLowerCase();
        const isStale =
          (lower.includes("without eq_principle") && fixed.includes("eq_principle")) ||
          (lower.includes("without consensus") && fixed.includes("eq_principle")) ||
          (lower.includes("without nondet") && fixed.includes("gl.nondet")) ||
          lower.includes("# removed:") ||
          (lower.includes("calling ai without") && fixed.includes("eq_principle")) ||
          (lower.includes("external call without") && fixed.includes("gl.nondet.web"));
        if (isStale) {
          // Skip this stale comment line entirely
          continue;
        }
      }
      cleanedLines.push(line);
    }
    fixed = cleanedLines.join("\n");
    if (fixed !== commentBefore) {
      changes.push("🧹 Removed stale comments that contradicted fixed code");
    }
  }

  ///////////////////////////////////////////
  // RULE 15 — Write methods with web/AI calls
  //           should store result in state,
  //           not return it directly.
  //           GenLayer runtime ignores write
  //           method return values.
  ///////////////////////////////////////////

  {
    const r15Lines = fixed.split("\n");
    const r15Out: string[] = [];
    let r15Changed = false;
    let i = 0;
    // Track new state vars so we can add class-level declarations
    const newStateVars: {name: string; type: string}[] = [];

    while (i < r15Lines.length) {
      const line = r15Lines[i];
      const trimmed = line.trim();

      // Detect @gl.public.write decorator
      if (trimmed === "@gl.public.write") {
        const decoratorIdx = i;
        const indent = line.match(/^(\s*)/)?.[1] || "    ";
        const bodyIndent = indent + "    ";

        // Next non-empty line should be the def
        let defIdx = -1;
        for (let j = i + 1; j < Math.min(i + 3, r15Lines.length); j++) {
          if (r15Lines[j].trim().match(/^(?:async\s+)?def\s+/)) {
            defIdx = j;
            break;
          }
        }

        if (defIdx >= 0) {
          const defLine = r15Lines[defIdx].trim();
          const defMatch = defLine.match(/^(?:async\s+)?def\s+(\w+)\s*\(/);
          const methodName = defMatch ? defMatch[1] : "";

          // Scan method body for web/AI calls and return statements
          let hasWebOrAI = false;
          let returnLineIdx = -1;
          let returnVarName = "";
          let methodEndIdx = defIdx;
          const defIndentLen = (r15Lines[defIdx].match(/^(\s*)/)?.[1] || "").length;

          for (let j = defIdx + 1; j < r15Lines.length; j++) {
            const bt = r15Lines[j].trim();
            if (!bt || bt.startsWith("#") || bt.startsWith('"""') || bt.startsWith("'''")) {
              methodEndIdx = j;
              continue;
            }
            const bIndent = (r15Lines[j].match(/^(\s*)/)?.[1] || "").length;
            if (bIndent <= defIndentLen && bt.length > 0) break;
            methodEndIdx = j;

            if (bt.includes("gl.nondet.web.") || bt.includes("gl.nondet.exec_prompt") || bt.includes("gl.eq_principle")) {
              hasWebOrAI = true;
            }
            // Match: return varName (simple identifier, not self.xxx)
            const retMatch = bt.match(/^return\s+(\w+)\s*$/);
            if (retMatch && !retMatch[1].startsWith("self")) {
              returnLineIdx = j;
              returnVarName = retMatch[1];
            }
          }

          // Apply fix: write method + web/AI + returns a local variable
          if (hasWebOrAI && returnLineIdx >= 0 && returnVarName) {
            // Infer state variable name from method name or return var
            let stateVarName = "last_result";
            if (methodName.startsWith("fetch_")) {
              stateVarName = methodName.replace("fetch_", "");
            } else if (methodName.startsWith("get_")) {
              stateVarName = methodName.replace("get_", "");
            } else if (methodName.includes("price")) {
              stateVarName = "price";
            } else if (methodName.includes("data")) {
              stateVarName = "fetched_data";
            } else if (returnVarName !== "result" && returnVarName !== "response" && returnVarName !== "data") {
              stateVarName = returnVarName;
            }

            // Smart type inference for state variable — match name semantics
            const NUMERIC_HINTS = ["price", "amount", "balance", "count", "total", "num", "fee", "cost", "rate", "score", "id", "index"];
            const isNumeric = NUMERIC_HINTS.some(h => stateVarName.includes(h));
            const inferredType = isNumeric ? "u256" : "str";

            // Replace "return varName" with "self.stateVarName = varName"
            // Use type-safe assignment based on inferred type
            if (isNumeric) {
              // For numeric state vars: parse the value safely
              // data might be a parsed dict or a raw string
              r15Lines[returnLineIdx] = r15Lines[returnLineIdx].replace(
                `return ${returnVarName}`,
                `self.${stateVarName} = u256(int(float(str(${returnVarName}))))`
              );
            } else {
              r15Lines[returnLineIdx] = r15Lines[returnLineIdx].replace(
                `return ${returnVarName}`,
                `self.${stateVarName} = str(${returnVarName})`
              );
            }

            // Fix return type annotation: -> str/dict/u256  →  -> None
            r15Lines[defIdx] = r15Lines[defIdx].replace(/->\s*(str|dict|u256)\s*:/, "-> None:");

            // Convert .json() to .text inside lambda web calls
            // .text returns str (safe for state), .json() returns dict (type mismatch)
            for (let j = i; j <= methodEndIdx; j++) {
              if (r15Lines[j].includes("lambda:") && r15Lines[j].includes(".json()")) {
                r15Lines[j] = r15Lines[j].replace(/\.json\(\)/g, ".text");
                changes.push("🔧 Converted `.json()` → `.text` inside lambda (str is safer for state storage)");
              }
            }

            // Build output up to end of this method
            for (let j = i; j <= methodEndIdx; j++) {
              r15Out.push(r15Lines[j]);
            }

            // Add a @gl.public.view getter after the method
            // Return type MUST match the state variable type
            const getterName = `get_${stateVarName}`;
            r15Out.push("");
            r15Out.push(`${indent}@gl.public.view`);
            r15Out.push(`${indent}def ${getterName}(self) -> ${inferredType}:`);
            r15Out.push(`${bodyIndent}return self.${stateVarName}`);

            // Track for class-level declaration
            newStateVars.push({ name: stateVarName, type: inferredType });

            i = methodEndIdx + 1;
            r15Changed = true;
            changes.push(`🔧 \`${methodName}\`: stored result in \`self.${stateVarName}\` (str) instead of returning`);
            changes.push(`🔧 Added \`${getterName}\` @gl.public.view getter`);
            continue;
          }
        }
      }

      r15Out.push(line);
      i++;
    }

    if (r15Changed) {
      fixed = r15Out.join("\n");
    }

    // Add class-level state variable declarations for any new vars
    if (newStateVars.length > 0) {
      const declLines = fixed.split("\n");
      // Find the last existing state variable declaration in the class body
      // Pattern: indented "varname: type" lines before any def or decorator
      let lastStateVarIdx = -1;
      let stateVarIndent = "    ";
      for (let idx = 0; idx < declLines.length; idx++) {
        const t = declLines[idx].trim();
        // Class-level state var: "    varname: type" (not inside a method)
        if (/^\w+\s*:\s*(str|u256|i256|bool|TreeMap|DynArray)/.test(t)) {
          lastStateVarIdx = idx;
          stateVarIndent = declLines[idx].match(/^(\s*)/)?.[1] || "    ";
        }
        // Stop at first method or decorator (we've passed the state vars section)
        if (t.startsWith("def ") || t.startsWith("@gl.") || t.startsWith("async def ")) break;
      }

      // Filter out vars already declared
      const existingDecls = fixed;
      const toAdd = newStateVars.filter(sv => {
        const declPattern = new RegExp(`^\\s+${sv.name}\\s*:`, "m");
        return !declPattern.test(existingDecls);
      });

      if (toAdd.length > 0 && lastStateVarIdx >= 0) {
        const newDecls = toAdd.map(sv => `${stateVarIndent}${sv.name}: ${sv.type}`);
        declLines.splice(lastStateVarIdx + 1, 0, ...newDecls);
        fixed = declLines.join("\n");
        for (const sv of toAdd) {
          changes.push(`✅ Added state variable declaration \`${sv.name}: ${sv.type}\``);
        }
      }
    }
  }

  ///////////////////////////////////////////
  // RULE 16 — Fix dict-key access on consensus string variables
  //           After Rule 5b wraps web calls with .text,
  //           the response is a plain string. If the original
  //           code did data["key"], we need json.loads() + str().
  //           Also catches patterns missed by Rule 5b cleanup.
  ///////////////////////////////////////////

  {
    const r16Lines = fixed.split("\n");
    let r16Changed = false;
    let r16NeedsJsonImport = false;

    for (let i = 0; i < r16Lines.length; i++) {
      const trimmed = r16Lines[i].trim();

      // Pattern: self.xxx = varname["key"] where varname is a plain string from consensus
      // Need to check if varname was assigned from eq_principle (string result)
      const dictAccessMatch = trimmed.match(/^(self\.\w+)\s*=\s*(\w+)\s*\[/);
      if (!dictAccessMatch) continue;

      const lhs = dictAccessMatch[1]; // self.price
      const dictVar = dictAccessMatch[2]; // data

      // Look backward: was dictVar assigned from eq_principle or from a json.loads-less response?
      let needsFix = false;
      for (let k = i - 1; k >= Math.max(0, i - 15); k--) {
        const prevTrimmed = r16Lines[k].trim();
        // If dictVar = response (where response is from eq_principle)
        // This means dictVar is a string, and ["key"] will fail
        if (prevTrimmed.startsWith(`${dictVar} = `) && !prevTrimmed.includes("json.loads")) {
          // Check if the assigned value is a simple variable (consensus result)
          const assignRhs = prevTrimmed.replace(`${dictVar} = `, "").trim();
          // If RHS is a simple variable name (not a function call or dict/list literal)
          if (/^\w+$/.test(assignRhs)) {
            // Check if THAT variable was from eq_principle
            for (let m = k - 1; m >= Math.max(0, k - 15); m--) {
              const mTrimmed = r16Lines[m].trim();
              if (mTrimmed.includes("eq_principle") && mTrimmed.includes(assignRhs)) {
                needsFix = true;
                break;
              }
            }
          }
          break;
        }
        // If dictVar was already set via json.loads, no fix needed
        if (prevTrimmed.includes(`${dictVar} = json.loads(`)) {
          break;
        }
      }

      if (needsFix) {
        const indent = r16Lines[i].match(/^(\s*)/)?.[1] || "        ";
        // Find the assignment line: `data = response` → `data = json.loads(response)`
        for (let k = i - 1; k >= Math.max(0, i - 10); k--) {
          const prevTrimmed = r16Lines[k].trim();
          if (prevTrimmed.startsWith(`${dictVar} = `) && !prevTrimmed.includes("json.loads")) {
            const simpleVar = prevTrimmed.replace(`${dictVar} = `, "").trim();
            if (/^\w+$/.test(simpleVar)) {
              const prevIndent = r16Lines[k].match(/^(\s*)/)?.[1] || "        ";
              r16Lines[k] = `${prevIndent}${dictVar} = json.loads(${simpleVar})`;
              r16NeedsJsonImport = true;
              r16Changed = true;
              changes.push(`🔧 Added \`json.loads()\` to parse consensus response before dict access`);
            }
            break;
          }
        }

        // Wrap the dict-access result with type-safe conversion
        // Detect the state variable type from declaration to use correct wrapper
        if (!trimmed.includes("str(") && !trimmed.includes("u256(")) {
          const eqIdx = trimmed.indexOf("=");
          if (eqIdx > 0) {
            const rhs = trimmed.slice(eqIdx + 1).trim();
            const origIndent = r16Lines[i].match(/^(\s*)/)?.[1] || "        ";
            const stateVarField = lhs.replace("self.", "");
            // Check if state var is declared as u256/numeric
            const NUMERIC_HINTS = ["price", "amount", "balance", "count", "total", "num", "fee", "cost", "rate", "score", "id", "index"];
            const isNumericVar = NUMERIC_HINTS.some(h => stateVarField.includes(h))
              || fixed.includes(`${stateVarField}: u256`)
              || fixed.includes(`${stateVarField}: i256`);

            if (isNumericVar) {
              // Safe numeric parsing: handles "65432.10" → u256
              r16Lines[i] = `${origIndent}${lhs} = u256(int(float(str(${rhs}))))`;
              changes.push(`🔧 Wrapped dict access in \`u256(int(float()))\` for numeric state variable`);
            } else {
              r16Lines[i] = `${origIndent}${lhs} = str(${rhs})`;
              changes.push(`🔧 Wrapped dict access in \`str()\` for state variable type safety`);
            }
            r16Changed = true;
          }
        }
      }
    }

    if (r16Changed) {
      fixed = r16Lines.join("\n");
    }

    // Add import json if Rule 16 needed it
    if (r16NeedsJsonImport && !fixed.includes("import json")) {
      const genlayerImportIdx = fixed.indexOf("from genlayer import *");
      if (genlayerImportIdx >= 0) {
        const insertPos = fixed.indexOf("\n", genlayerImportIdx);
        if (insertPos >= 0) {
          fixed = fixed.slice(0, insertPos) + "\nimport json" + fixed.slice(insertPos);
        }
      } else {
        fixed = "import json\n" + fixed;
      }
      changes.push("✅ Added `import json` for safe JSON parsing");
    }
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
