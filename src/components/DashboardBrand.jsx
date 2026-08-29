/** Logo compartido con driver-app (`/public/logo.png`). `src` permite el isotipo (P) sin wordmark. */
export default function DashboardBrand({ className = '', imageClassName = 'h-9 w-auto max-w-[132px] object-contain', src = '/logo.png', style }) {
  return (
    <div className={`flex items-center flex-shrink-0 ${className}`}>
      <img src={src} alt="Profesional" className={imageClassName} style={style} draggable={false} />
    </div>
  );
}
