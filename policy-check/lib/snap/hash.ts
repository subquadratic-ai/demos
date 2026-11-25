/** Small, stable string hashing. Deterministic across runs; nothing security-related. */

export function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function hashHex(input: string): string {
  return fnv1a(input).toString(16).padStart(8, "0");
}
