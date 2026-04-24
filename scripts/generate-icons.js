const fs = require('node:fs/promises')
const path = require('node:path')
const sharp = require('sharp')
const pngToIco = require('png-to-ico')

const SVG = path.join(__dirname, '..', 'public', 'favicon.svg')
const OUT_ICONS = path.join(__dirname, '..', 'public', 'icons')
const OUT_PUBLIC = path.join(__dirname, '..', 'public')
const BG = { r: 59, g: 130, b: 246, alpha: 1 } // #3b82f6 — matches manifest theme_color

async function renderPng(size, glyphFraction) {
  const inner = Math.max(1, Math.round(size * glyphFraction))
  const glyph = await sharp(SVG)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
  return sharp({
    create: { width: size, height: size, channels: 4, background: BG },
  })
    .composite([{ input: glyph, gravity: 'center' }])
    .png()
    .toBuffer()
}

async function main() {
  await fs.mkdir(OUT_ICONS, { recursive: true })

  const icon192 = await renderPng(192, 0.64)
  const icon512 = await renderPng(512, 0.64)
  const apple = await renderPng(180, 0.64)
  await fs.writeFile(path.join(OUT_ICONS, 'icon-192.png'), icon192)
  await fs.writeFile(path.join(OUT_ICONS, 'icon-512.png'), icon512)
  await fs.writeFile(path.join(OUT_ICONS, 'apple-touch-icon.png'), apple)

  const ico16 = await renderPng(16, 0.8)
  const ico32 = await renderPng(32, 0.72)
  const ico48 = await renderPng(48, 0.68)
  const ico = await pngToIco([ico16, ico32, ico48])
  await fs.writeFile(path.join(OUT_PUBLIC, 'favicon.ico'), ico)

  console.log('Icons written:')
  console.log('  public/icons/icon-192.png')
  console.log('  public/icons/icon-512.png')
  console.log('  public/icons/apple-touch-icon.png')
  console.log('  public/favicon.ico')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
