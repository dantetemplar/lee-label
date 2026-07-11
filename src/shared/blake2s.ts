// BLAKE2s (RFC 7693) — adapted from blakejs (MIT), digest_size 1..32

function rotR32(x: number, y: number): number {
  return (x >>> y) ^ (x << (32 - y))
}

const BLAKE2S_IV = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
])

const SIGMA = new Uint8Array([
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11,
  7, 5, 3, 11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4, 7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5,
  10, 4, 0, 15, 8, 9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13, 2, 12, 6, 10, 0, 11, 8, 3, 4,
  13, 7, 5, 15, 14, 1, 9, 12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11, 13, 11, 7, 14, 12, 1, 3,
  9, 5, 0, 15, 4, 8, 6, 2, 10, 6, 15, 14, 9, 11, 3, 0, 8, 12, 2, 13, 7, 1, 4, 10, 5, 10, 2, 8, 4, 7, 6,
  1, 5, 15, 11, 9, 14, 3, 12, 13, 0
])

interface Blake2sContext {
  h: Uint32Array
  b: Uint8Array
  c: number
  t: number
  outlen: number
}

const v = new Uint32Array(16)
const m = new Uint32Array(16)

function get32(bytes: Uint8Array, index: number): number {
  return bytes[index] ^ (bytes[index + 1] << 8) ^ (bytes[index + 2] << 16) ^ (bytes[index + 3] << 24)
}

function g(a: number, b: number, c: number, d: number, x: number, y: number): void {
  v[a] = v[a] + v[b] + x
  v[d] = rotR32(v[d] ^ v[a], 16)
  v[c] = v[c] + v[d]
  v[b] = rotR32(v[b] ^ v[c], 12)
  v[a] = v[a] + v[b] + y
  v[d] = rotR32(v[d] ^ v[a], 8)
  v[c] = v[c] + v[d]
  v[b] = rotR32(v[b] ^ v[c], 7)
}

function compress(ctx: Blake2sContext, last: boolean): void {
  for (let i = 0; i < 8; i++) {
    v[i] = ctx.h[i]
    v[i + 8] = BLAKE2S_IV[i]
  }

  v[12] ^= ctx.t
  v[13] ^= Math.floor(ctx.t / 0x100000000)
  if (last) v[14] = ~v[14]

  for (let i = 0; i < 16; i++) m[i] = get32(ctx.b, i * 4)

  for (let i = 0; i < 10; i++) {
    const base = i * 16
    g(0, 4, 8, 12, m[SIGMA[base]], m[SIGMA[base + 1]])
    g(1, 5, 9, 13, m[SIGMA[base + 2]], m[SIGMA[base + 3]])
    g(2, 6, 10, 14, m[SIGMA[base + 4]], m[SIGMA[base + 5]])
    g(3, 7, 11, 15, m[SIGMA[base + 6]], m[SIGMA[base + 7]])
    g(0, 5, 10, 15, m[SIGMA[base + 8]], m[SIGMA[base + 9]])
    g(1, 6, 11, 12, m[SIGMA[base + 10]], m[SIGMA[base + 11]])
    g(2, 7, 8, 13, m[SIGMA[base + 12]], m[SIGMA[base + 13]])
    g(3, 4, 9, 14, m[SIGMA[base + 14]], m[SIGMA[base + 15]])
  }

  for (let i = 0; i < 8; i++) ctx.h[i] ^= v[i] ^ v[i + 8]
}

function init(outlen: number): Blake2sContext {
  const ctx: Blake2sContext = {
    h: new Uint32Array(BLAKE2S_IV),
    b: new Uint8Array(64),
    c: 0,
    t: 0,
    outlen
  }
  ctx.h[0] ^= 0x01010000 ^ outlen
  return ctx
}

function update(ctx: Blake2sContext, input: Uint8Array): void {
  for (let i = 0; i < input.length; i++) {
    if (ctx.c === 64) {
      ctx.t += ctx.c
      compress(ctx, false)
      ctx.c = 0
    }
    ctx.b[ctx.c++] = input[i]
  }
}

function finalize(ctx: Blake2sContext): Uint8Array {
  ctx.t += ctx.c
  while (ctx.c < 64) ctx.b[ctx.c++] = 0
  compress(ctx, true)

  const out = new Uint8Array(ctx.outlen)
  for (let i = 0; i < ctx.outlen; i++) {
    out[i] = (ctx.h[i >> 2] >>> (8 * (i & 3))) & 0xff
  }
  return out
}

function blake2s(input: Uint8Array, outlen: number): Uint8Array {
  const ctx = init(outlen)
  update(ctx, input)
  return finalize(ctx)
}

export function hashLabelName(normalizedName: string): number {
  const digest = blake2s(new TextEncoder().encode(normalizedName), 3)
  return (digest[0] << 16) | (digest[1] << 8) | digest[2]
}
