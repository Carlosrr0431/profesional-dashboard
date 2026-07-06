import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.join(process.cwd(), 'app');
const ICON_SVG = path.join(ROOT, 'icon.svg');

async function generate() {
  await sharp(ICON_SVG)
    .resize(180, 180, { fit: 'contain', background: '#ffffff' })
    .png()
    .toFile(path.join(ROOT, 'apple-icon.png'));

  await sharp(ICON_SVG)
    .resize(32, 32, { fit: 'contain', background: '#ffffff' })
    .png()
    .toFile(path.join(ROOT, 'icon.png'));

  console.log('Favicons generados: app/icon.png, app/apple-icon.png');
}

await generate();
