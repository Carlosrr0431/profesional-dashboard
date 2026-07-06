import Image from 'next/image';

const DEFAULT_QUALITY = 92;

/**
 * Imagen optimizada para la landing: WebP/AVIF vía Next.js, sizes responsive y calidad alta.
 */
export default function LandingImage({
  src,
  alt,
  width,
  height,
  fill = false,
  priority = false,
  sizes,
  className = '',
  quality = DEFAULT_QUALITY,
}) {
  const shared = {
    src,
    alt,
    quality,
    draggable: false,
    className,
    ...(priority ? { priority: true, fetchPriority: 'high' } : {}),
  };

  if (fill) {
    return (
      <Image
        {...shared}
        fill
        sizes={sizes || '(max-width: 640px) 58vw, 300px'}
      />
    );
  }

  return (
    <Image
      {...shared}
      width={width}
      height={height}
      sizes={sizes || '(max-width: 768px) 100vw, 1152px'}
      style={{ width: '100%', height: 'auto' }}
    />
  );
}
