/** Logo Profesional en SVG — sin fondo, adaptable a tema claro. */
const LOGO_SRC = '/Profesional%20app-02.svg';

export default function LandingLogo({
  size = 'md',
  className = '',
  withGlow = false,
}) {
  const heights = {
    sm: 'h-8 max-w-[140px]',
    md: 'h-10 max-w-[168px]',
    lg: 'h-12 max-w-[200px]',
    hero: 'h-14 max-w-[220px] sm:h-[4.5rem] sm:max-w-[280px] lg:h-20 lg:max-w-[340px]',
  };

  return (
    <img
      src={LOGO_SRC}
      alt="Profesional App"
      className={`w-auto object-contain object-left ${heights[size]} ${
        withGlow ? 'drop-shadow-[0_8px_24px_rgba(30,58,95,0.12)]' : ''
      } ${className}`}
      draggable={false}
    />
  );
}
