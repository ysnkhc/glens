/**
 * GenLayer Client — Dual-Network (Studio + Bradbury)
 *
 * ARCHITECTURE:
 * Two networks are supported:
 *
 *   studio   → GenLayer Studio (studionet, public hosted by GenLayer)
 *              Chain ID: 61999, RPC: https://studio.genlayer.com/api
 *              Uses Rabby/MetaMask signing on studionet — fast validators.
 *
 *   bradbury → GenLayer Bradbury testnet
 *              Hybrid provider: Rabby signs, GenLayer RPC handles receipts.
 *              Bypasses broken SDK receipt parsing via direct log extraction.
 */

import { createClient } from "genlayer-js";
import { testnetBradbury, studionet } from "genlayer-js/chains";

// ─── Network Type ─────────────────────────────────────────────
export type NetworkType = "bradbury" | "studio";

/**
 * Contract addresses per network.
 */
export const CONTRACT_ADDRESS: Record<NetworkType, string> = {
  bradbury: "0x4aa1046C8751e043bAEe76b4FD0F1D4188aD8C2e",
  studio:   "0xa2c77099133E9b537a89edd8094239bd971Bf6bA",
};

/**
 * RPC endpoints per network.
 * studionet's public RPC is handled by the genlayer-js SDK automatically.
 */
const RPC: Record<NetworkType, string> = {
  bradbury: "https://rpc-bradbury.genlayer.com",
  studio:   "https://studio.genlayer.com/api",
};

/**
 * Return the correct genlayer-js chain config for the given network.
 */
export function getChain(network: NetworkType) {
  return network === "bradbury" ? testnetBradbury : studionet;
}

/**
 * Chain configs for wallet_addEthereumChain (MetaMask/Rabby).
 */
export const CHAIN_CONFIG: Record<NetworkType, {
  chainId: string;
  chainName: string;
  rpcUrls: string[];
  nativeCurrency: { name: string; symbol: string; decimals: number };
}> = {
  bradbury: {
    chainId: `0x${testnetBradbury.id.toString(16)}`,
    chainName: "GenLayer Testnet Bradbury",
    rpcUrls: [RPC.bradbury],
    nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
  },
  studio: {
    chainId: `0x${studionet.id.toString(16)}`, // 0xF22F = 61999
    chainName: "GenLayer Studio Network",
    rpcUrls: [RPC.studio],
    nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
  },
};

// ─── EIP-1193 Provider Type ───────────────────────────────────────
interface EIP1193Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
}

function getEthereum(): EIP1193Provider | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
}

// ─── Stored EVM txHash from last eth_sendTransaction ─────────────
let lastEvmTxHash: string | null = null;

/** Get the last EVM txHash sent through the hybrid provider */
export function getLastEvmTxHash(): string | null {
  return lastEvmTxHash;
}

/**
 * Switch/add the given network to the user's wallet (Rabby/MetaMask).
 */
async function ensureWalletNetwork(network: NetworkType): Promise<void> {
  const ethereum = getEthereum();
  if (!ethereum) return;

  const cfg = CHAIN_CONFIG[network];
  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: cfg.chainId }],
    });
  } catch (switchError: unknown) {
    const err = switchError as { code?: number };
    if (err.code === 4902 || err.code === -32603) {
      await ethereum.request({
        method: "wallet_addEthereumChain",
        params: [cfg],
      });
      await ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: cfg.chainId }],
      });
    } else if (err.code !== 4001) {
      try {
        await ethereum.request({ method: "wallet_addEthereumChain", params: [cfg] });
      } catch {
        console.warn(`Could not auto-add ${network} network.`);
      }
    }
  }
}

/**
 * Request wallet connection via MetaMask/Rabby.
 * Works for both Studio (studionet) and Bradbury — same flow, different chain.
 */
