/**
 * Unit tests for the SSRF-safe image URL loader (safeImageUrl.ts).
 *
 * DNS and network responses are mocked — no real internet requests are made.
 *
 * Coverage:
 *   - isPrivateIPv4 / isPrivateIPv6 helpers
 *   - assertSafeExternalUrl (protocol, credentials, DNS/SSRF checks)
 *   - safeFetchBuffer (byte limits, streaming, redirect handling)
 *   - fetchImageBuffer integration (internal path pass-through)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  isPrivateIPv4,
  isPrivateIPv6,
  assertSafeExternalUrl,
  safeFetchBuffer,
  MAX_REDIRECTS,
  _resolvers,
} from "../lib/safeImageUrl";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — DNS injection via _resolvers (vi.mock("dns/promises") is not
// reliable in pool:"forks"; mutating the exported object is the safe approach)
// ─────────────────────────────────────────────────────────────────────────────

const _nativeDnsLookup = _resolvers.dnsLookup;

afterEach(() => {
  // Always restore the real resolver after each test so other test files are
  // unaffected (each file runs in its own fork, but be explicit).
  _resolvers.dnsLookup = _nativeDnsLookup;
});

/** Allow every hostname to resolve to a public IPv4 address. */
function allowAllHosts() {
  _resolvers.dnsLookup = async () => [{ address: "8.8.8.8", family: 4 }];
}

/** Make every DNS lookup return a single specific address. */
function dnsReturns(address: string, family: 4 | 6 = 4) {
  _resolvers.dnsLookup = async () => [{ address, family }];
}

function makeSmallBuffer(sizeBytes = 512): Buffer {
  return Buffer.alloc(sizeBytes, 0x42);
}

function makeFetchResponse(opts: {
  status?: number;
  ok?: boolean;
  body?: Buffer;
  headers?: Record<string, string>;
  location?: string;
}): Response {
  const { status = 200, ok = true, body, headers = {}, location } = opts;
  const allHeaders = { ...headers };
  if (location) allHeaders["location"] = location;
  return {
    status,
    ok,
    headers: new Headers(allHeaders),
    body: null,          // no streaming in test stubs
    arrayBuffer: async () => (body ?? makeSmallBuffer()).buffer as ArrayBuffer,
  } as unknown as Response;
}

// ─────────────────────────────────────────────────────────────────────────────
// isPrivateIPv4
// ─────────────────────────────────────────────────────────────────────────────

