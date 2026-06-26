/** Logo compartido con driver-app (`/public/logo.png`). */
export default function DashboardBrand({ className = '', imageClassName = 'h-9 w-auto max-w-[132px] object-contain' }) {
  return (
    <div className={`flex items-center flex-shrink-0 ${className}`}>
      <img src="/logo.png" alt="Profesional" className={imageClassName} draggable={false} />
    </div>
  );
}
