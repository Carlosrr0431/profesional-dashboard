/**
 * Genera WebP optimizados para la landing (menor peso, buena calidad visual).
 * Uso: node scripts/optimize-landing-images.mjs
 */
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.join(process.cwd(), 'public');
const OUT = path.join(ROOT, 'landing', 'optimized');

const PHONE_WIDTH = 780;
const BANNER_WIDTH = 1280;
const WEBP_QUALITY = 88;

const JOBS = [
  { input: '9.16_1-06.png', output: 'passenger-1.webp', maxWidth: PHONE_WIDTH },
  { input: '9.16_2-07.png', output: 'passenger-2.webp', maxWidth: PHONE_WIDTH },
  { input: '9.16_3-08.png', output: 'passenger-3.webp', maxWidth: PHONE_WIDTH },
  { input: '9.16_4-09.png', output: 'passenger-4.webp', maxWidth: PHONE_WIDTH },
  { input: 'portada 1024x500--05.png', output: 'passenger-banner.webp', maxWidth: BANNER_WIDTH },
  { input: 'login conductor-06.png', output: 'driver-1.webp', maxWidth: PHONE_WIDTH },
  { input: 'en linea conductor-07.png', output: 'driver-2.webp', maxWidth: PHONE_WIDTH },
  { input: 'navegacion guiada conductor-08.png', output: 'driver-3.webp', maxWidth: PHONE_WIDTH },
  { input: 'gestion de viajes conductor-09.png', output: 'driver-4.webp', maxWidth: PHONE_WIDTH },
  { input: 'portada conductor-05.png', output: 'driver-banner.webp', maxWidth: BANNER_WIDTH },
];

async function optimize({ input, output, maxWidth }) {
  const inputPath = path.join(ROOT, input);
  const outputPath = path.join(OUT, output);

  await sharp(inputPath)
    .rotate()
    .resize({ width: maxWidth, withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY, effort: 6, smartSubsample: true })
    .toFile(outputPath);

  const [{ size: before }, { size: after }] = await Promise.all([
    stat(inputPath),
    stat(outputPath),
  ]);

  const saved = Math.round((1 - after / before) * 100);
  console.log(`${output}: ${Math.round(before / 1024)}KB → ${Math.round(after / 1024)}KB (-${saved}%)`);
}

await mkdir(OUT, { recursive: true });

for (const job of JOBS) {
  await optimize(job);
}

console.log('Listo: public/landing/optimized/');
