'use client';

import { useEffect, useRef, useState } from 'react';
import { fetchAutocomplete, suggestionLabel, suggestionSub } from './geo';

export default function AddressSearch({
  label,
  placeholder,
  value,
  onChangeText,
  onSelect,
  sessionToken,
  disabled = false,
}) {
  const [hits, setHits] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef(null);
  const wrapRef = useRef(null);

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
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    timerRef.current = setTimeout(async () => {
      const results = await fetchAutocomplete(query, sessionToken);
      setHits(results);
      setOpen(results.length > 0);
      setLoading(false);
    }, 280);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, sessionToken]);

  return (
    <div ref={wrapRef} className="relative">
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </label>
      <input
        type="text"
        autoComplete="off"
        disabled={disabled}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChangeText(event.target.value)}
        onFocus={() => hits.length > 0 && setOpen(true)}
        className="h-12 w-full rounded-2xl border border-light-300 bg-white px-4 text-sm text-navy-900 outline-none ring-accent/20 placeholder:text-slate-400 focus:border-accent focus:ring-4 disabled:bg-light-100"
      />
      {loading ? (
        <span className="absolute right-3 top-9 text-[11px] text-slate-400">Buscando…</span>
      ) : null}
      {open && hits.length > 0 ? (
        <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-2xl border border-light-300 bg-white py-1 shadow-xl">
          {hits.map((hit, index) => (
            <li key={`${hit.placeId || hit.title || 'h'}-${index}`}>
              <button
                type="button"
                className="flex w-full flex-col items-start px-4 py-2.5 text-left hover:bg-light-100"
                onClick={() => {
                  onSelect(hit);
                  setOpen(false);
                }}
              >
                <span className="text-sm font-semibold text-navy-900">{suggestionLabel(hit)}</span>
                {suggestionSub(hit) ? (
                  <span className="text-[12px] text-slate-500">{suggestionSub(hit)}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
