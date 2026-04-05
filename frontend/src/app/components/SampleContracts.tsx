"use client";

import React from "react";

// ─── Sample Contracts ───

export const SAMPLE_CONTRACTS: {
  name: string;
  label: string;
  risk: string;
  code: string;
}[] = [
  {
    name: "Simple Storage",
    label: "LOW",
    risk: "LOW",
    code: `# { "Depends": "py-genlayer:latest" }
from genlayer import *

class SimpleStorage(gl.Contract):
    """A simple storage contract that stores and retrieves a string value."""
    data: str
    owner: str

    def __init__(self, initial_value: str):
        self.data = initial_value
        self.owner = gl.message.sender

    @gl.public.view
    def get_data(self) -> str:
        """Returns the current stored value."""
        return self.data

    @gl.public.write
    def set_data(self, new_value: str) -> None:
        """Updates the stored value."""
        self.data = new_value
`,
  },
  {
    name: "Sentiment Analyzer",
    label: "MEDIUM",
    risk: "MEDIUM",
    code: `# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *

class SentimentOracle(gl.Contract):
    """Analyzes text sentiment using AI with consensus."""
    last_result: str
    query_count: u256

    def __init__(self):
        pass

    @gl.public.write
    def analyze_sentiment(self, text: str) -> str:
        result = gl.eq_principle.prompt_non_comparative(
            lambda: gl.nondet.exec_prompt(
                "Classify the sentiment of this text as POSITIVE, NEGATIVE, or NEUTRAL. "
                "Return ONLY one word. Text: " + text
            ),
            task="Classify text sentiment",
            criteria="Output must be exactly POSITIVE, NEGATIVE, or NEUTRAL"
        )
        self.last_result = result
        self.query_count = self.query_count + u256(1)
        return result

    @gl.public.view
    def get_last_result(self) -> str:
        return self.last_result

    @gl.public.view
    def get_query_count(self) -> u256:
        return self.query_count
`,
  },
  {
    name: "Broken Contract",
    label: "HIGH",
    risk: "HIGH",
    code: `from genlayer import *

class BrokenContract:
    """This contract has multiple issues."""
    data
    count

    def __init__(self):
        self.data = ""

    def process_data(self, input_text):
        # Calling AI without eq_principle
        result = gl.exec_prompt(
            f"Do something with: {input_text}"
        )
        self.data = result

    def fetch_price(self):
        # External call without consensus wrapping
        import requests
        response = requests.get("https://api.example.com/price")
        return response.json()

    @gl.public.view
    def get_data(self):
        return self.data
`,
  },
];

const RISK_DOT: Record<string, string> = {
  LOW: "bg-green-400",
  MEDIUM: "bg-amber-400",
  HIGH: "bg-orange-500",
};

const RISK_BORDER: Record<string, string> = {
  LOW: "rgba(74, 222, 128, 0.2)",
  MEDIUM: "rgba(251, 191, 36, 0.2)",
  HIGH: "rgba(249, 115, 22, 0.2)",
};

const RISK_BG_HOVER: Record<string, string> = {
  LOW: "rgba(74, 222, 128, 0.06)",
  MEDIUM: "rgba(251, 191, 36, 0.06)",
  HIGH: "rgba(249, 115, 22, 0.06)",
};

interface SampleContractsProps {
  onSelect: (code: string) => void;
}

export default function SampleContracts({ onSelect }: SampleContractsProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span
        className="text-[10px] font-bold uppercase tracking-[0.12em]"
        style={{ color: "var(--text-muted)" }}
      >
        Examples
      </span>
      <div className="h-3.5 w-px" style={{ background: "var(--border-subtle)" }} />
      {SAMPLE_CONTRACTS.map((sample, i) => (
        <button
          key={i}
          onClick={() => onSelect(sample.code)}
          className="flex items-center gap-2 text-[11px] px-3 py-1.5 rounded-md font-semibold transition-all duration-200 cursor-pointer active:scale-[0.97]"
          style={{
            background: "var(--bg-depth-2)",
            border: `1px solid ${RISK_BORDER[sample.risk] || "var(--border-subtle)"}`,
            color: "var(--text-secondary)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = RISK_BG_HOVER[sample.risk] || "var(--bg-depth-3)";
            e.currentTarget.style.color = "var(--text-primary)";
            e.currentTarget.style.transform = "translateY(-1px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "var(--bg-depth-2)";
            e.currentTarget.style.color = "var(--text-secondary)";
            e.currentTarget.style.transform = "translateY(0)";
          }}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${RISK_DOT[sample.risk] || "bg-slate-500"}`} />
          {sample.name}
          <span className="text-[9px] font-bold opacity-50">{sample.label}</span>
        </button>
      ))}
    </div>
  );
}
