export const metadata = {
  title: 'Eliminación de cuenta · Profesional Pasajero',
  description:
    'Cómo solicitar la eliminación de tu cuenta y datos personales en la app Profesional Pasajero.',
};

const CONTACT_EMAIL = 'contacto@profesional.com.ar';

const sections = [
  {
    id: 'app',
    title: '1. Aplicación',
    content: (
      <p>
        Esta página aplica a la aplicación móvil <strong>Profesional Pasajero</strong> (desarrollada por{' '}
        <strong>Profesional App</strong>), disponible en Google Play. Si usaste el servicio solo por
        WhatsApp o un enlace de seguimiento, los mismos pasos de solicitud aplican indicando tu número
        de teléfono registrado.
      </p>
    ),
  },
  {
    id: 'pasos',
    title: '2. Cómo solicitar la eliminación de tu cuenta',
    content: (
      <>
        <p>
          Para pedir la eliminación de tu cuenta y de los datos asociados, seguí estos pasos:
        </p>
        <ol className="list-decimal pl-5">
          <li>
            Enviá un correo a{' '}
            <a href={`mailto:${CONTACT_EMAIL}?subject=Eliminación%20de%20cuenta%20-%20Profesional%20Pasajero`}>
              {CONTACT_EMAIL}
            </a>{' '}
            con el asunto: <strong>Eliminación de cuenta - Profesional Pasajero</strong>.
          </li>
          <li>
            En el mensaje, indicá el <strong>número de teléfono</strong> con el que iniciás sesión en la
            app (incluí código de país, por ejemplo +54 9 387 500 0000).
          </li>
          <li>
            Opcional: podés agregar tu nombre tal como figura en la app para ayudarnos a identificar la
            cuenta.
          </li>
          <li>
            Confirmaremos la recepción de tu solicitud por correo electrónico. Procesaremos la eliminación
            en un plazo máximo de <strong>30 días hábiles</strong>.
          </li>
          <li>
            Si tenés la app instalada, podés cerrar sesión desde <strong>Perfil → Cerrar sesión</strong>{' '}
            después de enviar la solicitud. La eliminación en nuestros servidores se realiza cuando
            confirmemos tu pedido.
          </li>
        </ol>
        <p>
          Solo el titular del número de teléfono registrado (o su representante legal, con documentación
          que lo acredite) puede solicitar la eliminación.
        </p>
      </>
    ),
  },
  {
    id: 'eliminamos',
    title: '3. Datos que eliminamos',
    content: (
      <>
        <p>Cuando procesamos tu solicitud, borramos o desvinculamos, entre otros:</p>
        <ul>
          <li>Sesiones de acceso activas en la app.</li>
          <li>Códigos de verificación pendientes (OTP).</li>
          <li>Tokens de notificaciones push asociados a tu teléfono.</li>
          <li>Nombre de perfil vinculado a tu cuenta.</li>
          <li>Datos de cuenta almacenados en nuestros servidores para el inicio de sesión.</li>
        </ul>
        <p>
          Los datos que guardás solo en tu dispositivo (por ejemplo, sesión local o direcciones recientes)
          podés borrarlos desinstalando la app o limpiando los datos de la aplicación desde la
          configuración de Android.
        </p>
      </>
    ),
  },
  {
    id: 'conservamos',
    title: '4. Datos que podemos conservar',
    content: (
      <>
        <p>
          Por obligaciones legales, contables, de seguridad o para resolver disputas, podemos conservar
          algunos registros aunque elimines tu cuenta:
        </p>
        <ul>
          <li>
            <strong>Historial de viajes</strong> (origen, destino, fechas, estados, tarifas y teléfono
            asociado al viaje): hasta <strong>5 años</strong> desde la fecha del viaje, o el plazo que
            exija la normativa aplicable.
          </li>
          <li>
            <strong>Mensajes de WhatsApp</strong> con nuestro servicio de reservas, si los enviaste:
            hasta <strong>2 años</strong> para atención al cliente y mejora del servicio, salvo obligación
            legal de conservarlos por más tiempo.
          </li>
          <li>
            <strong>Registros técnicos y de seguridad</strong> (por ejemplo, logs de acceso anonimizados
            o agregados): hasta <strong>12 meses</strong>.
          </li>
        </ul>
        <p>
          Cuando la ley lo permita, anonimizamos la información conservada de forma que no permita
          identificarte directamente.
        </p>
      </>
    ),
  },
  {
    id: 'derechos',
    title: '5. Más información',
    content: (
      <p>
        Para conocer cómo tratamos tus datos en general, consultá nuestra{' '}
        <a href="/privacidad">Política de Privacidad</a>. Para ejercer otros derechos (acceso,
        rectificación, etc.) escribinos a{' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    ),
  },
];

export default function EliminacionCuentaPage() {
  return (
    <div className="legal-page fixed inset-0 overflow-y-auto overscroll-y-contain bg-[#f8f9fb] text-[#0F172A]">
      <style>{`
        .legal-page { -webkit-overflow-scrolling: touch; }
        .legal-page a { color: #1d2260; text-decoration: underline; text-underline-offset: 2px; }
        .legal-page a:hover { color: #2e3699; }
        .legal-page h3 { margin: 1.25rem 0 0.5rem; font-size: 0.95rem; font-weight: 600; color: #334155; }
        .legal-page ul, .legal-page ol { margin: 0.75rem 0; }
        .legal-page li { margin: 0.35rem 0; line-height: 1.6; }
        .legal-page p { margin: 0.75rem 0; line-height: 1.65; color: #334155; }
        .legal-page p:first-child { margin-top: 0; }
        .legal-page code { font-size: 0.85em; background: #f1f5f9; padding: 0.1rem 0.35rem; border-radius: 4px; }
      `}</style>

      <header className="border-b border-[#E2E8F0] bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-5 sm:px-6">
          <img src="/logo.png" alt="Profesional App" className="h-9 w-auto max-w-[132px] object-contain" />
          <span className="text-xs font-medium uppercase tracking-wide text-[#94A3B8]">Legal</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-10 sm:px-6 sm:py-14">
        <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-[#1d2260]">
          Profesional Pasajero
        </p>
        <h1 className="mb-3 text-3xl font-extrabold tracking-tight text-[#0F172A] sm:text-4xl">
          Eliminación de cuenta y datos
        </h1>
        <p className="mb-10 max-w-2xl text-base text-[#64748B]">
          Instrucciones para solicitar que borremos tu cuenta de la app <strong>Profesional Pasajero</strong>{' '}
          y los datos personales asociados, conforme a la Ley 25.326 de Protección de Datos Personales
          (Argentina).
        </p>
        <p className="mb-12 text-sm text-[#94A3B8]">
          Última actualización: 28 de junio de 2026
        </p>

        <div className="mb-12 rounded-2xl border border-[#1d2260]/20 bg-[#1d2260]/5 p-5 sm:p-6">
          <p className="mb-2 text-sm font-semibold text-[#1d2260]">Resumen rápido</p>
          <p className="text-[15px] text-[#334155]">
            Escribí a{' '}
            <a href={`mailto:${CONTACT_EMAIL}?subject=Eliminación%20de%20cuenta%20-%20Profesional%20Pasajero`}>
              {CONTACT_EMAIL}
            </a>{' '}
            con el asunto <strong>Eliminación de cuenta - Profesional Pasajero</strong> e incluí tu número
            de teléfono registrado en la app.
          </p>
        </div>

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
          Profesional Pasajero · Profesional App · Salta Capital, Argentina
        </p>
        <p className="mt-1 text-sm">
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          {' · '}
          <a href="/privacidad">Política de privacidad</a>
        </p>
      </footer>
    </div>
  );
}
