const fs = require('fs');
const path = require('path');

function readManifest(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '../../public', name), 'utf8'));
}

describe('PWA manifests', () => {
  it.each([
    ['pasajero.webmanifest', '/pasajero', 'Profesional Pasajero'],
    ['conductor.webmanifest', '/conductor', 'Profesional Conductor'],
  ])('%s es instalable (display standalone, íconos 192 y 512)', (file, startUrl, name) => {
    const manifest = readManifest(file);
    expect(manifest.name).toBe(name);
    expect(manifest.start_url).toBe(startUrl);
    expect(manifest.scope).toBe(startUrl);
    expect(manifest.display).toBe('standalone');
    expect(manifest.prefer_related_applications).toBe(false);

    const sizes = manifest.icons.map((icon) => icon.sizes);
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(manifest.icons.every((icon) => icon.type === 'image/png')).toBe(true);
  });
});

describe('SPA shell CSS', () => {
  it('usa layout a pantalla completa sin offsets fijos', () => {
    const css = fs.readFileSync(path.join(__dirname, '../../app/globals.css'), 'utf8');
    expect(css).toContain('.spa-screen');
    expect(css).toContain('.spa-auth');
    expect(css).toContain('.spa-poi-list');
    expect(css).toContain('100dvh');
    expect(css).toContain('env(safe-area-inset-top');
    expect(css).toContain('font-size: 16px');
  });
});
