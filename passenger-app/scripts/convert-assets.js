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

/** Logo blanco con Arial Bold (misma tipografía que driver-app login). */
function buildLogoLightSvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 813.3 436.7" width="1626" height="874">
  <text fill="#FFFFFF" font-family="Arial,Helvetica,sans-serif" font-size="137.1" font-weight="700" transform="translate(1.2 417.7)">Profesional</text>
  <polygon fill="#FFFFFF" points="303.8 278.6 325 278.6 325 245.1 303.8 253 303.8 278.6"/>
  <polygon fill="#FFFFFF" points="333.9 278.6 355 278.6 355 233.9 333.9 241.8 333.9 278.6"/>
  <path fill="#FFFFFF" d="M482,54c-1.2-1.4-2.5-2.7-3.8-4-6.9-6.9-14.9-12.9-23.5-17.6-4.7-2.6-9.6-4.7-14.8-6.5-2.7-1-5.5-1.8-8.4-2.6-4.9-1.3-9.9-2.2-15.1-2.7s-6.9-.5-10.4-.5-3.5,0-5.3.1c-.7,0-1.3.1-2,.2-1.1,0-2.1.1-3.2.2-.9,0-1.9.2-2.8.4-.8,0-1.5.2-2.3.3-1.1.2-2.2.4-3.2.6-.6.1-1.2.2-1.8.3-1.2.2-2.4.5-3.6.8-.4.1-.9.2-1.4.3-1.3.3-2.6.7-3.9,1.1-.3,0-.6.2-.9.3-1.4.4-2.8.9-4.1,1.4-.2,0-.4.1-.6.2-1.4.5-2.8,1.1-4.2,1.7-.1,0-.3.1-.4.2-1.5.6-2.9,1.3-4.3,2,0,0-.1,0-.2,0-14.5,7-27.1,17.3-36.8,29.9h0c-.8,1-1.5,2-2.2,3-.1.2-.2.3-.4.5-.7,1-1.4,2-2,3-.1.2-.2.3-.3.5-2.7,4.2-5.1,8.6-7.2,13.2-.2.4-.3.8-.5,1.1-.4.9-.8,1.8-1.1,2.7-.2.5-.4,1-.6,1.6-.3.8-.6,1.7-.9,2.5-.2.6-.4,1.2-.6,1.9-.3.8-.5,1.6-.8,2.4-.2.8-.5,1.6-.7,2.4-.3,1-.5,2-.8,3-.3,1.1-.5,2.2-.8,3.3-.1.6-.2,1.2-.4,1.9-.2.9-.4,1.9-.5,2.8-.1.6-.2,1.3-.3,1.9-.1,1-.3,1.9-.4,2.9,0,.6-.1,1.2-.2,1.9-.1,1.1-.2,2.1-.2,3.2,0,.5,0,1.1-.1,1.6,0,1.6-.1,3.2-.1,4.9s0,2.9.1,4.4h-.1v97.7h0v19.1l21.1-7.9,8.9-3.3,21.1-7.9h51s0,0,0,0,0,0,0,0h4.3c1.6-.2,3.3-.3,4.9-.4,0,0,.1,0,.2,0,1.6-.1,3.1-.3,4.6-.5.1,0,.3,0,.4,0,1.5-.2,3-.5,4.4-.7.2,0,.4,0,.5,0,1.4-.3,2.8-.6,4.2-.9.2,0,.4,0,.7-.2,1.4-.3,2.7-.7,4-1.1.3,0,.5-.1.8-.2,1.3-.4,2.6-.8,3.9-1.2.3,0,.6-.2.8-.3,1.2-.4,2.5-.9,3.7-1.4.3-.1.6-.2.9-.4,1.2-.5,2.4-1,3.5-1.5.3-.1.7-.3,1-.4,1.1-.5,2.2-1.1,3.3-1.6.3-.2.7-.4,1-.5,1.1-.6,2.1-1.1,3.2-1.7.4-.2.7-.4,1.1-.6,1-.6,2-1.2,3-1.8.4-.2.8-.5,1.1-.7,1-.6,1.9-1.3,2.8-1.9.4-.3.8-.6,1.2-.8.9-.7,1.8-1.3,2.7-2,.4-.3.8-.6,1.2-.9.8-.7,1.7-1.4,2.5-2.1.4-.3.8-.7,1.2-1.1.8-.7,1.6-1.4,2.3-2.1.4-.4.8-.8,1.2-1.2.7-.7,1.5-1.4,2.2-2.2.4-.4.8-.9,1.2-1.3.7-.7,1.4-1.5,2-2.2.4-.5.8-.9,1.2-1.4.6-.7,1.3-1.5,1.9-2.3.4-.5.8-1,1.2-1.5.6-.8,1.2-1.5,1.7-2.3.4-.5.8-1.1,1.2-1.6.5-.8,1.1-1.5,1.6-2.3.4-.6.8-1.2,1.1-1.8.5-.8,1-1.5,1.4-2.3.4-.6.7-1.3,1.1-1.9.4-.8.9-1.5,1.3-2.3.4-.7.7-1.3,1-2,.4-.8.8-1.6,1.2-2.3.3-.7.6-1.4,1-2.1.3-.8.7-1.6,1-2.4.3-.7.6-1.5.9-2.2.3-.8.6-1.6.9-2.3.3-.8.5-1.6.8-2.4.3-.8.5-1.5.8-2.3.3-.8.5-1.6.7-2.5.2-.8.4-1.5.6-2.3.2-.9.4-1.7.6-2.6.2-.8.4-1.5.5-2.3.2-.9.3-1.8.5-2.7.1-.7.3-1.5.4-2.2.1-1,.3-2,.4-3,0-.7.2-1.4.3-2.1.1-1.1.2-2.2.3-3.4,0-.6.1-1.2.1-1.8,0-1.7.1-3.4.1-5.1,0,0,0,0,0-.1,0-26.2-9.9-50.1-26.1-68.2ZM333.9,194.5h0s0,0,0,0h0ZM406,173.2c-28.2,0-51-22.8-51-51s22.8-51,51-51,51,22.8,51,51-22.8,51-51,51Z"/>
</svg>`;
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

  // 2b. logo-light.png — wordmark blanco bold para login (fondo oscuro)
  await sharp(Buffer.from(buildLogoLightSvg()))
    .png()
    .toFile(path.join(assetsDir, 'logo-light.png'));
  console.log('logo-light.png OK');

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
