/**
 * The mark of a change: eight hex digits that say which change a review read. It is the start of
 * SHA-256 over the change's file as parsed, written as JSON with the keys of every mapping sorted,
 * so that a new layout of the file moves nothing, and a changed value, an added record or a line
 * of `given` does. `status` and `why` are left out: deciding a change does not move its mark. The
 * page bundles this folder, so SHA-256 is written here in plain TypeScript, with no module of Node.
 */

/** The keys of a change that its mark leaves out: the decision, and the reason for a no. */
const DECISION_KEYS: readonly string[] = ['status', 'why'];

/** The first 32 bits of the fractional parts of the cube roots of the first 64 primes, as SHA-256 has them. */
const ROUND = Uint32Array.of(
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
);

/** The first 32 bits of the fractional parts of the square roots of the first eight primes: where SHA-256 starts. */
const START = Uint32Array.of(0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19);

/** A word of 32 bits turned right by `by` bits. */
const turn = (word: number, by: number): number => (word >>> by) | (word << (32 - by));

/** A text as the bytes of UTF-8. A lone half of a surrogate pair is written as U+FFFD, as the web's encoder writes it. */
function utf8(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const char of text) {
    let code = char.codePointAt(0) as number;
    if (code >= 0xd800 && code <= 0xdfff) code = 0xfffd;
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    else bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
  }
  return Uint8Array.from(bytes);
}

/** SHA-256 of a text's UTF-8 bytes, as 64 hex digits in lowercase. */
export function sha256(text: string): string {
  const bytes = utf8(text);
  // The message, a single 1 bit, zeros, and its length in bits as 64 bits, to a whole number of blocks of 64 bytes.
  const padded = new Uint8Array(Math.ceil((bytes.length + 9) / 64) * 64);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bits = bytes.length * 8;
  view.setUint32(padded.length - 8, Math.floor(bits / 0x100000000));
  view.setUint32(padded.length - 4, bits >>> 0);
  const hash = START.slice();
  const words = new Uint32Array(64);
  for (let block = 0; block < padded.length; block += 64) {
    for (let i = 0; i < 16; i++) words[i] = view.getUint32(block + i * 4);
    for (let i = 16; i < 64; i++) {
      const early = words[i - 15] as number;
      const late = words[i - 2] as number;
      const low = turn(early, 7) ^ turn(early, 18) ^ (early >>> 3);
      const high = turn(late, 17) ^ turn(late, 19) ^ (late >>> 10);
      words[i] = (words[i - 16] as number) + low + (words[i - 7] as number) + high;
    }
    let [a, b, c, d, e, f, g, h] = hash as unknown as [number, number, number, number, number, number, number, number];
    for (let i = 0; i < 64; i++) {
      const chosen = (e & f) ^ (~e & g);
      const first = (h + (turn(e, 6) ^ turn(e, 11) ^ turn(e, 25)) + chosen + (ROUND[i] as number) + (words[i] as number)) >>> 0;
      const most = (a & b) ^ (a & c) ^ (b & c);
      const second = ((turn(a, 2) ^ turn(a, 13) ^ turn(a, 22)) + most) >>> 0;
      [h, g, f, e, d, c, b, a] = [g, f, e, (d + first) >>> 0, c, b, a, (first + second) >>> 0];
    }
    // A Uint32Array keeps each sum to its 32 bits.
    [a, b, c, d, e, f, g, h].forEach((word, index) => (hash[index] = (hash[index] as number) + word));
  }
  return [...hash].map((word) => word.toString(16).padStart(8, '0')).join('');
}

/** A value as JSON with the keys of every mapping in order, so that two values are one text whatever the order of their keys. */
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) =>
    inner !== null && typeof inner === 'object' && !Array.isArray(inner) ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : inner,
  );
}

/**
 * The mark of a change, from its file as parsed: the first eight hex digits of SHA-256 over it as
 * JSON with its keys sorted, without `status` and `why`.
 */
export function changeMark(change: Readonly<Record<string, unknown>>): string {
  const kept = Object.fromEntries(Object.entries(change).filter(([key]) => !DECISION_KEYS.includes(key)));
  return sha256(canonical(kept)).slice(0, 8);
}
