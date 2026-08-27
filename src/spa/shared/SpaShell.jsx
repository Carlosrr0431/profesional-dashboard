'use client';

import { useEffect, useState } from 'react';

export function useKeyboardInset() {
  const [bottom, setBottom] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const viewport = window.visualViewport;
    if (!viewport) return undefined;

    const update = () => {
      const inset = Math.max(0, window.innerHeight - viewport.height - (viewport.offsetTop || 0));
      setBottom(inset);
    };

    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, []);

  return bottom;
}

export function SpaBootScreen({ children }) {
  return <div className="spa-boot">{children}</div>;
}

export function SpaAuthScreen({ children }) {
  return (
    <div className="spa-auth">
      <div className="spa-auth-inner">{children}</div>
    </div>
  );
}

export function SpaMapScreen({ map, header, banner, sheet, expanded = false }) {
  const keyboard = useKeyboardInset();
  return (
    <div
      className="spa-screen"
      style={keyboard > 0 ? { paddingBottom: keyboard } : undefined}
    >
      <div className="spa-map">{map}</div>
      <div className="spa-chrome">
        <div className="spa-top">
          {header}
          {banner}
        </div>
        <div className={expanded ? 'spa-bottom spa-bottom--expanded' : 'spa-bottom'}>
          {sheet}
        </div>
      </div>
    </div>
  );
}
