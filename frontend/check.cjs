// Minimal contract check via raw RPC
const ADDR = process.argv[2] || "0xf4C72e520903416334115D130c3813Cb6da7bF29";
const RPC = "https://rpc-bradbury.genlayer.com";

async function rpc(method, params) {
  const r = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return (await r.json());
}

async function main() {
  // Test 1: eth_getCode
  const codeRes = await rpc("eth_getCode", [ADDR, "latest"]);
  const code = codeRes.result;
  const hasCode = code && code !== "0x" && code !== "0x0";
  console.log("TEST1_eth_getCode=" + (hasCode ? "HAS_CODE_" + code.length + "_chars" : "NO_CODE"));

  // Test 2: eth_getBalance
  const balRes = await rpc("eth_getBalance", [ADDR, "latest"]);
  console.log("TEST2_balance=" + balRes.result);

  // Test 3: gen_call read
  // Manually encode {method: "get_total_calls"} in GenLayer binary
  const cd = [0x0e, 6, 109,101,116,104,111,100, 0x7c, 103,101,116,95,116,111,116,97,108,95,99,97,108,108,115];
  const hex = "0x" + cd.map(b => b.toString(16).padStart(2,"0")).join("");
  
  const genRes = await rpc("gen_call", [{
    type: "read",
    to: ADDR,
    from: "0x0000000000000000000000000000000000000000",
    data: hex,
    transaction_hash_variant: "latest-nonfinal"
  }]);
  
  if (genRes.error) {
    console.log("TEST3_gen_call=ERROR_" + genRes.error.message);
    if (genRes.error.data) console.log("TEST3_error_data=" + genRes.error.data);
  } else {
    console.log("TEST3_gen_call=OK_" + JSON.stringify(genRes.result).slice(0,100));
  }
}

main().catch(e => console.log("FATAL=" + e.message));
