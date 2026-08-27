'use client';

import { useEffect, useState } from 'react';
import {
  consumeInstallPrompt,
  isIosSafari,
  isStandaloneDisplay,
  subscribeInstallPrompt,
} from './pwa';
import { SpaButton } from './ui';

export default function InstallAppButton({ label = 'Instalar app' }) {
  const [canInstall, setCanInstall] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    setInstalled(isStandaloneDisplay());
    setIos(isIosSafari());
    return subscribeInstallPrompt((event) => setCanInstall(Boolean(event)));
  }, []);

  if (installed) return null;

  if (ios) {
    return (
      <p className="spa-install-hint">
        En iPhone: tocá <strong>Compartir</strong> y después <strong>Agregar a pantalla de inicio</strong>.
      </p>
    );
  }

  if (canInstall) {
    return (
      <SpaButton
        variant="accent"
        onClick={async () => {
          const event = consumeInstallPrompt();
          if (!event) return;
          event.prompt();
          await event.userChoice.catch(() => {});
        }}
      >
        {label}
      </SpaButton>
    );
  }

  return (
    <p className="spa-install-hint">
      En Chrome: menú ⋮ → <strong>Instalar app</strong>
    </p>
  );
}
