'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  background: '#F1F3F8',
  border: '1px solid #E2E8F0',
  borderRadius: '8px',
  color: '#0F172A',
  fontSize: '13px',
  outline: 'none',
  fontFamily: 'inherit',
};

export default function AddressAutocomplete({
  id,
  label,
  placeholder = 'Buscar dirección en Salta…',
  value,
  onChange,
  onSelect,
  disabled = false,
  required = false,
}) {
  const [query, setQuery] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  useEffect(() => {
    const onDocClick = (event) => {
      if (!wrapRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const fetchSuggestions = useCallback(async (text) => {
    const q = String(text || '').trim();
    if (q.length < 3) {
      setSuggestions([]);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`/api/geo/autocomplete?q=${encodeURIComponent(q)}&limit=6`);
      const payload = await response.json();
      setSuggestions(payload?.ok ? payload.data : []);
      setOpen(true);
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInput = (event) => {
    const text = event.target.value;
    setQuery(text);
    onChange?.(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(text), 320);
  };

  const handlePick = (item) => {
    const labelText = item.address || '';
    setQuery(labelText);
    onChange?.(labelText);
    onSelect?.({
      formattedAddress: labelText,
      lat: item.lat,
      lng: item.lng,
      placeId: item.placeId || null,
    });
    setOpen(false);
    setSuggestions([]);
  };

  return (
    <div ref={wrapRef} className="relative">
      {label ? (
        <label htmlFor={id} className="block text-[11px] text-gray-400 mb-1 font-semibold">
          {label}
          {required ? ' *' : ''}
        </label>
      ) : null}
      <input
        id={id}
        type="text"
        value={query}
        onChange={handleInput}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        style={inputStyle}
      />
      {loading ? (
        <span className="absolute right-3 top-[34px] text-[10px] text-gray-400">…</span>
      ) : null}
      {open && suggestions.length > 0 ? (
        <ul className="absolute z-50 left-0 right-0 mt-1 bg-white border border-light-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {suggestions.map((item, index) => (
            <li key={`${item.placeId || item.address}-${index}`}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-xs text-navy-900 hover:bg-light-100 border-b border-light-200/60 last:border-0"
                onClick={() => handlePick(item)}
              >
                {item.address}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
