"use client";

import React from "react";

// ─── Sample Contracts ───

export const SAMPLE_CONTRACTS: {
  name: string;
  risk: string;
  code: string;
}[] = [
  {
    name: "✅ Simple Storage (LOW risk)",
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
    name: "⚠️ AI Sentiment Analyzer (MEDIUM risk)",
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
    name: "🚨 Broken Contract (HIGH risk)",
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

const riskBorderColors: Record<string, string> = {
  LOW: "border-l-emerald-500/50 hover:border-l-emerald-400",
  MEDIUM: "border-l-amber-500/50 hover:border-l-amber-400",
  HIGH: "border-l-red-500/50 hover:border-l-red-400",
};

const riskHoverBg: Record<string, string> = {
  LOW: "hover:bg-emerald-500/8",
  MEDIUM: "hover:bg-amber-500/8",
  HIGH: "hover:bg-red-500/8",
};

interface SampleContractsProps {
  onSelect: (code: string) => void;
}

export default function SampleContracts({ onSelect }: SampleContractsProps) {
  return (
    <div className="flex items-center gap-2.5 flex-wrap">
      <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
        Examples
      </span>
      <div className="h-4 w-px bg-slate-700/50" />
      {SAMPLE_CONTRACTS.map((sample, i) => (
        <button
          key={i}
          onClick={() => onSelect(sample.code)}
          className={`text-xs px-3.5 py-2 rounded-lg bg-indigo-500/8 text-indigo-300 border border-l-[3px] border-indigo-500/12 transition-all duration-200 cursor-pointer hover:scale-[1.02] active:scale-[0.98] ${
            riskBorderColors[sample.risk] || ""
          } ${riskHoverBg[sample.risk] || "hover:bg-indigo-500/15"} hover:border-indigo-500/25 font-medium`}
        >
          {sample.name}
        </button>
      ))}
    </div>
  );
}
