'use client';

import { useEffect, useRef, useState } from 'react';

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

export function SpaBootScreen({ children, subtitle = 'Salta Capital' }) {
  return (
    <div className="spa-boot" role="status" aria-live="polite" aria-busy="true">
      <div className="spa-boot-glow" aria-hidden="true" />
      <div className="spa-boot-glow spa-boot-glow--accent" aria-hidden="true" />
      <div className="spa-boot-core">
        <div className="spa-boot-orb">
          <span className="spa-boot-ring" aria-hidden="true" />
          <span className="spa-boot-mark">P</span>
        </div>
        <p className="spa-boot-brand" translate="no">Profesional</p>
        <div className="spa-boot-track" aria-hidden="true">
          <span className="spa-boot-bar" />
        </div>
        <p className="spa-boot-msg">{children}</p>
        {subtitle ? <p className="spa-boot-sub">{subtitle}</p> : null}
      </div>
    </div>
  );
}

export function SpaAuthScreen({ children }) {
  return (
    <div className="spa-auth">
      <div className="spa-auth-glow" aria-hidden="true" />
      <div className="spa-auth-inner">{children}</div>
    </div>
  );
}

export function SpaMapScreen({
  map,
  header,
  banner,
  sheet,
  expanded = false,
  overlay = null,
  onChromeInsets,
  layoutKey = '',
}) {
  const keyboard = useKeyboardInset();
  const topRef = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (typeof onChromeInsets !== 'function') return undefined;

    const measure = () => {
      const top = Math.round(topRef.current?.getBoundingClientRect().height || 0);
      const bottom = Math.round(bottomRef.current?.getBoundingClientRect().height || 0);
      onChromeInsets({ top, bottom });
    };

    measure();
    const frame = requestAnimationFrame(measure);
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    if (observer && topRef.current) observer.observe(topRef.current);
    if (observer && bottomRef.current) observer.observe(bottomRef.current);
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
    };
  }, [onChromeInsets, expanded, layoutKey, keyboard]);

  return (
    <div
      className={keyboard > 48 ? 'spa-screen spa-screen--keyboard' : 'spa-screen'}
      style={keyboard > 0 ? { paddingBottom: keyboard } : undefined}
    >
      <div className="spa-map">{map}</div>
      <div className="spa-chrome">
        {header || banner ? (
          <div className="spa-top" ref={topRef}>
            {header}
            {banner}
          </div>
        ) : (
          <div ref={topRef} />
        )}
        <div ref={bottomRef} className={expanded ? 'spa-bottom spa-bottom--expanded' : 'spa-bottom'}>
          {sheet}
        </div>
      </div>
      {overlay}
    </div>
  );
}
