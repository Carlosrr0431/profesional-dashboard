export const metadata = {
  title: 'Política de Privacidad · Profesional App',
  description:
    'Cómo Profesional App recopila, usa y protege tus datos personales en Salta Capital, Argentina.',
};

const sections = [
  {
    id: 'responsable',
    title: '1. Responsable del tratamiento',
    content: (
      <>
        <p>
          <strong>Profesional App</strong> (en adelante, «Profesional») es el servicio de transporte
          con chofer en <strong>Salta Capital, Argentina</strong>. Operamos a través de:
        </p>
        <ul>
          <li>aplicación móvil para pasajeros;</li>
          <li>aplicación móvil para conductores;</li>
          <li>reservas y atención por WhatsApp;</li>
          <li>enlaces web de seguimiento de viajes en tiempo real;</li>
          <li>panel interno de operación (acceso restringido al personal autorizado).</li>
        </ul>
        <p>
          Para consultas sobre privacidad podés escribir a{' '}
          <a href="mailto:contacto@profesional.com.ar">contacto@profesional.com.ar</a>.
        </p>
      </>
    ),
  },
  {
    id: 'alcance',
    title: '2. Alcance',
    content: (
      <p>
        Esta política describe el tratamiento de datos personales cuando usás nuestros servicios como
        pasajero o conductor, cuando interactuás con nosotros por WhatsApp, o cuando accedés a un enlace
        de seguimiento de viaje. No aplica a sitios o servicios de terceros enlazados desde nuestras
        plataformas.
      </p>
    ),
  },
  {
    id: 'datos',
    title: '3. Datos que recopilamos',
    content: (
      <>
        <p>Según el servicio que uses, podemos tratar las siguientes categorías de datos:</p>

        <h3>Pasajeros</h3>
        <ul>
          <li>Nombre y número de teléfono.</li>
          <li>Código de verificación (OTP) enviado por WhatsApp para iniciar sesión.</li>
          <li>Direcciones y coordenadas de origen y destino del viaje.</li>
          <li>Notas o indicaciones que agregues al pedir un viaje.</li>
          <li>Historial de viajes (estado, fechas, rutas y tarifas asociadas).</li>
          <li>Mensajes enviados por WhatsApp al agente de reservas.</li>
          <li>Token de notificaciones push del dispositivo (si activás las alertas).</li>
        </ul>

        <h3>Conductores</h3>
        <ul>
          <li>Nombre, correo electrónico y teléfono.</li>
          <li>Datos del vehículo (marca, modelo, patente, color, tipo).</li>
          <li>Número de chofer y vencimiento de licencia de conducir.</li>
          <li>Ubicación geográfica en tiempo real mientras la app está activa y disponible.</li>
          <li>Estado operativo (disponible, en viaje, comisiones pendientes).</li>
          <li>Token de notificaciones push del dispositivo.</li>
          <li>Información relacionada con pagos de comisión (montos, estado y comprobantes).</li>
        </ul>

        <h3>Datos generados durante un viaje</h3>
        <ul>
          <li>Asignación entre pasajero y conductor.</li>
          <li>Recorrido estimado y actualizaciones de estado del viaje.</li>
          <li>Enlace único de seguimiento en vivo (accesible solo con el token correspondiente).</li>
        </ul>

        <h3>Datos técnicos</h3>
        <ul>
          <li>Identificadores de sesión y registros técnicos necesarios para seguridad y diagnóstico.</li>
          <li>Dirección IP y datos del navegador o dispositivo, en la medida en que los proveedores de
            infraestructura los registren automáticamente.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'finalidades',
    title: '4. Para qué usamos tus datos',
    content: (
      <ul>
        <li>Recibir, confirmar y gestionar solicitudes de viaje.</li>
        <li>Asignar conductores, calcular rutas y mostrar tiempos estimados de llegada.</li>
        <li>Permitir el seguimiento en vivo del viaje al pasajero y al conductor.</li>
        <li>Enviar notificaciones sobre el estado del viaje, códigos de acceso y avisos operativos.</li>
        <li>Atender consultas y reservas por WhatsApp mediante asistencia automatizada.</li>
        <li>Administrar cuentas de conductores, comisiones y pagos asociados.</li>
        <li>Prevenir fraudes, abusos y usos indebidos del servicio.</li>
        <li>Cumplir obligaciones legales y responder requerimientos de autoridades competentes.</li>
        <li>Mejorar la calidad, seguridad y cobertura del servicio en Salta Capital.</li>
      </ul>
    ),
  },
  {
    id: 'base-legal',
    title: '5. Base legal',
    content: (
      <p>
        Tratamos tus datos conforme a la <strong>Ley N.º 25.326</strong> de Protección de Datos
        Personales de la República Argentina y normas complementarias. Las bases habituales son: la
        ejecución del servicio solicitado, tu consentimiento (por ejemplo, al activar notificaciones o
        escribirnos por WhatsApp), el interés legítimo en operar y asegurar la plataforma, y el
        cumplimiento de obligaciones legales.
      </p>
    ),
  },
  {
    id: 'ubicacion',
    title: '6. Datos de ubicación',
    content: (
      <>
        <p>
          La ubicación es esencial para prestar el servicio. Los conductores comparten su posición en
          tiempo real mientras utilizan la aplicación en modo operativo. Los pasajeros indican puntos de
          origen y destino, y pueden ver la posición del vehículo durante un viaje activo.
        </p>
        <p>
          Podés limitar el acceso a la ubicación desde la configuración de tu dispositivo; sin embargo,
          algunas funciones (pedir un viaje, ser asignado como conductor o seguir un recorrido) dejarán
          de estar disponibles si no otorgás los permisos necesarios.
        </p>
      </>
    ),
  },
  {
    id: 'terceros',
    title: '7. Proveedores y transferencias',
    content: (
      <>
        <p>
          Compartimos datos con proveedores que nos ayudan a operar el servicio, siempre en la medida
          necesaria y bajo obligaciones de confidencialidad y seguridad. Entre ellos:
        </p>
        <ul>
          <li><strong>Supabase</strong> — almacenamiento de base de datos y autenticación.</li>
          <li><strong>Vercel</strong> — alojamiento del panel y APIs web.</li>
          <li><strong>Google Maps / servicios de mapas y rutas</strong> — geocodificación, autocompletado
            de direcciones y cálculo de recorridos (incluidos servicios propios de enrutamiento).</li>
          <li><strong>Proveedores de mensajería WhatsApp</strong> — envío y recepción de mensajes con
            pasajeros y conductores.</li>
          <li><strong>Proveedores de inteligencia artificial</strong> — procesamiento de mensajes para
            asistir en reservas por WhatsApp.</li>
          <li><strong>Paypertic</strong> — procesamiento de pagos de comisiones de conductores.</li>
          <li><strong>Servicios de notificaciones push</strong> — envío de alertas a dispositivos móviles.</li>
        </ul>
        <p>
          Algunos proveedores pueden encontrarse fuera de Argentina. En esos casos adoptamos medidas
          razonables para proteger la información transferida.
        </p>
      </>
    ),
  },
  {
    id: 'conservacion',
    title: '8. Conservación',
    content: (
      <p>
        Conservamos los datos mientras sean necesarios para prestar el servicio, resolver disputas,
        cumplir obligaciones legales o contables, y mantener registros operativos razonables. Los
        mensajes de WhatsApp, historial de viajes y registros de pago se conservan por períodos acordes
        a esas finalidades y luego se eliminan o anonimizan cuando ya no son requeridos.
      </p>
    ),
  },
  {
    id: 'seguridad',
    title: '9. Seguridad',
    content: (
      <p>
        Aplicamos medidas técnicas y organizativas para proteger la información, como control de acceso,
        cifrado en tránsito, segregación de entornos y políticas de acceso mínimo para el personal
        autorizado. Ningún sistema es completamente infalible; si detectamos un incidente que afecte tus
        datos, tomaremos las medidas correctivas y, cuando corresponda, te informaremos conforme a la
        normativa aplicable.
      </p>
    ),
  },
  {
    id: 'derechos',
    title: '10. Tus derechos',
    content: (
      <>
        <p>De acuerdo con la legislación argentina, podés solicitar:</p>
        <ul>
          <li>acceso a tus datos personales;</li>
          <li>rectificación de datos inexactos o incompletos;</li>
          <li>supresión cuando corresponda;</li>
          <li>información sobre el origen de los datos y a quién se comunicaron.</li>
        </ul>
        <p>
          Para ejercer estos derechos escribinos a{' '}
          <a href="mailto:contacto@profesional.com.ar">contacto@profesional.com.ar</a>. También podés
          presentar un reclamo ante la{' '}
          <strong>Agencia de Acceso a la Información Pública (AAIP)</strong>, organismo de control de la
          Ley 25.326.
        </p>
      </>
    ),
  },
  {
    id: 'menores',
    title: '11. Menores de edad',
    content: (
      <p>
        El servicio está dirigido a personas mayores de 18 años. No recopilamos intencionalmente datos
        de menores. Si creés que un menor nos proporcionó información personal, contactanos para
        evaluar su eliminación.
      </p>
    ),
  },
  {
    id: 'cambios',
    title: '12. Cambios a esta política',
    content: (
      <p>
        Podemos actualizar esta política para reflejar cambios en el servicio o en la normativa. Publicaremos
        la versión vigente en esta misma URL e indicaremos la fecha de última actualización. El uso
        continuado del servicio después de un cambio implica que revisaste la política actualizada.
      </p>
    ),
  },
];

export default function PrivacidadPage() {
  return (
    <div className="privacidad-page min-h-screen bg-[#f8f9fb] text-[#0F172A] overflow-y-auto">
      <style>{`
        .privacidad-page a { color: #1d2260; text-decoration: underline; text-underline-offset: 2px; }
        .privacidad-page a:hover { color: #2e3699; }
        .privacidad-page h3 { margin: 1.25rem 0 0.5rem; font-size: 0.95rem; font-weight: 600; color: #334155; }
        .privacidad-page ul { margin: 0.75rem 0; padding-left: 1.25rem; }
        .privacidad-page li { margin: 0.35rem 0; line-height: 1.6; }
        .privacidad-page p { margin: 0.75rem 0; line-height: 1.65; color: #334155; }
        .privacidad-page p:first-child { margin-top: 0; }
      `}</style>

      <header className="border-b border-[#E2E8F0] bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-5 sm:px-6">
          <img src="/logo.png" alt="Profesional App" className="h-9 w-auto max-w-[132px] object-contain" />
          <span className="text-xs font-medium uppercase tracking-wide text-[#94A3B8]">Legal</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-10 sm:px-6 sm:py-14">
        <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-[#1d2260]">
          Política de Privacidad
        </p>
        <h1 className="mb-3 text-3xl font-extrabold tracking-tight text-[#0F172A] sm:text-4xl">
          Cómo cuidamos tu información
        </h1>
        <p className="mb-10 max-w-2xl text-base text-[#64748B]">
          En Profesional App conectamos pasajeros y conductores en Salta Capital. Esta política explica
          qué datos recopilamos, para qué los usamos y qué opciones tenés respecto de tu información.
        </p>
        <p className="mb-12 text-sm text-[#94A3B8]">
          Última actualización: 28 de junio de 2026
        </p>

        <nav
          aria-label="Contenido de la política"
          className="mb-12 rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm"
        >
          <p className="mb-3 text-sm font-semibold text-[#0F172A]">Contenido</p>
          <ol className="grid gap-1.5 sm:grid-cols-2">
            {sections.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="text-sm font-medium !text-[#475569] !no-underline hover:!text-[#1d2260]"
                >
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="space-y-10">
          {sections.map((section) => (
            <section
              key={section.id}
              id={section.id}
              className="scroll-mt-6 rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm sm:p-8"
            >
              <h2 className="mb-4 text-xl font-bold text-[#0F172A]">{section.title}</h2>
              <div className="text-[15px]">{section.content}</div>
            </section>
          ))}
        </div>
      </main>

      <footer className="border-t border-[#E2E8F0] bg-white py-8 text-center">
        <p className="text-sm text-[#94A3B8]">
          Profesional App · Salta Capital, Argentina
        </p>
        <p className="mt-1 text-sm">
          <a href="mailto:contacto@profesional.com.ar">contacto@profesional.com.ar</a>
        </p>
      </footer>
    </div>
  );
}
