# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *


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
        self.total_calls = u256(0)

    @gl.public.write
    def analyze_contract(self, source_code: str) -> str:
        """Accept full contract source code and return comprehensive analysis JSON."""
        code = source_code[:4000]

        result = gl.eq_principle.prompt_non_comparative(
            lambda: gl.nondet.exec_prompt(
                "You are a GenLayer Intelligent Contract security auditor. "
                "Analyze the following Python contract source code for GenLayer-specific issues.\n\n"
                "<source_code>\n" + code + "\n</source_code>\n\n"
                "CHECK THESE RULES:\n\n"
                "ERRORS (contract will fail on-chain):\n"
                "- wrong_inheritance: Class must inherit from gl.Contract (not dict, list, object, or other Python types)\n"
                "- wrong_exec_prompt: gl.exec_prompt does NOT exist. Must use gl.nondet.exec_prompt()\n"
                "- dangerous_import: import requests, urllib, httpx, aiohttp are FORBIDDEN. Must use gl.nondet.web.get()\n"
                "- dangerous_external_call: requests.get(), requests.post(), urllib.request, httpx.get(), fetch() are FORBIDDEN. Must use gl.nondet.web.get()\n"
                "- missing_eq_principle: ALL non-deterministic calls (exec_prompt, web.get) MUST be wrapped in gl.eq_principle. Without it validators disagree and the transaction fails\n"
                "- decorated_constructor: __init__ must NOT have @gl.public.write or @gl.public.view decorator\n"
                "- no_contract_class: No class definition found that could be a contract\n\n"
                "WARNINGS:\n"
                "- missing_depends_header: First line should be # { \"Depends\": \"py-genlayer:<hash>\" } for deployment\n"
                "- missing_return_type: Public methods should have return type annotations (-> str, -> None)\n"
                "- missing_param_type: Method parameters (except self) should have type annotations\n"
                "- python_int_type: State variables should use u256 or i256, not Python int\n"
                "- python_dict_type: State variables should use TreeMap[K,V], not Python dict\n"
                "- python_list_type: State variables should use DynArray[T], not Python list\n\n"
                "RISK SCORING RULES:\n"
                "- HIGH: Any ERROR found, OR open-ended AI prompts (describe/explain/discuss/creative/summarize/tell me/random), OR AI calls without eq_principle\n"
                "- MEDIUM: Only warnings (no errors), OR AI with eq_principle but weakly constrained prompts\n"
                "- LOW: Zero errors + eq_principle used + prompts are strictly constrained (ONLY/EXACT/YES or NO/single word/JSON only/decimal number) + correct APIs used\n\n"
                "PROMPT QUALITY (assess any AI prompts found in exec_prompt calls):\n"
                "- HIGH: Output strictly constrained (ONLY, EXACT, EXACTLY, single word, YES or NO, JSON only, decimal number, UPPERCASE)\n"
                "- MEDIUM: Somewhat constrained but output could vary between validators\n"
                "- LOW: Open-ended (describe, explain, discuss, creative, tell me, summarize, what do you think)\n"
                "- If no AI prompts exist, set prompt_quality to N/A\n\n"
                "DETERMINISM RISK:\n"
                "- HIGH: Uses external data sources, open-ended AI, or non-deterministic logic without proper wrapping\n"
                "- MEDIUM: Uses AI with eq_principle but outputs could still vary\n"
                "- LOW: Fully deterministic or properly wrapped with strict output constraints\n\n"
                "CONSENSUS RISK:\n"
                "- HIGH: Validators will likely disagree (missing eq_principle, open-ended prompts, external calls without nondet)\n"
                "- MEDIUM: Validators might disagree on edge cases\n"
                "- LOW: Validators will agree (strict constraints, eq_principle, proper APIs)\n\n"
                "Return this EXACT JSON structure (no markdown, no code blocks, ONLY valid JSON):\n"
                "{\"risk_level\": \"LOW or MEDIUM or HIGH\", "
                "\"issues\": [{\"rule\": \"rule_id\", \"severity\": \"ERROR\", \"message\": \"human readable description\", \"line\": line_number_or_0}], "
                "\"warnings\": [{\"rule\": \"rule_id\", \"severity\": \"WARNING\", \"message\": \"human readable description\", \"line\": line_number_or_0}], "
                "\"prompt_quality\": \"LOW or MEDIUM or HIGH or N/A\", "
                "\"determinism_risk\": \"LOW or MEDIUM or HIGH\", "
                "\"consensus_risk\": \"LOW or MEDIUM or HIGH\", "
                "\"reasoning\": \"2-3 sentence analysis explaining the key findings\", "
                "\"fix_suggestions\": [\"actionable suggestion 1\", \"actionable suggestion 2\"]}"
            ),
            task="Perform comprehensive security audit of a GenLayer intelligent contract.",
            criteria="Output must be valid JSON with all required fields: risk_level, issues array, warnings array, prompt_quality, determinism_risk, consensus_risk, reasoning, fix_suggestions array."
        )

        self.last_analysis = result
        self.total_calls = self.total_calls + u256(1)
        return result

    @gl.public.write
    def explain_contract(self, source_code: str) -> str:
        """Accept full contract source code and return a plain-text explanation."""
        code = source_code[:4000]

        result = gl.eq_principle.prompt_non_comparative(
            lambda: gl.nondet.exec_prompt(
                "You are a GenLayer expert. Analyze and explain what this intelligent contract does.\n\n"
                "<source_code>\n" + code + "\n</source_code>\n\n"
                "Explain in under 150 words:\n"
                "1. What the contract does (purpose)\n"
                "2. What state it manages (variables)\n"
                "3. What public methods are available and what they do\n"
                "4. What GenLayer features it uses (eq_principle, nondet, web access)\n"
                "5. Any notable design patterns or potential issues\n"
                "Return plain text only. No JSON, no markdown."
            ),
            task="Explain what the intelligent contract does based on its full source code.",
            criteria="The explanation must be under 150 words, in plain text, and accurately describe the contract's purpose, state, methods, and GenLayer features."
        )

        self.last_explanation = result
        self.total_calls = self.total_calls + u256(1)
        return result

    @gl.public.write
    def simulate_consensus(self, prompt_text: str) -> str:
        """Test whether a prompt achieves consensus across validators."""
        safe_input = prompt_text[:300]

        def _execute_and_extract():
            raw = gl.nondet.exec_prompt(safe_input)
            import re
            words = re.findall(r'[A-Za-z0-9]+', raw.strip())
            if not words:
                raise Exception("Empty LLM output — rotate this validator")
            first_word = words[0].upper()
            return first_word

        result = gl.eq_principle(
            _execute_and_extract,
            task="Execute prompt and extract first word of output",
            criteria="Outputs are equivalent if the first meaningful word is identical"
        )

        self.last_simulation = result
        self.total_calls = self.total_calls + u256(1)
        return result

    @gl.public.write
    def fix_contract(self, source_code: str) -> str:
        """Accept full source code and return structured JSON patches.
        Uses run_nondet_unsafe with a custom validator that programmatically
        verifies every 'find' string is a real substring of the source code.
        This gives much higher consensus success than prompt_non_comparative.
        """
        code = source_code[:4000]
        import json

        prompt = (
            "You are a GenLayer contract fixer. Analyze this contract and return ONLY a JSON list of patches.\n\n"
            "<source_code>\n" + code + "\n</source_code>\n\n"
            "GenLayer rules to check:\n"
            "- Class must inherit from gl.Contract\n"
            "- Must use gl.nondet.exec_prompt() not gl.exec_prompt\n"
            "- Must use gl.nondet.web.get() not requests/urllib/httpx\n"
            "- All non-deterministic calls must be wrapped in gl.eq_principle\n"
            "- Should have # { \"Depends\": \"py-genlayer:<hash>\" } header\n"
            "- Public methods need @gl.public.write or @gl.public.view decorator\n"
            "- State variables should use u256/i256/TreeMap/DynArray not int/dict/list\n"
            "- Methods should have type annotations\n\n"
            "Return this EXACT JSON structure (no markdown, no code blocks, ONLY valid JSON):\n"
            "{\"patches\": [\n"
            "  {\"find\": \"exact string to find in source\", \"replace\": \"exact replacement string\", \"reason\": \"why this fix is needed\"},\n"
            "  {\"find\": \"another exact string\", \"replace\": \"its replacement\", \"reason\": \"explanation\"}\n"
            "], \"summary\": \"one sentence summary of all fixes applied\"}\n\n"
            "CRITICAL RULES FOR PATCHES:\n"
            "- find must be COPIED EXACTLY from the source code — character for character, including whitespace\n"
            "- replace must be the corrected version of that exact substring\n"
            "- Keep patches minimal — only change what is broken\n"
            "- Do NOT include patches for things that are already correct\n"
            "- Order patches from top of file to bottom\n"
            "Return ONLY valid JSON. No markdown, no code blocks."
        )

        def leader_fn():
            raw = gl.nondet.exec_prompt(prompt)
            return raw

        def validator_fn(leader_result) -> bool:
            if not isinstance(leader_result, gl.vm.Return):
                return False

            # ── Parse leader output ──
            try:
                leader_data = json.loads(leader_result.calldata)
                leader_patches = leader_data.get("patches", [])
            except Exception:
                return False

            # ── Must have patches array and summary ──
            if not isinstance(leader_patches, list):
                return False
            if not isinstance(leader_data.get("summary"), str):
                return False

            # ── HARD GATE: Every find must be a real substring of source ──
            for p in leader_patches:
                if not isinstance(p, dict):
                    return False
                find_str = p.get("find")
                replace_str = p.get("replace")
                if not isinstance(find_str, str) or not isinstance(replace_str, str):
                    return False
                if find_str not in code:
                    return False  # Leader hallucinated — reject

            # ── Structural sanity: independent validator run ──
            try:
                validator_raw = leader_fn()
                validator_data = json.loads(validator_raw)
                validator_patches = validator_data.get("patches", [])
                # Patch count tolerance: within ±2
                if abs(len(leader_patches) - len(validator_patches)) > 2:
                    return False
            except Exception:
                # Validator LLM failed but leader patches are verified ─ accept
                pass

            return True

        result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        self.last_fix = result
        self.total_calls = self.total_calls + u256(1)
        return result

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
