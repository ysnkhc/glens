# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *


class AIContractDebugger(gl.Contract):
    last_analysis: str
    last_explanation: str
    last_simulation: str
    last_fix: str
    total_calls: u256

    def __init__(self):
        self.total_calls = u256(0)

    @gl.public.write
    def analyze_contract(self, summary: str) -> str:
        safe_input = summary[:500]
        result = gl.eq_principle.prompt_non_comparative(
            lambda: gl.nondet.exec_prompt(
                "You are a GenLayer Intelligent Contract auditor. "
                "Analyze this contract summary and return STRICT JSON only: "
                + safe_input
                + " Return this exact JSON structure: "
                "{\"prompt_quality\": \"LOW or MEDIUM or HIGH\", "
                "\"determinism_risk\": \"LOW or MEDIUM or HIGH\", "
                "\"consensus_risk\": \"LOW or MEDIUM or HIGH\", "
                "\"reasoning\": \"2-3 sentence explanation\", "
                "\"fix_suggestions\": [\"suggestion 1\", \"suggestion 2\"]}. "
                "Return ONLY valid JSON."
            ),
            task="Analyze the given contract summary for quality, determinism and consensus risks.",
            criteria="The output must be valid JSON with all required fields: prompt_quality, determinism_risk, consensus_risk, reasoning, fix_suggestions."
        )

        self.last_analysis = result
        self.total_calls = self.total_calls + u256(1)
        return result

    @gl.public.write
    def explain_contract(self, summary: str) -> str:
        safe_input = summary[:500]
        result = gl.eq_principle.prompt_non_comparative(
            lambda: gl.nondet.exec_prompt(
                "You are a GenLayer expert. Based on this contract summary, explain what the contract does. "
                + safe_input
                + " Explain in under 100 words. Return plain text only."
            ),
            task="Explain what the contract does based on the summary.",
            criteria="The explanation must be under 100 words, in plain text, and accurately describe the contract."
        )

        self.last_explanation = result
        self.total_calls = self.total_calls + u256(1)
        return result

    @gl.public.write
    def simulate_consensus(self, prompt_text: str) -> str:
        safe_input = prompt_text[:300]

        def _execute_and_extract():
            raw = gl.nondet.exec_prompt(safe_input)
            # Extract ONLY the first word — kill hallucination
            # "YES, I confirm" → "YES"
            # "Understood. YES" → "UNDERSTOOD" (will fail validation)
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
    def fix_contract(self, issues: str) -> str:
        safe_input = issues[:400]
        result = gl.eq_principle.prompt_non_comparative(
            lambda: gl.nondet.exec_prompt(
                "You are a GenLayer contract fixer. Given these issues, suggest fixes. Issues: "
                + safe_input
                + " Return STRICT JSON only: "
                "{\"changes_made\": [\"fix 1\", \"fix 2\"]}. "
                "Return ONLY valid JSON."
            ),
            task="Suggest fixes for the given contract issues.",
            criteria="The output must be valid JSON with a changes_made array containing actionable fix suggestions."
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
    def get_total_calls(self) -> u256:
        return self.total_calls

    @gl.public.view
    def get_last_fix(self) -> str:
        return self.last_fix
