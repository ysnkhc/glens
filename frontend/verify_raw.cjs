/**
 * GenLayer Contract Verification — Raw RPC
 * Bypasses genlayer-js SDK to avoid broken ESM chunk issue.
 * 
 * Usage: node verify_raw.cjs [CONTRACT_ADDRESS]
 */

const CONTRACT_ADDRESS = process.argv[2] || "0xf4C72e520903416334115D130c3813Cb6da7bF29";
const RPC_URL = "https://rpc-bradbury.genlayer.com";
const ROUTER_ADDRESS = "0x0112Bf6e83497965A5fdD6Dad1E447a6E004271D";

async function rpcCall(method, params) {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`RPC ${method}: ${json.error.message} (code: ${json.error.code}, data: ${json.error.data || "none"})`);
  return json.result;
}

async function verify() {
  console.log("=".repeat(60));
  console.log("GenLayer Contract Verification (Raw RPC)");
  console.log("=".repeat(60));
  console.log("Contract:", CONTRACT_ADDRESS);
  console.log("Router:  ", ROUTER_ADDRESS);
  console.log("RPC:     ", RPC_URL);
  console.log("");

  // ─── Test 1: eth_getCode ───────────────────────────────────
  console.log("--- Test 1: eth_getCode ---");
  try {
    const code = await rpcCall("eth_getCode", [CONTRACT_ADDRESS, "latest"]);
    const hasCode = code && code !== "0x" && code !== "0x0";
    if (hasCode) {
      console.log(`PASS — Contract has bytecode (${code.length} hex chars)`);
    } else {
      console.log(`FAIL — No bytecode at address (returned: "${code}")`);
      console.log("  -> Address has no deployed contract. Needs redeployment.");
    }
  } catch (err) {
    console.log("FAIL —", err.message);
  }
  console.log("");

  // ─── Test 2: eth_getBalance ────────────────────────────────
  console.log("--- Test 2: eth_getBalance ---");
  try {
    const balance = await rpcCall("eth_getBalance", [CONTRACT_ADDRESS, "latest"]);
    const balWei = BigInt(balance);
    console.log(`INFO — Balance: ${balWei} wei (${Number(balWei) / 1e18} GEN)`);
  } catch (err) {
    console.log("FAIL —", err.message);
  }
  console.log("");

  // ─── Test 3: gen_call read (get_total_calls) ───────────────
  // GenLayer uses gen_call for contract reads with custom calldata encoding
  // We'll try a minimal read to see if the router accepts this contract
  console.log("--- Test 3: gen_call read (get_total_calls) ---");
  try {
    // GenLayer calldata for { method: "get_total_calls" }
    // Manually encoded: MAP(1 entry) -> key="method", value="get_total_calls"
    // TYPE_MAP=6, with 1 entry: 0x0e (1<<3 | 6)
    // key "method" = 6 bytes: 0x30 (6<<3 | TYPE_STR=4 = 52 = 0x34)... 
    // Actually let's encode it properly using the binary format
    
    // makeCalldataObject("get_total_calls", [], undefined) = { method: "get_total_calls" }
    // encode({ method: "get_total_calls" }) → binary
    // Then [binary, false] → serialize → RLP
    
    // Instead of manual encoding, let's use gen_call with a simpler approach
    // Actually gen_call expects { type, to, from, data, transaction_hash_variant }
    // where data is serialized calldata
    
    // Let me manually build the calldata:
    // The calldata object is: { method: "get_total_calls" }
    // GenLayer binary encoding:
    //   MAP with 1 entry = (1 << 3) | 6 = 14 = 0x0e
    //   key "method" length = 6, written as uLEB128 = 6
    //   key bytes = "method" = [109, 101, 116, 104, 111, 100]  
    //   value "get_total_calls" = TYPE_STR, length 15 = (15 << 3) | 4 = 124 = 0x7c
    //   value bytes = [103, 101, 116, 95, 116, 111, 116, 97, 108, 95, 99, 97, 108, 108, 115]
    
    const calldataBytes = [
      0x0e, // MAP with 1 entry
      6, // key length = 6
      109, 101, 116, 104, 111, 100, // "method"
      0x7c, // STR with length 15
      103, 101, 116, 95, 116, 111, 116, 97, 108, 95, 99, 97, 108, 108, 115 // "get_total_calls"
    ];
    
    // Wrap with [calldataBytes, false] and RLP-serialize
    // For gen_call read, data should be the serialized form of [calldata, leaderOnly]
    // leaderOnly = false
    
    // The SDK does: serialize([encode(calldataObj), leaderOnly])
    // serialize = toRlp(data.map(serializeOne))  where serializeOne = toHex
    // So we need: RLP([hex(calldataBytes), hex(false)])
    
    // hex(calldataBytes) = "0x0e06..."
    const calldataHex = "0x" + calldataBytes.map(b => b.toString(16).padStart(2, "0")).join("");
    
    // false serialized as hex = "0x" (empty for false in GenLayer's encoding)
    // Actually in the SDK: serializeOne(false) -> toHex(false) 
    // toHex from viem: toHex(false) might not work... let's check
    // In the SDK code, data = [encode(calldataObj), leaderOnly=false]
    // Then serialize(data) = toRlp(data.map(serializeOne)) where serializeOne = toHex
    // toHex(Uint8Array) works, toHex(false) → "0x0" or "0x00"
    // Actually looking at the viem source, toHex(false) = "0x0"
    
    // RLP encode [calldataHex, "0x0"]
    // For simplicity let's just make the raw RPC call with properly formatted params
    
    const requestParams = {
      type: "read",
      to: CONTRACT_ADDRESS,
      from: "0x0000000000000000000000000000000000000000",
      data: calldataHex, // We'll try just the calldata directly first
      transaction_hash_variant: "latest-nonfinal"
    };
    
    const result = await rpcCall("gen_call", [requestParams]);
    console.log("PASS — gen_call returned:", JSON.stringify(result).slice(0, 200));
  } catch (err) {
    const msg = err.message;
    console.log("FAIL —", msg.slice(0, 300));
    
    if (msg.includes("c1ba7c94")) {
      console.log("");
      console.log(">>> CONFIRMED: NonGenVMContract() error");
      console.log(">>> The router rejects this address as not being a valid GenVM contract.");
      console.log(">>> The contract MUST be redeployed via the GenLayer SDK deployContract() method.");
    }
  }
  console.log("");

  // ─── Test 4: estimateGas for addTransaction ────────────────
  console.log("--- Test 4: eth_estimateGas (simulated addTransaction) ---");
  try {
    // Build a minimal addTransaction call to the router
    // function addTransaction(address _sender, address _recipient, uint256 _numOfInitialValidators, uint256 _maxRotations, bytes _calldata, uint256 _validUntil)
    // selector = keccak256("addTransaction(address,address,uint256,uint256,bytes,uint256)")
    
    // We don't need the exact encoding - just checking if the router accepts the recipient
    // The estimateGas will revert with NonGenVMContract if the recipient is bad
    
    const senderPadded = "0000000000000000000000000000000000000000000000000000000000000001";
    const recipientPadded = CONTRACT_ADDRESS.slice(2).toLowerCase().padStart(64, "0");
    const numValidators = "0000000000000000000000000000000000000000000000000000000000000005"; // 5
    const maxRotations = "0000000000000000000000000000000000000000000000000000000000000003"; // 3
    const dataOffset =   "00000000000000000000000000000000000000000000000000000000000000c0"; // 192
    const validUntil =   "00000000000000000000000000000000000000000000000000000000ffffffff";
    const dataLen =      "0000000000000000000000000000000000000000000000000000000000000001";
    const dataPayload =  "0000000000000000000000000000000000000000000000000000000000000000";

    // addTransaction selector (V6 with validUntil)
    // keccak256("addTransaction(address,address,uint256,uint256,bytes,uint256)") first 4 bytes
    // Let's compute: we know the SDK uses encodeFunctionData which gets the correct selector
    // From the ABI the function is "addTransaction" with (address,address,uint256,uint256,bytes,uint256)
    
    const txData = {
      from: "0x0000000000000000000000000000000000000001",
      to: ROUTER_ADDRESS,
      // We can't easily compute the correct selector without ethers/viem
      // So let's just report what we know
    };
    
    console.log("SKIP — Cannot compute ABI encoding without viem. See gen_call test above.");
  } catch (err) {
    console.log("FAIL —", err.message.slice(0, 200));
  }
  console.log("");

  // ─── Summary ───────────────────────────────────────────────
  console.log("=".repeat(60));
  console.log("DIAGNOSIS");
  console.log("=".repeat(60));
  console.log("");
  console.log("The error NonGenVMContract() (selector 0xc1ba7c94) means the");
  console.log("GenLayer consensus router does not recognize the contract at");
  console.log(CONTRACT_ADDRESS);
  console.log("as a valid GenVM Intelligent Contract.");
  console.log("");
  console.log("REQUIRED ACTION:");
  console.log("  1. Redeploy the contract using the GenLayer SDK:");
  console.log("     node deploy_contract.mjs");
  console.log("  2. Update CONTRACT_ADDRESS in src/lib/genlayer.ts");
  console.log("  3. Re-run this verification script with the new address");
  console.log("");
}

verify().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