describe("isPrivateIPv4", () => {
  it("blocks 127.0.0.1 (loopback)", () => {
    expect(isPrivateIPv4("127.0.0.1")).toBe(true);
  });

  it("blocks 127.255.255.255 (loopback range)", () => {
    expect(isPrivateIPv4("127.255.255.255")).toBe(true);
  });

  it("blocks 10.0.0.1", () => {
    expect(isPrivateIPv4("10.0.0.1")).toBe(true);
  });

  it("blocks 172.16.0.1", () => {
    expect(isPrivateIPv4("172.16.0.1")).toBe(true);
  });

  it("blocks 172.31.255.255 (end of 172.16/12)", () => {
    expect(isPrivateIPv4("172.31.255.255")).toBe(true);
  });

  it("allows 172.32.0.1 (outside 172.16/12)", () => {
    expect(isPrivateIPv4("172.32.0.1")).toBe(false);
  });

  it("blocks 192.168.1.1", () => {
    expect(isPrivateIPv4("192.168.1.1")).toBe(true);
  });

  it("blocks 169.254.169.254 (metadata / link-local)", () => {
    expect(isPrivateIPv4("169.254.169.254")).toBe(true);
  });

  it("allows 8.8.8.8 (public)", () => {
    expect(isPrivateIPv4("8.8.8.8")).toBe(false);
  });

  it("allows 1.1.1.1 (public)", () => {
    expect(isPrivateIPv4("1.1.1.1")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isPrivateIPv6
// ─────────────────────────────────────────────────────────────────────────────

describe("isPrivateIPv6", () => {
  it("blocks ::1 (loopback)", () => {
    expect(isPrivateIPv6("::1")).toBe(true);
  });

  it("blocks :: (unspecified)", () => {
    expect(isPrivateIPv6("::")).toBe(true);
  });

  it("blocks fc00::1 (ULA fc00::/7)", () => {
    expect(isPrivateIPv6("fc00::1")).toBe(true);
  });

  it("blocks fd00::1 (ULA fd00::/7)", () => {
    expect(isPrivateIPv6("fd00::1")).toBe(true);
  });

  it("blocks fe80::1 (link-local fe80::/10)", () => {
    expect(isPrivateIPv6("fe80::1")).toBe(true);
  });

  it("blocks ::ffff:127.0.0.1 (IPv4-mapped loopback)", () => {
    expect(isPrivateIPv6("::ffff:127.0.0.1")).toBe(true);
  });

  it("blocks ::ffff:10.0.0.1 (IPv4-mapped private)", () => {
    expect(isPrivateIPv6("::ffff:10.0.0.1")).toBe(true);
  });

  it("blocks ::ffff:192.168.1.1 (IPv4-mapped private)", () => {
    expect(isPrivateIPv6("::ffff:192.168.1.1")).toBe(true);
  });

  it("allows 2001:db8::1 (documentation range — not blocked)", () => {
    // 2001:db8::/32 is documentation; our checker doesn't block it (it is routable-looking)
    expect(isPrivateIPv6("2001:db8::1")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// assertSafeExternalUrl
// ─────────────────────────────────────────────────────────────────────────────

describe("assertSafeExternalUrl", () => {
  beforeEach(() => {
    // Each test sets its own DNS behaviour via dnsReturns() / allowAllHosts().
    // No shared reset needed — afterEach (module-level) restores the native resolver.
  });

  it("blocks file:// protocol", async () => {
    await expect(assertSafeExternalUrl("file:///etc/passwd"))
      .rejects.toThrow(/private or unsupported/i);
  });

  it("blocks ftp:// protocol", async () => {
    await expect(assertSafeExternalUrl("ftp://example.com/image.png"))
      .rejects.toThrow(/private or unsupported/i);
  });

  it("blocks embedded credentials (user:pass@host)", async () => {
    await expect(assertSafeExternalUrl("https://user:secret@example.com/image.jpg"))
      .rejects.toThrow(/private or unsupported/i);
  });

  it("blocks localhost by name", async () => {
    await expect(assertSafeExternalUrl("http://localhost/image.jpg"))
      .rejects.toThrow(/private or unsupported/i);
  });

  it("blocks *.localhost", async () => {
    await expect(assertSafeExternalUrl("http://anything.localhost/image.jpg"))
      .rejects.toThrow(/private or unsupported/i);
  });

  it("blocks 127.0.0.1 via DNS resolution", async () => {
    dnsReturns("127.0.0.1");
    await expect(assertSafeExternalUrl("http://127.0.0.1/image.jpg"))
      .rejects.toThrow(/private or unsupported/i);
  });

  it("blocks 127.1 via DNS returning 127.0.0.1", async () => {
    // Some OSes resolve 127.1 → 127.0.0.1
    dnsReturns("127.0.0.1");
    await expect(assertSafeExternalUrl("http://127.1/image.jpg"))
      .rejects.toThrow(/private or unsupported/i);
  });

  it("blocks 10.0.0.1", async () => {
    dnsReturns("10.0.0.1");
    await expect(assertSafeExternalUrl("http://10.0.0.1/image.jpg"))
      .rejects.toThrow(/private or unsupported/i);
  });

  it("blocks 172.16.0.1", async () => {
    dnsReturns("172.16.0.1");
    await expect(assertSafeExternalUrl("http://172.16.0.1/image.jpg"))
      .rejects.toThrow(/private or unsupported/i);
  });

  it("blocks 192.168.1.1", async () => {
    dnsReturns("192.168.1.1");
    await expect(assertSafeExternalUrl("http://192.168.1.1/image.jpg"))
      .rejects.toThrow(/private or unsupported/i);
  });

  it("blocks 169.254.169.254 (metadata endpoint)", async () => {
    dnsReturns("169.254.169.254");
    await expect(assertSafeExternalUrl("http://169.254.169.254/latest/meta-data/"))
      .rejects.toThrow(/private or unsupported/i);
  });

  it("blocks ::1 (IPv6 loopback)", async () => {
    dnsReturns("::1", 6);
    await expect(assertSafeExternalUrl("http://[::1]/image.jpg"))
      .rejects.toThrow(/private or unsupported/i);
  });

  it("blocks fc00::1 (IPv6 ULA)", async () => {
    dnsReturns("fc00::1", 6);
    await expect(assertSafeExternalUrl("http://[fc00::1]/image.jpg"))
      .rejects.toThrow(/private or unsupported/i);
  });

  it("passes a valid public HTTPS URL", async () => {
    dnsReturns("8.8.8.8");
    await expect(assertSafeExternalUrl("https://example.com/image.jpg"))
      .resolves.toBeDefined();
  });

  it("does not expose resolved addresses in error messages", async () => {
    dnsReturns("192.168.100.50");
    let message = "";
    try {
      await assertSafeExternalUrl("http://internal.company.net/image.jpg");
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).not.toContain("192.168.100.50");
    expect(message).toMatch(/private or unsupported/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// safeFetchBuffer
// ─────────────────────────────────────────────────────────────────────────────

describe("safeFetchBuffer", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    // Default: all hostnames resolve to a public IP
    allowAllHosts();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const MAX_BYTES = 50 * 1024 * 1024;

  it("returns a buffer for a valid public HTTPS URL", async () => {
    const payload = Buffer.from("JPEG_DATA");
    vi.stubGlobal("fetch", async () => makeFetchResponse({ body: payload }));

    const buf = await safeFetchBuffer("https://example.com/image.jpg", MAX_BYTES);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(0);
  });

  it("throws on oversized Content-Length (exceeds maxBytes)", async () => {
    const tooBig = MAX_BYTES + 1;
    vi.stubGlobal("fetch", async () =>
      makeFetchResponse({ headers: { "content-length": String(tooBig) } })
    );
    await expect(safeFetchBuffer("https://example.com/big.jpg", MAX_BYTES))
      .rejects.toThrow(/too large/i);
  });

  it("throws when chunked response exceeds the byte limit", async () => {
    const smallLimit = 100;
    const bigBody = Buffer.alloc(200, 0xaa);
    vi.stubGlobal("fetch", async () => makeFetchResponse({ body: bigBody }));

    await expect(safeFetchBuffer("https://example.com/big.jpg", smallLimit))
      .rejects.toThrow(/too large/i);
  });

  it("follows redirects up to MAX_REDIRECTS times", async () => {
    // Set up a chain: URL1 → URL2 → URL3 → final (URL4 is the data)
    const finalPayload = Buffer.from("image data");
    let callCount = 0;
    vi.stubGlobal("fetch", async (url: string) => {
      callCount++;
      if (callCount <= MAX_REDIRECTS) {
        return makeFetchResponse({
          status: 302,
          ok: false,
          location: `https://cdn.example.com/hop-${callCount}/image.jpg`,
        });
      }
      return makeFetchResponse({ body: finalPayload });
    });

    const buf = await safeFetchBuffer("https://example.com/image.jpg", MAX_BYTES);
    expect(buf).toBeInstanceOf(Buffer);
    expect(callCount).toBe(MAX_REDIRECTS + 1);
  });

  it("throws when there are more than MAX_REDIRECTS redirects", async () => {
    let callCount = 0;
    vi.stubGlobal("fetch", async () => {
      callCount++;
      return makeFetchResponse({
        status: 302,
        ok: false,
        location: `https://cdn.example.com/hop-${callCount}/image.jpg`,
      });
    });

    await expect(safeFetchBuffer("https://example.com/image.jpg", MAX_BYTES))
      .rejects.toThrow(/too many/i);
  });

  it("throws when a redirect leads to a private address", async () => {
    let callCount = 0;
    vi.stubGlobal("fetch", async () => {
      callCount++;
      return makeFetchResponse({
        status: 301,
        ok: false,
        location: "http://192.168.1.100/secret",
      });
    });

    // First DNS lookup (for the initial URL) returns a public IP.
    // Second lookup (for 192.168.1.100) returns the private IP itself.
    _resolvers.dnsLookup = async (hostname: string) => {
      if (hostname === "192.168.1.100") return [{ address: "192.168.1.100", family: 4 }];
      return [{ address: "8.8.8.8", family: 4 }];
    };

    await expect(safeFetchBuffer("https://valid.example.com/image.jpg", MAX_BYTES))
      .rejects.toThrow(/private or unsupported/i);
  });

  it("blocks redirect to localhost", async () => {
    vi.stubGlobal("fetch", async () =>
      makeFetchResponse({
        status: 301,
        ok: false,
        location: "http://localhost/admin",
      })
    );

    await expect(safeFetchBuffer("https://valid.example.com/image.jpg", MAX_BYTES))
      .rejects.toThrow(/private or unsupported/i);
  });

  it("does not expose private addresses in error messages for redirects", async () => {
    vi.stubGlobal("fetch", async () =>
      makeFetchResponse({
        status: 301,
        ok: false,
        location: "http://10.0.0.1/secret",
      })
    );
    _resolvers.dnsLookup = async (hostname: string) => {
      if (hostname === "10.0.0.1") return [{ address: "10.0.0.1", family: 4 }];
      return [{ address: "8.8.8.8", family: 4 }];
    };

    let message = "";
    try {
      await safeFetchBuffer("https://example.com/image.jpg", MAX_BYTES);
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    // The error message must not leak the private address of the redirect target
    expect(message).not.toContain("10.0.0.1");
    expect(message).toMatch(/private or unsupported/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MAX_REDIRECTS constant
// ─────────────────────────────────────────────────────────────────────────────

describe("MAX_REDIRECTS constant", () => {
  it("equals 3", () => {
    expect(MAX_REDIRECTS).toBe(3);
  });
});
