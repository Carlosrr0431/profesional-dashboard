export const metadata = {
  title: 'Contacto · Profesional App',
  description:
    'Datos de contacto de Profesional App para pasajeros, conductores y consultas sobre privacidad en Salta Capital, Argentina.',
};

const CONTACT_EMAIL = 'contacto@profesional.com.ar';

const contactChannels = [
  {
    id: 'email',
    title: 'Correo electrónico',
    description: 'Canal principal para consultas, soporte y solicitudes formales.',
    value: CONTACT_EMAIL,
    href: `mailto:${CONTACT_EMAIL}`,
    cta: 'Enviar correo',
  },
  {
    id: 'whatsapp',
    title: 'WhatsApp',
    description:
      'Podés pedir viajes y recibir códigos de acceso por WhatsApp. Si ya usaste el servicio, escribinos al mismo número con el que te contactamos.',
    value: 'Reservas y atención por mensaje',
    href: `mailto:${CONTACT_EMAIL}?subject=Consulta%20por%20WhatsApp%20-%20Profesional%20App`,
    cta: 'Consultar por correo',
  },
  {
    id: 'ubicacion',
    title: 'Zona de operación',
    description: 'Prestamos el servicio de transporte con chofer en la ciudad.',
    value: 'Salta Capital, Argentina',
    href: null,
    cta: null,
  },
];

const topics = [
  {
    id: 'pasajeros',
    title: 'Pasajeros',
    items: [
      'Problemas para iniciar sesión o recibir el código por WhatsApp.',
      'Consultas sobre un viaje en curso o reciente.',
      'Solicitud de eliminación de cuenta o datos personales.',
      'Dudas sobre notificaciones o seguimiento en tiempo real.',
    ],
    mailtoSubject: 'Consulta%20pasajero%20-%20Profesional%20App',
  },
  {
    id: 'conductores',
    title: 'Conductores',
    items: [
      'Alta en la flota o acceso a la app Profesional Conductor.',
      'Consultas sobre comisiones y pagos.',
      'Problemas técnicos con la app de conductor.',
      'Actualización de datos del vehículo o documentación.',
    ],
    mailtoSubject: 'Consulta%20conductor%20-%20Profesional%20App',
  },
  {
    id: 'privacidad',
    title: 'Privacidad y datos personales',
    items: [
      'Acceso, rectificación o supresión de datos conforme a la Ley 25.326.',
      'Consultas sobre cómo usamos tu ubicación, teléfono o historial de viajes.',
      'Reclamos relacionados con el tratamiento de información personal.',
    ],
    mailtoSubject: 'Privacidad%20-%20Profesional%20App',
  },
];

export default function ContactoPage() {
  return (
    <div className="contact-page fixed inset-0 overflow-y-auto overscroll-y-contain bg-[#f8f9fb] text-[#0F172A]">
      <style>{`
        .contact-page { -webkit-overflow-scrolling: touch; }
        .contact-page a { color: #1d2260; text-decoration: underline; text-underline-offset: 2px; }
        .contact-page a:hover { color: #2e3699; }
        .contact-page ul { margin: 0.75rem 0; padding-left: 1.25rem; }
        .contact-page li { margin: 0.35rem 0; line-height: 1.6; color: #334155; }
        .contact-page p { margin: 0.75rem 0; line-height: 1.65; color: #334155; }
        .contact-page p:first-child { margin-top: 0; }
      `}</style>

      <header className="border-b border-[#E2E8F0] bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-5 sm:px-6">
          <img src="/logo.png" alt="Profesional App" className="h-9 w-auto max-w-[132px] object-contain" />
          <span className="text-xs font-medium uppercase tracking-wide text-[#94A3B8]">Contacto</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-10 sm:px-6 sm:py-14">
        <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-[#1d2260]">Profesional App</p>
        <h1 className="mb-3 text-3xl font-extrabold tracking-tight text-[#0F172A] sm:text-4xl">
          Estamos para ayudarte
        </h1>
        <p className="mb-10 max-w-2xl text-base text-[#64748B]">
          <strong>Profesional App</strong> conecta pasajeros y conductores en <strong>Salta Capital</strong>. Si tenés
          una consulta sobre nuestras apps, un viaje o tus datos personales, usá los canales de abajo.
        </p>

        <div className="mb-12 grid gap-4 sm:grid-cols-3">
          {contactChannels.map((channel) => (
            <section
              key={channel.id}
              className="flex h-full flex-col rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm sm:p-6"
            >
              <h2 className="mb-2 text-base font-bold text-[#0F172A]">{channel.title}</h2>
              <p className="mb-4 flex-1 text-sm text-[#64748B]">{channel.description}</p>
              <p className="mb-4 text-[15px] font-semibold text-[#1d2260]">{channel.value}</p>
              {channel.href ? (
                <a
                  href={channel.href}
                  className="inline-flex items-center justify-center rounded-xl bg-[#1d2260] px-4 py-2.5 text-sm font-semibold !text-white !no-underline transition hover:bg-[#2e3699]"
                >
                  {channel.cta}
                </a>
              ) : null}
            </section>
          ))}
        </div>

        <div className="mb-12 rounded-2xl border border-[#1d2260]/20 bg-[#1d2260]/5 p-5 sm:p-6">
          <p className="mb-2 text-sm font-semibold text-[#1d2260]">Tiempo de respuesta</p>
          <p className="text-[15px] text-[#334155]">
            Respondemos consultas por correo en un plazo habitual de <strong>2 a 5 días hábiles</strong>. Para viajes
            en curso, priorizamos los mensajes que incluyan tu <strong>número de teléfono registrado</strong> y, si
            aplica, el <strong>detalle del viaje</strong>.
          </p>
        </div>

        <div className="space-y-6">
          {topics.map((topic) => (
            <section
              key={topic.id}
              id={topic.id}
              className="scroll-mt-6 rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm sm:p-8"
            >
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <h2 className="text-xl font-bold text-[#0F172A]">{topic.title}</h2>
                <a
                  href={`mailto:${CONTACT_EMAIL}?subject=${topic.mailtoSubject}`}
                  className="text-sm font-semibold !no-underline"
                >
                  Escribinos →
                </a>
              </div>
              <p className="text-[15px]">Podés contactarnos si necesitás ayuda con:</p>
              <ul className="text-[15px]">
                {topic.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <section className="mt-10 rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm sm:p-8">
          <h2 className="mb-4 text-xl font-bold text-[#0F172A]">Enlaces útiles</h2>
          <ul className="text-[15px]">
            <li>
              <a href="/privacidad">Política de privacidad</a> — cómo recopilamos y protegemos tus datos.
            </li>
            <li>
              <a href="/eliminacion-cuenta">Eliminación de cuenta</a> — pasos para solicitar el borrado de tu cuenta de
              pasajero.
            </li>
            <li>
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> — contacto directo con el equipo de Profesional
              App.
            </li>
          </ul>
        </section>
      </main>

      <footer className="border-t border-[#E2E8F0] bg-white py-8 text-center">
        <p className="text-sm text-[#94A3B8]">Profesional App · Salta Capital, Argentina</p>
        <p className="mt-1 text-sm">
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          {' · '}
          <a href="/privacidad">Privacidad</a>
          {' · '}
          <a href="/eliminacion-cuenta">Eliminar cuenta</a>
        </p>
      </footer>
    </div>
  );
}
