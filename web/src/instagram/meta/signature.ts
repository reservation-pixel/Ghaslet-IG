import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify Meta's `X-Hub-Signature-256` header against the raw request body.
 *
 * The raw bytes matter: re-serialising a parsed body produces a different
 * string and the HMAC will never match, which is why the webhook route reads
 * `request.text()` rather than `request.json()`.
 */
export function verifySignature(
  rawBody: string,
  header: string | null,
  appSecret: string
): boolean {
  if (!header) return false;

  const [algorithm, received] = header.split("=");
  if (algorithm !== "sha256" || !received) return false;

  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");

  const receivedBuf = Buffer.from(received, "hex");
  const expectedBuf = Buffer.from(expected, "hex");

  // timingSafeEqual throws on length mismatch, so check that first.
  if (receivedBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(receivedBuf, expectedBuf);
}
