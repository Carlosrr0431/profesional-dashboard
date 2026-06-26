'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const STYLES = `
@keyframes _ac_spin { to { transform: rotate(360deg); } }
@keyframes _ac_fade { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
`;

function Spinner() {
  return (
    <div
      style={{
        width: 14,
        height: 14,
        border: '2px solid #E2E8F0',
        borderTopColor: '#DC2626',
        borderRadius: '50%',
        animation: '_ac_spin 0.65s linear infinite',
        flexShrink: 0,
      }}
    />
  );
}

function LocationIcon({ color = '#94A3B8' }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={color}>
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z" />
    </svg>
  );
}

function firstAddressLine(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.split(',')[0]?.trim() || '';
}

function buildSelectedAddressLabel({ title, line, fallback }) {
  const t = String(title || '').trim();
  const l = String(line || '').trim();
  const f = String(fallback || '').trim();
  if (t && l) {
    if (t.toLowerCase() === l.toLowerCase()) return t;
    return `${t}, ${l}`;
  }
  return t || l || f;
}

function filterSuggestionsByQuery(items, normalizedQuery) {
  const q = String(normalizedQuery || '').trim();
  if (!q) return [];
  return items.filter((item) => {
    const title = String(item?.title || '').toLowerCase();
    const subtitle = String(item?.subtitle || '').toLowerCase();
    const address = String(item?.address || '').toLowerCase();
    return title.includes(q) || subtitle.includes(q) || address.includes(q);
  });
}

export default function AddressAutocomplete({
  id,
  label,
  placeholder = 'Buscar dirección en Salta…',
  value,
  onChange,
  onSelect,
  disabled = false,
  required = false,
  inputIcon = null,
  accentColor = '#DC2626',
}) {
  const [query, setQuery] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const debounceRef = useRef(null);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);
  const requestSeqRef = useRef(0);
  const suggestionsCacheRef = useRef(new Map());
  const sessionTokenRef = useRef(null);

  const beginSession = useCallback(() => {
    sessionTokenRef.current = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `sess-${Date.now()}`;
  }, []);

  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  useEffect(() => {
    const onDocClick = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();
  }, []);

  const fetchSuggestions = useCallback(async (text) => {
    const q = String(text || '').trim();
    if (q.length < 2) { setSuggestions([]); setOpen(false); return; }

    const normalized = q.toLowerCase().replace(/\s+/g, ' ').trim();
    const cached = suggestionsCacheRef.current.get(normalized);
    if (cached) {
      setSuggestions(cached);
      setOpen(cached.length > 0);
      setLoading(false);
      return;
    }

    // Reutiliza cache de prefijos para mostrar algo instantáneo mientras llega red.
    const prefixEntries = Array.from(suggestionsCacheRef.current.entries())
      .filter(([key]) => normalized.startsWith(key))
      .sort((a, b) => b[0].length - a[0].length);
    if (prefixEntries.length > 0) {
      const optimistic = filterSuggestionsByQuery(prefixEntries[0][1], normalized);
      if (optimistic.length > 0) {
        setSuggestions(optimistic.slice(0, 6));
        setOpen(true);
      }
    }

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = ++requestSeqRef.current;

    setLoading(true);
    try {
      if (!sessionTokenRef.current) beginSession();
      const qs = new URLSearchParams({
        q,
        limit: '6',
        sessionToken: sessionTokenRef.current,
      });
      const res = await fetch(`/api/geo/autocomplete?${qs.toString()}`, {
        signal: controller.signal,
      });
      const payload = await res.json();
      if (requestId !== requestSeqRef.current) return;
      const nextSuggestions = payload?.ok ? payload.data : [];
      setSuggestions(nextSuggestions);
      suggestionsCacheRef.current.set(normalized, nextSuggestions);
      if (suggestionsCacheRef.current.size > 80) {
        const firstKey = suggestionsCacheRef.current.keys().next().value;
        if (firstKey) suggestionsCacheRef.current.delete(firstKey);
      }
      setOpen(true);
    } catch {
      if (controller.signal.aborted) return;
      setSuggestions([]);
      setOpen(false);
    } finally {
      if (requestId === requestSeqRef.current) setLoading(false);
    }
  }, [beginSession]);

  const handleInput = (e) => {
    const text = e.target.value;
    setQuery(text);
    onChange?.(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(text), 200);
  };

  const handlePick = async (item) => {
    const baseTitle = item.title || String(item.address || '').split(',')[0];
    const baseLine = firstAddressLine(item.subtitle || item.address);
    const labelText = buildSelectedAddressLabel({
      title: baseTitle,
      line: baseLine,
      fallback: item.address || '',
    });
    setQuery(labelText);
    onChange?.(labelText);
    setOpen(false);
    setSuggestions([]);

    const hasCoords = Number.isFinite(item.lat) && Number.isFinite(item.lng);
    if (hasCoords) {
      sessionTokenRef.current = null;
      onSelect?.({
        formattedAddress: labelText,
        lat: item.lat,
        lng: item.lng,
        placeId: item.placeId || null,
        title: item.title || null,
        subtitle: item.subtitle || null,
      });
      return;
    }

    if (!item.placeId) {
      onSelect?.({ formattedAddress: labelText, lat: null, lng: null, placeId: null });
      return;
    }

    try {
      const token = item.sessionToken || sessionTokenRef.current;
      const qs = new URLSearchParams({
        placeId: String(item.placeId),
        formattedAddress: labelText,
      });
      if (item.title) qs.set('title', item.title);
      if (item.subtitle) qs.set('subtitle', item.subtitle);
      if (token) qs.set('sessionToken', token);
      const res = await fetch(`/api/geo/geocode?${qs.toString()}`);
      const payload = await res.json();
      if (!payload?.ok) throw new Error(payload?.error || 'No se pudo obtener la ubicación');
      const resolvedTitle = payload.data?.title || item.title || null;
      const resolvedLine = firstAddressLine(payload.data?.formattedAddress || item.subtitle || item.address || '');
      const selectedLabel = buildSelectedAddressLabel({
        title: resolvedTitle,
        line: resolvedLine,
        fallback: payload.data?.formattedAddress || labelText,
      });
      setQuery(selectedLabel);
      onChange?.(selectedLabel);
      sessionTokenRef.current = null;
      onSelect?.({
        formattedAddress: selectedLabel,
        lat: payload.data?.lat,
        lng: payload.data?.lng,
        placeId: item.placeId,
        title: resolvedTitle,
        subtitle: payload.data?.subtitle || item.subtitle || null,
        fullFormattedAddress: payload.data?.formattedAddress || null,
        geocodeSource: payload.data?.geocodeSource || null,
      });
    } catch {
      onSelect?.({ formattedAddress: labelText, lat: null, lng: null, placeId: item.placeId || null });
    }
  };

  const borderColor = focused ? accentColor : '#E2E8F0';
  const shadowColor = focused ? `${accentColor}20` : 'transparent';

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <style>{STYLES}</style>

      {label && (
        <label
          htmlFor={id}
          style={{ display: 'block', fontSize: 11, color: '#64748B', marginBottom: 5, fontWeight: 700, letterSpacing: '0.05em' }}
        >
          {label}{required ? ' *' : ''}
        </label>
      )}

      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        {/* Left icon */}
        {inputIcon && (
          <span style={{ position: 'absolute', left: 11, pointerEvents: 'none', display: 'flex', alignItems: 'center' }}>
            {inputIcon}
          </span>
        )}

        <input
          ref={inputRef}
          id={id}
          type="text"
          value={query}
          onChange={handleInput}
          onFocus={() => { beginSession(); setFocused(true); if (suggestions.length > 0) setOpen(true); }}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          style={{
            width: '100%',
            padding: `10px ${loading ? 38 : 14}px 10px ${inputIcon ? 34 : 14}px`,
            background: disabled ? '#F8FAFC' : '#FFFFFF',
            border: `1.5px solid ${borderColor}`,
            borderRadius: 10,
            color: '#0F172A',
            fontSize: 13,
            outline: 'none',
            fontFamily: 'inherit',
            boxShadow: `0 0 0 3px ${shadowColor}`,
            transition: 'border-color 0.15s, box-shadow 0.15s',
            cursor: disabled ? 'not-allowed' : 'text',
          }}
        />

        {/* Right spinner */}
        {loading && (
          <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', display: 'flex' }}>
            <Spinner />
          </span>
        )}
      </div>

      {/* Dropdown */}
      {open && suggestions.length > 0 && (
        <div
          style={{
            position: 'absolute',
            left: 0, right: 0,
            top: 'calc(100% + 6px)',
            zIndex: 200,
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: 12,
            boxShadow: '0 12px 32px rgba(0,0,0,0.14)',
            overflow: 'hidden',
            maxHeight: 260,
            overflowY: 'auto',
            animation: '_ac_fade 0.12s ease',
          }}
        >
          {suggestions.map((item, index) => (
            <SuggestionItem
              key={item.placeId || `${item.address}-${index}`}
              item={item}
              onPick={handlePick}
              isLast={index === suggestions.length - 1}
              accentColor={accentColor}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SuggestionItem({ item, onPick, isLast, accentColor }) {
  const [hovered, setHovered] = useState(false);
  const title = item.title || String(item.address || '').split(',')[0];
  const subtitle = item.subtitle || String(item.address || '').split(',').slice(1).join(',').trim();

  return (
    <button
      type="button"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onPick(item)}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        width: '100%',
        textAlign: 'left',
        padding: '9px 14px',
        background: hovered ? '#F8FAFC' : '#FFFFFF',
        border: 'none',
        borderBottom: isLast ? 'none' : '1px solid #F1F5F9',
        cursor: 'pointer',
        transition: 'background 0.1s',
      }}
    >
      <span style={{ marginTop: 2, flexShrink: 0 }}>
        <LocationIcon color={hovered ? accentColor : '#94A3B8'} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 13,
          fontWeight: 600,
          color: '#0F172A',
          lineHeight: 1.35,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {title}
        </div>
        {subtitle && (
          <div style={{
            fontSize: 11,
            color: '#94A3B8',
            marginTop: 1,
            lineHeight: 1.3,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {subtitle}
          </div>
        )}
      </div>
    </button>
  );
}
