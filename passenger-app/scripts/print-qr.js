/**
 * Imprime el QR de dev client en la terminal (passenger-app, puerto 8082).
 */
const { spawnSync } = require('child_process');
const os = require('os');

const PORT = process.env.RCT_METRO_PORT || '8082';

function getLanIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

const ip = getLanIp();
const metroUrl = `http://${ip}:${PORT}`;
const devClientUrl =
  `exp+pasajero-app://expo-development-client/?url=${encodeURIComponent(metroUrl)}`;

console.log('');
console.log('=== PASSENGER-APP (puerto ' + PORT + ') ===');
console.log('Metro:', metroUrl);
console.log('URL:', devClientUrl);
console.log('');
console.log('Escaneá con la app Profesional Pasajero (misma Wi‑Fi que esta PC).');
console.log('Choferes usa puerto 8081 — no choca.');
console.log('');

const result = spawnSync('npx', ['--yes', 'qrcode-terminal', devClientUrl], {
  stdio: 'inherit',
  shell: true,
});

process.exit(result.status ?? 1);
