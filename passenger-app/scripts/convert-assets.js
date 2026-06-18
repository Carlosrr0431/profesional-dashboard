/**
 * Genera splash con fondo blanco, isotipo centrado y "Profesional" abajo.
 * Usa las dependencias de driver-app para no duplicar sharp/resvg.
 */
const { Resvg } = require('../../driver-app/node_modules/@resvg/resvg-js');
const sharp = require('../../driver-app/node_modules/sharp');
const fs = require('fs');
const path = require('path');

const assetsDir = path.join(__dirname, '..', 'assets');
const resDir = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');
const WHITE_BG = { r: 255, g: 255, b: 255, alpha: 1 };

function renderSvg(svgPath, width) {
  const svgData = fs.readFileSync(svgPath, 'utf8');
  const resvg = new Resvg(svgData, {
    fitTo: { mode: 'width', value: width },
    font: { loadSystemFonts: true },
  });
  const rendered = resvg.render();
  return { buffer: rendered.asPng(), width: rendered.width, height: rendered.height };
}

function footerLabelSvg(width, height) {
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <text
    x="${width / 2}"
    y="${height - 180}"
    text-anchor="middle"
    font-family="Arial, Helvetica, sans-serif"
    font-size="42"
    font-weight="400"
    fill="#8E8E93"
    letter-spacing="6"
  >PROFESIONAL</text>
</svg>`);
}

async function convertAssets() {
  const fullLogoSvg = path.join(assetsDir, 'Profesional app-02.svg');
  const isotipoSvg = path.join(assetsDir, 'isotipo profesional-04.svg');

  // 1. splash.png — isotipo centrado, fondo blanco, marca abajo
  const splashW = 1284;
  const splashH = 2778;
  const isotipoSplash = renderSvg(isotipoSvg, 420);

  await sharp({
    create: { width: splashW, height: splashH, channels: 4, background: WHITE_BG },
  })
    .composite([
      {
        input: isotipoSplash.buffer,
        left: Math.round((splashW - isotipoSplash.width) / 2),
        top: Math.round((splashH - isotipoSplash.height) / 2) - 40,
      },
      { input: footerLabelSvg(splashW, splashH), left: 0, top: 0 },
    ])
    .png()
    .toFile(path.join(assetsDir, 'splash.png'));
  console.log('splash.png OK');

  // 2. logo.png — wordmark a color para otras pantallas
  const logoForLoading = renderSvg(fullLogoSvg, 550);
  fs.writeFileSync(path.join(assetsDir, 'logo.png'), logoForLoading.buffer);
  console.log('logo.png OK');

  // 3. icon.png — isotipo sobre fondo blanco
  const iconSize = 1024;
  const isotipo = renderSvg(isotipoSvg, 600);
  await sharp({
    create: { width: iconSize, height: iconSize, channels: 4, background: WHITE_BG },
  })
    .composite([{
      input: isotipo.buffer,
      left: Math.round((iconSize - isotipo.width) / 2),
      top: Math.round((iconSize - isotipo.height) / 2),
    }])
    .png()
    .toFile(path.join(assetsDir, 'icon.png'));
  console.log('icon.png OK');

  // 4. adaptive-icon.png — isotipo transparente (capa foreground)
  const adaptiveSize = 1024;
  const isotipoAdaptive = renderSvg(isotipoSvg, 500);
  await sharp({
    create: { width: adaptiveSize, height: adaptiveSize, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{
      input: isotipoAdaptive.buffer,
      left: Math.round((adaptiveSize - isotipoAdaptive.width) / 2),
      top: Math.round((adaptiveSize - isotipoAdaptive.height) / 2),
    }])
    .png()
    .toFile(path.join(assetsDir, 'adaptive-icon.png'));
  console.log('adaptive-icon.png OK');

  // 5. Android splashscreen_logo — isotipo centrado sobre blanco
  const splashSizes = { mdpi: 288, hdpi: 432, xhdpi: 576, xxhdpi: 864, xxxhdpi: 1152 };
  for (const [density, size] of Object.entries(splashSizes)) {
    const isotipoNative = renderSvg(isotipoSvg, Math.round(size * 0.46));
    const dir = path.join(resDir, `drawable-${density}`);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const top = Math.round((size - isotipoNative.height) / 2) + Math.round(size * 0.02);
    await sharp({
      create: { width: size, height: size, channels: 4, background: WHITE_BG },
    })
      .composite([{
        input: isotipoNative.buffer,
        left: Math.round((size - isotipoNative.width) / 2),
        top,
      }])
      .png()
      .toFile(path.join(dir, 'splashscreen_logo.png'));
    console.log(`splashscreen_logo ${density} OK`);
  }

  // 6. Iconos del launcher Android (mipmap)
  const { setIconAsync } = require('@expo/prebuild-config/build/plugins/icons/withAndroidIcons');
  const projectRoot = path.join(__dirname, '..');
  await setIconAsync(projectRoot, {
    icon: path.join(assetsDir, 'adaptive-icon.png'),
    backgroundColor: '#FFFFFF',
    backgroundImage: undefined,
    monochromeImage: undefined,
    isAdaptive: true,
  });
  console.log('ic_launcher mipmap OK');
}

convertAssets().catch((err) => {
  console.error(err);
  process.exit(1);
});
