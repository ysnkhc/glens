/**
 * GenLayer Contract Verification Script
 * 
 * Run AFTER deployment to verify the contract is properly registered
 * and callable via the GenLayer consensus router.
 * 
 * Usage: node verify_contract.cjs <CONTRACT_ADDRESS>
 * Example: node verify_contract.cjs 0xf4C72e520903416334115D130c3813Cb6da7bF29
 */
const { createClient } = require("genlayer-js");
const { testnetBradbury } = require("genlayer-js/chains");

const contractAddress = process.argv[2];

if (!contractAddress || !contractAddress.startsWith("0x")) {
  console.error("Usage: node verify_contract.cjs <CONTRACT_ADDRESS>");
  process.exit(1);
}

console.log("=".repeat(60));
console.log("GenLayer Contract Verification");
console.log("=".repeat(60));
console.log("Contract:", contractAddress);
console.log("Network:  Bradbury Testnet");
console.log("Router:  ", testnetBradbury.consensusMainContract?.address || "unknown");
console.log("");

const client = createClient({ chain: testnetBradbury });

async function testCodeExists() {
  console.log("--- Test 1: eth_getCode ---");
  try {
    const code = await client.request({
      method: "eth_getCode",
      params: [contractAddress, "latest"],
    });
    const hasCode = code && code !== "0x" && code !== "0x0";
    console.log(hasCode
      ? `PASS - Contract has code (${String(code).length} hex chars)`
      : `FAIL - No code at address (returns "${code}")`);
    return hasCode;
  } catch (err) {
    console.log("FAIL -", (err.message || err).toString().slice(0, 200));
    return false;
  }
}

async function testReadCall() {
  console.log("--- Test 2: readContract (get_total_calls) ---");
  try {
    const result = await client.readContract({
      address: contractAddress,
      functionName: "get_total_calls",
      args: [],
    });
    console.log("PASS - get_total_calls returned:", String(result));
    return true;
  } catch (err) {
    const msg = (err.message || String(err)).slice(0, 300);
    console.log("FAIL -", msg);
    if (msg.includes("c1ba7c94") || msg.toLowerCase().includes("nongenvm")) {
      console.log("");
      console.log("ERROR: NonGenVMContract()");
      console.log("  Router does not recognize this address as a valid GenVM contract.");
      console.log("  The contract needs to be (re)deployed using deployContract().");
    }
    return false;
  }
}

async function testReadAnalysis() {
  console.log("--- Test 3: readContract (get_last_analysis) ---");
  try {
    const result = await client.readContract({
      address: contractAddress,
      functionName: "get_last_analysis",
      args: [],
    });
    console.log("PASS - get_last_analysis returned:", String(result).slice(0, 100));
    return true;
  } catch (err) {
    console.log("FAIL -", (err.message || err).toString().slice(0, 200));
    return false;
  }
}

async function verify() {
  const r = {};
  r.code = await testCodeExists();
  console.log("");
  r.read = await testReadCall();
  console.log("");
  r.analysis = await testReadAnalysis();
  console.log("");

  console.log("=".repeat(60));
  console.log("Summary");
  console.log("=".repeat(60));
  console.log("  eth_getCode:       ", r.code ? "PASS" : "FAIL");
  console.log("  get_total_calls:   ", r.read ? "PASS" : "FAIL");
  console.log("  get_last_analysis: ", r.analysis ? "PASS" : "FAIL");
  console.log("");

  if (Object.values(r).every(Boolean)) {
    console.log("ALL TESTS PASSED - Contract is live and callable!");
    console.log("");
    console.log("Update CONTRACT_ADDRESS in src/lib/genlayer.ts:");
    console.log(`  export const CONTRACT_ADDRESS: string = "${contractAddress}";`);
  } else {
    console.log("Some tests failed.");
    if (!r.code) {
      console.log("-> No code at address. Contract was never deployed or address is wrong.");
    } else if (!r.read) {
      console.log("-> Code exists but read fails. Likely NonGenVMContract (not deployed via GenLayer SDK).");
    }
  }
}

verify().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
