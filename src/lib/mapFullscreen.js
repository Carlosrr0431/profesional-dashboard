export function mapStageClassName(isFullscreen) {
  return isFullscreen
    ? 'fixed inset-0 z-[80] h-[100dvh] w-screen overflow-hidden bg-slate-100'
    : 'relative min-h-0 flex-1 overflow-hidden';
}

export function resizeMapInstance(mapRefCurrent) {
  if (!mapRefCurrent) return false;
  const map = typeof mapRefCurrent.getMap === 'function'
    ? mapRefCurrent.getMap()
    : mapRefCurrent;
  if (!map || typeof map.resize !== 'function') return false;
  map.resize();
  return true;
}
