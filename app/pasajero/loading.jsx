export default function PasajeroLoading() {
  return (
    <div className="spa-boot" role="status" aria-live="polite" aria-busy="true">
      <div className="spa-boot-glow" aria-hidden="true" />
      <div className="spa-boot-glow spa-boot-glow--accent" aria-hidden="true" />
      <div className="spa-boot-core">
        <div className="spa-boot-orb">
          <span className="spa-boot-ring" aria-hidden="true" />
          <span className="spa-boot-mark">P</span>
        </div>
        <p className="spa-boot-brand" translate="no">Profesional</p>
        <div className="spa-boot-track" aria-hidden="true">
          <span className="spa-boot-bar" />
        </div>
        <p className="spa-boot-msg">Preparando tu viaje…</p>
        <p className="spa-boot-sub">Pasajero · Salta</p>
      </div>
    </div>
  );
}
