/**
 * Webhook parametrizado por teléfono de negocio (línea whatsmeow).
 *
 * Ejemplos:
 *   POST /api/Agente_IA/5493873088777
 *
 * Cada línea: WHATSMEOW_PHONE + WHATSMEOW_AGENT_CODE (+ _2, …) o WHATSMEOW_LINES JSON.
 * El cron de Vercel sigue en /api/Agente_IA (sin slug).
 */
export { maxDuration, dynamic, runtime, POST, GET } from '../route';
