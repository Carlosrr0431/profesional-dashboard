'use client';

import { useEffect, useRef, useState } from 'react';
import { fetchAutocomplete, suggestionLabel, suggestionSub } from './geo';
import { spaFieldClass } from './ui';

export default function AddressSearch({
  label,
  placeholder,
  value,
  onChangeText,
  onSelect,
  sessionToken,
  disabled = false,
  onOpenChange,
}) {
  const [hits, setHits] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef(null);
  const wrapRef = useRef(null);

  const visible = open && hits.length > 0;

  useEffect(() => {
    onOpenChange?.(visible);
  }, [visible, onOpenChange]);

  useEffect(() => {
    const onDoc = (event) => {
      if (!wrapRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    const query = String(value || '').trim();
    if (timerRef.current) clearTimeout(timerRef.current);
    if (query.length < 2) {
      setHits([]);
      setOpen(false);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    timerRef.current = setTimeout(async () => {
      const results = await fetchAutocomplete(query, sessionToken);
      setHits(results);
      setOpen(results.length > 0);
      setLoading(false);
    }, 240);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, sessionToken]);

  return (
    <div ref={wrapRef} className="relative">
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
        {label}
      </label>
      <div className="relative">
        <input
          type="text"
          autoComplete="off"
          disabled={disabled}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChangeText(event.target.value)}
          onFocus={() => hits.length > 0 && setOpen(true)}
          className={spaFieldClass}
        />
        {loading ? (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">
            Buscando…
          </span>
        ) : null}
      </div>
      {visible ? (
        <ul className="mt-2 max-h-[min(46vh,360px)] overflow-y-auto overscroll-contain rounded-2xl bg-light-100 p-1">
          {hits.map((hit, index) => {
            const sub = suggestionSub(hit);
            const title = suggestionLabel(hit);
            return (
              <li key={`${hit.placeId || title || 'h'}-${index}`}>
                <button
                  type="button"
                  className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-white"
                  onClick={() => {
                    onSelect(hit);
                    setOpen(false);
                    setHits([]);
                  }}
                >
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-navy-900 ring-1 ring-light-300">
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
                      <path d="M12 21s7-6.2 7-11.2A7 7 0 1 0 5 9.8C5 14.8 12 21 12 21Z" stroke="currentColor" strokeWidth="1.8" />
                      <circle cx="12" cy="9.8" r="2.2" fill="currentColor" />
                    </svg>
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-navy-900">{title}</span>
                    {sub && sub !== title ? (
                      <span className="mt-0.5 block text-[12px] leading-snug text-slate-500">{sub}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
