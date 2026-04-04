// ─── Consensus History Store ───────────────────────────────────
// Tracks: input → prediction → actual result
// Builds a dataset of "what actually fails" — your edge.

export interface ConsensusHistoryEntry {
  id: string;
  timestamp: number;
  prompt: string;
  predictedRisk: string;          // from analyzer: LOW / MEDIUM / HIGH
  actualOutcome: string;          // AGREED / DISAGREED / CONTRACT_REVERT / NETWORK_ERROR
  failureType?: string;           // classification from Task 2
  failureReason?: string;         // human-readable reason
  txHash?: string;
  mismatch: boolean;              // prediction ≠ reality
  durationMs?: number;
}

const STORAGE_KEY = "gl_consensus_history";
const MAX_ENTRIES = 100;

/** Load history from localStorage */
export function loadHistory(): ConsensusHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ConsensusHistoryEntry[];
  } catch {
    return [];
  }
}

/** Save a new entry to history */
export function recordConsensusResult(entry: Omit<ConsensusHistoryEntry, "id" | "timestamp">): ConsensusHistoryEntry {
  const full: ConsensusHistoryEntry = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
  };

  const history = loadHistory();
  history.unshift(full); // newest first
  if (history.length > MAX_ENTRIES) history.length = MAX_ENTRIES;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // localStorage full — evict oldest half
    history.length = Math.floor(MAX_ENTRIES / 2);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  }

  console.log("📊 CONSENSUS HISTORY RECORDED:", full);
  return full;
}

/** Get mismatch stats */
export function getHistoryStats() {
  const history = loadHistory();
  const total = history.length;
  const mismatches = history.filter(h => h.mismatch).length;
  const agreed = history.filter(h => h.actualOutcome === "AGREED").length;
  const disagreed = history.filter(h => h.actualOutcome === "DISAGREED").length;
  const reverts = history.filter(h => h.actualOutcome === "CONTRACT_REVERT").length;
  const networkErrors = history.filter(h => h.actualOutcome === "NETWORK_ERROR").length;

  return {
    total,
    mismatches,
    mismatchRate: total > 0 ? mismatches / total : 0,
    agreed,
    disagreed,
    reverts,
    networkErrors,
    accuracy: total > 0 ? (total - mismatches) / total : 0,
  };
}

/** Clear history */
export function clearHistory() {
  if (typeof window !== "undefined") {
    localStorage.removeItem(STORAGE_KEY);
  }
}
