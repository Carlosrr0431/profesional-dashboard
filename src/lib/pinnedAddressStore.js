'use client';

import { useSyncExternalStore } from 'react';
import { supabase } from './supabase';

let rows = [];
let focusId = null;
const listeners = new Set();
let started = false;

function emit() {
  listeners.forEach((listener) => listener());
}

function snapshot() {
  return rows;
}

function focusSnapshot() {
  return focusId;
}

function normalizeRow(row) {
  if (!row?.id || !row?.title) return null;
  const lat = Number(row.lat);
  const lng = Number(row.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { id: String(row.id), title: String(row.title), lat, lng };
}

export function subscribePinnedAddresses(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPinnedAddressRows() {
  return rows;
}

export function getPinnedAddressFocusId() {
  return focusId;
}

export function usePinnedAddresses() {
  return useSyncExternalStore(subscribePinnedAddresses, getPinnedAddressRows, getPinnedAddressRows);
}

export function usePinnedAddressFocusId() {
  return useSyncExternalStore(subscribePinnedAddresses, getPinnedAddressFocusId, getPinnedAddressFocusId);
}

export function setPinnedAddressRows(next) {
  rows = Array.isArray(next) ? next.map(normalizeRow).filter(Boolean) : [];
  emit();
}

export function upsertPinnedAddressRow(row) {
  const next = normalizeRow(row);
  if (!next) return;
  const index = rows.findIndex((item) => item.id === next.id);
  rows = index === -1 ? [next, ...rows] : rows.map((item) => (item.id === next.id ? next : item));
  emit();
}

export function removePinnedAddressRow(id) {
  rows = rows.filter((item) => item.id !== id);
  if (focusId === id) focusId = null;
  emit();
}

export function focusPinnedAddress(id) {
  focusId = id || null;
  emit();
}

async function refreshPinnedAddresses() {
  try {
    const response = await fetch('/api/geo/pinned-addresses', { cache: 'no-store' });
    const payload = await response.json();
    if (payload?.ok && Array.isArray(payload.data)) setPinnedAddressRows(payload.data);
  } catch {
    // La lista local sigue vigente hasta el próximo evento.
  }
}

function applyRealtime(payload) {
  if (payload.eventType === 'DELETE') {
    removePinnedAddressRow(payload.old?.id);
    return;
  }
  upsertPinnedAddressRow(payload.new);
}

export function ensurePinnedAddressSync() {
  if (started || typeof window === 'undefined') return;
  started = true;
  refreshPinnedAddresses();
  supabase
    .channel('pinned_addresses_live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pinned_addresses' }, applyRealtime)
    .subscribe();
}
