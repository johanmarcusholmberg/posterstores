/**
 * SSRF-safe external image URL validation and streaming fetch.
 *
 * Internal object-storage paths (/api/storage/objects/… or /objects/…)
 * must bypass this module entirely and be handled by the storage SDK.
 *
 * For all external HTTP/HTTPS URLs this module:
 *   – Rejects non-HTTP/HTTPS schemes.
 *   – Rejects embedded credentials (user:pass@host).
 *   – Resolves DNS before connecting and blocks every private,
 *     loopback, link-local, metadata, unspecified, and multicast address.
 *   – Blocks IPv4-mapped IPv6 variants.
 *   – Blocks localhost and *.localhost by name.
 *   – Follows redirects manually (max MAX_REDIRECTS), re-validating
 *     each hop before following it.
 *   – Pre-checks Content-Length when the server provides it.
 *   – Streams the response body and enforces a hard byte limit.
 *
 * Error messages are safe for callers to surface: they never expose resolved
 * addresses, signed URL secrets, or internal network topology.
 */

import { lookup as _nativeDnsLookup } from "dns/promises";

export const MAX_REDIRECTS = 3;

// ─── Injectable resolvers (tests may replace these) ───────────────────────────
//
// vitest's `vi.mock("dns/promises")` does not intercept Node.js built-in
// modules when the pool is "forks".  Tests should instead replace
// `_resolvers.dnsLookup` in beforeEach / afterEach to control DNS behaviour.
//
export const _resolvers = {
  dnsLookup: (hostname: string) =>
    _nativeDnsLookup(hostname, { all: true }) as Promise<{ address: string; family: number }[]>,
};

const BLOCKED_MSG = "Image URL points to a private or unsupported network address.";

// ─── Private-address detection ────────────────────────────────────────────────

export function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return false;
  const [a, b, c] = parts;
  if (a === 0) return true;                                  // 0.0.0.0/8 — unspecified
  if (a === 10) return true;                                 // 10.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true;        // 100.64.0.0/10 — CGNAT shared space
  if (a === 127) return true;                                // 127.0.0.0/8 — loopback
  if (a === 169 && b === 254) return true;                   // 169.254.0.0/16 — link-local / AWS metadata
  if (a === 172 && b >= 16 && b <= 31) return true;         // 172.16.0.0/12
  if (a === 192 && b === 0 && c === 2) return true;          // 192.0.2.0/24 — TEST-NET-1
  if (a === 192 && b === 168) return true;                   // 192.168.0.0/16
  if (a === 198 && (b === 18 || b === 19)) return true;      // 198.18.0.0/15 — benchmarking
  if (a === 198 && b === 51 && c === 100) return true;       // 198.51.100.0/24 — TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true;        // 203.0.113.0/24 — TEST-NET-3
  if (a >= 224) return true;                                 // 224.0.0.0/4 — multicast + reserved
  return false;
}

export function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase().trim();

  if (lower === "::1" || lower === "::") return true;       // loopback / unspecified

  const firstSegment = lower.split(":")[0] ?? "";
  const firstHex = parseInt(firstSegment.padStart(4, "0"), 16);

  if (isNaN(firstHex)) return false;

  if ((firstHex & 0xfe00) === 0xfc00) return true;          // fc00::/7  — ULA
  if ((firstHex & 0xffc0) === 0xfe80) return true;          // fe80::/10 — link-local
  if ((firstHex & 0xffc0) === 0xfec0) return true;          // fec0::/10 — deprecated site-local
  if ((firstHex & 0xff00) === 0xff00) return true;          // ff00::/8  — multicast

  // ::ffff:0:0/96 — IPv4-mapped
  if (lower.startsWith("::ffff:")) {
    const rest = lower.slice(7);
    if (rest.includes(".")) {
      // ::ffff:a.b.c.d
      return isPrivateIPv4(rest);
    }
    // ::ffff:xxxx:xxxx — convert hex pairs to dotted-decimal
    const hexParts = rest.split(":");
    if (hexParts.length === 2) {
      const hi = parseInt(hexParts[0] ?? "0", 16);
      const lo = parseInt(hexParts[1] ?? "0", 16);
      const a = (hi >> 8) & 0xff;
      const b = hi & 0xff;
      const c = (lo >> 8) & 0xff;
      const d = lo & 0xff;
      return isPrivateIPv4(`${a}.${b}.${c}.${d}`);
    }
  }

  return false;
}

// ─── Hostname validation ──────────────────────────────────────────────────────

