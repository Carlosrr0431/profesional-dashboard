/**
 * Webhook parametrizado por teléfono de negocio (línea whatsmeow).
 *
 * Mismo handler que /api/Agente_IA: saludo de Betto, pedido de calle y altura
 * o ubicación GPS, y el resto del agente. Ambas líneas:
 *   POST /api/Agente_IA/5493873088777   (Profesional_1)
 *   POST /api/Agente_IA/5493872138777   (Profesional_Pasajeros)
 *
 * Cada línea: WHATSMEOW_PHONE + WHATSMEOW_AGENT_CODE (+ _2, …) o WHATSMEOW_LINES JSON.
 * El cron de Vercel sigue en /api/Agente_IA (sin slug).
 */
export { maxDuration, dynamic, runtime, POST, GET } from '../route';
