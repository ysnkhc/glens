/**
 * 🧠 GenLayer Flow Inspector — Debug & Observability Layer
 *
 * Provides:
 * - Global structured debug logger
 * - Contract call wrapper with full tracing
 * - Consensus failure detector
 * - Raw result viewer
 * - In-memory log store for UI DebugPanel
 *
 * NO BUSINESS LOGIC MODIFIED — observability only.
 */

// ─── Debug Flag ────────────────────────────────────────────────

export const GL_DEBUG = process.env.NEXT_PUBLIC_GL_DEBUG === "true";

// ─── Log Store (for UI DebugPanel) ─────────────────────────────

export interface DebugLogEntry {
  id: number;
  timestamp: string;
  step: string;
  category: "TX_START" | "TX_SENT" | "TX_FINALIZED" | "TX_READ" | "TX_ERROR" | "CONSENSUS_FAIL" | "FALLBACK" | "CLIENT" | "RESULT" | "INFO";
  data: unknown;
}

let _logIdCounter = 0;
let _logListeners: ((logs: DebugLogEntry[]) => void)[] = [];
const _logStore: DebugLogEntry[] = [];

const MAX_LOGS = 200;

function getCategoryFromStep(step: string): DebugLogEntry["category"] {
  if (step.includes("TX START") || step.includes("INPUT")) return "TX_START";
  if (step.includes("TX SENT") || step.includes("TX HASH")) return "TX_SENT";
  if (step.includes("FINALIZED") || step.includes("RECEIPT")) return "TX_FINALIZED";
  if (step.includes("READ")) return "TX_READ";
  if (step.includes("ERROR")) return "TX_ERROR";
  if (step.includes("CONSENSUS")) return "CONSENSUS_FAIL";
  if (step.includes("FALLBACK")) return "FALLBACK";
  if (step.includes("CLIENT")) return "CLIENT";
  if (step.includes("RESULT") || step.includes("PARSED") || step.includes("RAW")) return "RESULT";
  return "INFO";
}

// ─── Core Logger ───────────────────────────────────────────────

export function logGL(step: string, data: unknown): void {
  if (!GL_DEBUG) return;

  const entry: DebugLogEntry = {
    id: ++_logIdCounter,
    timestamp: new Date().toISOString(),
    step,
    category: getCategoryFromStep(step),
    data,
  };

  _logStore.push(entry);
  if (_logStore.length > MAX_LOGS) _logStore.shift();

  // Console output with grouping
  const icon = {
    TX_START: "🚀",
    TX_SENT: "⛓️",
    TX_FINALIZED: "✅",
    TX_READ: "📖",
    TX_ERROR: "❌",
    CONSENSUS_FAIL: "🔴",
    FALLBACK: "⚠️",
    CLIENT: "💻",
    RESULT: "📊",
    INFO: "ℹ️",
  }[entry.category];

  console.group(`${icon} GenLayer Debug → ${step}`);
  console.log("Timestamp:", entry.timestamp);
  if (typeof data === "object" && data !== null) {
    console.log("Data:", JSON.parse(JSON.stringify(data, (_k, v) =>
      typeof v === "bigint" ? v.toString() + "n" : v
    )));
  } else {
    console.log("Data:", data);
  }
  console.groupEnd();

  // Notify UI listeners
  for (const listener of _logListeners) {
    listener([..._logStore]);
  }
}

// ─── Log Store Access ──────────────────────────────────────────

export function getDebugLogs(): DebugLogEntry[] {
  return [..._logStore];
}

export function clearDebugLogs(): void {
  _logStore.length = 0;
  _logIdCounter = 0;
  for (const listener of _logListeners) {
    listener([]);
  }
}

export function subscribeDebugLogs(listener: (logs: DebugLogEntry[]) => void): () => void {
  _logListeners.push(listener);
  return () => {
    _logListeners = _logListeners.filter((l) => l !== listener);
  };
}

// ─── Consensus Failure Detector ────────────────────────────────

export interface ConsensusFailureInfo {
  type: "CONSENSUS_FAILURE" | "EXECUTION_REVERTED" | "GAS_ESTIMATION" | "NETWORK_ERROR" | "UNKNOWN";
  message: string;
  raw: string;
}

export function detectConsensusFailure(error: unknown): ConsensusFailureInfo | null {
  if (!error) return null;

  const msg = error instanceof Error ? error.message : String(error);

  if (msg.includes("not processed by consensus") || msg.includes("consensus")) {
    const info: ConsensusFailureInfo = {
      type: "CONSENSUS_FAILURE",
      message: "Validators disagreed on AI output — prompt may be too ambiguous for deterministic evaluation.",
      raw: msg.slice(0, 500),
    };
    logGL("CONSENSUS FAILURE DETECTED", info);
    return info;
  }

  if (msg.includes("execution reverted")) {
    const info: ConsensusFailureInfo = {
      type: "EXECUTION_REVERTED",
      message: "Contract execution failed — likely bad prompt structure or invalid input.",
      raw: msg.slice(0, 500),
    };
    logGL("EXECUTION REVERTED", info);
    return info;
  }

  if (msg.includes("estimateGas") || msg.includes("gas")) {
    const info: ConsensusFailureInfo = {
      type: "GAS_ESTIMATION",
      message: "Gas estimation failed — possible exec_prompt issue or RPC problem.",
      raw: msg.slice(0, 500),
    };
    logGL("GAS ESTIMATION ERROR", info);
    return info;
  }

  if (msg.includes("fetch") || msg.includes("network") || msg.includes("timeout")) {
    const info: ConsensusFailureInfo = {
      type: "NETWORK_ERROR",
      message: "Network error — check Bradbury RPC connectivity.",
      raw: msg.slice(0, 500),
    };
    logGL("NETWORK ERROR", info);
    return info;
  }

  return null;
}

// ─── Raw Result Viewer ─────────────────────────────────────────

export function showRawResult(result: string, label: string = "RESULT"): unknown {
  try {
    const parsed = JSON.parse(result);
    logGL(`PARSED ${label}`, parsed);
    return parsed;
  } catch {
    logGL(`RAW TEXT ${label}`, result);
    return result;
  }
}

// ─── Payload Size Inspector ────────────────────────────────────

export function inspectPayload(method: string, args: unknown[]): void {
  if (!GL_DEBUG) return;

  const argsStr = JSON.stringify(args);
  logGL(`PAYLOAD [${method}]`, {
    method,
    argCount: args.length,
    totalChars: argsStr.length,
    args: args.map((a, i) => ({
      index: i,
      type: typeof a,
      length: typeof a === "string" ? a.length : undefined,
      preview: typeof a === "string" ? a.slice(0, 100) + (a.length > 100 ? "..." : "") : a,
    })),
  });
}

// ─── Transaction Timing ────────────────────────────────────────

export function createTxTimer(method: string): { stop: () => number } {
  const start = performance.now();
  logGL(`TX TIMER START [${method}]`, { method, startTime: new Date().toISOString() });

  return {
    stop: () => {
      const elapsed = Math.round(performance.now() - start);
      logGL(`TX TIMER END [${method}]`, {
        method,
        elapsedMs: elapsed,
        elapsedFormatted: elapsed > 1000 ? `${(elapsed / 1000).toFixed(1)}s` : `${elapsed}ms`,
      });
      return elapsed;
    },
  };
}
