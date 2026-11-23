// Generates build/icon.png (512×512) — the app/installer icon — with no
// external dependencies: draws the logo into an RGBA buffer and encodes a PNG.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const SIZE = 512
const SS = 4 // supersampling per axis for anti-aliasing
const px = new Uint8Array(SIZE * SIZE * 4)

const lerp = (a, b, t) => a + (b - a) * t
const from = [0x9b, 0x8c, 0xff]
const to = [0x5b, 0x47, 0xf5]

// Shapes in a 64-unit coordinate space (same as the SVG logo).
function insideRoundRect(x, y, x0, y0, w, h, r) {
  const cx = Math.min(Math.max(x, x0 + r), x0 + w - r)
  const cy = Math.min(Math.max(y, y0 + r), y0 + h - r)
  return x >= x0 && x <= x0 + w && y >= y0 && y <= y0 + h && (x - cx) ** 2 + (y - cy) ** 2 <= r * r
}
function white(x, y) {
  // Monitor outline: rounded rect stroke 4 wide around (13,17,38,25,r4)
  const outer = insideRoundRect(x, y, 11, 15, 42, 29, 6)
  const inner = insideRoundRect(x, y, 15, 19, 34, 21, 2)
  if (outer && !inner) return true
  // Stand: line from (24,49) to (40,49), width 4, round caps
  const sx = Math.min(Math.max(x, 24), 40)
  if ((x - sx) ** 2 + (y - 49) ** 2 <= 4) return true
  // Play triangle (28,25) (37,29.5) (28,34)
  if (x >= 28 && x <= 37) {
    const half = 4.5 * (1 - (x - 28) / 9)
    if (Math.abs(y - 29.5) <= half) return true
  }
  return false
}

for (let py = 0; py < SIZE; py++) {
  for (let pxl = 0; pxl < SIZE; pxl++) {
    let r = 0,
      g = 0,
      b = 0,
      a = 0
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const x = ((pxl + (sx + 0.5) / SS) / SIZE) * 64
        const y = ((py + (sy + 0.5) / SS) / SIZE) * 64
        if (!insideRoundRect(x, y, 0, 0, 64, 64, 16)) continue
        const t = (x + y) / 128
        const c = white(x, y) ? [255, 255, 255] : from.map((v, i) => lerp(v, to[i], t))
        r += c[0]
        g += c[1]
        b += c[2]
        a += 255
      }
    }
    const n = SS * SS
    const i = (py * SIZE + pxl) * 4
    const cover = a / n
    px[i] = cover ? (r / n) * (255 / cover) : 0
    px[i + 1] = cover ? (g / n) * (255 / cover) : 0
    px[i + 2] = cover ? (b / n) * (255 / cover) : 0
    px[i + 3] = cover
  }
}

function crc32(buf) {
  let c,
    crc = 0xffffffff
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crc = (crc >>> 8) ^ c
  }
  return (crc ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE)
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0
  Buffer.from(px.buffer, y * SIZE * 4, SIZE * 4).copy(raw, y * (SIZE * 4 + 1) + 1)
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
for (const out of ['build/icon.png', 'resources/icon.png']) {
  const file = resolve(root, out)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, png)
  console.log('wrote', out)
}
