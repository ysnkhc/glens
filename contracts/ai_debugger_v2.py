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
        self.last_analysis = ""
        self.last_explanation = ""
        self.last_simulation = ""
        self.last_fix = ""
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
                "- wrong_inheritance: Class must inherit from gl.Contract. PASSES if '(gl.Contract)' appears in any class definition\n"
                "- wrong_exec_prompt: gl.exec_prompt does NOT exist. Must use gl.nondet.exec_prompt(). PASSES if only gl.nondet.exec_prompt is used (no bare gl.exec_prompt)\n"
                "- dangerous_import: import requests, urllib, httpx, aiohttp are FORBIDDEN. PASSES if none of these imports exist, even if gl.nondet.web is used (that is correct)\n"
                "- dangerous_external_call: requests.get(), urllib.request, httpx.get(), fetch() are FORBIDDEN. PASSES if only gl.nondet.web.get/post is used. gl.nondet.web.get() inside eq_principle is the CORRECT pattern — do NOT flag it\n"
                "- missing_eq_principle: Non-deterministic calls must be inside gl.eq_principle. PASSES if every gl.nondet.exec_prompt and gl.nondet.web call is wrapped in gl.eq_principle or gl.eq_principle.prompt_non_comparative\n"
                "- decorated_constructor: __init__ must NOT have @gl.public.write or @gl.public.view decorator\n"
                "- no_contract_class: No class definition found that could be a contract\n\n"
                "WARNINGS:\n"
                "- missing_depends_header: First line must start with # { \"Depends\": \"py-genlayer: followed by any hash or 'latest'. PASSES if first line contains # { \"Depends\":\n"
                "- missing_return_type: Public methods should have return type annotations (-> str, -> None). PASSES if all def lines have ->\n"
                "- missing_param_type: Method parameters (except self) should have type annotations\n"
                "- python_int_type: State variables should use u256 or i256, not Python int\n"
                "- python_dict_type: State variables should use TreeMap[K,V], not Python dict\n"
                "- python_list_type: State variables should use DynArray[T], not Python list\n\n"
                "RISK SCORING RULES:\n"
                "- HIGH: Any ERROR found, OR open-ended AI prompts without JSON constraints, OR AI calls outside eq_principle\n"
                "- MEDIUM: Only warnings (no errors), OR AI prompts with partial constraints\n"
                "- LOW: Zero errors + eq_principle used everywhere + prompts contain 'Return ONLY' or 'JSON' or 'Exact JSON schema' + correct APIs\n\n"
                "PROMPT QUALITY (assess any AI prompts found in exec_prompt calls):\n"
                "- HIGH: Output strictly constrained — prompt contains words like ONLY, EXACT, JSON, schema, 'no markdown', 'no extra text', or specifies exact keys\n"
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
            task="Security audit of GenLayer contract.",
            criteria=(
                "Approve ONLY if ALL are true: "
                "(1) Output is parseable JSON starting with { and ending with }. "
                "(2) Has key 'risk_level' with value exactly 'LOW', 'MEDIUM', or 'HIGH'. "
                "(3) Has key 'issues' that is an array. "
                "(4) Has key 'warnings' that is an array. "
                "(5) Has key 'prompt_quality' with value exactly 'LOW', 'MEDIUM', 'HIGH', or 'N/A'. "
                "(6) Has key 'determinism_risk' with value exactly 'LOW', 'MEDIUM', or 'HIGH'. "
                "(7) Has key 'consensus_risk' with value exactly 'LOW', 'MEDIUM', or 'HIGH'. "
                "(8) Has key 'reasoning' that is a non-empty string. "
                "(9) Has key 'fix_suggestions' that is an array. "
                "Reject if ANY condition fails."
            )
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
    def fix_contract(self, source_code: str, analysis_summary: str) -> str:
        """Analyze contract issues and return structured fix categories.
        Returns small, consensus-friendly JSON with issue categories
        and short fix descriptions — NOT full code or find/replace patches.
        The client-side rule engine applies fixes deterministically.
        """
        code = source_code[:4000]
        context = analysis_summary[:1000]

        result = gl.eq_principle.prompt_non_comparative(
            lambda: gl.nondet.exec_prompt(
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
                "- missing_eq_principle: Non-deterministic calls not wrapped in gl.eq_principle\n"
                "- dangerous_import: Uses requests/urllib/httpx instead of gl.nondet.web\n"
                "- dangerous_external_call: Uses requests.get/post instead of gl.nondet.web.get\n"
                "- missing_decorator: Public methods missing @gl.public.write or @gl.public.view\n"
                "- missing_depends_header: First line does NOT start with # { \"Depends\": \"py-genlayer:\" — if it does, do NOT flag this\n"
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
            ),
            task="List issue categories in contract.",
            criteria=(
                "Approve ONLY if ALL are true: "
                "(1) Output is parseable JSON starting with { and ending with }. "
                "(2) Has exactly one top-level key: 'fixes'. "
                "(3) 'fixes' is an array. "
                "(4) Each element has 'category' (string) and 'severity' (string). "
                "(5) Each 'severity' is exactly 'ERROR' or 'WARNING'. "
                "(6) Each 'category' is one of: wrong_inheritance, wrong_exec_prompt, "
                "missing_eq_principle, dangerous_import, dangerous_external_call, "
                "missing_decorator, missing_depends_header, python_int_type, "
                "python_dict_type, python_list_type, missing_type_annotation, "
                "weak_prompt, no_contract_class. "
                "Reject if ANY condition fails."
            )
        )

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
