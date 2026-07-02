import importlib.util
import json
import sys
import types
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class U256(int):
    def __new__(cls, value=0):
        return int.__new__(cls, value)

    def __add__(self, other):
        return U256(int(self) + int(other))


class TreeMap(dict):
    def __class_getitem__(cls, _item):
        return cls


class FakeReturn:
    def __init__(self, calldata):
        self.calldata = calldata


class FakeUserError(Exception):
    pass


class FakeVm:
    Return = FakeReturn
    UserError = FakeUserError

    def run_nondet_unsafe(self, leader_fn, validator_fn):
        leader_value = leader_fn()
        accepted = validator_fn(FakeReturn(leader_value))
        if not accepted:
            raise FakeUserError("Consensus validation failed.")
        return leader_value


class FakeNondet:
    def __init__(self):
        self.outputs = []
        self.prompts = []

    def exec_prompt(self, prompt, response_format=None):
        self.prompts.append({"prompt": prompt, "response_format": response_format})
        if not self.outputs:
            raise AssertionError("No fake LLM output queued.")
        output = self.outputs.pop(0)
        if callable(output):
            return output(prompt, response_format)
        return output


class FakePublic:
    @staticmethod
    def write(fn):
        return fn

    @staticmethod
    def view(fn):
        return fn


class FakeMessage:
    sender = "0x0000000000000000000000000000000000000000"


class FakeGl:
    Contract = object

    def __init__(self):
        self.vm = FakeVm()
        self.nondet = FakeNondet()
        self.public = FakePublic()
        self.message = FakeMessage()


def install_fake_genlayer(fake_gl):
    module = types.ModuleType("genlayer")
    module.gl = fake_gl
    module.u256 = U256
    module.TreeMap = TreeMap
    sys.modules["genlayer"] = module