export async function connectWallet(network: NetworkType = "studio"): Promise<string | null> {
  const ethereum = getEthereum();
  if (!ethereum) {
    throw new Error("No wallet found. Please install MetaMask or Rabby to use this dApp.");
  }

  try {
    const accounts = await ethereum.request({
      method: "eth_requestAccounts",
    }) as string[];

    if (!accounts || accounts.length === 0) {
      throw new Error("No accounts found. Please unlock your wallet.");
    }

    // Auto-switch to the correct network
    await ensureWalletNetwork(network);

    return accounts[0];
  } catch (err: unknown) {
    const error = err as { code?: number; message?: string };
    if (error.code === 4001) {
      throw new Error("Connection rejected. Please approve the connection in your wallet.");
    }
    throw err;
  }
}

/**
 * Get the currently connected address (without prompting).
 */
export async function getConnectedAddress(): Promise<string | null> {
  const ethereum = getEthereum();
  if (!ethereum) return null;

  try {
    const accounts = await ethereum.request({
      method: "eth_accounts",
    }) as string[];
    return accounts?.[0] || null;
  } catch {
    return null;
  }
}

// ─── Direct GenLayer RPC helper ──────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function genLayerRPC(method: string, params: unknown[] = [], rpcUrl: string = RPC.bradbury): Promise<any> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      params,
    }),
  });

  if (!response.ok) {
    throw new Error(`GenLayer RPC error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(data.error.message || JSON.stringify(data.error));
  }
  return data.result;
}

/**
 * Poll for an EVM receipt from GenLayer RPC.
 * Retries until the receipt is available (tx mined).
 */
export async function pollForReceipt(
  evmTxHash: string,
  timeoutMs = 30000,
  network: NetworkType = "bradbury",
): Promise<Record<string, unknown>> {
  const rpcUrl = RPC[network];
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const receipt = await genLayerRPC("eth_getTransactionReceipt", [evmTxHash], rpcUrl);
    if (receipt) {
      console.log("🧾 EVM RECEIPT:", JSON.stringify(receipt, null, 2));
      return receipt;
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error(`EVM receipt polling timeout after ${timeoutMs}ms`);
}

/**
 * Extract GenLayer txId from EVM receipt logs.
 */
export function extractGenLayerTxId(receipt: Record<string, unknown>): string | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const logs = (receipt as any).logs;
  if (!logs || !Array.isArray(logs)) return null;

  const CONSENSUS_ROUTER = "0x1d301acef55eaf7df5d3741659d426f51061ec8d";

  const log = logs.find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (l: any) => l.address && l.address.toLowerCase() === CONSENSUS_ROUTER.toLowerCase()
  );

  if (log && log.topics && log.topics[1]) {
    console.log("🎯 EXTRACTED GenLayer txId:", log.topics[1], "from log address:", log.address);
    return log.topics[1];
  }

  console.warn("⚠️ TransactionCreated event not found from", CONSENSUS_ROUTER);
  for (let i = 0; i < logs.length; i++) {
    console.warn(`  LOG[${i}] address=${logs[i].address} topics=${JSON.stringify(logs[i].topics)}`);
  }
  return null;
}

/**
 * Poll GenLayer consensus status directly via RPC.
 */
export interface ConsensusResult {
  consensus: "AGREED" | "DISAGREED" | "TIMEOUT" | "ERROR" | "CANCELLED";
  txId: string;
  status: string;
  statusName?: string;
  resultName?: string;
  executionResult?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
}

const TERMINAL_AGREED = ["FINALIZED", "ACCEPTED"];
const TERMINAL_FAILED = ["UNDETERMINED", "LEADER_TIMEOUT", "CANCELED"];

export async function pollConsensusStatus(
  txId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  onProgress?: (status: string, elapsed: number) => void,
  signal?: AbortSignal,
): Promise<ConsensusResult> {
  const start = Date.now();
  let lastStatus = "";

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (signal?.aborted) {
      return { consensus: "CANCELLED", txId, status: "CANCELLED", statusName: "Polling cancelled by user" };
    }

    const elapsed = Date.now() - start;
    try {
      const tx = await client.getTransaction({ hash: txId });

      if (!tx) {
        if (onProgress) onProgress("WAITING", elapsed);
        await new Promise(r => setTimeout(r, 30000));
        continue;
      }

      const statusName = tx.statusName || "";
      const resultName = tx.resultName || "";

      if (!lastStatus) {
        console.group("📍 TX OBJECT AUDIT (first poll)");
        console.log("statusName:", tx.statusName);
        console.log("resultName:", tx.resultName);
        console.log("queueType:", tx.queueType, "| queueTypeName:", tx.queueTypeName);
        console.log("queuePosition:", tx.queuePosition);
        console.log("numOfInitialValidators:", tx.numOfInitialValidators);
        console.log("activator:", tx.activator);
        console.log("All TX keys:", Object.keys(tx));
        console.groupEnd();
      }

      if (statusName !== lastStatus) {
        lastStatus = statusName;
        if (onProgress) onProgress(statusName, elapsed);
      }

      if (TERMINAL_AGREED.includes(statusName)) {
        return {
          consensus: resultName === "AGREE" ? "AGREED" : "DISAGREED",
          txId, status: statusName, statusName, resultName,
          executionResult: tx.txExecutionResultName,
          data: tx,
        };
      }

      if (TERMINAL_FAILED.includes(statusName)) {
        return { consensus: "DISAGREED", txId, status: statusName, statusName, resultName, data: tx };
      }

    } catch (err) {
      if (signal?.aborted) {
        return { consensus: "CANCELLED", txId, status: "CANCELLED", statusName: "Cancelled" };
      }
      console.warn(`Consensus poll error (${(elapsed / 1000).toFixed(0)}s):`, err);
    }

    await new Promise(r => setTimeout(r, 30000));
  }
}

// ─── Hybrid EIP-1193 provider ────────────────────────────────────

/**
 * Hybrid EIP-1193 provider:
 *   eth_sendTransaction → Rabby wallet (popup + signing)
 *   Everything else     → GenLayer RPC directly (Studio or Bradbury)
 *
 * Used for BOTH Studio and Bradbury — the only difference is the rpcUrl.
 */
function createHybridProvider(rpcUrl: string): EIP1193Provider {
  let jsonRpcId = 1;

  return {
    request: async ({ method, params }: { method: string; params?: unknown[] }) => {
      if (method === "eth_sendTransaction") {
        const ethereum = getEthereum();
        if (!ethereum) throw new Error("Wallet not available for signing");

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const txData = (params as any)?.[0]?.data as string | undefined;
        if (txData && txData.length > 10) {
          try {
            const abiData = txData.slice(10);
            const wordCount = Math.floor(abiData.length / 64);
            console.group("📍 CALLDATA AUDIT");
            console.log("Total calldata length:", txData.length);
            console.log("ABI word count:", wordCount);
            for (let i = Math.max(0, wordCount - 4); i < wordCount; i++) {
              const word = abiData.slice(i * 64, (i + 1) * 64);
              const asNum = BigInt("0x" + word);
              const label = i === wordCount - 1 ? "➡️ LAST WORD (likely validUntil)" : `word[${i}]`;
              console.log(label + ":", word, "=", asNum.toString(),
                asNum > 1000000000n && asNum < 9999999999n
                  ? ("= date: " + new Date(Number(asNum) * 1000).toISOString())
                  : ""
              );
            }
            console.groupEnd();
          } catch(e) {
            console.warn("Calldata audit failed:", e);
          }
        }

        const txHash = await ethereum.request({ method, params });
        lastEvmTxHash = txHash as string;
        return txHash;
      }

      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: jsonRpcId++,
          method,
          params: params || [],
        }),
      });

      if (!response.ok) {
        throw new Error(`GenLayer RPC error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error.message || JSON.stringify(data.error));
      }

      return data.result;
    },
  };
}

/**
 * Create a GenLayer client for on-chain transactions.
 *
 * Both Studio and Bradbury use the hybrid Rabby provider —
 * the only differences are the chain and the RPC endpoint.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createWalletClient(address: string, network: NetworkType = "studio"): any {
  const chain = getChain(network);
  const rpcUrl = RPC[network];
  const hybridProvider = createHybridProvider(rpcUrl);

  return createClient({
    chain,
    account: address as `0x${string}`,
    provider: hybridProvider,
  });
}
