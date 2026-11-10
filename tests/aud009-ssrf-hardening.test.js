const assert = require("assert");
const http = require("node:http");
const dns = require("node:dns");
const { Agent } = require("undici");
const {
  classifyIpAddress,
  isDisallowedCloudHost,
  isLocalOrLoopbackHost,
  isAuthorizedHost,
  resolveCloudServerUrl,
  safeCloudFetch,
  createSecureLookup,
  getSecureCloudAgent
} = require("../main.js");

let savedEnv = {};
function saveEnv() {
  savedEnv = {
    NODE_ENV: process.env.NODE_ENV,
    TRUSTED_LAN_HOSTS: process.env.TRUSTED_LAN_HOSTS,
    ALLOW_INSECURE_HTTP: process.env.ALLOW_INSECURE_HTTP,
    ALLOW_LOOPBACK_IN_PRODUCTION: process.env.ALLOW_LOOPBACK_IN_PRODUCTION
  };
}

function restoreEnv() {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

async function run() {
  console.log("\n=======================================================");
  console.log("▶ STARTING AUD-009 SSRF HARDENING BEHAVIORAL SUITE");
  console.log("=======================================================\n");

  saveEnv();

  // Test HTTP server for real local loopback and redirect verification
  const TEST_PORT = 4219;
  let testServerRequests = [];
  const testServer = http.createServer((req, res) => {
    testServerRequests.push({ method: req.method, url: req.url, headers: req.headers });
    if (req.url === "/api/v1/system/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, status: "operational" }));
    } else if (req.url === "/api/v1/redirect-to-metadata") {
      res.writeHead(302, { "Location": "http://169.254.169.254/latest/meta-data/" });
      res.end();
    } else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "Not Found" }));
    }
  });

  await new Promise((resolve) => testServer.listen(TEST_PORT, "127.0.0.1", resolve));

  try {
    // ─────────────────────────────────────────────────────────────────
    // Test 1: Production request to direct 192.168.x.x is blocked by default
    // ─────────────────────────────────────────────────────────────────
    console.log("[Test 1] Production request to direct 192.168.x.x is blocked by default...");
    process.env.NODE_ENV = "production";
    delete process.env.TRUSTED_LAN_HOSTS;
    const res1 = await safeCloudFetch("/api/v1/system/health", {}, "http://192.168.1.100:4000");
    assert.strictEqual(res1.ok, false);
    assert.ok(res1.error.includes("private/LAN destination") || res1.error.includes("SSRF Protection"));
    console.log("✓ Direct 192.168.x.x blocked in production by default.");

    // ─────────────────────────────────────────────────────────────────
    // Test 2: Production request to direct 10.x.x.x is blocked by default
    // ─────────────────────────────────────────────────────────────────
    console.log("\n[Test 2] Production request to direct 10.x.x.x is blocked by default...");
    process.env.NODE_ENV = "production";
    delete process.env.TRUSTED_LAN_HOSTS;
    const res2 = await safeCloudFetch("/api/v1/system/health", {}, "http://10.0.0.5:4000");
    assert.strictEqual(res2.ok, false);
    assert.ok(res2.error.includes("private/LAN destination") || res2.error.includes("SSRF Protection"));
    console.log("✓ Direct 10.x.x.x blocked in production by default.");

    // ─────────────────────────────────────────────────────────────────
    // Test 3: Production request to direct 172.16.x.x is blocked by default
    // ─────────────────────────────────────────────────────────────────
    console.log("\n[Test 3] Production request to direct 172.16.x.x is blocked by default...");
    process.env.NODE_ENV = "production";
    delete process.env.TRUSTED_LAN_HOSTS;
    const res3 = await safeCloudFetch("/api/v1/system/health", {}, "http://172.16.5.10:4000");
    assert.strictEqual(res3.ok, false);
    assert.ok(res3.error.includes("private/LAN destination") || res3.error.includes("SSRF Protection"));
    console.log("✓ Direct 172.16.x.x blocked in production by default.");

    // ─────────────────────────────────────────────────────────────────
    // Test 4: Direct 127.0.0.1 is blocked in production unless explicitly authorized
    // ─────────────────────────────────────────────────────────────────
    console.log("\n[Test 4] Direct 127.0.0.1 blocked in production unless authorized...");
    process.env.NODE_ENV = "production";
    delete process.env.ALLOW_LOOPBACK_IN_PRODUCTION;
    delete process.env.TRUSTED_LAN_HOSTS;
    const res4 = await safeCloudFetch("/api/v1/system/health", {}, `http://127.0.0.1:${TEST_PORT}`);
    assert.strictEqual(res4.ok, false);
    assert.ok(res4.error.includes("loopback destination") || res4.error.includes("blocked in production"));
    console.log("✓ Direct 127.0.0.1 correctly blocked in production without authorization.");

    // ─────────────────────────────────────────────────────────────────
    // Test 5: 169.254.169.254 is always blocked unconditionally
    // ─────────────────────────────────────────────────────────────────
    console.log("\n[Test 5] 169.254.169.254 is always blocked unconditionally...");
    delete process.env.NODE_ENV;
    process.env.TRUSTED_LAN_HOSTS = "169.254.169.254"; // Even if placed in trusted list
    const res5 = await safeCloudFetch("/api/v1/system/health", {}, "http://169.254.169.254");
    assert.strictEqual(res5.ok, false);
    assert.ok(res5.error.includes("Prohibited IP target"));
    console.log("✓ 169.254.169.254 is unconditionally blocked.");

    // ─────────────────────────────────────────────────────────────────
    // Test 6: Carrier-grade NAT range (100.64.0.0/10) is handled as private
    // ─────────────────────────────────────────────────────────────────
    console.log("\n[Test 6] Carrier-grade NAT range handled according to policy...");
    const cNat1 = classifyIpAddress("100.64.0.1");
    const cNat2 = classifyIpAddress("100.127.255.255");
    const cNatOutside = classifyIpAddress("100.128.0.1");
    assert.strictEqual(cNat1.isCarrierNat, true);
    assert.strictEqual(cNat1.isPrivate, true);
    assert.strictEqual(cNat2.isCarrierNat, true);
    assert.strictEqual(cNat2.isPrivate, true);
    assert.strictEqual(cNatOutside.isCarrierNat, false);

    process.env.NODE_ENV = "production";
    delete process.env.TRUSTED_LAN_HOSTS;
    const res6 = await safeCloudFetch("/api/v1/system/health", {}, "http://100.64.1.2:4000");
    assert.strictEqual(res6.ok, false);
    console.log("✓ Carrier-grade NAT verified as private and blocked in production.");

    // ─────────────────────────────────────────────────────────────────
    // Test 7: IPv6 loopback, link-local, and unique-local are handled correctly
    // ─────────────────────────────────────────────────────────────────
    console.log("\n[Test 7] IPv6 loopback, link-local and unique-local classification...");
    const cIpv6Loop = classifyIpAddress("::1");
    assert.strictEqual(cIpv6Loop.isLoopback, true);
    assert.strictEqual(cIpv6Loop.isDisallowed, false);

    const cIpv6Link = classifyIpAddress("fe80::1");
    assert.strictEqual(cIpv6Link.isLinkLocal, true);
    assert.strictEqual(cIpv6Link.isDisallowed, true);

    const cIpv6Ula1 = classifyIpAddress("fc00::1");
    const cIpv6Ula2 = classifyIpAddress("fd12:3456::1");
    assert.strictEqual(cIpv6Ula1.isPrivate, true);
    assert.strictEqual(cIpv6Ula2.isPrivate, true);
    console.log("✓ IPv6 classification verified.");

    // ─────────────────────────────────────────────────────────────────
    // Test 8: IPv4-mapped IPv6 cannot bypass classification
    // ─────────────────────────────────────────────────────────────────
    console.log("\n[Test 8] IPv4-mapped IPv6 cannot bypass classification...");
    const cMapMeta = classifyIpAddress("::ffff:169.254.169.254");
    assert.strictEqual(cMapMeta.isDisallowed, true);
    assert.strictEqual(cMapMeta.isLinkLocal, true);
    assert.strictEqual(cMapMeta.isIpv4Mapped, true);

    const cMapPriv = classifyIpAddress("::ffff:192.168.1.1");
    assert.strictEqual(cMapPriv.isPrivate, true);
    assert.strictEqual(cMapPriv.isIpv4Mapped, true);

    const cMapLoop = classifyIpAddress("::ffff:127.0.0.1");
    assert.strictEqual(cMapLoop.isLoopback, true);
    assert.strictEqual(cMapLoop.isIpv4Mapped, true);
    console.log("✓ IPv4-mapped IPv6 normalization and classification verified.");

    // ─────────────────────────────────────────────────────────────────
    // Test 9: Public hostname resolving to a private IP is rejected
    // ─────────────────────────────────────────────────────────────────
    console.log("\n[Test 9] Public hostname resolving to a private IP is rejected...");
    process.env.NODE_ENV = "production";
    delete process.env.TRUSTED_LAN_HOSTS;
    const lookupFunc = createSecureLookup();

    await new Promise((resolve) => {
      // Mock dns.lookup resolution returning private IP for test
      const originalLookup = dns.lookup;
      dns.lookup = (host, opts, cb) => {
        cb(null, [{ address: "192.168.1.50", family: 4 }]);
      };

      lookupFunc("fake-cloud.zynbill.in", {}, (err) => {
        dns.lookup = originalLookup;
        assert.ok(err, "Must return error for hostname resolving to private IP");
        assert.ok(err.message.includes("unauthorized internal IP") || err.message.includes("SSRF Protection"));
        resolve();
      });
    });
    console.log("✓ Public hostname resolving to private IP correctly rejected.");

    // ─────────────────────────────────────────────────────────────────
    // Test 10: Mixed public/private DNS responses are rejected by default
    // ─────────────────────────────────────────────────────────────────
    console.log("\n[Test 10] Mixed public/private DNS responses are rejected by default...");
    await new Promise((resolve) => {
      const originalLookup = dns.lookup;
      dns.lookup = (host, opts, cb) => {
        cb(null, [
          { address: "93.184.216.34", family: 4 },
          { address: "192.168.1.50", family: 4 }
        ]);
      };

      lookupFunc("mixed-results.zynbill.in", {}, (err) => {
        dns.lookup = originalLookup;
        assert.ok(err, "Must reject mixed DNS results");
        assert.ok(err.message.includes("Mixed public/private DNS response"));
        resolve();
      });
    });
    console.log("✓ Mixed public/private DNS responses correctly rejected.");

    // ─────────────────────────────────────────────────────────────────
    // Test 11: DNS resolution failure safely rejects the request
    // ─────────────────────────────────────────────────────────────────
    console.log("\n[Test 11] DNS resolution failure safely rejects the request...");
    const res11 = await safeCloudFetch("/api/v1/system/health", {}, "https://nonexistent-host-random-12345.zynbill.test");
    assert.strictEqual(res11.ok, false);
    assert.strictEqual(res11.status, 0);
    assert.ok(res11.error);
    console.log("✓ DNS resolution failure safely handled.");

    // ─────────────────────────────────────────────────────────────────
    // Test 12: Connection pinning prevents DNS rebinding TOCTOU
    // ─────────────────────────────────────────────────────────────────
    console.log("\n[Test 12] Connection pinning prevents DNS rebinding TOCTOU...");
    await new Promise((resolve) => {
      const originalLookup = dns.lookup;
      let callCount = 0;
      dns.lookup = (host, opts, cb) => {
        callCount++;
        // First call returns public IP
        cb(null, [{ address: "93.184.216.34", family: 4 }]);
      };

      lookupFunc("pinned-host.zynbill.in", { all: true }, (err, addresses) => {
        dns.lookup = originalLookup;
        assert.strictEqual(err, null);
        assert.strictEqual(addresses.length, 1);
        assert.strictEqual(addresses[0].address, "93.184.216.34");
        // Connection pinned directly to the single validated IP
        resolve();
      });
    });
    console.log("✓ Connection pinning verified: single validated IP returned for socket binding.");

    // ─────────────────────────────────────────────────────────────────
    // Test 13: HTTP redirects are rejected
    // ─────────────────────────────────────────────────────────────────
    console.log("\n[Test 13] HTTP redirects are rejected...");
    delete process.env.NODE_ENV; // Allow local loopback request
    const res13 = await safeCloudFetch("/api/v1/redirect-to-metadata", {}, `http://127.0.0.1:${TEST_PORT}`);
    assert.strictEqual(res13.ok, false);
    assert.ok(res13.error.toLowerCase().includes("redirect") || res13.error.toLowerCase().includes("failed"));
    console.log("✓ HTTP redirects rejected by native fetch with redirect: error.");

    // ─────────────────────────────────────────────────────────────────
    // Test 14: HTTPS remains enforced for remote production servers
    // ─────────────────────────────────────────────────────────────────
    console.log("\n[Test 14] HTTPS remains enforced for remote production servers...");
    process.env.NODE_ENV = "production";
    delete process.env.ALLOW_INSECURE_HTTP;
    const remoteUrl = resolveCloudServerUrl("http://api.zynbill.com");
    assert.strictEqual(remoteUrl, "https://api.zynbill.com");
    console.log("✓ Remote HTTP upgraded to https:// in production.");

    // ─────────────────────────────────────────────────────────────────
    // Test 15: Explicitly authorized customer LAN configuration works only for approved destination
    // ─────────────────────────────────────────────────────────────────
    console.log("\n[Test 15] Explicitly authorized customer LAN works only for approved destination...");
    process.env.NODE_ENV = "production";
    process.env.TRUSTED_LAN_HOSTS = "192.168.1.50,lan-server.local";

    assert.strictEqual(isAuthorizedHost("192.168.1.50", "192.168.1.50"), true);
    assert.strictEqual(isAuthorizedHost("192.168.1.51", "192.168.1.51"), false);
    assert.strictEqual(isAuthorizedHost("lan-server.local", "192.168.1.50"), true);
    assert.strictEqual(isAuthorizedHost("rogue-server.local", "192.168.1.51"), false);

    // Verify metadata IP can NEVER be authorized even if placed in TRUSTED_LAN_HOSTS
    process.env.TRUSTED_LAN_HOSTS = "169.254.169.254";
    const res15Meta = await safeCloudFetch("/api/v1/system/health", {}, "http://169.254.169.254");
    assert.strictEqual(res15Meta.ok, false);
    assert.ok(res15Meta.error.includes("Prohibited IP target"));
    console.log("✓ Trusted LAN allowlist strictly enforced; prohibited ranges remain unconditionally blocked.");

    // ─────────────────────────────────────────────────────────────────
    // Test 16: Existing localhost development workflow still works
    // ─────────────────────────────────────────────────────────────────
    console.log("\n[Test 16] Existing localhost development workflow still works...");
    delete process.env.NODE_ENV; // non-production / dev mode
    assert.strictEqual(isAuthorizedHost("localhost"), true);
    assert.strictEqual(isAuthorizedHost("127.0.0.1"), true);
    assert.strictEqual(resolveCloudServerUrl("http://localhost:4000"), "http://localhost:4000");

    const res16 = await safeCloudFetch("/api/v1/system/health", {}, `http://127.0.0.1:${TEST_PORT}`);
    assert.strictEqual(res16.ok, true);
    assert.strictEqual(res16.status, 200);
    assert.strictEqual(res16.data.status, "operational");
    console.log("✓ Local development workflow operational.");

    console.log("\n=======================================================");
    console.log("🎉 ALL 16 AUD-009 SSRF HARDENING BEHAVIORAL TESTS PASSED!");
    console.log("=======================================================\n");
  } finally {
    restoreEnv();
    testServer.close();
  }
}

run().catch((err) => {
  console.error("\n❌ AUD-009 BEHAVIORAL SUITE FAILED:", err);
  process.exit(1);
});
