// Both inputs are hashed to a fixed-length SHA-256 digest before comparing,
// so the comparison loop iterates a constant number of bytes (32) regardless
// of input lengths. This prevents an attacker who controls one side from
// probing the other side's length by varying their candidate length and
// observing response-time differences.
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const [aDigest, bDigest] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ])
  const aBytes = new Uint8Array(aDigest)
  const bBytes = new Uint8Array(bDigest)
  let diff = 0
  for (let i = 0; i < aBytes.length; i++) {
    diff |= aBytes[i] ^ bBytes[i]
  }
  return diff === 0
}
