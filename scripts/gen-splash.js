/**
 * Genera splash.png para driver-app y passenger-app.
 * Fondo blanco, logo azul centrado, bien proporcioando.
 * Dimensiones: 1242×2688 (iPhone 14 Pro Max — Expo lo escala)
 */
const sharp = require('../passenger-app/node_modules/sharp');
const path = require('path');
const fs = require('fs');

const SPLASH_W = 1242;
const SPLASH_H = 2688;
const LOGO_W = 600; // logo ocupa ~48% del ancho — proporcioado como driver-app

async function gen(logoSrc, outPath) {
  const logo = await sharp(logoSrc)
    .resize(LOGO_W, null, { fit: 'inside', withoutEnlargement: false })
    .toBuffer();

  const logoMeta = await sharp(logo).metadata();
  const logoH = logoMeta.height;

  const left = Math.round((SPLASH_W - LOGO_W) / 2);
  const top  = Math.round((SPLASH_H - logoH) / 2);

  await sharp({
    create: {
      width: SPLASH_W,
      height: SPLASH_H,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([{ input: logo, left, top }])
    .png({ compressionLevel: 9 })
    .toFile(outPath);

  const sizeKB = Math.round(fs.statSync(outPath).size / 1024);
  console.log(`✅  ${outPath}  (${sizeKB} KB)`);
}

(async () => {
  const root = path.join(__dirname, '..');
  const logoSrc = path.join(root, 'passenger-app', 'assets', 'logo.png');

  await gen(logoSrc, path.join(root, 'passenger-app', 'assets', 'splash.png'));
  await gen(logoSrc, path.join(root, 'driver-app',    'assets', 'splash.png'));
  console.log('Listo — ambas apps usan el nuevo splash.');
})();
