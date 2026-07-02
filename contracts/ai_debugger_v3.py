# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *
import json
import re


class AIContractDebugger(gl.Contract):
    """GLENS AI Contract Debugger v3 with consensus-certified audit reports."""

    last_analysis: str
    last_explanation: str
    last_simulation: str
    last_fix: str
    total_calls: u256

    report_count: u256
    reports: TreeMap[u256, str]
    report_titles: TreeMap[u256, str]
    report_owners: TreeMap[u256, str]
    last_report_by_owner: TreeMap[str, u256]

    def __init__(self):
        self.last_analysis = ""
        self.last_explanation = ""
        self.last_simulation = ""
        self.last_fix = ""
        self.total_calls = u256(0)

        self.report_count = u256(0)
        self.reports = TreeMap[u256, str]()
        self.report_titles = TreeMap[u256, str]()
        self.report_owners = TreeMap[u256, str]()
        self.last_report_by_owner = TreeMap[str, u256]()

    def _user_error(self, message: str):
        raise gl.vm.UserError(message)

    def _clean_text(self, value: str, max_len: int) -> str:
        cleaned = re.sub(r"\s+", " ", value).strip()
        if len(cleaned) > max_len:
            cleaned = cleaned[:max_len].strip()
        return cleaned

    def _clean_title(self, project_name: str) -> str:
        if not isinstance(project_name, str):
            self._user_error("Project name must be text.")
        title = self._clean_text(project_name, 80)
        if len(title) == 0:
            self._user_error("Project name is required.")
        if len(re.sub(r"\s+", " ", project_name).strip()) > 80:
            self._user_error("Project name must be 80 characters or less.")
        return title

    def _clean_source(self, source_code: str) -> str:
        if not isinstance(source_code, str):
            self._user_error("Source code must be text.")
        source = source_code.strip()
        if len(source) == 0:
            self._user_error("Source code is required.")
        if len(source) > 4000:
            self._user_error("Source code must be 4000 characters or less.")
        return source

    def _caller(self) -> str:
        sender = str(gl.message.sender)
        if len(sender.strip()) == 0:
            self._user_error("Caller address is unavailable.")
        return sender

    def _parse_json_object(self, raw):
        if isinstance(raw, str):
            try:
                data = json.loads(raw)
            except Exception:
                self._user_error("Audit report AI response was not valid JSON.")
        elif isinstance(raw, dict):
            data = raw
        else:
            self._user_error("Audit report AI response must be a JSON object.")

        if not isinstance(data, dict):
            self._user_error("Audit report AI response must be a JSON object.")
        return data

    def _normalize_enum(self, value, field_name: str, allowed: tuple) -> str:
        if not isinstance(value, str):
            self._user_error(field_name + " must be text.")
        normalized = value.strip().upper()
        if normalized not in allowed:
            self._user_error(field_name + " has an invalid value.")
        return normalized

    def _normalize_line(self, value) -> int:
        if isinstance(value, int):
            if value < 0:
                self._user_error("Issue line must be zero or positive.")
            return value
        self._user_error("Issue line must be a number.")

    def _normalize_finding(self, item, expected_severity: str):
        if not isinstance(item, dict):
            self._user_error("Audit findings must be JSON objects.")

        rule = item.get("rule")
        message = item.get("message")
        if not isinstance(rule, str) or len(rule.strip()) == 0:
            self._user_error("Audit finding rule is required.")
        if not isinstance(message, str) or len(message.strip()) == 0:
            self._user_error("Audit finding message is required.")

        severity = self._normalize_enum(
            item.get("severity"),
            "Audit finding severity",
            ("ERROR", "WARNING"),
        )
        if severity != expected_severity:
            self._user_error("Audit finding severity does not match its section.")

        return {
            "rule": self._clean_text(rule, 80),
            "severity": severity,
            "message": self._clean_text(message, 300),
            "line": self._normalize_line(item.get("line", 0)),
        }

    def _normalize_findings(self, items, expected_severity: str):
        if not isinstance(items, list):
            self._user_error(expected_severity.lower() + " findings must be a list.")
        if len(items) > 50:
            self._user_error(expected_severity.lower() + " findings are limited to 50 entries.")
        normalized = []
        for item in items:
            normalized.append(self._normalize_finding(item, expected_severity))
        return normalized

    def _normalize_string_list(self, items, field_name: str):
        if not isinstance(items, list):
            self._user_error(field_name + " must be a list.")
        if len(items) > 20:
            self._user_error(field_name + " is limited to 20 entries.")
        normalized = []
        for item in items:
            if not isinstance(item, str):
                self._user_error(field_name + " entries must be text.")
            cleaned = self._clean_text(item, 240)
            if len(cleaned) > 0:
                normalized.append(cleaned)
        return normalized

    def _normalize_audit_response(self, raw):
        data = self._parse_json_object(raw)
        required = (
            "risk_level",
            "issues",
            "warnings",
            "prompt_quality",
            "determinism_risk",
            "consensus_risk",
            "reasoning",
            "fix_suggestions",
        )
        for key in required:
            if key not in data:
                self._user_error("Audit report missing required field: " + key)

        reasoning = data.get("reasoning")
        if not isinstance(reasoning, str) or len(reasoning.strip()) == 0:
            self._user_error("Audit report reasoning is required.")

        return {
            "risk_level": self._normalize_enum(data.get("risk_level"), "risk_level", ("LOW", "MEDIUM", "HIGH")),
            "issues": self._normalize_findings(data.get("issues"), "ERROR"),
            "warnings": self._normalize_findings(data.get("warnings"), "WARNING"),
            "prompt_quality": self._normalize_enum(data.get("prompt_quality"), "prompt_quality", ("LOW", "MEDIUM", "HIGH", "N/A")),
            "determinism_risk": self._normalize_enum(data.get("determinism_risk"), "determinism_risk", ("LOW", "MEDIUM", "HIGH")),
            "consensus_risk": self._normalize_enum(data.get("consensus_risk"), "consensus_risk", ("LOW", "MEDIUM", "HIGH")),
            "reasoning": self._clean_text(reasoning, 600),
            "fix_suggestions": self._normalize_string_list(data.get("fix_suggestions"), "fix_suggestions"),
        }

    def _error_rule_ids(self, audit_data):
        rule_ids = set()
        for issue in audit_data.get("issues", []):
            if issue.get("severity") == "ERROR":
                rule_ids.add(issue.get("rule"))
        return sorted(rule_ids)

    def _decision_digest(self, audit_data) -> str:
        return json.dumps({
            "consensus_risk": audit_data.get("consensus_risk"),
            "error_rules": self._error_rule_ids(audit_data),
            "risk_level": audit_data.get("risk_level"),
        }, sort_keys=True, separators=(",", ":"))

    def _serialize_audit(self, audit_data) -> str:
        return json.dumps(audit_data, sort_keys=True, separators=(",", ":"))

    def _validate_report_consensus(self, leader_result, leader_fn) -> bool:
        if not isinstance(leader_result, gl.vm.Return):
            return False
        try:
            leader_data = self._normalize_audit_response(leader_result.calldata)
            validator_raw = leader_fn()
            validator_data = self._normalize_audit_response(validator_raw)
            return self._decision_digest(leader_data) == self._decision_digest(validator_data)
        except Exception:
            return False

    def _audit_prompt(self, title: str, source: str) -> str:
        return (
            "You are the GLENS GenLayer Intelligent Contract security auditor. "
            "Create a consensus-certified audit report for the project below. "
            "Evaluate only the provided source. Do not include the full source code in the response.\n\n"
            "<project_name>\n" + title + "\n</project_name>\n\n"
            "<source_code>\n" + source + "\n</source_code>\n\n"
            "Check GenLayer contract safety rules, including inheritance from gl.Contract, "
            "proper gl.nondet.exec_prompt usage, nondeterministic calls inside run_nondet_unsafe, "
            "forbidden HTTP libraries, typed persistent state, strict AI output formats, "
            "prompt determinism, and validator consensus risk.\n\n"
            "Return ONLY valid JSON with this exact shape and no markdown:\n"
            "{\"risk_level\":\"LOW|MEDIUM|HIGH\","
            "\"issues\":[{\"rule\":\"rule_id\",\"severity\":\"ERROR\",\"message\":\"short finding\",\"line\":0}],"
            "\"warnings\":[{\"rule\":\"rule_id\",\"severity\":\"WARNING\",\"message\":\"short finding\",\"line\":0}],"
            "\"prompt_quality\":\"LOW|MEDIUM|HIGH|N/A\","
            "\"determinism_risk\":\"LOW|MEDIUM|HIGH\","
            "\"consensus_risk\":\"LOW|MEDIUM|HIGH\","
            "\"reasoning\":\"2-4 concise sentences\","
            "\"fix_suggestions\":[\"actionable suggestion\"]}\n\n"
            "Only include issues for rules that fail. Only include warnings for warnings that apply. "
            "The decisive consensus fields are risk_level, consensus_risk, and the sorted unique rule IDs "
            "for ERROR issues."
        )

    @gl.public.write
    def create_audit_report(self, project_name: str, source_code: str) -> u256:
        title = self._clean_title(project_name)
        source = self._clean_source(source_code)
        prompt = self._audit_prompt(title, source)

        def leader_fn():
            raw = gl.nondet.exec_prompt(prompt, response_format='json')
            audit_data = self._normalize_audit_response(raw)
            return self._serialize_audit(audit_data)

        def validator_fn(leader_result) -> bool:
            return self._validate_report_consensus(leader_result, leader_fn)

        result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        audit_data = self._normalize_audit_response(result)
        serialized = self._serialize_audit(audit_data)

        report_id = self.report_count + u256(1)
        owner = self._caller()
        self.reports[report_id] = serialized
        self.report_titles[report_id] = title
        self.report_owners[report_id] = owner
        self.last_report_by_owner[owner] = report_id
        self.report_count = report_id
        self.total_calls = self.total_calls + u256(1)
        return report_id

    @gl.public.write
    def analyze_contract(self, source_code: str) -> str:
        code = source_code[:4000]
        analysis_prompt = (
            "You are a GenLayer Intelligent Contract security auditor. "
            "Analyze the following Python contract source code for GenLayer-specific issues.\n\n"
            "<source_code>\n" + code + "\n</source_code>\n\n"
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
            try:
                data = self._normalize_audit_response(leader_result.calldata)
                return isinstance(data, dict)
            except Exception:
                return False

        result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)

        if isinstance(result, dict):
            result = json.dumps(result, sort_keys=True)
        self.last_analysis = result
        self.total_calls = self.total_calls + u256(1)
        return result

    @gl.public.write
    def explain_contract(self, source_code: str) -> str:
        code = source_code[:4000]
        explain_prompt = (
            "You are a GenLayer expert. Analyze and explain what this intelligent contract does.\n\n"
            "<source_code>\n" + code + "\n</source_code>\n\n"
            "Explain in under 150 words. Return plain text only. No JSON, no markdown."
        )

        def leader_fn():
            return gl.nondet.exec_prompt(explain_prompt)

        def validator_fn(leader_result) -> bool:
            if not isinstance(leader_result, gl.vm.Return):
                return False
            text = leader_result.calldata
            return isinstance(text, str) and len(text.strip()) > 0 and len(text.split()) <= 200

        result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        self.last_explanation = result
        self.total_calls = self.total_calls + u256(1)
        return result

    @gl.public.write
    def simulate_consensus(self, prompt_text: str) -> str:
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

    @gl.public.write
    def fix_contract(self, source_code: str, analysis_summary: str) -> str:
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
            "{\"fixes\": [{\"category\": \"CATEGORY_ID\", \"severity\": \"ERROR or WARNING\"}]}\n"
            "Use only valid category IDs. No markdown, no code blocks."
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

    def _require_report(self, report_id: u256) -> u256:
        if report_id <= u256(0) or report_id > self.report_count:
            self._user_error("Unknown audit report ID.")
        return report_id

    @gl.public.view
    def get_report(self, report_id: u256) -> str:
        report_id = self._require_report(report_id)
        return self.reports[report_id]

    @gl.public.view
    def get_report_title(self, report_id: u256) -> str:
        report_id = self._require_report(report_id)
        return self.report_titles[report_id]

    @gl.public.view
    def get_report_owner(self, report_id: u256) -> str:
        report_id = self._require_report(report_id)
        return self.report_owners[report_id]

    @gl.public.view
    def get_report_count(self) -> u256:
        return self.report_count

    @gl.public.view
    def get_last_report_id(self, owner: str) -> u256:
        if not isinstance(owner, str) or len(owner.strip()) == 0:
            return u256(0)
        try:
            return self.last_report_by_owner[owner]
        except Exception:
            return u256(0)

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
