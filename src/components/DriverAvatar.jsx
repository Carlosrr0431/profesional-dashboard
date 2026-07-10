'use client';

import { useState } from 'react';

const SIZE_CLASS = {
  sm: 'w-9 h-9 text-xs rounded-xl',
  md: 'w-11 h-11 text-sm rounded-full',
  lg: 'w-12 h-12 text-sm rounded-xl',
};

function getInitials(name) {
  return String(name || 'NN')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .substring(0, 2)
    .toUpperCase() || 'NN';
}

/**
 * Avatar de chofer: usa photo_url / photoUrl si existe; si falla, muestra iniciales.
 */
export default function DriverAvatar({
  photoUrl,
  name,
  size = 'sm',
  online = true,
  className = '',
  ringClassName = '',
}) {
  const [failed, setFailed] = useState(false);
  const src = String(photoUrl || '').trim();
  const showPhoto = Boolean(src) && !failed;
  const sizeClass = SIZE_CLASS[size] || SIZE_CLASS.sm;
  const tone = online
    ? 'bg-light-200 text-navy-800'
    : 'bg-light-200/60 text-gray-400';

  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden font-bold ${sizeClass} ${tone} ${ringClassName} ${className}`}
    >
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name ? `Foto de ${name}` : 'Foto del chofer'}
          className="h-full w-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        getInitials(name)
      )}
    </div>
  );
}
