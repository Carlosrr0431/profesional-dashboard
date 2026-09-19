'use client';

/**
 * Recuadro de notas en el sheet del chofer.
 * El overlay centrado solo se abre al tocar el recuadro.
 * Un cambio en tiempo real resalta y vibra, sin tapar la pantalla.
 */
import { useEffect, useRef, useState } from 'react';
import { haptic } from './ui';

const HIGHLIGHT_MS = 10000;

export default function SpaTripNotes({ notes, tripId = null }) {
  const text = String(notes || '').trim();
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(false);
  const prevRef = useRef({ tripId: undefined, text: undefined });

  useEffect(() => {
    const prev = prevRef.current;
    if (prev.tripId !== tripId) {
      prevRef.current = { tripId, text };
      setHighlighted(false);
      setOpen(false);
      return undefined;
    }
    if (prev.text === text) return undefined;
    prevRef.current = { tripId, text };

    if (!text) {
      setHighlighted(false);
      setOpen(false);
      return undefined;
    }

    setHighlighted(true);
    haptic(40);
    const timer = setTimeout(() => setHighlighted(false), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [tripId, text]);

  if (!text) return null;

  return (
    <>
      <button
        type="button"
        className={`spa-trip-notes${highlighted ? ' is-updated' : ''}`}
        onClick={() => setOpen(true)}
      >
        <span className="spa-trip-notes-kicker">
          {highlighted ? 'Notas actualizadas' : 'Notas'}
        </span>
        <span className="spa-trip-notes-text">{text}</span>
        <span className="spa-trip-notes-hint">Tocá para agrandar</span>
      </button>
      {open ? (
        <div
          className="spa-trip-notes-overlay"
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <div
            className="spa-trip-notes-dialog"
            role="dialog"
            aria-label={highlighted ? 'Notas actualizadas' : 'Notas del viaje'}
            onClick={(event) => event.stopPropagation()}
          >
            <p className="spa-trip-notes-kicker">
              {highlighted ? 'Notas actualizadas' : 'Notas del viaje'}
            </p>
            <p className="spa-trip-notes-large">{text}</p>
            <p className="spa-trip-notes-hint">Tocá afuera para salir</p>
          </div>
        </div>
      ) : null}
    </>
  );
}
