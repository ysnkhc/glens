# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *
import json
import re


class AIContractDebugger(gl.Contract):
    """GenLayer AI Contract Debugger v2 — Full on-chain analysis.
    All bug detection, risk scoring, and prompt assessment happens
    inside exec_prompt via validator consensus. The frontend is a thin UI."""

    last_analysis: str
    last_explanation: str
    last_simulation: str
    last_fix: str
    total_calls: u256

    def __init__(self):
        self.last_analysis = ""
        self.last_explanation = ""
        self.last_simulation = ""
        self.last_fix = ""
        self.total_calls = u256(0)

    # ── analyze_contract ─────────────────────────────────────────
    @gl.public.write
    def analyze_contract(self, source_code: str) -> str:
        """Accept full contract source code and return comprehensive analysis JSON."""
        code = source_code[:4000]

        analysis_prompt = (
            "You are a GenLayer Intelligent Contract security auditor. "
            "Analyze the following Python contract source code for GenLayer-specific issues.\n\n"
            "<source_code>\n" + code + "\n</source_code>\n\n"
            "CHECK EACH RULE below independently. For each rule, check if it PASSES or FAILS based on the source code.\n\n"
            "CRITICAL INSTRUCTION: The pattern 'gl.vm.run_nondet_unsafe(leader_fn, validator_fn)' where leader_fn calls gl.nondet.exec_prompt is the CORRECT GenLayer pattern. "
            "If you see gl.nondet.exec_prompt INSIDE a leader_fn or lambda INSIDE run_nondet_unsafe or eq_principle, that rule PASSES. Do NOT flag it.\n\n"
            "ERRORS (contract will fail on-chain):\n"
            "- wrong_inheritance: FAILS only if the class does NOT have (gl.Contract) in its definition. PASSES if you see 'class SomeName(gl.Contract)'.\n"
            "- wrong_exec_prompt: FAILS only if code uses bare 'gl.exec_prompt(' without '.nondet'. PASSES if all exec_prompt calls are 'gl.nondet.exec_prompt('.\n"
            "- dangerous_import: FAILS only if code has 'import requests' or 'import urllib' or 'import httpx' or 'import aiohttp'. PASSES if none of those import lines exist.\n"
            "- dangerous_external_call: FAILS only if code calls requests.get(), requests.post(), urllib.request, httpx.get(), or fetch(). PASSES if only gl.nondet.web.get() or gl.nondet.web.post() is used.\n"
            "- missing_eq_principle: FAILS only if gl.nondet.exec_prompt or gl.nondet.web appears OUTSIDE of run_nondet_unsafe/eq_principle. PASSES if every gl.nondet call is inside a leader_fn/lambda.\n"
            "- decorated_constructor: __init__ must NOT have @gl.public.write or @gl.public.view decorator\n"
            "- no_contract_class: No class definition found that could be a contract\n\n"
            "WARNINGS:\n"
            "- missing_depends_header: First line should start with '# { \"Depends\":'. PASSES if the first non-empty line contains '# { \"Depends\":'.\n"
            "- missing_return_type: Public methods should have -> type annotations. PASSES if all def lines have ->.\n"
            "- missing_param_type: Method parameters (except self) should have type annotations\n"
            "- python_int_type: State variables should use u256 or i256, not Python int\n"
            "- python_dict_type: State variables should use TreeMap[K,V], not Python dict\n"
            "- python_list_type: State variables should use DynArray[T], not Python list\n\n"
            "RISK SCORING:\n"
            "- LOW: Zero errors AND all gl.nondet calls are inside run_nondet_unsafe AND prompts contain strict output constraints (ONLY, JSON, Exact, schema)\n"
            "- MEDIUM: Only warnings, no errors. Or prompts have partial constraints.\n"
            "- HIGH: Any ERROR found, OR gl.nondet calls outside run_nondet_unsafe, OR completely open-ended prompts\n\n"
            "PROMPT QUALITY:\n"
            "- HIGH: Prompts contain 'Return ONLY', 'Exact JSON', 'JSON schema', 'no markdown', 'no extra text', or specify exact output keys\n"
            "- MEDIUM: Somewhat constrained but output could vary\n"
            "- LOW: Open-ended (describe, explain, discuss, creative, tell me, summarize)\n"
            "- N/A: No AI prompts in the contract\n\n"
            "DETERMINISM RISK:\n"
            "- LOW: All non-deterministic calls properly wrapped in run_nondet_unsafe with strict constraints\n"
            "- MEDIUM: Wrapped but constraints are loose\n"
            "- HIGH: Non-deterministic calls without wrapping\n\n"
            "CONSENSUS RISK:\n"
            "- LOW: Validators will agree (run_nondet_unsafe used, strict JSON constraints, proper APIs)\n"
            "- MEDIUM: Validators might disagree on edge cases\n"
            "- HIGH: Validators will likely disagree\n\n"
            "IMPORTANT: Only add issues/warnings for rules that actually FAIL. If a rule PASSES, do NOT include it.\n\n"
            "Return this EXACT JSON structure (no markdown, no code blocks, ONLY valid JSON):\n"
            "{\"risk_level\": \"LOW or MEDIUM or HIGH\", "
            "\"issues\": [{\"rule\": \"rule_id\", \"severity\": \"ERROR\", \"message\": \"human readable description\", \"line\": line_number_or_0}], "
            "\"warnings\": [{\"rule\": \"rule_id\", \"severity\": \"WARNING\", \"message\": \"human readable description\", \"line\": line_number_or_0}], "
            "\"prompt_quality\": \"LOW or MEDIUM or HIGH or N/A\", "
            "\"determinism_risk\": \"LOW or MEDIUM or HIGH\", "
            "\"consensus_risk\": \"LOW or MEDIUM or HIGH\", "
            "\"reasoning\": \"2-3 sentence analysis explaining the key findings\", "
            "\"fix_suggestions\": [\"actionable suggestion 1\", \"actionable suggestion 2\"]}"
        )

        def leader_fn():
            return gl.nondet.exec_prompt(analysis_prompt, response_format='json')

        def validator_fn(leader_result) -> bool:
            if not isinstance(leader_result, gl.vm.Return):
                return False
            raw = leader_result.calldata
            if isinstance(raw, str):
                try:
                    data = json.loads(raw)
                except Exception:
                    return False
            elif isinstance(raw, dict):
                data = raw
            else:
                return False
            if data.get("risk_level") not in ("LOW", "MEDIUM", "HIGH"):
                return False
            if not isinstance(data.get("issues"), list):
                return False
            if not isinstance(data.get("warnings"), list):
                return False
            if data.get("prompt_quality") not in ("LOW", "MEDIUM", "HIGH", "N/A"):
                return False
            if data.get("determinism_risk") not in ("LOW", "MEDIUM", "HIGH"):
                return False
            if data.get("consensus_risk") not in ("LOW", "MEDIUM", "HIGH"):
                return False
            if not isinstance(data.get("reasoning"), str) or len(data["reasoning"]) == 0:
                return False
            if not isinstance(data.get("fix_suggestions"), list):
                return False
            return True

        result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)

        if isinstance(result, dict):
            result = json.dumps(result, sort_keys=True)
        self.last_analysis = result
        self.total_calls = self.total_calls + u256(1)
        return result

    # ── explain_contract ─────────────────────────────────────────
    @gl.public.write
    def explain_contract(self, source_code: str) -> str:
        """Accept full contract source code and return a plain-text explanation."""
        code = source_code[:4000]

        explain_prompt = (
            "You are a GenLayer expert. Analyze and explain what this intelligent contract does.\n\n"
            "<source_code>\n" + code + "\n</source_code>\n\n"
            "Explain in under 150 words:\n"
            "1. What the contract does (purpose)\n"
            "2. What state it manages (variables)\n"
            "3. What public methods are available and what they do\n"
            "4. What GenLayer features it uses (run_nondet_unsafe, nondet, web access)\n"
            "5. Any notable design patterns or potential issues\n"
            "Return plain text only. No JSON, no markdown."
        )

        def leader_fn():
            return gl.nondet.exec_prompt(explain_prompt)

        def validator_fn(leader_result) -> bool:
            if not isinstance(leader_result, gl.vm.Return):
                return False
            text = leader_result.calldata
            if not isinstance(text, str) or len(text.strip()) == 0:
                return False
            if len(text.split()) > 200:
                return False
            return True

        result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)

        self.last_explanation = result
        self.total_calls = self.total_calls + u256(1)
        return result

    # ── simulate_consensus ───────────────────────────────────────
    @gl.public.write
    def simulate_consensus(self, prompt_text: str) -> str:
        """Test whether a prompt achieves consensus across validators."""
        safe_input = prompt_text[:300]

        def leader_fn():
            raw = gl.nondet.exec_prompt(safe_input)
            words = re.findall(r'[A-Za-z0-9]+', raw.strip())
            if not words:
                raise gl.vm.UserError("Empty LLM output -- rotate this validator")
            return words[0].upper()

        def validator_fn(leader_result) -> bool:
            if not isinstance(leader_result, gl.vm.Return):
                return False
            own = leader_fn()
            return own == leader_result.calldata

        result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)

        self.last_simulation = result
        self.total_calls = self.total_calls + u256(1)
        return result

    # ── fix_contract ─────────────────────────────────────────────
    @gl.public.write
    def fix_contract(self, source_code: str, analysis_summary: str) -> str:
        """Analyze contract issues and return structured fix categories.
        Returns small, consensus-friendly JSON with issue categories
        and short fix descriptions -- NOT full code or find/replace patches.
        The client-side rule engine applies fixes deterministically.
        """
        code = source_code[:4000]
        context = analysis_summary[:1000]

        valid_categories = {
            "wrong_inheritance", "wrong_exec_prompt", "missing_eq_principle",
            "dangerous_import", "dangerous_external_call", "missing_decorator",
            "missing_depends_header", "python_int_type", "python_dict_type",
            "python_list_type", "missing_type_annotation", "weak_prompt",
            "no_contract_class",
        }

        fix_prompt = (
            "You are a GenLayer contract auditor. Analyze this contract and return a categorized list of fixes needed.\n\n"
            "<source_code>\n" + code + "\n</source_code>\n\n"
            "<previous_analysis>\n" + context + "\n</previous_analysis>\n\n"
            "Return ONLY valid JSON with this EXACT structure:\n"
            "{\"fixes\": [\n"
            "  {\"category\": \"CATEGORY_ID\", \"severity\": \"ERROR or WARNING\"}\n"
            "]}\n\n"
            "VALID CATEGORY IDs (use ONLY these exact strings):\n"
            "- wrong_inheritance: Class does not inherit from gl.Contract\n"
            "- wrong_exec_prompt: Uses gl.exec_prompt instead of gl.nondet.exec_prompt\n"
            "- missing_eq_principle: Non-deterministic calls not wrapped in run_nondet_unsafe\n"
            "- dangerous_import: Uses requests/urllib/httpx instead of gl.nondet.web\n"
            "- dangerous_external_call: Uses requests.get/post instead of gl.nondet.web.get\n"
            "- missing_decorator: Public methods missing @gl.public.write or @gl.public.view\n"
            "- missing_depends_header: First line does NOT start with # { \"Depends\": \"py-genlayer:\" -- if it does, do NOT flag this\n"
            "- python_int_type: Uses int instead of u256/i256\n"
            "- python_dict_type: Uses dict instead of TreeMap\n"
            "- python_list_type: Uses list instead of DynArray\n"
            "- missing_type_annotation: Methods missing parameter or return type annotations\n"
            "- weak_prompt: AI prompt is too vague or open-ended for consensus\n"
            "- no_contract_class: No contract class found\n\n"
            "RULES:\n"
            "- Only include categories for issues that ACTUALLY EXIST in the code\n"
            "- Do NOT invent new category IDs\n"
            "- Do NOT add any extra fields like description, priority, summary, or confidence\n"
            "Return ONLY valid JSON. No markdown, no code blocks."
        )

        def leader_fn():
            return gl.nondet.exec_prompt(fix_prompt, response_format='json')

        def validator_fn(leader_result) -> bool:
            if not isinstance(leader_result, gl.vm.Return):
                return False
            raw = leader_result.calldata
            if isinstance(raw, str):
                try:
                    data = json.loads(raw)
                except Exception:
                    return False
            elif isinstance(raw, dict):
                data = raw
            else:
                return False
            fixes = data.get("fixes")
            if not isinstance(fixes, list):
                return False
            for fix in fixes:
                if not isinstance(fix, dict):
                    return False
                if fix.get("category") not in valid_categories:
                    return False
                if fix.get("severity") not in ("ERROR", "WARNING"):
                    return False
            return True

        result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)

        if isinstance(result, dict):
            result = json.dumps(result, sort_keys=True)
        self.last_fix = result
        self.total_calls = self.total_calls + u256(1)
        return result

    # ── view methods ─────────────────────────────────────────────
    @gl.public.view
    def get_last_analysis(self) -> str:
        return self.last_analysis

    @gl.public.view
    def get_last_explanation(self) -> str:
        return self.last_explanation

    @gl.public.view
    def get_last_simulation(self) -> str:
        return self.last_simulation

    @gl.public.view
    def get_last_fix(self) -> str:
        return self.last_fix

    @gl.public.view
    def get_total_calls(self) -> u256:
        return self.total_calls
