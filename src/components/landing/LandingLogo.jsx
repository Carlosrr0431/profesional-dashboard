/** Logo Profesional sobre fondo claro — legible en hero oscuro y footer. */
export default function LandingLogo({
  size = 'md',
  className = '',
  withGlow = false,
}) {
  const shell = {
    sm: 'rounded-xl px-3 py-2',
    md: 'rounded-2xl px-4 py-2.5',
    lg: 'rounded-2xl px-5 py-3',
    hero: 'rounded-[1.25rem] px-6 py-4 shadow-2xl shadow-black/30',
  };

  const image = {
    sm: 'h-7 w-auto max-w-[108px]',
    md: 'h-9 w-auto max-w-[132px]',
    lg: 'h-11 w-auto max-w-[160px]',
    hero: 'h-12 w-auto max-w-[180px] sm:h-14 sm:max-w-[210px]',
  };

  return (
    <div
      className={`inline-flex items-center justify-center border border-white/20 bg-white ${shell[size]} ${
        withGlow ? 'ring-1 ring-white/30' : ''
      } ${className}`}
    >
      <img
        src="/logo.png"
        alt="Profesional App"
        className={`object-contain ${image[size]}`}
        draggable={false}
      />
    </div>
  );
}