def load_contract():
    fake_gl = FakeGl()
    install_fake_genlayer(fake_gl)
    path = ROOT / "contracts" / "ai_debugger_v3.py"
    spec = importlib.util.spec_from_file_location("ai_debugger_v3_under_test", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.AIContractDebugger(), fake_gl, module


def report_fixture(**overrides):
    data = {
        "risk_level": "LOW",
        "issues": [],
        "warnings": [
            {
                "rule": "missing_depends_header",
                "severity": "WARNING",
                "message": "Header should pin py-genlayer.",
                "line": 1,
            }
        ],
        "prompt_quality": "HIGH",
        "determinism_risk": "LOW",
        "consensus_risk": "LOW",
        "reasoning": "The contract uses deterministic storage and no unsafe nondeterminism.",
        "fix_suggestions": ["Pin the dependency header."],
    }
    data.update(overrides)
    return data


class AuditReportContractTests(unittest.TestCase):
    def test_create_report_increments_and_stores_report_by_owner(self):
        contract, fake_gl, _module = load_contract()
        fake_gl.message.sender = "0x1111111111111111111111111111111111111111"
        fake_gl.nondet.outputs = [report_fixture(), report_fixture(reasoning="Validator wording differs.")]

        report_id = contract.create_audit_report("  Project   Alpha  ", "from genlayer import *")

        self.assertEqual(report_id, U256(1))
        self.assertEqual(contract.get_report_count(), U256(1))
        self.assertEqual(contract.get_report_title(U256(1)), "Project Alpha")
        self.assertEqual(contract.get_report_owner(U256(1)), fake_gl.message.sender)
        self.assertEqual(contract.get_last_report_id(fake_gl.message.sender), U256(1))
        stored = json.loads(contract.get_report(U256(1)))
        self.assertEqual(stored["risk_level"], "LOW")
        self.assertEqual(stored["consensus_risk"], "LOW")
        self.assertNotIn("source_code", stored)
        self.assertEqual(len(fake_gl.nondet.prompts), 2)

    def test_owner_indexes_are_isolated(self):
        contract, fake_gl, _module = load_contract()
        fake_gl.nondet.outputs = [report_fixture(), report_fixture(), report_fixture(), report_fixture()]

        fake_gl.message.sender = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        first_id = contract.create_audit_report("Owner A", "contract A")
        fake_gl.message.sender = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
        second_id = contract.create_audit_report("Owner B", "contract B")

        self.assertEqual(first_id, U256(1))
        self.assertEqual(second_id, U256(2))
        self.assertEqual(contract.get_last_report_id("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"), U256(1))
        self.assertEqual(contract.get_last_report_id("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"), U256(2))

    def test_input_validation_is_clear(self):
        contract, _fake_gl, _module = load_contract()

        with self.assertRaisesRegex(FakeUserError, "Project name is required"):
            contract.create_audit_report("   ", "source")
        with self.assertRaisesRegex(FakeUserError, "80 characters"):
            contract.create_audit_report("x" * 81, "source")
        with self.assertRaisesRegex(FakeUserError, "Source code is required"):
            contract.create_audit_report("Project", "   ")
        with self.assertRaisesRegex(FakeUserError, "4000 characters"):
            contract.create_audit_report("Project", "x" * 4001)

    def test_malformed_json_and_invalid_enums_are_rejected(self):
        contract, fake_gl, _module = load_contract()
        fake_gl.nondet.outputs = ["{not-json"]

        with self.assertRaisesRegex(FakeUserError, "not valid JSON"):
            contract.create_audit_report("Project", "source")

        bad_enum = report_fixture(risk_level="CRITICAL")
        with self.assertRaisesRegex(FakeUserError, "risk_level has an invalid value"):
            contract._normalize_audit_response(bad_enum)

    def test_validator_accepts_only_non_decisive_differences(self):
        contract, fake_gl, _module = load_contract()
        leader = report_fixture(reasoning="Leader wording.")
        validator = report_fixture(reasoning="Validator wording.", fix_suggestions=["Different suggestion."])
        fake_gl.nondet.outputs = [leader, validator]

        report_id = contract.create_audit_report("Decision Stable", "source")
        stored = json.loads(contract.get_report(report_id))

        self.assertEqual(report_id, U256(1))
        self.assertEqual(stored["reasoning"], "Leader wording.")

    def test_validator_rejects_decisive_disagreement(self):
        contract, fake_gl, _module = load_contract()
        leader = report_fixture(risk_level="LOW", consensus_risk="LOW")
        validator = report_fixture(risk_level="HIGH", consensus_risk="LOW")
        fake_gl.nondet.outputs = [leader, validator]

        with self.assertRaisesRegex(FakeUserError, "Consensus validation failed"):
            contract.create_audit_report("Decision Changed", "source")
        self.assertEqual(contract.get_report_count(), U256(0))

    def test_validator_rejects_consensus_risk_disagreement(self):
        contract, fake_gl, _module = load_contract()
        leader = report_fixture(risk_level="LOW", consensus_risk="LOW")
        validator = report_fixture(risk_level="LOW", consensus_risk="HIGH")
        fake_gl.nondet.outputs = [leader, validator]

        with self.assertRaisesRegex(FakeUserError, "Consensus validation failed"):
            contract.create_audit_report("Consensus Risk Changed", "source")
        self.assertEqual(contract.get_report_count(), U256(0))

    def test_validator_rejects_changed_error_rule_ids(self):
        contract, fake_gl, _module = load_contract()
        leader = report_fixture(
            risk_level="HIGH",
            consensus_risk="HIGH",
            issues=[{"rule": "wrong_exec_prompt", "severity": "ERROR", "message": "Bad API.", "line": 4}],
        )
        validator = report_fixture(
            risk_level="HIGH",
            consensus_risk="HIGH",
            issues=[{"rule": "dangerous_import", "severity": "ERROR", "message": "Bad import.", "line": 2}],
        )
        fake_gl.nondet.outputs = [leader, validator]

        with self.assertRaisesRegex(FakeUserError, "Consensus validation failed"):
            contract.create_audit_report("Rules Changed", "source")

    def test_unknown_report_ids_fail_and_missing_owner_returns_zero(self):
        contract, _fake_gl, _module = load_contract()

        with self.assertRaisesRegex(FakeUserError, "Unknown audit report ID"):
            contract.get_report(U256(1))
        self.assertEqual(contract.get_last_report_id("0xmissing"), U256(0))
        self.assertEqual(contract.get_last_report_id(""), U256(0))

    def test_v2_contract_is_not_modified_to_include_reports(self):
        v2_source = (ROOT / "contracts" / "ai_debugger_v2.py").read_text(encoding="utf-8")

        self.assertNotIn("create_audit_report", v2_source)
        self.assertNotIn("report_count", v2_source)


if __name__ == "__main__":
    unittest.main()
