// Regenerates the PWA icons in public/icons/ — run `node scripts/make-icons.mjs`.
// Zero-dependency PNG writer: draws the HomeBoard house glyph (white on the
// crimson accent) with 3x supersampling, then encodes RGBA → PNG via zlib.
import { deflateSync } from 'zlib'
import { mkdirSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const ACCENT = [0xc3, 0x3c, 0x54]
const WHITE = [0xff, 0xff, 0xff]

// ---- PNG encoding ----
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8   // bit depth
  ihdr[9] = 6   // color type RGBA
  // filter byte 0 at the start of each scanline
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---- glyph geometry (unit square) ----
const inTriangle = (px, py, [ax, ay], [bx, by], [cx, cy]) => {
  const s1 = (bx - ax) * (py - ay) - (by - ay) * (px - ax)
  const s2 = (cx - bx) * (py - by) - (cy - by) * (px - bx)
  const s3 = (ax - cx) * (py - cy) - (ay - cy) * (px - cx)
  return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0)
}
const inRect = (px, py, x0, y0, x1, y1) => px >= x0 && px <= x1 && py >= y0 && py <= y1

/** Color of one unit-square point: rounded-rect bg + white house + door cutout. */
function sample(u, v, cornerR, glyphScale) {
  // rounded-square hit test (transparent outside)
  const r = cornerR
  const dx = Math.max(r - u, u - (1 - r), 0)
  const dy = Math.max(r - v, v - (1 - r), 0)
  if (dx * dx + dy * dy > r * r) return null

  // house glyph, scaled about the icon centre
  const g = (c) => 0.5 + (c - 0.5) / glyphScale
  const roof = inTriangle(u, v, [g(0.5), g(0.155)], [g(0.13), g(0.52)], [g(0.87), g(0.52)])
  const body = inRect(u, v, g(0.225), g(0.50), g(0.775), g(0.83))
  const door = inRect(u, v, g(0.435), g(0.615), g(0.565), g(0.83))
  if ((roof || body) && !door) return WHITE
  return ACCENT
}

function render(size, { cornerR = 0.21, glyphScale = 1 } = {}) {
  const SS = 3 // supersampling factor
  const rgba = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let rs = 0, gs = 0, bs = 0, as = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = sample((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size, cornerR, glyphScale)
          if (c) { rs += c[0]; gs += c[1]; bs += c[2]; as += 255 }
        }
      }
      const n = SS * SS
      const i = (y * size + x) * 4
      const a = as / n
      // premultiplied average, un-premultiplied for PNG straight alpha
      rgba[i] = a ? Math.round(rs / n / (a / 255)) : 0
      rgba[i + 1] = a ? Math.round(gs / n / (a / 255)) : 0
      rgba[i + 2] = a ? Math.round(bs / n / (a / 255)) : 0
      rgba[i + 3] = Math.round(a)
    }
  }
  return encodePng(size, rgba)
}

const out = join(dirname(fileURLToPath(import.meta.url)), '../public/icons')
mkdirSync(out, { recursive: true })
writeFileSync(join(out, 'icon-192.png'), render(192))
writeFileSync(join(out, 'icon-512.png'), render(512))
// maskable: full-bleed square, smaller glyph so it survives the 80% safe zone
writeFileSync(join(out, 'maskable-512.png'), render(512, { cornerR: 0.0001, glyphScale: 0.72 }))
// iOS rounds corners itself → full bleed
writeFileSync(join(out, 'apple-touch-icon.png'), render(180, { cornerR: 0.0001, glyphScale: 0.9 }))
console.log(`icons written to ${out}`)
