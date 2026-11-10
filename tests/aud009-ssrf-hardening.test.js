const assert = require("assert");
const http = require("node:http");
const dns = require("node:dns");
const {
  parseIpv6ToWords,
  ipMatchesCidr,
  classifyIpAddress,
  isDisallowedCloudHost,
  isLocalOrLoopbackHost,
  isAuthorizedHost,
  resolveCloudServerUrl,
  safeCloudFetch,
  createSecureLookup,
  getSecureCloudAgent
} = require("../main");

const TEST_PORT_PRIMARY = 4199;

function createTestServer(host, port, serverId, redirectTarget = null) {
  const requests = [];
  const srv = http.createServer((req, res) => {
    requests.push({ method: req.method, url: req.url, headers: req.headers, host });
    if (req.url === "/api/v1/redirect-to-metadata" && redirectTarget) {
      res.writeHead(302, { Location: redirectTarget });
      res.end();
      return;
    }
    if (req.url === "/api/v1/system/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "operational", server: serverId, host, port }));
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not_found", server: serverId }));
  });
  srv.getRequests = () => requests;
  srv.clearRequests = () => { requests.length = 0; };
  return srv;
}

async function run() {
  console.log("\n=======================================================");
  console.log("▶ STARTING AUD-009 SSRF HARDENING VERIFICATION SUITE");
  console.log("=======================================================\n");

  const originalEnv = { ...process.env };
  const restoreEnv = () => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  };

  // Primary server listens on 127.0.0.1:4199 (Approved destination)
  const primaryServer = createTestServer("127.0.0.1", TEST_PORT_PRIMARY, "primary_approved", "http://169.254.169.254/latest/meta-data");
  // Secondary server listens on 127.0.0.2:4199 (Mutated DNS rebind target)
  const secondaryServer = createTestServer("127.0.0.2", TEST_PORT_PRIMARY, "secondary_unauthorized_rebind_target");

  await new Promise((resolve) => primaryServer.listen(TEST_PORT_PRIMARY, "127.0.0.1", resolve));
  await new Promise((resolve) => secondaryServer.listen(TEST_PORT_PRIMARY, "127.0.0.2", resolve));

  try {
    // ─────────────────────────────────────────────────────────────────
    // Test 1: Production request to direct 192.168.x.x is blocked by default
    // ─────────────────────────────────────────────────────────────────
    console.log("[Test 1] Production request to direct 192.168.x.x is blocked by default...");
    process.env.NODE_ENV = "production";
    delete process.env.TRUSTED_LAN_HOSTS;
    const res1 = await safeCloudFetch("/api/v1/system/health", {}, "http://192.168.1.100:4000");
    assert.strictEqual(res1.ok, false);
    assert.ok(res1.error.includes("Direct private/LAN destination") || res1.error.includes("blocked"));
    console.log("✓ Direct 192.168.x.x blocked in production by default.");

    // ─────────────────────────────────────────────────────────────────
    // Test 2: Production request to direct 10.x.x.x is blocked by default
    // ─────────────────────────────────────────────────────────────────
    console.log("\n[Test 2] Production request to direct 10.x.x.x is blocked by default...");
    const res2 = await safeCloudFetch("/api/v1/system/health", {}, "http://10.0.0.5:4000");
    assert.strictEqual(res2.ok, false);
    assert.ok(res2.error.includes("Direct private/LAN destination") || res2.error.includes("blocked"));
    console.log("✓ Direct 10.x.x.x blocked in production by default.");

    // ─────────────────────────────────────────────────────────────────
    // Test 3: Production request to direct 172.16.x.x is blocked by default
    // ─────────────────────────────────────────────────────────────────
    console.log("\n[Test 3] Production request to direct 172.16.x.x is blocked by default...");
    const res3 = await safeCloudFetch("/api/v1/system/health", {}, "http://172.16.5.10:4000");
    assert.strictEqual(res3.ok, false);
    assert.ok(res3.error.includes("Direct private/LAN destination") || res3.error.includes("blocked"));
    console.log("✓ Direct 172.16.x.x blocked in production by default.");

    // ─────────────────────────────────────────────────────────────────
    // Test 4: Direct 127.0.0.1 blocked in production unless authorized
    // ─────────────────────────────────────────────────────────────────
    console.log("\n[Test 4] Direct 127.0.0.1 blocked in production unless authorized...");
    delete process.env.ALLOW_LOOPBACK_IN_PRODUCTION;
    const res4 = await safeCloudFetch("/api/v1/system/health", {}, `http://127.0.0.1:${TEST_PORT_PRIMARY}`);
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
    // Test 7: Authoritative IANA Special-Use IPv6 & Special-Purpose IPv4 Registry
    // Distinguishing Globally Reachable from Non-Globally-Reachable Entries
    // ─────────────────────────────────────────────────────────────────
    console.log("\n[Test 7] Authoritative IANA Special-Use IPv6 & IPv4 Registry coverage...");
    // 1. Loopback (::1/128, RFC 4291) - Non-global
    const cIpv6Loop = classifyIpAddress("::1");
    assert.strictEqual(cIpv6Loop.isLoopback, true);
    assert.strictEqual(cIpv6Loop.isDisallowed, false);

    // 2. Link-Local (fe80::/10, RFC 4291) - Non-global
    const cIpv6Link = classifyIpAddress("fe80::1");
    assert.strictEqual(cIpv6Link.isLinkLocal, true);
    assert.strictEqual(cIpv6Link.isDisallowed, true);

    // 3. Unique-Local ULA (fc00::/7, RFC 4193) - Non-global
    const cIpv6Ula1 = classifyIpAddress("fc00::1");
    const cIpv6Ula2 = classifyIpAddress("fd12:3456::1");
    assert.strictEqual(cIpv6Ula1.isPrivate, true);
    assert.strictEqual(cIpv6Ula2.isPrivate, true);

    // 4. Discard-Only (100::/64, RFC 6666) - Non-global
    const cIpv6Discard = classifyIpAddress("100::1");
    assert.strictEqual(cIpv6Discard.isReserved, true);
    assert.strictEqual(cIpv6Discard.isDisallowed, true);

    // 5. Dummy IPv6 Prefix (100:0:0:1::/64) - Non-global
    const cIpv6Dummy = classifyIpAddress("100:0:0:1::1");
    assert.strictEqual(cIpv6Dummy.isReserved, true);
    assert.strictEqual(cIpv6Dummy.isDisallowed, true);

    // 6. Documentation (2001:db8::/32, RFC 3849) - Non-global
    const cIpv6Doc1 = classifyIpAddress("2001:db8::1");
    assert.strictEqual(cIpv6Doc1.isDocumentation, true);
    assert.strictEqual(cIpv6Doc1.isDisallowed, true);

    // 7. Documentation (3fff::/20, RFC 9637) - Non-global
    const cIpv6Doc2 = classifyIpAddress("3fff::1");
    assert.strictEqual(cIpv6Doc2.isDocumentation, true);
    assert.strictEqual(cIpv6Doc2.isDisallowed, true);

    const cIpv6Doc2Boundary = classifyIpAddress("3fff:0fff:ffff::1");
    assert.strictEqual(cIpv6Doc2Boundary.isDocumentation, true);
    assert.strictEqual(cIpv6Doc2Boundary.isDisallowed, true);

    // 8. Benchmarking (2001:2::/48, RFC 5180) - Non-global
    const cIpv6Bench = classifyIpAddress("2001:2::1");
    assert.strictEqual(cIpv6Bench.isBenchmark, true);
    assert.strictEqual(cIpv6Bench.isDisallowed, true);

    // 9. ORCHIDv2 (2001:20::/28, RFC 7343) - Non-global
    const cIpv6Orchid = classifyIpAddress("2001:20::1");
    assert.strictEqual(cIpv6Orchid.isReserved, true);
    assert.strictEqual(cIpv6Orchid.isDisallowed, true);

    // 10. AS112-v6 Anycast (2001:4:112::/48, RFC 7535) - Non-global
    const cIpv6As112 = classifyIpAddress("2001:4:112::1");
    assert.strictEqual(cIpv6As112.isReserved, true);
    assert.strictEqual(cIpv6As112.isDisallowed, true);

    // 11. Deprecated Site-Local (fec0::/10, RFC 3879) - Non-global
    const cIpv6SiteLocal = classifyIpAddress("fec0::1");
    assert.strictEqual(cIpv6SiteLocal.isReserved, true);
    assert.strictEqual(cIpv6SiteLocal.isPrivate, true);
    assert.strictEqual(cIpv6SiteLocal.isDisallowed, true);

    // 12. Non-GUA Reserved Space outside 2000::/3 (e.g. 4000::/3) - Non-global
    const cIpv6Reserved = classifyIpAddress("4000::1");
    assert.strictEqual(cIpv6Reserved.isReserved, true);
    assert.strictEqual(cIpv6Reserved.isDisallowed, true);

    // 13. Legitimate Globally Reachable Global Unicast Addresses (GUA) MUST NOT be blocked
    const cIpv6GoogleGua = classifyIpAddress("2607:f8b0:4005:805::200e");
    assert.strictEqual(cIpv6GoogleGua.isReserved, false);
    assert.strictEqual(cIpv6GoogleGua.isDisallowed, false);
    assert.strictEqual(cIpv6GoogleGua.isNonPublic, false);

    const cIpv6CloudflareGua = classifyIpAddress("2606:4700::6810:84e5");
    assert.strictEqual(cIpv6CloudflareGua.isReserved, false);
    assert.strictEqual(cIpv6CloudflareGua.isDisallowed, false);
    assert.strictEqual(cIpv6CloudflareGua.isNonPublic, false);

    const cIpv6GoogleEurope = classifyIpAddress("2a00:1450:4009:815::200e");
    assert.strictEqual(cIpv6GoogleEurope.isReserved, false);
    assert.strictEqual(cIpv6GoogleEurope.isDisallowed, false);
    assert.strictEqual(cIpv6GoogleEurope.isNonPublic, false);

    // 14. 6to4 Anycast (2002::/16, RFC 3056, deprecated by RFC 7526)
    const cIpv66to4Meta = classifyIpAddress("2002:a9fe:a9fe::1");
    assert.strictEqual(cIpv66to4Meta.is6to4, true);
    assert.strictEqual(cIpv66to4Meta.isDisallowed, true);
    assert.strictEqual(cIpv66to4Meta.embeddedIpv4, "169.254.169.254");

    const cIpv66to4Priv = classifyIpAddress("2002:c0a8:0101::1");
    assert.strictEqual(cIpv66to4Priv.is6to4, true);
    assert.strictEqual(cIpv66to4Priv.isPrivate, true);
    assert.strictEqual(cIpv66to4Priv.embeddedIpv4, "192.168.1.1");

    // 15. IPv4 Special-Purpose: IETF protocol assignments (192.0.0.0/24, RFC 6890)
    const cIpv4Ietf = classifyIpAddress("192.0.0.1");
    assert.strictEqual(cIpv4Ietf.isReserved, true);
    assert.strictEqual(cIpv4Ietf.isDisallowed, true);

    // 16. IPv4 Special-Purpose: 6to4 relay anycast (192.88.99.0/24, RFC 7526)
    const cIpv46to4Relay = classifyIpAddress("192.88.99.1");
    assert.strictEqual(cIpv46to4Relay.isReserved, true);
    assert.strictEqual(cIpv46to4Relay.isDisallowed, true);

    console.log("✓ Full IANA Special-Use IPv6 (3fff::/20, 100:0:0:1::/64) & IPv4 classification verified.");

    // ─────────────────────────────────────────────────────────────────
    // Test 8: Comprehensive IPv4-Mapped IPv6 Normalization & Classification
    // (Dotted-decimal, Hexadecimal, SIIT, NAT64, Deprecated Compatible)
    // ─────────────────────────────────────────────────────────────────
    console.log("\n[Test 8] Comprehensive IPv4-mapped IPv6 normalization & classification...");
    // 1. Dotted-decimal IPv4-mapped
    const cMapDottedPriv = classifyIpAddress("::ffff:192.168.1.1");
    assert.strictEqual(cMapDottedPriv.isPrivate, true);
    assert.strictEqual(cMapDottedPriv.isIpv4Mapped, true);
    assert.strictEqual(cMapDottedPriv.embeddedIpv4, "192.168.1.1");

    const cMapDottedMeta = classifyIpAddress("::ffff:169.254.169.254");
    assert.strictEqual(cMapDottedMeta.isDisallowed, true);
    assert.strictEqual(cMapDottedMeta.isLinkLocal, true);
    assert.strictEqual(cMapDottedMeta.embeddedIpv4, "169.254.169.254");

    // 2. Hexadecimal IPv4-mapped: ::ffff:c0a8:0101 (192.168.1.1)
    const cMapHexPriv1 = classifyIpAddress("::ffff:c0a8:0101");
    assert.strictEqual(cMapHexPriv1.isPrivate, true);
    assert.strictEqual(cMapHexPriv1.isIpv4Mapped, true);
    assert.strictEqual(cMapHexPriv1.embeddedIpv4, "192.168.1.1");

    // 3. Hexadecimal IPv4-mapped without leading zeros: ::ffff:c0a8:101
    const cMapHexPriv2 = classifyIpAddress("::ffff:c0a8:101");
    assert.strictEqual(cMapHexPriv2.isPrivate, true);
    assert.strictEqual(cMapHexPriv2.isIpv4Mapped, true);
    assert.strictEqual(cMapHexPriv2.embeddedIpv4, "192.168.1.1");

    // 4. Hexadecimal IPv4-mapped metadata: ::ffff:a9fe:a9fe (169.254.169.254)
    const cMapHexMeta = classifyIpAddress("::ffff:a9fe:a9fe");
    assert.strictEqual(cMapHexMeta.isDisallowed, true);
    assert.strictEqual(cMapHexMeta.isLinkLocal, true);
    assert.strictEqual(cMapHexMeta.isIpv4Mapped, true);
    assert.strictEqual(cMapHexMeta.embeddedIpv4, "169.254.169.254");

    // 5. Hexadecimal IPv4-mapped loopback: ::ffff:7f00:1 (127.0.0.1)
    const cMapHexLoop = classifyIpAddress("::ffff:7f00:1");
    assert.strictEqual(cMapHexLoop.isLoopback, true);
    assert.strictEqual(cMapHexLoop.embeddedIpv4, "127.0.0.1");

    // 6. Hexadecimal IPv4-mapped carrier-grade NAT: ::ffff:6440:1 (100.64.0.1)
    const cMapHexCnat = classifyIpAddress("::ffff:6440:1");
    assert.strictEqual(cMapHexCnat.isCarrierNat, true);
    assert.strictEqual(cMapHexCnat.isPrivate, true);
    assert.strictEqual(cMapHexCnat.embeddedIpv4, "100.64.0.1");

    // 7. Full expanded 8-hextet IPv4-mapped hex: 0:0:0:0:0:ffff:c0a8:0101
    const cMapFullHex = classifyIpAddress("0:0:0:0:0:ffff:c0a8:0101");
    assert.strictEqual(cMapFullHex.isPrivate, true);
    assert.strictEqual(cMapFullHex.embeddedIpv4, "192.168.1.1");

    // 8. Bracketed URI representation: [::ffff:a9fe:a9fe]
    const cMapBracketed = classifyIpAddress("[::ffff:a9fe:a9fe]");
    assert.strictEqual(cMapBracketed.isDisallowed, true);
    assert.strictEqual(cMapBracketed.embeddedIpv4, "169.254.169.254");

    // Verify safeCloudFetch rejects hexadecimal IPv4-mapped addresses in production
    process.env.NODE_ENV = "production";
    delete process.env.TRUSTED_LAN_HOSTS;
    const resHexPriv = await safeCloudFetch("/api/v1/system/health", {}, "http://[::ffff:c0a8:0101]:4000");
    assert.strictEqual(resHexPriv.ok, false);
    assert.ok(resHexPriv.error.includes("blocked"));

    const resHexMeta = await safeCloudFetch("/api/v1/system/health", {}, "http://[::ffff:a9fe:a9fe]:4000");
    assert.strictEqual(resHexMeta.ok, false);
    assert.ok(resHexMeta.error.includes("Prohibited IP target"));
    console.log("✓ Hexadecimal and bracketed IPv4-mapped IPv6 representations normalized and blocked.");

    // ─────────────────────────────────────────────────────────────────
    // Test 9: Public hostname resolving to a private IP is rejected
    // ─────────────────────────────────────────────────────────────────
    console.log("\n[Test 9] Public hostname resolving to a private IP is rejected...");
    process.env.NODE_ENV = "production";
    delete process.env.TRUSTED_LAN_HOSTS;
    const lookupFunc = createSecureLookup();

    await new Promise((resolve) => {
      const originalLookup = dns.lookup;
      dns.lookup = (host, opts, cb) => {
        cb(null, [{ address: "192.168.1.50", family: 4 }]);
      };

      lookupFunc("fake-cloud.zynbill.in", {}, (err) => {
        dns.lookup = originalLookup;
        assert.ok(err, "Must return error for hostname resolving to private IP");
        assert.ok(err.message.includes("DNS rebinding rejected") || err.message.includes("SSRF Protection"));
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
    // Test 12: Real Connection Pinning & DNS Rebinding Socket Integration
    // (Actual HTTP Socket Connections + DNS Mutation to Secondary Server IP)
    // ─────────────────────────────────────────────────────────────────
    console.log("\n[Test 12] Real connection pinning: verified via active HTTP socket connections...");
    delete process.env.NODE_ENV; // dev mode
    process.env.TRUSTED_LAN_HOSTS = "rebind.zynbill.test,127.0.0.1";

    primaryServer.clearRequests();
    secondaryServer.clearRequests();

    const originalDnsLookup = dns.lookup;
    let dnsQueryCount = 0;
    // Initial DNS returns Primary Server IP (127.0.0.1).
    // Mutated DNS returns Secondary Server IP (127.0.0.2).
    let simulatedDnsAddress = "127.0.0.1";

    dns.lookup = (hostname, options, callback) => {
      if (hostname === "rebind.zynbill.test") {
        dnsQueryCount++;
        const currentAddr = simulatedDnsAddress;
        // Mutate DNS response for subsequent queries directly to the Secondary Server IP
        simulatedDnsAddress = "127.0.0.2";
        return callback(null, [{ address: currentAddr, family: 4 }]);
      }
      return originalDnsLookup(hostname, options, callback);
    };

    try {
      assert.strictEqual(dnsQueryCount, 0, "Initial DNS query count must be 0");
      assert.strictEqual(primaryServer.getRequests().length, 0, "Primary server must have 0 requests initially");
      assert.strictEqual(secondaryServer.getRequests().length, 0, "Secondary server must have 0 requests initially");

      // 1. First request: Hostname resolves to 127.0.0.1 (Primary Approved Server)
      const res12A = await safeCloudFetch(
        "/api/v1/system/health",
        {},
        `http://rebind.zynbill.test:${TEST_PORT_PRIMARY}`
      );
      assert.strictEqual(res12A.ok, true);
      assert.strictEqual(res12A.status, 200);
      assert.strictEqual(res12A.data.server, "primary_approved");
      assert.strictEqual(res12A.data.host, "127.0.0.1");

      // Verify dnsQueryCount is exactly 1 for the first successful request
      assert.strictEqual(dnsQueryCount, 1, "DNS lookup must be invoked exactly once during initial socket connection");

      // Verify socket connected to the validated IP (127.0.0.1: primary server)
      assert.strictEqual(primaryServer.getRequests().length, 1, "Primary server must have received exactly 1 request");

      // Verify secondary server (127.0.0.2) received zero requests
      assert.strictEqual(secondaryServer.getRequests().length, 0, "Secondary server must have received zero requests");

      // 2. Second request in production: DNS now returns 127.0.0.2 (Secondary Server IP)
      // Because 127.0.0.2 is unauthorized in production, createSecureLookup must reject it pre-socket!
      process.env.NODE_ENV = "production";
      const res12B = await safeCloudFetch(
        "/api/v1/system/health",
        {},
        `http://rebind.zynbill.test:${TEST_PORT_PRIMARY}`
      );
      assert.strictEqual(res12B.ok, false);
      assert.ok(
        res12B.error.includes("DNS rebinding rejected") ||
        res12B.error.includes("unauthorized internal IP") ||
        res12B.error.includes("fetch failed")
      );

      // Verify secondary server (127.0.0.2) STILL received zero requests (rejected before any socket opened!)
      assert.strictEqual(secondaryServer.getRequests().length, 0, "Secondary server (mutated DNS target) must receive zero requests");
      assert.strictEqual(primaryServer.getRequests().length, 1, "Primary server must not have received any second request");
    } finally {
      dns.lookup = originalDnsLookup;
    }
    console.log("✓ Real connection pinning verified: socket connects strictly to validated IP; mutated DNS rejected before secondary server.");

    // ─────────────────────────────────────────────────────────────────
    // Test 13: HTTP redirects are rejected unconditionally
    // ─────────────────────────────────────────────────────────────────
    console.log("\n[Test 13] HTTP redirects are rejected...");
    delete process.env.NODE_ENV;
    const res13 = await safeCloudFetch("/api/v1/redirect-to-metadata", {}, `http://127.0.0.1:${TEST_PORT_PRIMARY}`);
    assert.strictEqual(res13.ok, false);
    assert.ok(res13.error.toLowerCase().includes("redirect") || res13.error.toLowerCase().includes("failed"));
    console.log("✓ HTTP redirects rejected by native fetch with redirect: error.");

    // ─────────────────────────────────────────────────────────────────
    // Test 14: Production TLS Enforcement (ALLOW_INSECURE_HTTP cannot bypass HTTPS)
    // ─────────────────────────────────────────────────────────────────
    console.log("\n[Test 14] Production TLS enforcement: ALLOW_INSECURE_HTTP cannot bypass HTTPS for remote hosts...");
    process.env.NODE_ENV = "production";
    process.env.ALLOW_INSECURE_HTTP = "true"; // Attempting insecure override
    delete process.env.TRUSTED_LAN_HOSTS;

    const remoteUrl = resolveCloudServerUrl("http://api.zynbill.com");
    assert.strictEqual(remoteUrl, "https://api.zynbill.com", "Remote public host MUST be upgraded to https:// in production even with ALLOW_INSECURE_HTTP=true");

    // But explicitly authorized trusted LAN hosts preserve HTTP
    process.env.TRUSTED_LAN_HOSTS = "192.168.1.50,lan-server.local";
    const lanIpUrl = resolveCloudServerUrl("http://192.168.1.50:4000");
    assert.strictEqual(lanIpUrl, "http://192.168.1.50:4000", "Authorized trusted LAN IP must allow plain HTTP");

    const lanHostUrl = resolveCloudServerUrl("http://lan-server.local:4000");
    assert.strictEqual(lanHostUrl, "http://lan-server.local:4000", "Authorized trusted LAN hostname must allow plain HTTP");
    console.log("✓ Production TLS enforced: HTTPS mandatory for remote hosts; plain HTTP restricted to authorized LAN/loopback.");

    // ─────────────────────────────────────────────────────────────────
    // Test 15: Strengthened Trusted LAN Host Authorization
    // (Validates Resolved Destination IP & Rejects Allowlisted Host Redirecting to Unauthorized IP)
    // ─────────────────────────────────────────────────────────────────
    console.log("\n[Test 15] Strengthened Trusted LAN Host Authorization...");
    process.env.NODE_ENV = "production";
    process.env.TRUSTED_LAN_HOSTS = "192.168.1.50,lan-server.local,explicit.local:192.168.1.75,192.168.2.0/24";

    // 1. Allowlisted direct IP vs unauthorized direct IP
    assert.strictEqual(isAuthorizedHost("192.168.1.50", "192.168.1.50"), true);
    assert.strictEqual(isAuthorizedHost("192.168.1.51", "192.168.1.51"), false);

    // 2. Allowlisted hostname resolving to approved IP vs unauthorized IP
    assert.strictEqual(isAuthorizedHost("lan-server.local", "192.168.1.50"), true);
    assert.strictEqual(isAuthorizedHost("lan-server.local", "192.168.1.99"), false, "Allowlisted hostname MUST NOT authorize unauthorized destination IP");
    assert.strictEqual(isAuthorizedHost("lan-server.local", "127.0.0.1"), false, "Allowlisted LAN hostname MUST NOT authorize loopback IP");
    assert.strictEqual(isAuthorizedHost("lan-server.local", "169.254.169.254"), false, "Allowlisted LAN hostname MUST NOT authorize metadata IP");

    // 3. Host-to-IP explicit binding: explicit.local:192.168.1.75
    assert.strictEqual(isAuthorizedHost("explicit.local", "192.168.1.75"), true);
    assert.strictEqual(isAuthorizedHost("explicit.local", "192.168.1.50"), false, "Host bound to 192.168.1.75 must reject 192.168.1.50");

    // 4. CIDR subnet matching in TRUSTED_LAN_HOSTS: 192.168.2.0/24
    assert.strictEqual(isAuthorizedHost("192.168.2.10", "192.168.2.10"), true);
    assert.strictEqual(isAuthorizedHost("192.168.3.10", "192.168.3.10"), false);

    // 5. Unallowlisted hostname with valid IP
    assert.strictEqual(isAuthorizedHost("rogue-server.local", "192.168.1.50"), false);

    // 6. Prohibited metadata IP can NEVER be authorized even if placed in TRUSTED_LAN_HOSTS
    process.env.TRUSTED_LAN_HOSTS = "169.254.169.254";
    const res15Meta = await safeCloudFetch("/api/v1/system/health", {}, "http://169.254.169.254");
    assert.strictEqual(res15Meta.ok, false);
    assert.ok(res15Meta.error.includes("Prohibited IP target"));
    console.log("✓ Strengthened Trusted LAN authorization verified: destination IPs strictly verified.");

    // ─────────────────────────────────────────────────────────────────
    // Test 16: Existing localhost development workflow still works
    // ─────────────────────────────────────────────────────────────────
    console.log("\n[Test 16] Existing localhost development workflow still works...");
    delete process.env.NODE_ENV; // non-production / dev mode
    assert.strictEqual(isAuthorizedHost("localhost"), true);
    assert.strictEqual(isAuthorizedHost("127.0.0.1"), true);
    assert.strictEqual(resolveCloudServerUrl("http://localhost:4000"), "http://localhost:4000");

    const res16 = await safeCloudFetch("/api/v1/system/health", {}, `http://127.0.0.1:${TEST_PORT_PRIMARY}`);
    assert.strictEqual(res16.ok, true);
    assert.strictEqual(res16.status, 200);
    assert.strictEqual(res16.data.status, "operational");
    console.log("✓ Local development workflow operational.");

    // ─────────────────────────────────────────────────────────────────
    // Test 17: Defensive Dispatcher Validation
    // (Demonstrably Proves Caller-Supplied Dispatcher is NEVER Invoked)
    // ─────────────────────────────────────────────────────────────────
    console.log("\n[Test 17] Defensive dispatcher validation...");
    delete process.env.NODE_ENV;

    let callerDispatcherInvoked = false;
    const trackingSpyDispatcher = {
      dispatch(options, handler) {
        callerDispatcherInvoked = true;
        throw new Error("SECURITY_BREACH: Caller-supplied dispatcher was invoked!");
      },
      close() {},
      destroy() {}
    };

    // Attempt to pass an untrusted dispatcher in options
    const res17 = await safeCloudFetch(
      "/api/v1/system/health",
      { dispatcher: trackingSpyDispatcher },
      `http://127.0.0.1:${TEST_PORT_PRIMARY}`
    );
    assert.strictEqual(res17.ok, true, "safeCloudFetch must succeed using secure Agent");
    assert.strictEqual(
      callerDispatcherInvoked,
      false,
      "Demonstrable proof: Caller-supplied dispatcher was NEVER invoked! safeCloudFetch unconditionally uses secure Agent."
    );
    console.log("✓ Defensive dispatcher enforcement demonstrably verified: caller-supplied dispatcher is strictly ignored.");

    console.log("\n=======================================================");
    console.log("🎉 ALL 17 AUD-009 SSRF HARDENING BEHAVIORAL TESTS PASSED!");
    console.log("=======================================================\n");
  } finally {
    restoreEnv();
    primaryServer.close();
    secondaryServer.close();
  }
}

run().catch((err) => {
  console.error("\n❌ AUD-009 BEHAVIORAL SUITE FAILED:", err);
  process.exit(1);
});
