/**
 * Just what main/ needs from node:crypto: sync sha1/sha256 hex digests (cache file names, term-image
 * folders) in plain JS, since SubtleCrypto is async, plus random ids.
 */

const rotl = (value: number, bits: number) => (value << bits) | (value >>> (32 - bits));
const rotr = (value: number, bits: number) => (value >>> bits) | (value << (32 - bits));

const padMessage = (message: Uint8Array): Uint8Array => {
  const bitLength = message.length * 8;
  const paddedLength = ((message.length + 9 + 63) >> 6) << 6;
  const padded = new Uint8Array(paddedLength);
  padded.set(message);
  padded[message.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(paddedLength - 4, bitLength >>> 0);
  return padded;
};

const sha1 = (message: Uint8Array): Uint8Array => {
  const view = new DataView(padMessage(message).buffer);
  const state = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
  const w = new Array<number>(80);
  for (let offset = 0; offset < view.byteLength; offset += 64) {
    for (let t = 0; t < 16; t++) w[t] = view.getUint32(offset + t * 4);
    for (let t = 16; t < 80; t++) w[t] = rotl(w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16], 1);
    let [a, b, c, d, e] = state;
    for (let t = 0; t < 80; t++) {
      let f: number;
      let k: number;
      if (t < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
      else if (t < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
      else if (t < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
      else { f = b ^ c ^ d; k = 0xca62c1d6; }
      const temp = (rotl(a, 5) + f + e + k + w[t]) | 0;
      e = d; d = c; c = rotl(b, 30); b = a; a = temp;
    }
    state[0] = (state[0] + a) | 0; state[1] = (state[1] + b) | 0; state[2] = (state[2] + c) | 0;
    state[3] = (state[3] + d) | 0; state[4] = (state[4] + e) | 0;
  }
  const out = new DataView(new ArrayBuffer(20));
  state.forEach((word, index) => out.setUint32(index * 4, word >>> 0));
  return new Uint8Array(out.buffer);
};

const K256 = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

const sha256 = (message: Uint8Array): Uint8Array => {
  const view = new DataView(padMessage(message).buffer);
  const state = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const w = new Array<number>(64);
  for (let offset = 0; offset < view.byteLength; offset += 64) {
    for (let t = 0; t < 16; t++) w[t] = view.getUint32(offset + t * 4);
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = state;
    for (let t = 0; t < 64; t++) {
      const sum1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temp1 = (h + sum1 + choose + K256[t] + w[t]) | 0;
      const sum0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sum0 + majority) | 0;
      h = g; g = f; f = e; e = (d + temp1) | 0; d = c; c = b; b = a; a = (temp1 + temp2) | 0;
    }
    [a, b, c, d, e, f, g, h].forEach((value, index) => { state[index] = (state[index] + value) | 0; });
  }
  const out = new DataView(new ArrayBuffer(32));
  state.forEach((word, index) => out.setUint32(index * 4, word >>> 0));
  return new Uint8Array(out.buffer);
};

const algorithms: Record<string, (message: Uint8Array) => Uint8Array> = {sha1, sha256};

class Hash {
  private readonly chunks: Uint8Array[] = [];

  constructor(private readonly algorithm: (message: Uint8Array) => Uint8Array) {}

  update(data: string | Uint8Array, encoding?: string) {
    this.chunks.push(typeof data === 'string' ? Buffer.from(data, (encoding ?? 'utf8') as BufferEncoding) : data);
    return this;
  }

  digest(encoding?: string): any {
    const total = this.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const message = new Uint8Array(total);
    let offset = 0;
    for (const chunk of this.chunks) {
      message.set(chunk, offset);
      offset += chunk.length;
    }
    const result = Buffer.from(this.algorithm(message));
    return encoding ? result.toString(encoding as BufferEncoding) : result;
  }
}

export const createHash = (algorithm: string) => {
  const implementation = algorithms[algorithm.toLowerCase()];
  if (!implementation) throw new Error(`crypto.createHash('${algorithm}') is not available in the Tauri backend worker`);
  return new Hash(implementation);
};

export const randomUUID = () => globalThis.crypto.randomUUID();

export const randomBytes = (size: number) => Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(size)));

export default {createHash, randomUUID, randomBytes};
