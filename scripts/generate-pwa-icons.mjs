import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const SVG = path.join(ROOT, 'app', 'icon.svg');
const OUT = path.join(ROOT, 'public', 'pwa');
const NAVY = { r: 40, g: 46, b: 105, alpha: 1 };

async function pngIcon(size, { padded = false } = {}) {
  const inner = padded ? Math.round(size * 0.72) : size;
  const logo = await sharp(SVG)
    .resize(inner, inner, { fit: 'contain', background: NAVY })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: NAVY,
    },
  })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toBuffer();
}

async function generate() {
  await fs.mkdir(OUT, { recursive: true });
  await fs.writeFile(path.join(OUT, 'icon-192.png'), await pngIcon(192));
  await fs.writeFile(path.join(OUT, 'icon-512.png'), await pngIcon(512));
  await fs.writeFile(path.join(OUT, 'maskable-512.png'), await pngIcon(512, { padded: true }));
  await fs.writeFile(path.join(OUT, 'apple-touch-180.png'), await pngIcon(180));
  console.log('Iconos PWA en public/pwa/');
}

await generate();
