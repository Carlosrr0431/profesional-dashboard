'use client';

import { memo, useMemo } from 'react';
import { Marker } from 'react-leaflet';
import L from 'leaflet';
import { ensurePinnedAddressSync, usePinnedAddressFocusId, usePinnedAddresses } from '../lib/pinnedAddressStore';

function pinIcon(title, selected) {
  const color = selected ? '#BE123C' : '#E11D48';
  const safe = String(title || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
  return L.divIcon({
    className: 'fleet-map-pin',
    iconSize: [220, 28],
    iconAnchor: [14, 28],
    html: `<div style="display:flex;align-items:flex-end;gap:6px;pointer-events:none;white-space:nowrap">
      <span style="width:16px;height:16px;border-radius:999px 999px 999px 2px;transform:rotate(-45deg);background:${color};border:2px solid #fff;box-shadow:0 2px 6px rgba(190,18,60,.45)"></span>
      <span style="margin-bottom:2px;font-size:12px;font-weight:800;color:${color};text-shadow:-1px -1px 0 #fff,1px -1px 0 #fff,-1px 1px 0 #fff,1px 1px 0 #fff">${safe}</span>
    </div>`,
  });
}

const PinnedAddressMarkers = memo(function PinnedAddressMarkers() {
  ensurePinnedAddressSync();
  const rows = usePinnedAddresses();
  const focusId = usePinnedAddressFocusId();
  const icons = useMemo(
    () => new Map(rows.map((row) => [row.id, pinIcon(row.title, row.id === focusId)])),
    [rows, focusId],
  );

  return rows.map((row) => (
    <Marker
      key={row.id}
      position={[row.lat, row.lng]}
      icon={icons.get(row.id)}
      interactive={false}
      keyboard={false}
      zIndexOffset={row.id === focusId ? 400 : 180}
    />
  ));
});

export default PinnedAddressMarkers;