async function assertSafeHostname(hostname: string): Promise<void> {
  const lower = hostname.toLowerCase();

  // Block localhost by name (before DNS resolution)
  if (lower === "localhost" || lower.endsWith(".localhost")) {
    throw new Error(BLOCKED_MSG);
  }

  // DNS-resolve every IP the hostname maps to
  let addresses: { address: string }[];
  try {
    addresses = await _resolvers.dnsLookup(hostname);
  } catch {
    // DNS failure is treated as unresolvable (no information leakage)
    throw new Error("Image URL could not be resolved.");
  }

  if (addresses.length === 0) {
    throw new Error("Image URL could not be resolved.");
  }

  for (const { address } of addresses) {
    if (isPrivateIPv4(address) || isPrivateIPv6(address)) {
      throw new Error(BLOCKED_MSG);
    }
  }
}

/**
 * Validate that a raw URL string is safe to fetch as an external image.
 * Throws with a caller-safe message on any violation.
 * Does NOT make a network request.
 */
export async function assertSafeExternalUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Invalid image URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(BLOCKED_MSG);
  }

  if (parsed.username || parsed.password) {
    throw new Error(BLOCKED_MSG);
  }

  await assertSafeHostname(parsed.hostname);
  return parsed;
}

// ─── SSRF-safe streaming fetch ────────────────────────────────────────────────

/**
 * Fetch an external URL with full SSRF protection and a hard byte limit.
 *
 *  1. Validates the URL and resolves DNS on each hop.
 *  2. Uses redirect: "manual" — follows up to MAX_REDIRECTS redirects,
 *     re-validating the target before each hop.
 *  3. Pre-checks Content-Length when provided.
 *  4. Streams the body and aborts as soon as cumulative bytes > maxBytes.
 *
 * @throws Error with a safe message on any security or size violation.
 */
export async function safeFetchBuffer(rawUrl: string, maxBytes: number): Promise<Buffer> {
  let currentUrl = rawUrl;

  for (let hop = 0; ; hop++) {
    // Validate (and DNS-check) before connecting
    await assertSafeExternalUrl(currentUrl);

    let response: Response;
    try {
      response = await fetch(currentUrl, {
        redirect: "manual",
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      throw new Error(
        `Failed to fetch image: ${err instanceof Error ? err.message : "network error"}`
      );
    }

    // ── Redirect handling ────────────────────────────────────────────────
    if (response.status >= 300 && response.status < 400) {
      if (hop >= MAX_REDIRECTS) {
        await response.body?.cancel().catch(() => undefined);
        throw new Error(`Image URL redirects too many times (max ${MAX_REDIRECTS}).`);
      }
      const location = response.headers.get("location");
      if (!location) {
        throw new Error("Redirect response has no Location header.");
      }
      let next: string;
      try {
        next = new URL(location, currentUrl).toString();
      } catch {
        throw new Error("Redirect target is not a valid URL.");
      }
      await response.body?.cancel().catch(() => undefined);
      currentUrl = next;
      continue;
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch image (HTTP ${response.status}).`);
    }

    // ── Content-Length pre-check ─────────────────────────────────────────
    const clHeader = response.headers.get("content-length");
    if (clHeader) {
      const declared = parseInt(clHeader, 10);
      if (!isNaN(declared) && declared > maxBytes) {
        await response.body?.cancel().catch(() => undefined);
        throw new Error(
          `Image is too large (${Math.round(declared / 1024 / 1024)} MB). ` +
          `Maximum allowed size is ${Math.round(maxBytes / 1024 / 1024)} MB.`
        );
      }
    }

    // ── Streaming read ───────────────────────────────────────────────────
    if (response.body) {
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;
      const reader = response.body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          totalBytes += value.byteLength;
          if (totalBytes > maxBytes) {
            await reader.cancel();
            throw new Error(
              `Image is too large. ` +
              `Maximum allowed size is ${Math.round(maxBytes / 1024 / 1024)} MB.`
            );
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      return Buffer.concat(chunks.map((c) => Buffer.from(c)));
    }

    // Fallback for test environments where fetch stubs return no streaming body
    const arrayBuf = await response.arrayBuffer();
    const buf = Buffer.from(arrayBuf);
    if (buf.byteLength > maxBytes) {
      throw new Error(
        `Image is too large (${Math.round(buf.byteLength / 1024 / 1024)} MB). ` +
        `Maximum allowed size is ${Math.round(maxBytes / 1024 / 1024)} MB.`
      );
    }
    return buf;
  }
}
