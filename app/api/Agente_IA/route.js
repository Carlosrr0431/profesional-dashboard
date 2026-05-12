import OpenAI, { toFile } from 'openai';
import { createClient } from '@supabase/supabase-js';
import {
  getFirebaseMessagingClient,
  isFirebaseCredentialError,
  isLegacyExpoPushToken,
  isLikelyFcmToken,
  normalizeFcmDataPayload,
  normalizeFirebaseSendError,
} from '../../../src/lib/firebaseAdmin';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ACCUMULATION_MS = Number(process.env.WHATSAPP_ACCUMULATION_MS || 40000);
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const WASENDER_API_KEY = process.env.WASENDER_API_KEY || '';
const WASENDER_BASE_URL = process.env.WASENDER_BASE_URL || 'https://www.wasenderapi.com/api';
const TRACKING_BASE_URL = process.env.TRACKING_BASE_URL || 'https://profesional-dashboard.vercel.app';
const SUPABASE_PUBLIC_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://gnqewqtpvygnkxryyaij.supabase.co';
const SUPABASE_PUBLIC_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImducWV3cXRwdnlnbmt4cnl5YWlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjY1ODA5MzksImV4cCI6MjA0MjE1NjkzOX0.WodtkWTtLzGNeEgPcRUuR_rJjHoGn3aDBhBDbmkYKEk';
const LEGACY_CHAT_OWNER = process.env.WHATSAPP_CHAT_OWNER || 'Profesional_App';
const CRON_SECRET = process.env.CRON_SECRET || '';
const WHATSAPP_TRIP_TRANSITION_SECRET = process.env.WHATSAPP_TRIP_TRANSITION_SECRET || '';
const ALLOWED_PHONES = new Set(['5493878630173']);
const IS_SERVERLESS = Boolean(process.env.VERCEL);
const IMMEDIATE_PROCESSING =
  (process.env.WHATSAPP_IMMEDIATE_PROCESSING || '').toLowerCase() === 'true';
const SUPABASE_DISPATCH_ONLY =
  (process.env.WHATSAPP_SUPABASE_DISPATCH_ONLY || 'true').toLowerCase() !== 'false';

const ACTIVE_TRIP_STATUSES = ['accepted', 'going_to_pickup', 'in_progress'];
const OPEN_TRIP_STATUSES = ['queued', 'pending', ...ACTIVE_TRIP_STATUSES];
const DRIVER_BUSY_TRIP_STATUSES = ['pending', ...ACTIVE_TRIP_STATUSES];
const PENDING_GUARD_MAX_AGE_MINUTES = Number(process.env.WHATSAPP_PENDING_GUARD_MAX_AGE_MINUTES || 5);
const DRIVER_PENDING_BUSY_MAX_AGE_MINUTES = Number(process.env.WHATSAPP_DRIVER_PENDING_BUSY_MAX_AGE_MINUTES || 5);
const processingTimers = new Map();
const pendingTimeoutTimers = new Map();
const passengerLifecycleFollowupMemory = new Map();
const driverWhatsappNotifyMemory = new Map();
const UPSERT_ONLY = (process.env.WHATSAPP_UPSERT_ONLY || 'true').toLowerCase() !== 'false';
// Perfil de expansión progresiva inspirado en marketplaces de movilidad.
// Mantiene 1km/2km al inicio y luego abre anillos cada 15s.
const SEARCH_RADII_KM = [1, 2, 3, 4.5, 6, 8, 10, 12, 15, 20];
const SALTA_CAPITAL_CENTER = { lat: -24.7829, lng: -65.4122 };
const SALTA_CAPITAL_PRIORITY_RADIUS_KM = Math.max(
  6,
  Number(process.env.WHATSAPP_SALTA_CAPITAL_PRIORITY_RADIUS_KM || 18) || 18
);

const DEFAULT_PENDING_ACCEPT_TIMEOUT_MS = 60 * 1000;
const MIN_PENDING_ACCEPT_TIMEOUT_MS = 20 * 1000;
const MAX_PENDING_ACCEPT_TIMEOUT_MS = 5 * 60 * 1000;
const configuredPendingAcceptTimeoutMs = Number(
  process.env.WHATSAPP_PENDING_ACCEPT_TIMEOUT_MS || DEFAULT_PENDING_ACCEPT_TIMEOUT_MS
);
const PENDING_ACCEPT_TIMEOUT_MS = Number.isFinite(configuredPendingAcceptTimeoutMs)
  ? Math.max(
    MIN_PENDING_ACCEPT_TIMEOUT_MS,
    Math.min(MAX_PENDING_ACCEPT_TIMEOUT_MS, Math.round(configuredPendingAcceptTimeoutMs))
  )
  : DEFAULT_PENDING_ACCEPT_TIMEOUT_MS;
const PENDING_TIMEOUT_CANCEL_REASON = '[AUTO_TIMEOUT] Chofer no aceptó en tiempo (auto-reasignación)';
const DRIVER_SEARCH_EXPANSION_INTERVAL_MS = 15 * 1000;
const REASSIGNMENT_LOOKBACK_HOURS = 2;
const DRIVER_RELIABILITY_LOOKBACK_HOURS = 6;
const AUTO_TIMEOUT_SCORE_PENALTY_KM = 0.9;
const CANCEL_SCORE_PENALTY_KM = 0.25;
const NO_PUSH_TOKEN_SCORE_PENALTY_KM = 0.35;
const MAX_RELIABILITY_SCORE_PENALTY_KM = 3.5;
const DEFAULT_PASSENGER_LIFECYCLE_FOLLOWUP_MIN_INTERVAL_MS = 8 * 60 * 1000;
const PASSENGER_LIFECYCLE_FOLLOWUP_MIN_INTERVAL_MS = Math.max(
  60 * 1000,
  Number(
    process.env.WHATSAPP_PASSENGER_LIFECYCLE_FOLLOWUP_MIN_INTERVAL_MS ||
      DEFAULT_PASSENGER_LIFECYCLE_FOLLOWUP_MIN_INTERVAL_MS
  ) || DEFAULT_PASSENGER_LIFECYCLE_FOLLOWUP_MIN_INTERVAL_MS
);
const DEFAULT_DRIVER_WHATSAPP_NOTIFY_MIN_INTERVAL_MS = 5 * 60 * 1000;
const DRIVER_WHATSAPP_NOTIFY_MIN_INTERVAL_MS = Math.max(
  30 * 1000,
  Number(
    process.env.WHATSAPP_DRIVER_NOTIFY_MIN_INTERVAL_MS ||
      DEFAULT_DRIVER_WHATSAPP_NOTIFY_MIN_INTERVAL_MS
  ) || DEFAULT_DRIVER_WHATSAPP_NOTIFY_MIN_INTERVAL_MS
);
const ENABLE_PENDING_TIMEOUT_TIMER =
  process.env.NODE_ENV !== 'test' &&
  (process.env.WHATSAPP_ENABLE_PENDING_TIMEOUT_TIMER || 'true').toLowerCase() !== 'false';
const PUSH_NOTIFICATIONS_ENABLED =
  (process.env.WHATSAPP_PUSH_ENABLED || 'true').toLowerCase() !== 'false';
const QUEUE_DISPATCH_LOCK_SECONDS = Math.max(
  10,
  Number(process.env.WHATSAPP_QUEUE_LOCK_SECONDS || 25) || 25
);
const QUEUE_DISPATCH_RETRY_SECONDS = Math.max(
  3,
  Number(process.env.WHATSAPP_QUEUE_RETRY_SECONDS || 12) || 12
);
const QUEUE_DISPATCH_NOTIFY_FAIL_RETRY_SECONDS = Math.max(
  QUEUE_DISPATCH_RETRY_SECONDS,
  Number(process.env.WHATSAPP_QUEUE_NOTIFY_FAIL_RETRY_SECONDS || 45) || 45
);
const PUSH_PROVIDER_BACKOFF_MS = Math.max(
  60 * 1000,
  Number(process.env.WHATSAPP_PUSH_PROVIDER_BACKOFF_MS || 10 * 60 * 1000) || 10 * 60 * 1000
);
const QUEUE_DISPATCH_WORKER_ID = [
  process.env.VERCEL_REGION || 'local',
  process.env.VERCEL_ENV || process.env.NODE_ENV || 'dev',
  process.pid || 'pid',
].join(':');

let warmed = false;
let supabaseClient = null;
let openaiClient = null;
let knowledgeSupabaseClient = null;
let queueDispatchRpcAvailable = null;
let pushProviderBackoffUntil = 0;
let globalAddressKnowledgeCache = {
  expiresAt: 0,
  addresses: [],
};

const GLOBAL_KNOWLEDGE_TTL_MS = 5 * 60 * 1000;
const MAX_GLOBAL_KNOWLEDGE_MESSAGES = 1500;
const MAX_PHONE_KNOWLEDGE_MESSAGES = 300;
const MAX_KNOWLEDGE_ADDRESSES = 18;
const SALTA_STREETS_SOURCE_URL = 'https://codigo-postal.co/argentina/salta/calles-de-salta/';
const SALTA_STREETS_TTL_MS = 24 * 60 * 60 * 1000;

const SALTA_STREETS_FALLBACK = [
  // Fechas patrias y números
  'Calle 1 de Marzo',
  'Calle 10 de Octubre',
  'Calle 12 de Octubre',
  'Avenida 13 de Julio',
  'Avenida 16 de Septiembre',
  'Calle 17 de Agosto',
  'Avenida 17 de Junio',
  'Calle 2 de Abril',
  'Calle 20 de Febrero',
  'Avenida 20 de Junio',
  'Calle 25 de Mayo',
  'Pasaje 3 de Febrero',
  'Calle 7 de Noviembre',
  'Diagonal 9 de Julio',
  'Calle 9 de Julio',
  // A
  'Calle A Boutel',
  'Calle A Choque',
  'Calle A Lincoln',
  'Calle A M de Nievas',
  'Calle Aaron de Anchorena',
  'Calle Abel Gomez Rincon',
  'Calle Abel Pereyra',
  'Calle Abraham Cornejo',
  'Calle Acambuco',
  'Pasaje Acheral',
  'Calle Acuña',
  'Calle Adan Quiroga',
  'Pasaje Adolfo Angel Basso',
  'Pasaje Aguaray',
  'Calle Aguas Blancas',
  'Calle Agustin Magaldi',
  'Calle Agustin Usandivaras',
  'Calle Alaska',
  'Calle Alberdi',
  'Avenida Albert Einstein',
  'Calle Alberto Ascari',
  'Calle Alberto Logulo',
  'Calle Alcides Juares Telles',
  'Calle Alejandro Benitez',
  'Calle Alejandro Fabregas',
  'Calle Alejandro Gallardo',
  'Calle Alejandro Graham Bell',
  'Pasaje Alejandro M de Aguado',
  'Calle Alexander Fleming',
  'Pasaje Almafuerte',
  'Calle Alte Emilio Berisso',
  'Calle Alte Francisco Segui',
  'Calle Alte G Brown',
  'Calle Alte Manuel D Garcia',
  'Calle Alte Onofre Betbeder',
  'Calle Alvarado',
  'Calle Alvarez Condarco',
  'Calle Alvarez Thomas',
  'Calle Amadeo Sirolli',
  'Calle Amalia Aybar',
  'Calle Ana Albeza',
  'Calle Andres de Mestre',
  'Calle Andres Mendieta',
  'Calle Andres Paz',
  'Pasaje Angastaco',
  'Calle Angel de Rosa',
  'Calle Angel Lovalvo',
  'Diagonal Angel Maria Figueroa',
  'Calle Angel Vargas',
  'Calle Angelica Cresseri de Correa',
  'Pasaje Anta',
  'Pasaje Antartida Argentina',
  'Calle Antonio Alice',
  'Calle Antonio Alvarez Jonte',
  'Calle Antonio M Feijoo',
  'Pasaje Apolinario Echeverria',
  'Pasaje Apolinario Figueroa',
  'Calle Apolinario Saravia',
  'Calle Araoz Castellanos',
  'Calle Argentino Medina',
  'Calle Arias Velazquez',
  'Avenida Armada Argentina',
  'Calle Arteaga Serapion',
  'Pasaje Arturo Capdevila',
  'Calle Arturo Gambolini',
  'Pasaje Arturo Gambolini',
  'Calle Arturo Peñaloza',
  'Pasaje Aurelio Arevalo',
  'Avenida Autodromo',
  'Calle Avelino Araoz',
  'Pasaje Avelino Figueroa',
  'Calle Ayacucho',
  'Pasaje Ayohuma',
  'Calle Ayuntamiento Albox',
  'Calle Azopardo',
  'Calle Azufre',
  // B
  'Calle Bahia Blanca',
  'Calle Balbino Zaporta',
  'Calle Balcarce',
  'Pasaje Baldomero Castro',
  'Calle Bariloche',
  'Calle Bartolome Valero',
  'Pasaje Bat de Cancha Rayada',
  'Calle Bat de Pavon',
  'Avenida Bat de Salta',
  'Calle Bat Vuelta de Obligado',
  'Calle Bdier Antonio Balcarce',
  'Calle Bdier Facundo Quiroga',
  'Pasaje Bdier Felipe Heredia',
  'Avenida Bdier J M de Rosas',
  'Avenida Belgica',
  'Avenida Belgrano',
  'Pasaje Benedicto Campos',
  'Pasaje Benita Campos',
  'Calle Benito Perez Galdos',
  'Calle Benjamin Araoz',
  'Calle Bernardino Oliveres',
  'Calle Bernardino Rivadavia',
  'Pasaje Bernardo Frias',
  'Calle Betania',
  'Avenida Bicentenario',
  'Pasaje Blanco Encalada',
  'Calle Blanco Gabino',
  'Pasaje Bolivia',
  'Avenida Bolivia',
  'Avenida Boulogne Sur Mer',
  'Calle Brasil',
  'Pasaje Brealito',
  'Calle Brillante',
  'Calle Bucci Clemar',
  'Calle Buenos Aires',
  // C
  'Calle C Barbaran Alvarado',
  'Calle C Gardel',
  'Calle C Gollins',
  'Calle C Matorras Cornejo',
  'Calle C P Segura',
  'Pasaje Cabildo',
  'Calle Cabo 1Ro P Guanca',
  'Calle Cabo 2Do Jose F Chaile',
  'Calle Cabo 2Do Luis Flores',
  'Pasaje Cabo Ppal Alancay',
  'Pasaje Cachi',
  'Calle Cachi',
  'Calle Cadena de Hessling',
  'Pasaje Cafayate',
  'Pasaje Caipe',
  'Pasaje Calchaqui',
  'Calle Calcuta',
  'Pasaje Calderon de la Barca',
  'Calle Calicuchina',
  'Pasaje Calixto Gauna',
  'Calle Calixto Linares Fowlis',
  'Camino A Atocha',
  'Calle Campos',
  'Avenida Canada',
  'Pasaje Cañada de la Horqueta',
  'Calle Canonigo Gorriti',
  'Calle Canonigo Hinojosa',
  'Calle Cantores del Alba',
  'Pasaje Cap Chanchorra',
  'Calle Cap de Fgta P Giachino',
  'Calle Cap H Viola',
  'Pasaje Cap Jose Antonio Ruiz',
  'Pasaje Cap Justo G Bermudez',
  'Calle Cap Luis C Candelaria',
  'Calle Cap Marcelino Cornejo',
  'Calle Cap Miguel A Keller',
  'Calle Cap Miguel Angel Paiva',
  'Calle Cap Valentin Cordoba',
  'Calle Capital Federal',
  'Calle Capitan Gonzalez',
  'Calle Carlos A Casafoust',
  'Calle Carlos Belgrano',
  'Calle Carlos del Castillo',
  'Calle Carlos H Scarcella',
  'Pasaje Carlos Maria Saravia',
  'Calle Carlos Menditegui',
  'Calle Carlos Pellegrini',
  'Calle Carlos Xamena',
  'Calle Carlos Zatucek',
  'Calle Carmelo Bevacqua',
  'Calle Carmen Niño',
  'Calle Carmen Puch de Guemes',
  'Calle Carmen Salas',
  'Calle Carmen Toribia Torena',
  'Calle Cartero Bruno Ramirez',
  'Calle Caseros',
  'Pasaje Casiano Hoyos',
  'Calle Catamarca',
  'Calle Cbo 1Ro Jose Maldonado',
  'Pasaje Cbo Farina',
  'Calle Cbo Orlando A Moya',
  'Calle Cbo Ppal Luis Ramirez',
  'Avenida Cdad de Asuncion',
  'Calle Cdad de Rosario',
  'Calle Cdad de Rosas',
  'Pasaje Celedonio Molina',
  'Pasaje Cerrillos',
  'Calle Cerro Acay',
  'Calle Cerro Aracan',
  'Calle Cerro Bola',
  'Calle Cerro Creston',
  'Calle Cerro Minero',
  'Calle Cerro Negro',
  'Calle Cerro Queval',
  'Calle Cerro Rincon',
  'Calle Cerro San Bernardo',
  'Calle Cerro Soyano',
  'Pasaje Cesar Diaz Peralta',
  'Calle Cesar F Perdiguero',
  'Calle Chacabuco',
  'Calle Chacho Peñaloza',
  'Pasaje Chaco',
  'Calle Chaco',
  'Calle Chalchaleros',
  'Pasaje Chasquis de la Patria',
  'Calle Chazarreta',
  'Calle Checoslovaquia',
  'Pasaje Chicoana',
  'Avenida Chile',
  'Calle Chubut',
  'Avenida Circunvalacion',
  'Pasaje Clase 63',
  'Calle Clase 63',
  'Pasaje Cmte Juan M Cabot',
  'Calle Cmte Luis Piedrabuena',
  'Calle Cmte Melecio Frias',
  'Calle Cnel A Carpani Costa',
  'Calle Cnel Alvarez Prado',
  'Calle Cnel Angel M Zerda',
  'Pasaje Cnel Antonio Saravia',
  'Calle Cnel Borja Diaz',
  'Calle Cnel Carlos Forest',
  'Calle Cnel de Marina Rosales',
  'Calle Cnel Federico Brandsen',
  'Calle Cnel Fernandez Cornejo',
  'Pasaje Cnel Francisco Velarde',
  'Calle Cnel Ibazeta',
  'Calle Cnel Ignacio Pedriel',
  'Avenida Cnel Jorge Vidt',
  'Calle Cnel Jose A Rojas',
  'Calle Cnel Jose E Mendez',
  'Pasaje Cnel Jose F Bogado',
  'Calle Cnel Jose Moldes',
  'Calle Cnel Jose Superi',
  'Calle Cnel Juan E Dalla Fontana',
  'Calle Cnel Juan Jose Cornejo',
  'Calle Cnel Juan Pringles',
  'Calle Cnel Juan Quesada',
  'Calle Cnel Juan Sola',
  'Calle Cnel Luis Burela',
  'Calle Cnel Luis Fabregas',
  'Calle Cnel M Freyre',
  'Calle Cnel Manuel Dorrego',
  'Calle Cnel Manuel Rojas',
  'Pasaje Cnel Mateo Rios',
  'Calle Cnel Miguel Di Pasquo',
  'Pasaje Cnel Nicanor Arias',
  'Calle Cnel Olascoaga',
  'Calle Cnel Pachi Gorriti',
  'Pasaje Cnel Pedro Conde',
  'Calle Cnel Pedro J Saravia',
  'Pasaje Cnel Ramon Castillo',
  'Calle Cnel Ricardo Ibazeta',
  'Calle Cnel Roberto Echegoyen',
  'Calle Cnel Suarez',
  'Avenida Cnel Suarez',
  'Pasaje Cnel Toribio Tedin',
  'Pasaje Cnel Vicente Torino',
  'Calle Cnel Vidt',
  'Pasaje Cnel Zelaya',
  'Calle Colombia',
  'Pasaje Comb de las Piedras',
  'Calle Combate de los Pozos',
  'Calle Comodoro Rivadavia',
  'Calle Congreso',
  'Calle Constancio C Vigil',
  'Calle Constitucion',
  'Avenida Constitucion Nacional',
  'Pasaje Constituyentes',
  'Calle Cordoba',
  'Calle Corina Lona',
  'Calle Corina Martinez',
  'Calle Cornejo',
  'Calle Corrientes',
  'Calle Cortez',
  'Pasaje Cosquin',
  'Calle Costa Rica',
  'Avenida Costanera',
  'Calle Cresseri de Correa',
  'Calle Cristobal Colon',
  'Calle Cuba',
  'Calle Cuellar Davalos',
  // D
  'Calle D el Independiente',
  'Calle D el Litoral Santa Fe',
  'Calle D el Territ Misiones',
  'Calle D la Nueva Provincia',
  'Calle D la Voz del Interior',
  'Calle D Oro Ansansa',
  'Calle Daimo Bojanich',
  'Calle Damaso Uriburo',
  'Calle Damian M Torino',
  'Pasaje Daniel Frias',
  'Calle Davalos',
  'Calle David Lezcano',
  'Calle David Saravia Castro',
  'Calle David Zambrano',
  'Avenida De la Libertad',
  'Avenida De la Paz',
  'Calle De la Quintana',
  'Avenida De las Americas',
  'Pasaje De las Artes',
  'Calle De las Tuscas',
  'Pasaje De los Arrieros',
  'Pasaje De los Artesanos',
  'Pasaje De los Baqueanos',
  'Calle De los Decididos',
  'Avenida De los Incas',
  'Pasaje De los Jesuitas',
  'Avenida De los Jockey',
  'Calle De los Partidarios',
  'Calle Dean Funes',
  'Avenida Del Golf',
  'Avenida Del Libertador',
  'Calle Del Milagro',
  'Pasaje Del Sol',
  'Pasaje Del Temple',
  'Avenida Del Trabajo',
  'Avenida Del Turista',
  'Diagonal Del Valle Larragure',
  'Calle Delfin Huergo',
  'Calle Delfin Leguizamon',
  'Calle Dennys Ruiz',
  'Calle Diamante',
  'Calle Diario Cronica',
  'Calle Diario Cuyo',
  'Calle Diario el Clarin',
  'Calle Diario el Dia',
  'Calle Diario el Fueguino',
  'Calle Diario el Liberal',
  'Calle Diario el Litoral',
  'Calle Diario el Pregon',
  'Calle Diario el Territorio',
  'Calle Diario Esquel',
  'Calle Diario General Roca',
  'Calle Diario la Arena',
  'Calle Diario la Capital',
  'Calle Diario la Gaceta',
  'Calle Diario la Nacion',
  'Avenida Diario la Opinion',
  'Calle Diario la Opinion',
  'Calle Diario la Union',
  'Calle Diario los Andes',
  'Calle Diario los Principios',
  'Pasaje Diego de Rojas',
  'Calle Diego Diez Gomez',
  'Calle Dinamarca',
  'Pasaje Dique Itiyuro',
  'Calle Domingo D Isasmendi',
  'Pasaje Domingo de Basavilbaso',
  'Avenida Domingo F Sarmiento',
  'Calle Domingo Guemes',
  'Calle Domingo Marimon',
  'Pasaje Domingo Matheu',
  // Dr
  'Calle Dr A Alsina',
  'Pasaje Dr Aaron Castellanos',
  'Calle Dr Abraham Fernandez',
  'Calle Dr Adolfo Guemes',
  'Calle Dr Alfredo Palacios',
  'Calle Dr Amancio Pardo',
  'Calle Dr Amaro Moron Jimenez',
  'Calle Dr Aniceto Latorre',
  'Calle Dr Antonio Ortelli',
  'Calle Dr Apolonio Ormachea',
  'Calle Dr Arturo Jauretche',
  'Calle Dr Arturo L Davalos',
  'Calle Dr Arturo Oñativia',
  'Pasaje Dr Augusto Cortazar',
  'Calle Dr Benito Graña',
  'Pasaje Dr Benjamin N Figueroa',
  'Pasaje Dr Benjamin Zorrilla',
  'Pasaje Dr Bernabe Lopez',
  'Avenida Dr Bernardo Houssay',
  'Pasaje Dr Carlos Costas',
  'Pasaje Dr Carlos Ibarguren',
  'Calle Dr Carlos Serrey',
  'Pasaje Dr Cleto Aguirre',
  'Calle Dr Danilo Bonari',
  'Calle Dr Dionisio Ramos',
  'Calle Dr Eduardo Wilde',
  'Calle Dr Elio Alderete',
  'Calle Dr F Ameghino',
  'Avenida Dr F de Gurruchaga',
  'Calle Dr Facundo de Zuviria',
  'Calle Dr Federico Ibarguren',
  'Calle Dr Francisco Arias',
  'Calle Dr Francisco Cabrera',
  'Calle Dr Francisco Muñiz',
  'Pasaje Dr Gabriel Pulo',
  'Calle Dr Gregorio Marañon',
  'Calle Dr Humberto Canepa',
  'Calle Dr Indalecio Gomez',
  'Calle Dr Joaquin Perez',
  'Calle Dr Jose Astigueta',
  'Calle Dr Jose E Uriburu',
  'Calle Dr Jose Hilario Tedin',
  'Calle Dr Jose Vicente Sola',
  'Calle Dr Jose W Tobias',
  'Calle Dr Juan A Fernandez',
  'Pasaje Dr Juan B Peñalva',
  'Avenida Dr Juan Bautista Justo',
  'Calle Dr Juan Brigido Teran',
  'Calle Dr Juan Jose Paso',
  'Calle Dr Juan Monge y Ortega',
  'Avenida Dr Juan Usandivaras',
  'Pasaje Dr Julio Cintioni',
  'Pasaje Dr Lisandro de la Torre',
  'Avenida Dr Lisandro de la Torre',
  'Calle Dr Luis Agote',
  'Avenida Dr Luis Guemes',
  'Calle Dr Luis Linares',
  'Pasaje Dr M Silvester',
  'Calle Dr Manuel Anzoategui',
  'Calle Dr Manuel de Acevedo',
  'Calle Dr Mariano Boedo',
  'Calle Dr Mariano Moreno',
  'Avenida Dr Mariano Moreno',
  'Calle Dr Martin G Guemes',
  'Calle Dr Miguel s Ortiz',
  'Calle Dr Miguel Sola',
  'Calle Dr Moises Gonorazky',
  'Calle Dr Nicolas Avellaneda',
  'Pasaje Dr Papi Aristene',
  'Calle Dr Patricio Fleming',
  'Calle Dr Pedro Antonio Pardo',
  'Avenida Dr R Patron Costas',
  'Avenida Dr Ricardo Balbin',
  'Pasaje Dr Ricardo Rojas',
  'Calle Dr Ricardo San Millan',
  'Pasaje Dr Sidney Tamayo',
  'Calle Dr Tomas Godoy Cruz',
  'Avenida Dr V de la Plaza',
  'Avenida Dr Velez Sarsfield',
  // E
  'Calle E Arana',
  'Calle E Cornejo Saravia',
  'Calle E Diaz Saenz Valiente',
  'Calle E Janin',
  'Calle E Juncosa',
  'Calle E Martinez Estrada',
  'Calle E Santos Discepolo',
  'Avenida E Santos Discepolo',
  'Calle Ecuador',
  'Pasaje Edelmiro Avellaneda',
  'Calle Eduardo Gauna',
  'Calle Eduardo Paz Chain Dr',
  'Avenida Ejercito Argentino',
  'Avenida Ejercito de los Andes',
  'Avenida Ejercito del Norte',
  'Calle El Aybal de San Luis',
  'Pasaje El Carmen',
  'Calle El Chaja',
  'Calle El Comercio',
  'Calle El Condor',
  'Calle El Creston',
  'Calle El Diario',
  'Calle El Diario San Luis',
  'Pasaje El Inca',
  'Pasaje El Jardin',
  'Calle El Mirador',
  'Calle El Ñandu',
  'Calle El Norte',
  'Calle El Pavo Real',
  'Calle El Tronador',
  'Calle El Tunal',
  'Calle Elisa Lopez del Val',
  'Calle Eliseo Outes',
  'Calle Emilia Wierna',
  'Calle Emilio Maroco',
  'Calle Emma Sola de Sola',
  'Avenida Eneida Delgadillo',
  'Pasaje Enrique Torino',
  'Avenida Entre Rios',
  'Calle Entre Rios',
  'Calle Eric Bonan',
  'Calle Ernesto Clerico',
  'Calle Ernesto Diaz Villalba',
  'Calle Ernesto H Blanco',
  'Pasaje Ernesto Sola',
  'Pasaje Esc de los Infernales',
  'Avenida Escalada de San Martin',
  'Pasaje Escuadr de los Gauchos',
  'Calle Esmeralda',
  'Calle España',
  'Calle Estados Unidos',
  'Calle Estanislao Lopez',
  'Calle Esteban de Luca',
  'Calle Esteban Echeverria',
  'Avenida Esteban Sokol',
  'Avenida Esteco',
  'Calle Estefano Nasif',
  'Pasaje Eugenio Caballero',
  'Calle Eusebio Marcilla',
  'Avenida Ex Combat de Malvinas',
  'Calle Ezeiza',
  // F
  'Calle F C de San Millan',
  'Calle F Gomez de Vidaurre',
  'Calle F Marquez Miranda',
  'Calle F Toledo y Pimentel',
  'Pasaje Falucho',
  'Calle Farat Sire Salim',
  'Calle Fausto Burgos',
  'Calle Fca la Vervena',
  'Pasaje Federico Gauffin',
  'Avenida Federico Lacroze',
  'Calle Feliciano Chiclana',
  'Pasaje Felipe Lopez',
  'Calle Felipe Vallese',
  'Calle Felipe Varela',
  'Calle Fernandez de la Cruz',
  'Calle Fgta Libertad',
  'Calle Fgta Pte Sarmiento',
  'Calle Figueroa',
  'Calle Figueroa de Sola',
  'Calle Filiberto Meneses',
  'Pasaje Flavio Garcia',
  'Calle Florentino Serrey',
  'Calle Florida',
  'Calle Formosa',
  'Calle Francia',
  'Calle Francisco Beiro',
  'Calle Francisco Canaro',
  'Calle Francisco Castro',
  'Calle Francisco Centeno',
  'Calle Francisco de Aguirre',
  'Calle Francisco de Miranda',
  'Calle Francisco Fernandez',
  'Calle Francisco G Arias',
  'Pasaje Francisco Javier Ortiz',
  'Pasaje Francisco Peralta',
  'Calle Francisco Uriburu',
  'Calle Fray J de Collalunga',
  'Calle Fray J Puig Dengolas',
  'Calle Fray Juan de la Zerda',
  'Avenida Fray Luis Beltran',
  'Calle Fray Luis Beltran',
  'Calle Fray Mamerto Esquiu',
  'Calle Fray Pistoia',
  'Pasaje Fray Sta Maria de Oro',
  'Avenida Fuerza Aerea',
  // G
  'Calle G Cornejo de Medeiro',
  'Pasaje Gabino Sardina',
  'Calle Gabriel Gomez Recio',
  'Calle Garcia Lorca',
  'Calle Gato y Mancha',
  'Avenida Gaucho Mendez',
  'Calle Gaufin Decabada',
  'Pasaje Gdero Baigorria',
  'Calle Gdor Gregores',
  'Avenida Gdor Roberto Romero',
  'Pasaje Gdor Sixto Ovejero',
  'Calle Gelly Obes',
  'Calle Gendarmeria Nacional',
  'Calle George Washington',
  'Calle German Buch',
  'Pasaje Geronimo Lopez',
  'Pasaje Getulio Vargas',
  'Calle Gimenez Zapiola',
  'Pasaje Gonzalo de Abreu',
  'Calle Gral A C Costas',
  'Calle Gral Angel Pacheco',
  'Calle Gral Anselmo Rojo',
  'Calle Gral Antonio Parodi',
  'Avenida Gral Arenales',
  'Calle Gral Arenales',
  'Calle Gral Arias Rengel',
  'Calle Gral Brig C Cardozo',
  'Calle Gral Cornelio Saavedra',
  'Calle Gral Diaz Velez',
  'Avenida Gral Dionisio Puch',
  'Pasaje Gral E Mosconi',
  'Calle Gral Enrique Martinez',
  'Calle Gral Eustaquio Frias',
  'Pasaje Gral F de Uriondo',
  'Calle Gral F de Uriondo',
  'Calle Gral Federico Rauch',
  'Calle Gral Francisco Ramirez',
  'Calle Gral Francisco Velez',
  'Pasaje Gral Gregorio Velez',
  'Avenida Gral Guemes',
  'Calle Gral Guemes',
  'Calle Gral J J de Urquiza',
  'Calle Gral Jorge Grassi',
  'Calle Gral Jose F Uriburu',
  'Avenida Gral Jose G Artigas',
  'Calle Gral Jose I Gorriti',
  'Calle Gral Jose Maria Paz',
  'Calle Gral Juan C Sanchez',
  'Pasaje Gral Juan Cornejo',
  'Calle Gral Juan Gregorio Lemos',
  'Calle Gral Juan Lavalle',
  'Calle Gral Lamadrid',
  'Calle Gral las Heras',
  'Pasaje Gral Lorenzo Vintter',
  'Calle Gral Luis Maria Campos',
  'Calle Gral M de Azcuenaga',
  'Calle Gral M Soler',
  'Avenida Gral Manuel Belgrano',
  'Calle Gral Manuel N Savio',
  'Calle Gral Mitre',
  'Pasaje Gral Napoleon Uriburu',
  'Calle Gral O Higgins',
  'Calle Gral Ortiz de Ocampo',
  'Pasaje Gral Pablo Latorre',
  'Pasaje Gral Paez',
  'Calle Gral R Alvarado',
  'Calle Gral Ricardo Sola',
  'Calle Gral Roman A Deheza',
  'Calle Gral Rondeau',
  'Avenida Gral San Martin',
  'Calle Gral Sequeira Segura',
  'Calle Gral Simon Bolivar',
  'Calle Gral Tomas de Iriarte',
  'Pasaje Gral Tomas Guido',
  'Pasaje Granaderos',
  'Calle Gregoria Matorras',
  'Pasaje Gregorio Beeche',
  'Pasaje Guachipas',
  'Calle Guaipos',
  'Calle Guanca',
  'Calle Guardia M C M Moyano',
  'Calle Guayaquil',
  'Pasaje Guillermo Ormachea',
  'Calle Guillermo Usandivaras',
  'Calle Guillermo Villegas',
  // H
  'Calle Hector Gonzalez',
  'Calle Hector Supice Sede',
  'Calle Hermenegildo Diez',
  'Calle Hernan Arancibia',
  'Calle Hernan Figueroa Reyes',
  'Calle Hernando de Lerma',
  'Avenida Heroes de la Patria',
  'Pasaje Higinio Falcon',
  'Pasaje Hilario Ascasubi',
  'Calle Hilario Ascasubi',
  'Calle Hincanchos',
  'Calle Hipolito Bouchard',
  'Calle Homero Manzi',
  'Pasaje Huaytiquina',
  'Calle Hugo Alarcon',
  'Calle Hugo C Ramon Espeche',
  'Calle Hugo Wast',
  'Calle Humahuaca',
  // I
  'Calle Incahuasi',
  'Avenida Independencia',
  'Calle Ing Abel A Goytia',
  'Calle Ing Abel Cornejo',
  'Calle Ing Enrique Clement',
  'Pasaje Ing Fernando Sola',
  'Calle Ing Francisco Host',
  'Calle Ing Guillermo Marconi',
  'Calle Ing H Anasagasti',
  'Pasaje Ing Klein',
  'Calle Ing Manuel Tedin',
  'Calle Ing Miguel Araoz',
  'Calle Ing Pedro Cornejo',
  'Pasaje Ing Ramon Castro',
  'Calle Inte Alberto San Miguel',
  'Calle Inte Carlos Gotling',
  'Calle Inte Carlos Outes',
  'Calle Inte Carlos Saravia Cornejo',
  'Pasaje Inte Ernesto Zenteno Boedo',
  'Calle Inte Felix Usandivaras',
  'Pasaje Inte Gerardo E Cuellar',
  'Calle Inte Jose M Ovejero',
  'Pasaje Inte Julio J Paz',
  'Calle Inte Langou',
  'Pasaje Inte Luis Diez',
  'Pasaje Inte Michel Benjamin Davalos',
  'Calle Inte R P Sosa Zenteno',
  'Calle Inte San Roman Vicente',
  'Pasaje Iruya',
  'Calle Isaac Jira',
  'Calle Islas Malvinas',
  'Avenida Italia',
  'Calle Ituzaingo',
  // J
  'Pasaje J Azurduy de Padilla',
  'Calle J Buttinelli',
  'Calle J Lali',
  'Calle J Villagra',
  'Calle Jaime Davalos',
  'Calle Jaime Durand',
  'Calle Jasimana',
  'Calle Javier Pantaleon',
  'Calle Jeronimo Matorras',
  'Calle Joaquin Castellanos',
  'Calle Joaquin Corbalan',
  'Calle Joaquin Diaz de Bedoya',
  'Calle Joaquin Lopez Figueroa',
  'Calle Joaquin Ramos',
  'Calle Joaquin V Gonzalez',
  'Avenida John Kennedy',
  'Calle Jorge Cisterna',
  'Calle Jorge Gutierrez',
  'Calle Jorge Luis Borges',
  'Calle Jorge Manrique',
  'Calle Jorge Newbery',
  'Calle Jorge Sly',
  'Pasaje Jose A de Alberro',
  'Calle Jose Cirilo Sosa',
  'Calle Jose Daniel Gomez',
  'Calle Jose de Gurruchaga',
  'Calle Jose de Medeiros',
  'Pasaje Jose E Alderete',
  'Calle Jose E Contreras',
  'Pasaje Jose Echenique',
  'Calle Jose Francisco Lopez',
  'Calle Jose Gomez',
  'Pasaje Jose Hernandez',
  'Calle Jose Leon Cabezon',
  'Pasaje Jose M Lahora',
  'Calle Jose M Ojeda',
  'Calle Jose Manuel Baca',
  'Pasaje Jose Manuel Estrada',
  'Calle Jose Maria Chavez',
  'Calle Jose Maria Chocano',
  'Pasaje Jose Maria Decavi',
  'Pasaje Jose Maria Gallo Mendoza',
  'Calle Jose Maria Mirau',
  'Pasaje Jose Maria Todd',
  'Calle Jose Marmol',
  'Calle Jose Palermo Riviello',
  'Calle Juan A Avellaneda',
  'Calle Juan Adolfo Romero',
  'Calle Juan B Ambrosetti',
  'Calle Juan C Usandivaras',
  'Avenida Juan Carlos Davalos',
  'Calle Juan D Arienzo',
  'Calle Juan de Matienzo',
  'Calle Juan Esteban Tamayo',
  'Pasaje Juan Francisco M de Echauri',
  'Calle Juan Francisco Pastor',
  'Calle Juan Galvez',
  'Calle Juan Gutenberg',
  'Pasaje Juan J Campero',
  'Calle Juan Jose Castelli',
  'Pasaje Juan Larrea',
  'Calle Juan Leguizamon',
  'Calle Juan Manuel Castilla',
  'Calle Juan Manuel Guemes',
  'Calle Juan Muñoz Cabrera',
  'Calle Juan Ramon Boedo',
  'Calle Juan s Bulloc',
  'Calle Juan Vucetich',
  'Pasaje Juana E Velarde',
  'Pasaje Juana Fowlis',
  'Calle Juana Hernandez',
  'Pasaje Juana Lopez de Vila',
  'Pasaje Juana Manuela Gorriti',
  'Calle Juana Moro de Lopez',
  'Calle Juez Jose Maria Zuviria',
  'Calle Jujuy',
  'Calle Julia Alderete',
  'Calle Julio Aramburu',
  'Pasaje Junin',
  'Calle Junin',
  'Calle Juramento',
  'Calle Juventud',
  // L
  'Calle L Guzman',
  'Calle L N Alem',
  'Calle La Banca',
  'Pasaje La Caldera',
  'Pasaje La Candelaria',
  'Calle La Capital de Rosario',
  'Calle La Cultura',
  'Avenida La Cumbre',
  'Calle La Gauchada',
  'Calle La Guerra Gaucha',
  'Calle La Inteligencia',
  'Calle La Lealtad',
  'Calle La Mañana Diario',
  'Calle La Pampa',
  'Calle La Plata',
  'Pasaje La Poma',
  'Calle La Prensa Diario',
  'Calle La Razon Diario',
  'Calle La Rioja',
  'Pasaje La Rural',
  'Pasaje La Tablada',
  'Calle La Tacunga',
  'Pasaje La Victoria',
  'Pasaje La Viña',
  'Calle Laprida',
  'Calle Las Acacias',
  'Calle Las Achiras',
  'Calle Las Aguilas',
  'Calle Las Amapolas',
  'Calle Las Araucarias',
  'Calle Las Azaleas',
  'Calle Las Azucenas',
  'Calle Las Breñas',
  'Calle Las Bumbunas',
  'Pasaje Las Calandrias',
  'Calle Las Calas',
  'Calle Las Camelias',
  'Calle Las Capuchinas',
  'Calle Las Casuarinas',
  'Calle Las Charatas',
  'Calle Las Charcas',
  'Calle Las Chirimoyas',
  'Calle Las Cigueñas',
  'Calle Las Clivias',
  'Calle Las Dalias',
  'Calle Las Diamelas',
  'Calle Las Encinas',
  'Calle Las Garzas',
  'Calle Las Gaviotas',
  'Calle Las Glicinas',
  'Calle Las Golondrinas',
  'Calle Las Guindas',
  'Calle Las Guineas',
  'Calle Las Hayas',
  'Pasaje Las Higueras',
  'Calle Las Hortensias',
  'Calle Las Industrias',
  'Calle Las Madreselvas',
  'Calle Las Magnolias',
  'Calle Las Margaritas',
  'Calle Las Moreras',
  'Calle Las Orquideas',
  'Calle Las Palmas',
  'Calle Las Palmeras',
  'Calle Las Palomas',
  'Calle Las Paltas',
  'Calle Las Papayas',
  'Pasaje Las Perdices',
  'Calle Las Quinas',
  'Pasaje Las Reinamoras',
  'Calle Las Retamas',
  'Calle Las Rosas',
  'Pasaje Las Sachas',
  'Calle Las Talas',
  'Calle Las Tijeretas',
  'Calle Las Tipas',
  'Calle Las Tuscas',
  'Calle Las Violetas',
  'Calle Las Zarzamoras',
  'Pasaje Lasgallaretas',
  'Calle Lasserre Cdoro Juan Maria',
  'Pasaje Leopoldo Lugones',
  'Calle Leguizamon',
  'Calle Libertad',
  'Calle Libertador Gral San Martin',
  'Pasaje Liborio Matos',
  'Pasaje Limache',
  'Calle Lola Mora',
  'Calle Lope de Vega',
  'Calle Lopez de Fernandez',
  'Pasaje Lopez Jordan',
  'Calle Lorenza de la Camara',
  'Pasaje Lorenzo Maurin',
  'Pasaje Loreto Caro',
  'Calle Loreto Caro',
  'Calle Los Abedules',
  'Calle Los Abetos',
  'Calle Los Aceres',
  'Calle Los Aguaribayes',
  'Calle Los Alamos',
  'Avenida Los Albatros',
  'Calle Los Alelies',
  'Calle Los Alerces',
  'Calle Los Algarrobos',
  'Calle Los Alisos',
  'Calle Los Almendros',
  'Calle Los Amancay',
  'Pasaje Los Andes',
  'Calle Los Angeles',
  'Calle Los Arces',
  'Calle Los Aristocratas',
  'Calle Los Aromos',
  'Calle Los Avellanos',
  'Calle Los Azahares',
  'Calle Los Bambues',
  'Calle Los Bardos',
  'Calle Los Bejucos',
  'Calle Los Blancos',
  'Calle Los Braquiquitos',
  'Calle Los Cactus',
  'Calle Los Canelos',
  'Calle Los Cardenales',
  'Calle Los Cardones',
  'Calle Los Carolinos',
  'Calle Los Castaños',
  'Calle Los Cebiles',
  'Calle Los Cedros',
  'Calle Los Ceibos',
  'Calle Los Chalchaleros',
  'Calle Los Chañares',
  'Calle Los Cipreses',
  'Calle Los Ciruelos',
  'Calle Los Cisnes',
  'Calle Los Claveles',
  'Calle Los Condores',
  'Pasaje Los Constituyentes',
  'Calle Los Crespones',
  'Calle Los Crisantemos',
  'Calle Los Curupayes',
  'Calle Los Damascos',
  'Calle Los de Salta',
  'Calle Los Durazneros',
  'Pasaje Los Ebanos',
  'Calle Los Eucaliptus',
  'Calle Los Federales',
  'Calle Los Flamencos',
  'Calle Los Fresnos',
  'Calle Los Fronterizos',
  'Calle Los Gavilanes',
  'Calle Los Geranios',
  'Calle Los Gladiolos',
  'Calle Los Guayacanes',
  'Calle Los Guaypos',
  'Calle Los Halcones',
  'Calle Los Horneros',
  'Calle Los Inciensos',
  'Calle Los Jazmines',
  'Calle Los Juncaros',
  'Calle Los Juncos',
  'Calle Los Junquillos',
  'Pasaje Los Labradores',
  'Calle Los Lanceros',
  'Calle Los Lapachos',
  'Calle Los Laureles',
  'Calle Los Ligustros',
  'Avenida Los Lirios',
  'Calle Los Mandarinos',
  'Calle Los Manzanos',
  'Pasaje Los Medanos',
  'Calle Los Membrillos',
  'Calle Los Mirlos',
  'Calle Los Mistoles',
  'Avenida Los Molles',
  'Calle Los Naranjos',
  'Calle Los Nardos',
  'Calle Los Nisperos',
  'Calle Los Nogales',
  'Calle Los Olivos',
  'Calle Los Olmos',
  'Calle Los Ombues',
  'Calle Los Pacaras',
  'Avenida Los Papagayos',
  'Calle Los Paraisos',
  'Calle Los Parrales',
  'Calle Los Peatones',
  'Calle Los Pelicanos',
  'Calle Los Pensamientos',
  'Calle Los Perales',
  'Calle Los Petiribies',
  'Calle Los Pinguinos',
  'Calle Los Pinos',
  'Calle Los Piquillines',
  'Calle Los Platanos',
  'Calle Los Pomelos',
  'Calle Los Quebrachos',
  'Calle Los Quimiles',
  'Calle Los Quitupies',
  'Calle Los Raulies',
  'Calle Los Robles',
  'Calle Los Sauces',
  'Calle Los Saucos',
  'Calle Los Tarcos',
  'Calle Los Teros',
  'Calle Los Tiatines',
  'Calle Los Tilos',
  'Calle Los Timboes',
  'Calle Los Tres Zorritos',
  'Calle Los Tucanes',
  'Calle Los Tulipanes',
  'Calle Los Unitarios',
  'Calle Los Yuchanes',
  'Calle Los Zorzales',
  'Calle Lostarcos',
  'Calle Loteo San Bernardo',
  'Calle Lucio V Mansilla',
  'Calle Luis Alberto Gonzalez',
  'Calle Luis Angel de Dios',
  'Calle Luis Angel Firpo',
  'Calle Luis Braille',
  'Calle Luis Brozzuti',
  'Avenida Luis de los Rios',
  'Calle Luis Patron Costas',
  'Pasaje Luis Peña',
  'Pasaje Luis Peralta',
  'Pasaje Lumbreras',
  // M
  'Calle M Cayo',
  'Calle M Serrey Condarco',
  'Calle M Silva de Gurruchaga',
  'Calle M Zabala',
  'Calle Macapillo',
  'Calle Maestra Benigna Saravia',
  'Calle Maestra Jacoba B Saravia',
  'Pasaje Magdalena Goyechea',
  'Calle Magdalena Guemes de Tejada',
  'Calle Maipu',
  'Calle Mamerto Villagran',
  'Calle Manantial',
  'Pasaje Manuel Antonio Castro',
  'Calle Manuel Castilla',
  'Calle Manuel s Sola',
  'Calle Manuela Gonzalez de Tood',
  'Calle Manuela Martinez de Tineo',
  'Calle Mar Adriatico',
  'Calle Mar Antartico',
  'Calle Mar Arabigo',
  'Calle Mar Argentino',
  'Calle Mar Artico',
  'Calle Mar Baltico',
  'Calle Mar Blanco',
  'Calle Mar Caspio',
  'Calle Mar Chiquita',
  'Calle Mar de Behring',
  'Calle Mar de las Antillas',
  'Calle Mar del Plata',
  'Calle Mar Egeo',
  'Calle Mar Jonico',
  'Calle Mar Mediterraneo',
  'Avenida Mar Rojo',
  'Calle Mar Tirreno',
  'Pasaje Marcos Paz',
  'Calle Maria A de la Paz Lezcano',
  'Calle Maria Ines Jandula',
  'Calle Maria Torres Frias',
  'Calle Mariano Benitez',
  'Pasaje Mariano Cabezon',
  'Avenida Mariano Saravia',
  'Pasaje Mariano Zorreguieta',
  'Calle Marimon Onofre',
  'Calle Marinero 1Ro J L Villegas',
  'Pasaje Marinero 1Ro M A Lamas',
  'Calle Mario Condori',
  'Calle Mario Guevara',
  'Pasaje Marta Saravia',
  'Calle Martin Cornejo',
  'Calle Martin Fierro',
  'Calle Martin Guerrico',
  'Calle Martinez de Lezama',
  'Calle Matias Patron',
  'Pasaje Matias Patron Costas',
  'Calle Mayor Fco de Arteaga',
  'Calle Mayor Gustavo Garcia Cuevas',
  'Calle Mayor H Palaver del Valle',
  'Calle Mayor Marcelo Pedro Lotufo',
  'Calle Mejias',
  'Calle Mendoza',
  'Calle Mercedes Arancibia',
  'Pasaje Metan',
  'Calle Mexico',
  'Pasaje Michel Torino',
  'Calle Miguel Angel Martinez Saravia',
  'Calle Miguel Cane',
  'Pasaje Miguel David Torino',
  'Avenida Miguel de Cervantes',
  'Pasaje Miguel Otero',
  'Calle Miguel Ragone',
  'Avenida Miguel Rodriguez Durañona',
  'Paseo Miramar',
  'Pasaje Misiones',
  'Calle Misiones',
  'Calle Mitre',
  'Pasaje Moises Oliva',
  'Calle Moises Racedo',
  'Pasaje Molinos',
  'Pasaje Mollinedo',
  'Calle Mons J Campero y Araoz',
  'Avenida Mons Jose R Tavella',
  'Calle Mons Miguel A Vergara',
  'Pasaje Montevideo',
  'Calle Mtro R Alvarado',
  // N
  'Pasaje N B Saravia',
  'Calle N Ojeda',
  'Calle Napoleon Peña',
  'Pasaje Natalio Roldan',
  'Calle Necochea',
  'Calle Nelson Christian',
  'Pasaje Neo Machi',
  'Calle Nestor Patron Costas',
  'Calle Neuquen',
  'Calle Nevado de Llullaillaco',
  'Calle Nicaragua',
  'Calle Nicolas Isasmendi Lopez',
  'Calle Nicolas Medina',
  'Calle Ntra Señora de Talavera',
  'Calle Nueva Zelandia',
  // O
  'Pasaje Obispo Linares',
  'Calle Obispo Romero',
  'Calle Obispo Victoria',
  'Calle Oficial Aux Mario Duarte',
  'Calle Olavarria',
  'Calle Olegario V Andrade',
  'Calle Omar Madrid',
  'Calle Omar Vargas',
  'Calle Oran',
  'Pasaje Oruro',
  'Calle Oscar Cabalen',
  'Calle Oscar H Blas',
  'Calle Osvaldo Dell Aqua',
  // P
  'Calle Pablo Aleman',
  'Calle Pablo Saravia',
  'Pasaje Pablo Soria',
  'Calle Pacheco de Melo',
  'Pasaje Pacheco de Melo',
  'Calle Padre A de Castañares',
  'Calle Padre Antonio Salinas',
  'Calle Padre Jose Carrion',
  'Pasaje Padre L Giorgi Silvester',
  'Pasaje Padre Luis Giorgi',
  'Calle Padre Miguel Martin',
  'Diagonal Padre Miguel Martin',
  'Calle Padre Rafael Aduaga',
  'Pasaje Padre Rafael Gobelli',
  'Calle Palermo',
  'Avda Circunvalacion Papa Juan XXIII',
  'Avenida Paraguay',
  'Calle Paraiso',
  'Calle Parana',
  'Calle Parque Patricios',
  'Calle Paso de los Patos',
  'Pasaje Paso de los Patos',
  'Pasaje Pastor Padilla',
  'Calle Pastore Wiliar',
  'Pasaje Patagonia',
  'Pasaje Patricias Argentinas',
  'Calle Pbto M Alberti',
  'Calle Pedernera',
  'Calle Pedro A Perez',
  'Calle Pedro de Valdivia',
  'Pasaje Pedro Ferroni',
  'Pasaje Pedro H Buitrago',
  'Pasaje Pedro Nolasco Lopez',
  'Pasaje Pedro Pastore',
  'Pasaje Pedro Solivarez',
  'Pasaje Pedro Uriburu',
  'Calle Perez',
  'Calle Perito F P Moreno',
  'Calle Peru',
  'Calle Pichanal',
  'Pasaje Pintor R Usandivaras',
  'Pasaje Pje 22',
  'Pasaje Pje 23',
  'Pasaje Pje 9',
  'Calle Plaza',
  'Calle Polo Sur',
  'Calle Polonia',
  'Calle Pompilio Guzman',
  'Diagonal Portugal',
  'Calle Posadas',
  'Calle Posta de Yatasto',
  'Calle Ppal 1Ro Ricardo Gallardo',
  'Calle Pres Gral J A Roca',
  'Calle Pres J Figueroa Alcorta',
  'Pasaje Primera Junta',
  'Calle Prof Dr Mariano Castex',
  'Pasaje Prof Fausto Torres',
  'Calle Prof Fernando Ramos',
  'Calle Provisor Fernandez',
  'Avenida Pte H Yrigoyen',
  'Avenida Pte J D Peron',
  'Calle Pte M T de Alvear',
  'Pasaje Puerto Montt',
  'Calle Puerto Rico',
  'Calle Pueyrredon',
  'Pasaje Punta del Este',
  // Q-R
  'Calle Quisque',
  'Avenida R J Durand',
  'Calle R Saenz Peña',
  'Calle Radio Belgrano',
  'Calle Radio Cerealista',
  'Calle Radio Chaco',
  'Calle Radio Colon',
  'Calle Radio del Plata',
  'Calle Radio el Mundo',
  'Calle Radio Fortin Yunka',
  'Calle Radio General Paz',
  'Calle Radio General Pico',
  'Calle Radio General Urquiza',
  'Calle Radio Gonzalez',
  'Calle Radio Granaderos Puntanos',
  'Calle Radio Guarani de Curuzu Cuati',
  'Calle Radio Independencia',
  'Calle Radio la Voz del Comahue',
  'Calle Radio Nacional',
  'Calle Radio Neuquen',
  'Calle Radio Nihuil Mendoza',
  'Calle Radio Obera',
  'Calle Radio Patagonia Argentina',
  'Calle Radio Rio Gallegos',
  'Calle Radio Rivadavia',
  'Calle Radio San Salvador de Jujuy',
  'Calle Radio Santiago del Estero',
  'Calle Radio Splendid',
  'Calle Radio Sur Argentino',
  'Calle Rafael de la Luz',
  'Calle Rafael Obligado',
  'Calle Ramiro Cañabera',
  'Pasaje Ramiro Canavares',
  'Calle Ramon Diaz',
  'Calle Ramon Garcia Pizarro',
  'Calle Ramon Lista',
  'Calle Ramon Valle',
  'Calle Raul Alejo Medrano',
  'Calle Raul Riganti',
  'Pasaje Read Head',
  'Calle Reconquista',
  'Pasaje Reina Margarita',
  'Calle Rep de Siria',
  'Pasaje Repetti',
  'Calle Republica de Israel',
  'Avenida Republica del Libano',
  'Calle Retamoso de Iñiguez',
  'Calle Rey Bentarcur',
  'Avenida Reyes Catolicos',
  'Avenida Reymundin',
  'Calle Ricardo Durand',
  'Calle Ricardo Guiraldes',
  'Calle Ricardo Gutierrez',
  'Calle Ricardo Levenne',
  'Calle Ricardo Maury',
  'Calle Ricardo Reimundin',
  'Calle Ricardo Rizzati',
  'Calle Ricardo Serenata Saavedra',
  'Calle Ricardo Torres',
  'Calle Rio Ancho',
  'Calle Rio Arenales',
  'Pasaje Rio Bermejo',
  'Calle Rio Blanco',
  'Calle Rio Cachi',
  'Calle Rio Carapari',
  'Calle Rio Chicoana',
  'Calle Rio de la Plata',
  'Calle Rio del Valle',
  'Calle Rio Gallegos',
  'Calle Rio Juramento',
  'Calle Rio la Viña',
  'Calle Rio Lavallen',
  'Calle Rio Lorohuasi',
  'Calle Rio Medina',
  'Calle Rio Mojotoro',
  'Calle Rio Negro',
  'Calle Rio Piedras',
  'Calle Rio Rosario de Lerma',
  'Calle Rio San Carlos',
  'Calle Rio Santa Ana',
  'Calle Rio Santa Barbara',
  'Calle Rio Talavera',
  'Calle Rio Toro',
  'Calle Rio Wierna',
  'Calle Riobamba',
  'Calle Rita Torena',
  'Ruta Nacional Rn 51',
  'Ruta Nacional Rn 9',
  'Calle Roberto Corbalan',
  'Calle Roberto Etchegoyen',
  'Avenida Roberto H Sanson',
  'Avenida Roberto Leviller',
  'Calle Rodolfo Frumento',
  'Calle Rodrigo Pereyra',
  'Calle Roque Chippoloni',
  'Pasaje Rosario de la Frontera',
  'Pasaje Rosario de Lerma',
  'Calle Rosario Vera Peñaloza',
  'Ruta Provincial Rp 26',
  'Ruta Provincial Rp 28',
  'Calle Ruben Dario',
  'Calle Rubi',
  'Pasaje Rugby',
  'Pasaje Ruiz de los Llanos',
  'Calle Ruminagui',
  'Avenida Ruta Nacional 68',
  'Avenida Ruta Prov 21',
  'Calle Ruy Diaz de Guzman',
  // S
  'Calle S Sola de Castellanos',
  'Calle Sagrada Familia',
  'Calle Saldeño',
  'Avenida Salvador Allende',
  'Calle Salvador Debenedetti',
  'Calle Salvador Mazza',
  'Calle Salvador Ramos',
  'Calle Samuel Lafone Quevedo',
  'Avenida San Bernardo',
  'Calle San Agustin',
  'Pasaje San Andres',
  'Calle San Andres',
  'Calle San Antonio',
  'Calle San Antonio de los Cobres',
  'Calle San Benito',
  'Calle San C de la Nueva Sevil',
  'Pasaje San Carlos',
  'Pasaje San Cayetano',
  'Calle San Clemente de la N Sevilla',
  'Calle San Felipe',
  'Calle San Felipe y Santiago',
  'Calle San Isidro',
  'Calle San Jose',
  'Calle San Juan',
  'Calle San Justo',
  'Calle San Lorenzo',
  'Calle San Lucas',
  'Calle San Luis',
  'Calle San Marco',
  'Calle San Marcos',
  'Pasaje San Martin',
  'Avenida San Martin',
  'Calle San Mateo',
  'Calle San Nicolas',
  'Pasaje San Pablo',
  'Calle San Pablo',
  'Calle San Pedro',
  'Calle San Ramon',
  'Calle San Roque',
  'Calle San Santiago',
  'Calle Sanchez',
  'Calle Sanchez Frias Loreto',
  'Calle Santa Ana',
  'Calle Santa Barbara',
  'Calle Santa Catalina',
  'Calle Santa Cecilia',
  'Avenida Santa Cruz',
  'Calle Santa Cruz',
  'Calle Santa Elena',
  'Calle Santa Fe',
  'Calle Santa Gabriela',
  'Calle Santa Gertrudis',
  'Calle Santa Ines',
  'Calle Santa Isabel',
  'Pasaje Santa Laura',
  'Pasaje Santa Lucia',
  'Calle Santa Magdalena',
  'Calle Santa Maria',
  'Calle Santa Marta',
  'Calle Santa Monica',
  'Calle Santa Oliva',
  'Calle Santa Rita',
  'Pasaje Santa Rosa',
  'Calle Santa Silvana',
  'Calle Santa Teresita',
  'Calle Santa Victoria',
  'Calle Santiago de Liniers',
  'Calle Santiago del Estero',
  'Calle Santiago Saravia',
  'Calle Saravia Toledo',
  'Calle Scalabrini Ortiz',
  'Calle Sebastian Elcano',
  'Pasaje Senador D Avellaneda',
  'Pasaje Sgto Ayte Acosta',
  'Calle Sgto 1Ro Mateo A Sbert',
  'Calle Sgto Juan B Cabral',
  'Calle Sgto Mayor Jose L Lemos',
  'Pasaje Socompa',
  'Calle Sold Carlos Alberto Viscarra',
  'Calle Sold Eleuterio Ramos',
  'Calle Sold Ramon Gutierrez',
  'Calle Sold Ramon Salazar',
  'Pasaje Sold Roque Sanchez',
  'Calle Soldado Argentino',
  'Diagonal Solis Pizarro',
  'Avenida Solis Pizarro',
  'Calle Sor Maria de los Angeles',
  'Calle Subcial Ppal Albelos',
  'Calle Subof 2Do Carlos H Medina',
  'Calle Subof 2Do Ignacio Gonzalez',
  'Calle Subof 2Do Jorge Luis Velez',
  'Calle Subof 2Do Jose Rodriguez',
  'Calle Subof Francisco Luna',
  'Calle Subof Mayor Julio Lastra',
  'Calle Subtte Jose Daldini',
  'Diagonal Sucre',
  'Calle Suecia',
  'Avenida Suipacha',
  'Calle Suipacha',
  'Avenida Suiza',
  'Avda Circunvalacion Sur',
  // T
  'Calle Tadia Tadeo',
  'Pasaje Talapampa',
  'Calle Talcahuano',
  'Calle Tarija',
  'Calle Tellez',
  'Calle Teniente Diego Barcelo',
  'Pasaje Teniente Eduardo Racedo',
  'Calle Teniente Hector Volponi',
  'Avenida Teniente Jose Luis Fuentes',
  'Calle Teniente Mario Azua',
  'Pasaje Teodoro Fels',
  'Calle Tierra del Fuego',
  'Calle Tincunaco',
  'Pasaje Tineo',
  'Pasaje Toledo Welindo',
  'Calle Tomas Arias',
  'Calle Tomas Cabrera',
  'Calle Tomas de Allende',
  'Calle Tomas de Archondo',
  'Pasaje Tomas E Oliver',
  'Calle Tomas Espora',
  'Pasaje Tomas Zapata',
  'Calle Topacio',
  'Calle Torino de Viana',
  'Calle Toscano Vicario',
  'Pasaje Triunvirato',
  'Calle Tte 1Ro Ruben E Marquez',
  'Pasaje Tte Benjamin Matienzo',
  'Calle Tte Cnel G Espejo',
  'Calle Tte Cnel Manuel F Prado',
  'Calle Tte Cnel Santiago Morales',
  'Calle Tte de Navio Jorge Mayol',
  'Calle Tte Ernesto E Espinoza',
  'Calle Tte Gral Donato Alvarez',
  'Calle Tte Gral Pablo Ricchieri',
  'Pasaje Tte Jose L Ardiles',
  'Calle Tte Juan C Gabande',
  'Calle Tte Roberto M Fiorito',
  'Calle Tucuman',
  'Pasaje Turquia',
  // U
  'Calle Universidad Catolica',
  'Calle Uriburu Garcia',
  'Calle Urquiza',
  'Avenida Uruguay',
  'Pasaje Uspallata',
  // V
  'Calle V Aban',
  'Calle V Juarez',
  'Calle Valparaiso',
  'Calle Venezuela',
  'Calle Vicalte Quijada Hermes',
  'Pasaje Vicario Pedro Chavez y Abrehu',
  'Calle Vicario Simon Diez Zambrano',
  'Calle Vicente Hector Gonzalez',
  'Calle Vicente Lopez',
  'Pasaje Vicente Maravialla',
  'Pasaje Vicente Panana',
  'Calle Vicente Ramos',
  'Pasaje Victor Arias',
  'Calle Victor Garino',
  'Calle Victor Sola Zambrano',
  'Calle Villa el Sol',
  'Calle Villa Maria Esther',
  'Calle Villoresi Luiggi',
  'Calle Virgen del Rosario',
  'Calle Virgilio Figueroa',
  'Calle Virgilio Tedin',
  'Calle Virginio L Canova',
  'Pasaje Virrey P de Cevallos',
  'Avenida Virrey Toledo',
  'Calle Vito Dumas',
  // W-Z
  'Calle Washington Alvarez',
  'Avenida Y P F',
  'Pasaje Yapeyu',
  'Calle Yatasto',
  'Calle Ypf Destileria',
  'Calle Zabala',
  'Avenida Zacarias Yanci',
  'Calle Zafiro',
  'Calle Zorrigueta Rauch',
  'Pasaje Zorrilla',
  'Calle Zuviria',
];

let saltaStreetCatalogCache = {
  expiresAt: 0,
  streets: [],
  tokenIndex: new Map(),
  loadingPromise: null,
};

function normalizePhone(phone) {
  const raw = String(phone || '').trim();
  if (!raw) return '';

  // Si llega en formato JID (ej: 549...@s.whatsapp.net), quedarnos con la parte local.
  const localPart = raw.includes('@') ? raw.split('@')[0] : raw;
  let digits = localPart.replace(/\D/g, '');

  // Prefijo internacional con 00 -> quitarlo para dejar solo E.164 en dígitos.
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }

  return digits;
}

function normalizePhoneForWhatsApp(phone) {
  let digits = normalizePhone(phone);
  if (!digits) return '';

  // Números locales con 0 inicial (trunk prefix) -> quitarlo.
  if (digits.startsWith('0') && digits.length >= 11) {
    digits = digits.replace(/^0+/, '');
  }

  // Heurística AR: 54 + móvil suele requerir 549 para WhatsApp.
  if (digits.startsWith('54') && !digits.startsWith('549') && digits.length >= 12 && digits.length <= 13) {
    digits = `549${digits.slice(2)}`;
  }

  // Heurística Salta/AR para formato viejo con "15" luego del área: 54938715xxxxxx -> 549387xxxxxx
  if (digits.startsWith('54938715') && digits.length >= 14) {
    digits = `549387${digits.slice(8)}`;
  }

  return digits;
}

function toWhatsAppJid(phone) {
  const normalized = normalizePhoneForWhatsApp(phone);
  if (!normalized || normalized.length < 10) return null;
  return `${normalized}@s.whatsapp.net`;
}

function maskPhone(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return 'unknown';
  if (normalized.length <= 4) return normalized;
  return `${'*'.repeat(Math.max(0, normalized.length - 4))}${normalized.slice(-4)}`;
}

function logWebhook(stage, meta = {}) {
  try {
    console.info('[wasender-webhook]', JSON.stringify({ stage, ...meta }));
  } catch {
    console.info('[wasender-webhook]', stage);
  }
}

function summarizeDbError(error) {
  if (!error) return null;
  return {
    code: error.code || null,
    message: error.message || null,
    details: error.details || null,
    hint: error.hint || null,
  };
}

function isMissingRpcFunctionError(error) {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  return (
    code === 'PGRST202' ||
    message.includes('could not find the function') ||
    message.includes('claim_trip_queue_item') ||
    message.includes('release_trip_queue_item')
  );
}

async function claimTripQueueLock(trip) {
  const tripId = trip?.id;
  if (!tripId) {
    return { claimed: false, lockToken: null, reason: 'missing_trip_id' };
  }

  if (queueDispatchRpcAvailable === false) {
    return { claimed: true, lockToken: null, reason: 'fallback_rpc_disabled' };
  }

  const { data, error } = await getSupabase().rpc('claim_trip_queue_item', {
    p_trip_id: tripId,
    p_worker: QUEUE_DISPATCH_WORKER_ID,
    p_lock_seconds: QUEUE_DISPATCH_LOCK_SECONDS,
  });

  if (error) {
    if (isMissingRpcFunctionError(error)) {
      queueDispatchRpcAvailable = false;
      logWebhook('queue_dispatch_lock_rpc_missing', {
        tripId,
        error: summarizeDbError(error),
      });
      return { claimed: true, lockToken: null, reason: 'fallback_rpc_missing' };
    }

    logWebhook('queue_dispatch_lock_error', {
      tripId,
      error: summarizeDbError(error),
    });
    return { claimed: true, lockToken: null, reason: 'fallback_rpc_error' };
  }

  queueDispatchRpcAvailable = true;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row.claimed !== 'boolean') {
    logWebhook('queue_dispatch_lock_rpc_unexpected', { tripId });
    return { claimed: true, lockToken: null, reason: 'fallback_rpc_unexpected' };
  }

  return {
    claimed: Boolean(row.claimed),
    lockToken: row.lock_token || null,
    reason: row.reason || (row.claimed ? 'claimed' : 'not_available'),
  };
}

async function releaseTripQueueLock(
  tripId,
  lockToken,
  { result = 'retry', retrySeconds = QUEUE_DISPATCH_RETRY_SECONDS, errorMessage = null } = {}
) {
  if (!tripId || !lockToken) return false;
  if (queueDispatchRpcAvailable === false) return false;

  const normalizedResult = ['retry', 'done', 'drop'].includes(String(result || '').toLowerCase())
    ? String(result || '').toLowerCase()
    : 'retry';
  const safeRetrySeconds = Math.max(1, Math.round(Number(retrySeconds) || QUEUE_DISPATCH_RETRY_SECONDS));

  const { data, error } = await getSupabase().rpc('release_trip_queue_item', {
    p_trip_id: tripId,
    p_lock_token: lockToken,
    p_result: normalizedResult,
    p_retry_seconds: safeRetrySeconds,
    p_error: errorMessage ? String(errorMessage).slice(0, 400) : null,
  });

  if (error) {
    if (isMissingRpcFunctionError(error)) {
      queueDispatchRpcAvailable = false;
      logWebhook('queue_dispatch_release_rpc_missing', {
        tripId,
        error: summarizeDbError(error),
      });
      return false;
    }

    logWebhook('queue_dispatch_release_error', {
      tripId,
      result: normalizedResult,
      error: summarizeDbError(error),
    });
    return false;
  }

  queueDispatchRpcAvailable = true;
  return Boolean(data);
}

async function postponeTripQueueRetry(tripId, retrySeconds, reason = 'retry') {
  if (!tripId) return false;

  const safeRetrySeconds = Math.max(1, Math.round(Number(retrySeconds) || QUEUE_DISPATCH_RETRY_SECONDS));
  const retryAt = new Date(Date.now() + safeRetrySeconds * 1000).toISOString();
  const queueTableConfigs = [
    {
      tableName: 'dispatch_queue',
      payload: {
        queue_status: 'queued',
        lock_token: null,
        lock_owner: null,
        lock_acquired_at: null,
        lock_expires_at: null,
        next_attempt_at: retryAt,
        last_error: String(reason || 'retry').slice(0, 400),
      },
    },
    {
      tableName: 'trip_dispatch_queue',
      payload: {
        queue_status: 'queued',
        lock_token: null,
        locked_by: null,
        locked_at: null,
        lock_expires_at: null,
        next_attempt_at: retryAt,
        last_error: String(reason || 'retry').slice(0, 400),
      },
    },
  ];

  let missingTableCount = 0;
  for (const config of queueTableConfigs) {
    const { tableName, payload } = config;
    const { data, error } = await getSupabase()
      .from(tableName)
      .update(payload)
      .eq('trip_id', tripId)
      .select('trip_id');

    if (error) {
      const message = String(error?.message || '').toLowerCase();
      const tableMissing = message.includes(tableName) && message.includes('does not exist');
      if (tableMissing) {
        missingTableCount += 1;
        continue;
      }

      // Si la estructura no coincide (rolling deploy), probamos la siguiente tabla de compatibilidad.
      const schemaMismatch =
        message.includes('column') &&
        (message.includes('lock_owner') || message.includes('lock_acquired_at') || message.includes('locked_by') || message.includes('locked_at'));
      if (schemaMismatch) {
        continue;
      }

      logWebhook('queue_dispatch_postpone_error', {
        tripId,
        tableName,
        retrySeconds: safeRetrySeconds,
        reason,
        error: summarizeDbError(error),
      });
      return false;
    }

    if (data?.length) {
      logWebhook('queue_dispatch_postponed', {
        tripId,
        tableName,
        retrySeconds: safeRetrySeconds,
        reason,
      });
    }
    return Boolean(data?.length);
  }

  if (missingTableCount === queueTableConfigs.length) {
    return false;
  }

  return false;
}

function isAuthorizedPhone(phone) {
  if (ALLOWED_PHONES.size === 0) return true;
  const normalized = normalizePhone(phone);
  return [...ALLOWED_PHONES].some((allowed) => normalized === allowed || normalized.endsWith(allowed.slice(-10)));
}

function isTripTransitionAuthorized({ authHeader = '', tripTransitionSecretHeader = '' } = {}) {
  if (!WHATSAPP_TRIP_TRANSITION_SECRET) return false;
  return (
    tripTransitionSecretHeader === WHATSAPP_TRIP_TRANSITION_SECRET ||
    authHeader === `Bearer ${WHATSAPP_TRIP_TRANSITION_SECRET}`
  );
}

function getBearerTokenFromHeader(authHeader = '') {
  const rawHeader = String(authHeader || '');
  if (!rawHeader.toLowerCase().startsWith('bearer ')) return '';
  return rawHeader.slice(7).trim();
}

async function authenticateDriverFromBearer(authHeader = '') {
  const token = getBearerTokenFromHeader(authHeader);
  if (!token) {
    return { ok: false, reason: 'missing_bearer_token' };
  }

  const { data: userData, error: authError } = await getSupabase().auth.getUser(token);
  const userId = userData?.user?.id || null;
  if (authError || !userId) {
    return {
      ok: false,
      reason: 'invalid_bearer_token',
      error: authError?.message || null,
    };
  }

  const { data: driver, error: driverError } = await getSupabase()
    .from('drivers')
    .select('id, user_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (driverError || !driver?.id) {
    return {
      ok: false,
      reason: 'driver_not_found_for_user',
      userId,
      error: driverError?.message || null,
    };
  }

  return {
    ok: true,
    userId,
    driverId: driver.id,
  };
}

async function authorizeDriverTripTransitionRequest({ authHeader = '', tripId = '' } = {}) {
  const driverAuth = await authenticateDriverFromBearer(authHeader);
  if (!driverAuth.ok) {
    return driverAuth;
  }

  const trip = await getConversationFlowTripById(tripId);
  if (!trip) {
    return {
      ok: false,
      reason: 'trip_not_found',
      driverId: driverAuth.driverId,
      userId: driverAuth.userId,
    };
  }

  if (String(trip.driver_id || '') !== String(driverAuth.driverId)) {
    return {
      ok: false,
      reason: 'trip_not_owned_by_driver',
      driverId: driverAuth.driverId,
      tripDriverId: trip.driver_id || null,
    };
  }

  const tripStatus = normalizeText(trip.status || '');
  if (!ACTIVE_TRIP_STATUSES.includes(tripStatus)) {
    return {
      ok: false,
      reason: 'trip_status_not_notifiable',
      tripStatus,
      driverId: driverAuth.driverId,
    };
  }

  return {
    ok: true,
    userId: driverAuth.userId,
    driverId: driverAuth.driverId,
    tripStatus,
  };
}

function safeJsonParse(value, fallback = null) {
  if (value == null) return fallback;
  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return fallback;
  }
}

async function fetchWithRetry(url, options = {}, { retries = 2, delayMs = 800, label = 'fetch' } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.status >= 500 && attempt < retries) {
        logWebhook('fetch_retry_server_error', { label, attempt, status: response.status });
        await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      logWebhook('fetch_retry_network_error', { label, attempt, error: error?.message });
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

function sanitizeAddressInput(address) {
  if (!address || typeof address !== 'string') return '';
  return address.replace(/[<>{}[\]\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 200);
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function stripPostalCodePrefix(value) {
  return normalizeForMatch(value)
    .replace(/\ba\d{4}\b/gi, ' ')
    .replace(/\b\d{4}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferSaltaCapitalFromFormattedAddress(formattedAddress) {
  const clean = sanitizeAddressInput(formattedAddress || '');
  if (!clean) return null;

  const parts = clean
    .split(',')
    .map((part) => sanitizeAddressInput(part))
    .filter(Boolean);

  if (parts.length < 2) return null;

  const normalizedParts = parts.map((part) => normalizeForMatch(part)).filter(Boolean);
  if (normalizedParts.length < 2) return null;

  const country = normalizedParts[normalizedParts.length - 1];
  if (country !== 'argentina') return null;

  // Formato corto: "Belgrano 1200, Salta, Argentina"
  if (normalizedParts.length === 3) {
    return stripPostalCodePrefix(normalizedParts[normalizedParts.length - 2]) === 'salta';
  }

  // Formato largo: "Belgrano 1200, A4400 Salta, Salta, Argentina"
  const province = stripPostalCodePrefix(normalizedParts[normalizedParts.length - 2]);
  if (province !== 'salta') return null;

  const locality = stripPostalCodePrefix(normalizedParts[normalizedParts.length - 3]);
  if (!locality) return null;

  return locality === 'salta';
}

function isSaltaCapitalCandidate(candidate) {
  const byAddress = inferSaltaCapitalFromFormattedAddress(candidate?.formattedAddress || '');
  if (typeof byAddress === 'boolean') return byAddress;

  const lat = Number(candidate?.lat);
  const lng = Number(candidate?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;

  const distanceFromCenterKm = haversineKm(
    lat,
    lng,
    SALTA_CAPITAL_CENTER.lat,
    SALTA_CAPITAL_CENTER.lng
  );

  return distanceFromCenterKm <= SALTA_CAPITAL_PRIORITY_RADIUS_KM;
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function normalizeReason(value) {
  return normalizeText(value).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeForMatch(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeAddress(value) {
  return normalizeForMatch(value)
    .split(' ')
    .filter((token) => token.length > 1 && !['de', 'del', 'la', 'el', 'en', 'y', 'al', 'a'].includes(token));
}

function extractNumbers(value) {
  const matches = String(value || '').match(/\b\d{1,5}\b/g);
  return new Set((matches || []).map((n) => Number(n)));
}

function normalizeAddressKey(value) {
  return normalizeForMatch(value)
    .replace(/\b(avda|av\.|avenida)\b/g, 'avenida')
    .replace(/\bgral\b/g, 'general')
    .replace(/\bc\/?\b/g, 'calle')
    .replace(/\s+/g, ' ')
    .trim();
}

const GENERIC_ADDRESS_TOKENS = new Set([
  'calle',
  'avenida',
  'av',
  'avda',
  'pasaje',
  'pje',
  'ruta',
  'esquina',
  'altura',
  'salta',
  'capital',
  'argentina',
]);

function getAddressContentTokens(value) {
  return normalizeForMatch(value || '')
    .split(' ')
    .filter((token) => token && /[a-z]/.test(token) && !GENERIC_ADDRESS_TOKENS.has(token));
}

function isSpecificStreetAddress(value) {
  const normalized = normalizeForMatch(value || '');
  if (!normalized) return false;
  const hasNumber = /\b\d{1,5}\b/.test(normalized);
  if (!hasNumber) return false;
  return getAddressContentTokens(normalized).length > 0;
}

function isGenericStreetWithoutName(value) {
  const normalized = normalizeForMatch(value || '');
  if (!normalized) return false;
  return /^(?:calle|av|avda|avenida|pasaje|pje|ruta)\s+\d{1,5}(?:\s*,?\s*salta(?:\s+capital)?(?:\s+argentina)?)?$/.test(normalized);
}

const STREET_TYPE_LABELS = {
  calle: 'Calle',
  avenida: 'Avenida',
  pasaje: 'Pasaje',
  diagonal: 'Diagonal',
  ruta: 'Ruta',
  camino: 'Camino',
  paseo: 'Paseo',
};

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&ntilde;/gi, 'ñ')
    .replace(/&Ntilde;/g, 'Ñ')
    .replace(/&aacute;/gi, 'á')
    .replace(/&eacute;/gi, 'é')
    .replace(/&iacute;/gi, 'í')
    .replace(/&oacute;/gi, 'ó')
    .replace(/&uacute;/gi, 'ú')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function normalizeStreetType(value) {
  const type = normalizeForMatch(value || '').replace(/\./g, '');
  if (type === 'av' || type === 'avda') return 'avenida';
  if (type === 'pje') return 'pasaje';
  return type;
}

function parseSaltaStreetCatalogEntry(label) {
  const cleanLabel = sanitizeAddressInput(decodeHtmlEntities(label));
  if (!cleanLabel) return null;

  const match = cleanLabel.match(/^(calle|avenida|avda|av\.?|pasaje|pje\.?|diagonal|ruta|camino|paseo)\s+(.+)$/i);
  if (!match) return null;

  const type = normalizeStreetType(match[1]);
  const name = sanitizeAddressInput(match[2]);
  if (!name) return null;

  const nameKey = normalizeAddressKey(name);
  if (!nameKey) return null;
  if (nameKey === 's c' || nameKey === 'sc') return null;
  if (/^[a-z]$/.test(nameKey)) return null;

  const tokens = tokenizeAddress(nameKey)
    .filter((token) => token && token.length >= 2 && !GENERIC_ADDRESS_TOKENS.has(token));
  if (tokens.length === 0) return null;

  const normalizedType = STREET_TYPE_LABELS[type] ? type : 'calle';
  const fullLabel = `${STREET_TYPE_LABELS[normalizedType]} ${name}`;

  return {
    type: normalizedType,
    name,
    nameKey,
    tokens,
    fullLabel,
  };
}

function buildSaltaStreetTokenIndex(streets) {
  const tokenIndex = new Map();
  for (const street of streets || []) {
    const seenTokens = new Set();
    for (const token of street.tokens || []) {
      if (!token || token.length < 3 || seenTokens.has(token)) continue;
      seenTokens.add(token);
      if (!tokenIndex.has(token)) tokenIndex.set(token, []);
      tokenIndex.get(token).push(street);
    }
  }
  return tokenIndex;
}

function parseSaltaStreetCatalogHtml(html) {
  const entries = [];
  const seen = new Set();
  const linkRegex = /<a[^>]+href=["'][^"']*\/argentina\/salta\/salta\/[^"']*["'][^>]*>([^<]+)<\/a>/gi;
  let match;

  while ((match = linkRegex.exec(String(html || '')))) {
    const parsed = parseSaltaStreetCatalogEntry(match[1]);
    if (!parsed) continue;
    const key = `${parsed.type}|${parsed.nameKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(parsed);
  }

  return entries;
}

function getFallbackSaltaStreetEntries() {
  const parsed = SALTA_STREETS_FALLBACK
    .map((item) => parseSaltaStreetCatalogEntry(item))
    .filter(Boolean);
  const seen = new Set();
  return parsed.filter((item) => {
    const key = `${item.type}|${item.nameKey}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function loadSaltaStreetCatalog(force = false) {
  const now = Date.now();
  if (!force && saltaStreetCatalogCache.expiresAt > now && saltaStreetCatalogCache.streets.length > 0) {
    return saltaStreetCatalogCache;
  }

  if (saltaStreetCatalogCache.loadingPromise) {
    return saltaStreetCatalogCache.loadingPromise;
  }

  saltaStreetCatalogCache.loadingPromise = (async () => {
    try {
      if (process.env.NODE_ENV === 'test') {
        const fallback = getFallbackSaltaStreetEntries();
        saltaStreetCatalogCache = {
          expiresAt: Date.now() + SALTA_STREETS_TTL_MS,
          streets: fallback,
          tokenIndex: buildSaltaStreetTokenIndex(fallback),
          loadingPromise: null,
        };
        return saltaStreetCatalogCache;
      }

      const response = await fetchWithRetry(
        SALTA_STREETS_SOURCE_URL,
        {
          headers: {
            'User-Agent': 'ProfesionalApp/1.0 (salta-street-catalog)',
          },
        },
        { retries: 1, delayMs: 700, label: 'salta_street_catalog' }
      );

      const html = await response.text();
      const parsed = parseSaltaStreetCatalogHtml(html);
      const streets = parsed.length > 0 ? parsed : getFallbackSaltaStreetEntries();

      saltaStreetCatalogCache = {
        expiresAt: Date.now() + SALTA_STREETS_TTL_MS,
        streets,
        tokenIndex: buildSaltaStreetTokenIndex(streets),
        loadingPromise: null,
      };

      logWebhook('salta_street_catalog_loaded', {
        source: SALTA_STREETS_SOURCE_URL,
        streets: streets.length,
      });
      return saltaStreetCatalogCache;
    } catch (error) {
      const fallback = saltaStreetCatalogCache.streets.length > 0
        ? saltaStreetCatalogCache.streets
        : getFallbackSaltaStreetEntries();

      saltaStreetCatalogCache = {
        expiresAt: Date.now() + 30 * 60 * 1000,
        streets: fallback,
        tokenIndex: buildSaltaStreetTokenIndex(fallback),
        loadingPromise: null,
      };

      logWebhook('salta_street_catalog_load_error', {
        error: error?.message || 'unknown_error',
        fallbackCount: fallback.length,
      });

      return saltaStreetCatalogCache;
    }
  })();

  return saltaStreetCatalogCache.loadingPromise;
}

function getCatalogAddressVariants(address, maxResults = 4) {
  const input = sanitizeAddressInput(address || '');
  if (!input) return [];
  if (!Array.isArray(saltaStreetCatalogCache.streets) || saltaStreetCatalogCache.streets.length === 0) {
    return [];
  }

  const normalizedInput = normalizeForMatch(input)
    .replace(/\b(?:salta|capital|argentina)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalizedInput) return [];

  const houseNumber = (normalizedInput.match(/\b\d{1,5}[a-z]?\b/i) || [null])[0];
  const streetSegment = normalizedInput
    .replace(/\bal\s+\d{1,5}[a-z]?\b/gi, ' ')
    .replace(/\b(?:altura|nro|numero|n)\s*\d{1,5}[a-z]?\b/gi, ' ')
    .replace(/\b\d{1,5}[a-z]?\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const queryTokens = tokenizeAddress(streetSegment)
    .filter((token) => token && token.length >= 3 && !GENERIC_ADDRESS_TOKENS.has(token));
  if (queryTokens.length === 0) return [];

  const candidateMap = new Map();
  for (const token of queryTokens) {
    const tokenMatches = saltaStreetCatalogCache.tokenIndex.get(token) || [];
    for (const street of tokenMatches) {
      const key = `${street.type}|${street.nameKey}`;
      if (!candidateMap.has(key)) {
        candidateMap.set(key, { street, overlap: 0 });
      }
      candidateMap.get(key).overlap += 1;
    }
  }

  const ranked = [...candidateMap.values()]
    .map(({ street, overlap }) => {
      const overlapScore = overlap / queryTokens.length;
      let score = overlapScore;
      if (/\b(?:pasaje|pje)\b/i.test(normalizedInput) && street.type === 'pasaje') score += 0.2;
      if (/\b(?:avenida|avda|av)\b/i.test(normalizedInput) && street.type === 'avenida') score += 0.2;
      if (houseNumber) score += 0.05;
      return { street, score };
    })
    .filter((item) => item.score >= 0.6)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);

  const variants = [];
  const seenVariants = new Set();
  for (const item of ranked) {
    const withType = houseNumber
      ? `${item.street.fullLabel} ${houseNumber}, Salta`
      : `${item.street.fullLabel}, Salta`;
    const withoutType = houseNumber
      ? `${item.street.name} ${houseNumber}, Salta`
      : `${item.street.name}, Salta`;

    for (const candidate of [withType, withoutType]) {
      const key = normalizeAddressKey(candidate);
      if (!key || seenVariants.has(key)) continue;
      seenVariants.add(key);
      variants.push(candidate);
    }
  }

  return variants;
}

// --- Correcciones fonéticas para nombres de calles en Salta ---
const SALTA_PHONETIC_CORRECTIONS = [
  [/\birig[uo]g[io]en\b/gi, 'Yrigoyen'],
  [/\birig[ou]ien\b/gi, 'Yrigoyen'],
  [/\burquis[ao]\b/gi, 'Urquiza'],
  [/\burguis[ao]\b/gi, 'Urquiza'],
  [/\b(?:geme[sz]?|gueme[sz]?)\b/gi, 'Güemes'],
  [/\bbuenos\s+aire(?!s)\b/gi, 'Buenos Aires'],
  [/\bcastan[ae]r[ao]s\b/gi, 'Castañares'],
  [/\bleguisam[o]n\b/gi, 'Leguizamón'],
  [/\bzub[i]r[ia][ao]?\b/gi, 'Zuviría'],
  [/\bespana\b/gi, 'España'],
  [/\bsantiag[ou]\s+del?\s+ester[ou]\b/gi, 'Santiago del Estero'],
  // Correcciones adicionales para errores de transcripción de voz (Whisper)
  [/\bmitra\b/gi, 'Mitre'],
  [/\balverdi\b/gi, 'Alberdi'],
  [/\balverdy\b/gi, 'Alberdi'],
  [/\brivadabia\b/gi, 'Rivadavia'],
  [/\bribadavia\b/gi, 'Rivadavia'],
  [/\bpelegrini\b/gi, 'Pellegrini'],
  [/\bpelegr[ií]ni\b/gi, 'Pellegrini'],
  [/\bcaseiro[s]?\b/gi, 'Caseros'],
  [/\bnecochia\b/gi, 'Necochea'],
  [/\bvalgrano\b/gi, 'Belgrano'],
  [/\bbalgrano\b/gi, 'Belgrano'],
  [/\bsanmartin\b/gi, 'San Martín'],
  [/\bpuerred[oó]n\b/gi, 'Pueyrredón'],
  [/\bdean\s+funez\b/gi, 'Dean Funes'],
  [/\bde[aá]n\s+funes\b/gi, 'Dean Funes'],
  [/\bguardias\s+nacionales\b/gi, 'Guardias Nacionales'],
  [/\bsarmient[ou]\b/gi, 'Sarmiento'],
  [/\bjujuy\b/gi, 'Jujuy'],
];

function applyPhoneticCorrections(text) {
  let result = String(text || '');
  for (const [pattern, replacement] of SALTA_PHONETIC_CORRECTIONS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

// Expansiones de apellido → nombre completo de calles conocidas en Salta.
// Se usan SOLO para generar variantes de geocodificación más precisas; nunca modifican
// la dirección canónica almacenada en BD.
const SALTA_STREET_EXPANSIONS = [
  [/\bmitre\b/gi, 'Bartolomé Mitre'],
  [/\balberdi\b/gi, 'Juan Bautista Alberdi'],
  [/\brivadavia\b/gi, 'Bernardino Rivadavia'],
  [/\bpellegrini\b/gi, 'Carlos Pellegrini'],
  [/\bpueyrred[oó]n\b/gi, 'Mariano Pueyrredón'],
  [/\bsarmiento\b/gi, 'Domingo F. Sarmiento'],
  [/\byrigoyen\b/gi, 'Hipólito Yrigoyen'],
];

function applyStreetNameExpansions(text) {
  let result = String(text || '');
  for (const [pattern, replacement] of SALTA_STREET_EXPANSIONS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Usa IA para corregir y normalizar una dirección de Salta que no pudo geocodificarse.
 * Se llama SOLO como fallback cuando geocodeAddress() falla, para no agregar latencia al flujo normal.
 * Retorna la dirección corregida como string, o null si no puede mejorarla.
 */
async function normalizeAddressWithAI(rawAddress, conversationText = '') {
  if (!rawAddress) return null;
  try {
    const systemInstructions = [
      'Sos un experto en calles, barrios y puntos de interés de Salta Capital, Argentina.',
      'Tu tarea es normalizar una dirección para que Google Maps pueda geocodificarla con precisión.',
      'La dirección puede haber sido dictada por voz, escrita con errores, o usar formas abreviadas.',
      '',
      '## Expansiones de nombres de calles (apellido → nombre completo del prócer)',
      '- "Mitre" → "Bartolomé Mitre"',
      '- "Belgrano" → "Manuel Belgrano"',
      '- "Sarmiento" → "Domingo F. Sarmiento"',
      '- "Rivadavia" → "Bernardino Rivadavia"',
      '- "Alberdi" → "Juan Bautista Alberdi"',
      '- "Urquiza" → "Justo José de Urquiza"',
      '- "Arenales" → "Juan Antonio Álvarez de Arenales"',
      '- "Caseros" → "Batalla de Caseros"',
      '- "Pueyrredón" → "Mariano Pueyrredón"',
      '- "Pellegrini" → "Carlos Pellegrini"',
      '- "Dean Funes" → "Deán Gregorio Funes"',
      '- "Necochea" → "Coronel Necochea"',
      '',
      '## Puntos de interés (POIs) conocidos en Salta',
      '- "el hospital", "hospital" → "Hospital San Bernardo, Salta"',
      '- "la terminal", "terminal de ómnibus", "terminal" → "Terminal de Ómnibus de Salta"',
      '- "el shopping", "shopping salta" → "Shopping Salta"',
      '- "el aeropuerto", "aeropuerto" → "Aeropuerto Internacional Martín Miguel de Güemes, Salta"',
      '- "la catedral", "plaza principal", "plaza 9 de julio" → "Plaza 9 de Julio, Salta"',
      '- "el casino", "casino salta" → "Casino Club Salta"',
      '- "el tren", "estación de tren" → "Estación de Tren Salta"',
      '- "APASS", "sanatorio apass" → "APASS, Salta"',
      '- "el cementerio", "cementerio" → "Cementerio de la Santa Cruz, Salta"',
      '',
      '## Barrios',
      '- "tres cerr", "3 cerros" → "Tres Cerritos, Salta"',
      '- "grand bourg", "gran bourg" → "Grand Bourg, Salta"',
      '- "castañares", "castanares" → "Castañares, Salta"',
      '- "limache" → "Limache, Salta"',
      '- "portezuelo" → "Portezuelo, Salta"',
      '',
      '## Formato de salida — JSON estricto',
      'Respondé SIEMPRE con un JSON con este formato exacto:',
      '{"address": "Dirección normalizada, Salta"} o {"address": null} si no podés normalizarla con confianza.',
      '',
      'Reglas:',
      '- Formato de address: "Nombre Completo NúmeroAltura, Salta" | "Calle1 y Calle2, Salta" | "Nombre del POI, Salta"',
      '- Si la dirección ya es correcta y completa, devolvela igual en el JSON.',
      '- Nunca inventes calles ni lugares que no existan en Salta Capital.',
    ].join('\n');

    const userContent = [
      `Dirección a normalizar: "${rawAddress}"`,
      conversationText ? `Contexto del mensaje original (para mayor precisión): "${conversationText.slice(0, 200)}"` : '',
    ].filter(Boolean).join('\n');

    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-5-nano',
      max_completion_tokens: 80,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemInstructions },
        { role: 'user', content: userContent },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) return null;
    // Parsear JSON estructurado devuelto por gpt-5.4-nano
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Fallback: si por alguna razón devuelve texto plano, usarlo directamente
      parsed = { address: raw };
    }
    const result = parsed?.address;
    if (!result || result === 'null' || String(result).toLowerCase() === 'null') return null;
    if (result.length < 4 || result.length > 150) return null;
    const sanitized = sanitizeAddressInput(String(result));
    if (!sanitized) return null;
    logWebhook('ai_address_normalize_ok', { model: 'gpt-5-nano', original: rawAddress, corrected: sanitized });
    return sanitized;
  } catch (err) {
    logWebhook('ai_address_normalize_error', { original: rawAddress, error: err?.message || 'unknown' });
    return null;
  }
}

/**
 * Elimina números de teléfono embebidos en cadenas de dirección.
 * "España 351-4567890" → "España 351"
 * "Mitre 200 cel 1547891234" → "Mitre 200"
 */
function stripEmbeddedPhoneNumbers(text) {
  return String(text || '')
    // "cel/tel/wpp ..." con secuencia de dígitos larga
    .replace(/\b(?:cel(?:ular)?|tel(?:efono)?|mob(?:il)?|whatsapp|wpp)\s*:?\s*[\d\s\-+().]{7,}/gi, '')
    // Número corto (nro de calle) seguido de guión + secuencia larga (teléfono): "351-4567890" → "351"
    .replace(/\b(\d{1,5})-\d{5,}\b/g, '$1')
    // Secuencias de 8+ dígitos standalone (número de teléfono sin formato)
    .replace(/\b\d{8,}\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Tabla de conversión: palabras numéricas en español → valor entero
const SPANISH_HUNDREDS = {
  'doscient[ao]s': 200, 'trescient[ao]s': 300, 'cuatrocient[ao]s': 400,
  'quinient[ao]s': 500, 'seiscient[ao]s': 600, 'setecient[ao]s': 700,
  'ochocient[ao]s': 800, 'novecient[ao]s': 900, 'ciento?': 100,
};
const SPANISH_TENS = {
  veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50,
  sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
};

/**
 * Convierte frases numéricas en español a dígitos dentro de un texto de dirección.
 * "belgrano doscientos cincuenta" → "belgrano 250"
 * "calle trescientos" → "calle 300"
 */
function convertSpanishNumbersInText(text) {
  let result = String(text || '');
  const tensAlternation = Object.keys(SPANISH_TENS).join('|');
  for (const [hPat, hVal] of Object.entries(SPANISH_HUNDREDS)) {
    const combinedPattern = new RegExp(
      `\\b${hPat}(?:\\s+(?:y\\s+)?(${tensAlternation}))?\\b`, 'gi'
    );
    result = result.replace(combinedPattern, (m, tens) => {
      const tVal = tens ? (SPANISH_TENS[tens.toLowerCase()] ?? 0) : 0;
      const total = hVal + tVal;
      return total > 0 ? String(total) : m;
    });
  }
  return result;
}

function looksLikeAddressText(text) {
  const value = sanitizeAddressInput(text);
  if (!value) return false;

  const hasStreetAndNumber = /[a-zA-ZÀ-ÿ]{2,}[\w\s.'-]*\s\d{1,5}(?:\s*[a-zA-Z]\d?)?/i.test(value);
  const hasIntersection = /\b[a-zA-ZÀ-ÿ]{2,}[\w\s.'-]*\s+y\s+[a-zA-ZÀ-ÿ]{2,}[\w\s.'-]*/i.test(value);
  const hasStreetKeyword = /\b(calle|av\.?|avenida|pasaje|pje\.?|barrio|esquina|callej[oó]n|manzana|mz\.?|lote)\b/i.test(value);

  if (hasStreetAndNumber || hasIntersection) return true;
  if (hasStreetKeyword && value.length >= 8) return true;

  return false;
}

function extractAddressSnippetsFromText(text) {
  const input = String(text || '');
  if (!input.trim()) return [];

  const snippets = new Set();
  const lines = input
    .split(/\n|\.|;/)
    .map((line) => sanitizeAddressInput(line))
    .filter(Boolean);

  for (const line of lines) {
    if (!line) continue;
    if (looksLikeAddressText(line)) {
      snippets.add(line);
      continue;
    }

    const streetNumMatches = line.match(/[a-zA-ZÀ-ÿ]{2,}[\w\s.'-]{0,80}\s\d{1,5}(?:\s*[a-zA-Z]\d?)?/g);
    for (const match of streetNumMatches || []) {
      const cleaned = sanitizeAddressInput(match);
      if (looksLikeAddressText(cleaned)) snippets.add(cleaned);
    }

    const cornerMatches = line.match(/[a-zA-ZÀ-ÿ]{2,}[\w\s.'-]{0,60}\s+y\s+[a-zA-ZÀ-ÿ]{2,}[\w\s.'-]{0,60}/g);
    for (const match of cornerMatches || []) {
      const cleaned = sanitizeAddressInput(match);
      if (looksLikeAddressText(cleaned)) snippets.add(cleaned);
    }
  }

  return [...snippets].slice(0, 6);
}

function normalizeAddressPhrase(value) {
  const input = sanitizeAddressInput(value || '');
  if (!input) return '';

  // 1. Frases que NO son direcciones: "acá", "aquí", "donde estoy", etc.
  if (/^(?:ac[aá](?:\s*nom[aá]s)?|aqu[ií]|donde\s+estoy|en\s+mi\s+cas[ao]|ac[aá]\s+estoy)$/i.test(input.trim())) return '';

  // 2. Eliminar números de teléfono embebidos
  let work = stripEmbeddedPhoneNumbers(input);

  // 3. Convertir números escritos en español a dígitos
  work = convertSpanishNumbersInText(work);

  // 4. Aplicar correcciones fonéticas de calles de Salta
  work = applyPhoneticCorrections(work);

  return sanitizeAddressInput(
    work
      // Expandir abreviaturas de tipo de vía
      .replace(/\bavda\.?\b/gi, 'Avenida')
      .replace(/\bav\.?\b/gi, 'Avenida')
      .replace(/\bgral\.?\b/gi, 'General')
      .replace(/\bcnel\.?\b/gi, 'Coronel')
      .replace(/\btte\.?\b/gi, 'Teniente')
      .replace(/\bbvd\.?\b/gi, 'Boulevard')
      .replace(/\bbv\.?\b/gi, 'Boulevard')
      // Normalizar separadores de intersección: "c/" y "esq." → "y"
      .replace(/\besq(?:uina)?\.?\s*/gi, 'y ')
      .replace(/\s+c\/\s*/gi, ' y ')
      // "belgrano al 200" -> "belgrano 200"
      .replace(/\bal\s+(\d{1,5})\b/gi, '$1')
      // "altura 200", "nro 200", "numero 200"
      .replace(/\b(?:altura|nro\.?|numero|n[uú]mero)\s*(\d{1,5})\b/gi, '$1')
      // "mitre n 300" / "mitre n° 300"
      // Importante: evitar match dentro de palabras Unicode (ej: "Asuncion 1550").
      .replace(/(^|[\s,.-])n\s*[°o]?\s*(\d{1,5})\b/gi, '$1$2')
      // Ignorar departamento/piso/oficina cuando viene luego del número de calle.
      // Ej: "Mitre 351 2B" -> "Mitre 351", "351 2B" -> "351"
      .replace(/\b(\d{1,5})\s+(?:dto\.?|depto\.?|departamento|dpto\.?|piso|of\.?|oficina|dep\.?|torre|bloque|block)?\s*[a-z]?\d{1,3}[a-z]?\b/gi, '$1')
      // Limpieza de conectores comunes al inicio
      .replace(/^(?:en|por|desde|hasta|hacia|a)\s+/i, '')
      .trim()
  );
}

function splitAddressFromIntentPhrase(text, cueRegex) {
  const src = String(text || '');
  const cueMatch = src.match(cueRegex);
  if (!cueMatch) return null;

  const startIdx = cueMatch.index + cueMatch[0].length;
  const tail = src.slice(startIdx).trim();
  if (!tail) return null;

  // Cortar cuando aparece una segunda intención clara en la misma oración.
  const stopPattern = /\b(?:voy\s+(?:para|a)|me\s+llev(?:a|as|en)\s+a|destino(?:\s+es)?|hasta|hacia|despu[eé]s\s+a)\b/i;
  const stopMatch = tail.match(stopPattern);
  const segment = stopMatch ? tail.slice(0, stopMatch.index).trim() : tail;
  return normalizeAddressPhrase(segment);
}

function extractFullTripByPattern(text) {
  const src = String(text || '').trim();
  if (!src) return null;

  const patterns = [
    /(?:remis|movil|m[oó]vil|taxi|auto)\s+(?:para|a|en)\s+(.+?)\s*(?:,|\.)?\s*(?:voy\s+(?:para|a)|me\s+llev(?:a|as|en)\s+a|destino(?:\s+es)?|hasta|hacia)\s+(.+)$/i,
    /(?:pasame\s+a\s+buscar(?:me)?|buscame|retiro\s+en|estoy\s+en|desde)\s*[:,-]?\s*(.+?)\s*(?:,|\.)?\s*(?:voy\s+(?:para|a)|me\s+llev(?:a|as|en)\s+a|destino(?:\s+es)?|hasta|hacia)\s+(.+)$/i,
    /\bde\s+(.+?)\s+a\s+(.+)$/i,
  ];

  for (const regex of patterns) {
    const match = src.match(regex);
    if (!match) continue;

    const pickup = normalizeAddressPhrase(match[1]);
    const destination = normalizeAddressPhrase(match[2]);
    if (pickup && destination) {
      return { pickup, destination };
    }
  }

  return null;
}

function rankAddresses(entries, max = MAX_KNOWLEDGE_ADDRESSES) {
  const byKey = new Map();

  for (const entry of entries || []) {
    const raw = sanitizeAddressInput(entry?.address || '');
    if (!raw) continue;
    const key = normalizeAddressKey(raw);
    if (!key) continue;

    const prev = byKey.get(key) || {
      address: raw,
      count: 0,
      lastSeenAt: null,
    };

    prev.count += Number(entry?.count || 1);
    const lastSeen = entry?.lastSeenAt || null;
    if (!prev.lastSeenAt || (lastSeen && new Date(lastSeen).getTime() > new Date(prev.lastSeenAt).getTime())) {
      prev.lastSeenAt = lastSeen;
      prev.address = raw;
    }
    byKey.set(key, prev);
  }

  return [...byKey.values()]
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return new Date(b.lastSeenAt || 0).getTime() - new Date(a.lastSeenAt || 0).getTime();
    })
    .slice(0, max);
}

function mergeKnowledgeCandidates({ pickupHint, combinedText, phoneAddresses = [], globalAddresses = [] } = {}) {
  const candidates = [];
  const seen = new Set();

  const pushCandidate = (address, source, score) => {
    const cleaned = sanitizeAddressInput(address);
    if (!cleaned) return;
    const key = normalizeAddressKey(cleaned);
    if (!key || seen.has(key)) return;
    seen.add(key);
    candidates.push({ address: cleaned, source, score });
  };

  const pickupNums = extractNumbers(pickupHint || '');
  const textNums = extractNumbers(combinedText || '');
  const msgTokens = new Set(tokenizeAddress(`${pickupHint || ''} ${combinedText || ''}`));

  for (const item of phoneAddresses) {
    let score = 0;
    const itemNums = extractNumbers(item.address);
    const itemTokens = new Set(tokenizeAddress(item.address));

    if (pickupNums.size > 0) {
      pickupNums.forEach((num) => {
        if (itemNums.has(num)) score += 2;
      });
    }
    if (textNums.size > 0) {
      textNums.forEach((num) => {
        if (itemNums.has(num)) score += 1;
      });
    }
    msgTokens.forEach((token) => {
      if (itemTokens.has(token)) score += 0.5;
    });
    score += Math.min(item.count || 0, 3) * 0.25;

    pushCandidate(item.address, 'phone_history', score);
  }

  for (const item of globalAddresses) {
    let score = 0;
    const itemNums = extractNumbers(item.address);
    const itemTokens = new Set(tokenizeAddress(item.address));

    if (pickupNums.size > 0) {
      pickupNums.forEach((num) => {
        if (itemNums.has(num)) score += 1.25;
      });
    }
    msgTokens.forEach((token) => {
      if (itemTokens.has(token)) score += 0.25;
    });
    score += Math.min(item.count || 0, 5) * 0.1;

    pushCandidate(item.address, 'global_history', score);
  }

  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((item) => item.address);
}

function buildAddressVariants(address) {
  const base = sanitizeAddressInput(address);
  if (!base) return [];

  const variants = [];
  const pushVariant = (item) => {
    const cleaned = sanitizeAddressInput(item);
    if (cleaned) variants.push(cleaned);
  };

  const withSalta = /salta/i.test(base) ? base : `${base}, Salta`;
  pushVariant(withSalta);

  const noBarrioPrefix = withSalta.replace(/^barrio\s+/i, '').trim();
  if (noBarrioPrefix !== withSalta) pushVariant(noBarrioPrefix);
  pushVariant(withSalta.replace(/\besquina\s+con\b/gi, 'y'));

  // Si el texto coincide con una calle/pasaje conocido de Salta, agregamos variantes
  // canónicas para mejorar geocodificación y reducir falsas calles similares.
  const catalogVariants = getCatalogAddressVariants(withSalta, 4);
  for (const variant of catalogVariants) {
    pushVariant(variant);
  }

  // Si el query usa solo el apellido, probar también el nombre completo del prócer.
  // Ej: "Mitre 200, Salta" → también intenta "Bartolomé Mitre 200, Salta".
  // Esto ayuda cuando Google Maps devuelve partial_match para la forma corta.
  const expandedBase = applyStreetNameExpansions(withSalta);
  if (expandedBase !== withSalta) {
    pushVariant(expandedBase);
  }

  const normalized = normalizeForMatch(withSalta);
  const unique = new Set();
  const result = [];
  for (const variant of variants) {
    const key = normalizeForMatch(variant);
    if (!key || unique.has(key)) continue;
    unique.add(key);
    result.push(variant);
  }

  if (!result.some((item) => normalizeForMatch(item).includes('salta'))) {
    result.push(`${base}, Salta`);
  }

  return result.slice(0, 9);
}

function scoreGeocodeResult(result, query) {
  const queryTokens = new Set(tokenizeAddress(query));
  const formatted = result?.formatted_address || '';
  const addressTokens = new Set(tokenizeAddress(formatted));
  const addressComponents = Array.isArray(result?.address_components) ? result.address_components : [];
  const locationType = result?.geometry?.location_type || '';
  const types = Array.isArray(result?.types) ? result.types : [];

  let tokenOverlap = 0;
  queryTokens.forEach((token) => {
    if (addressTokens.has(token)) tokenOverlap += 1;
  });

  let score = queryTokens.size > 0 ? tokenOverlap / queryTokens.size : 0;

  if (locationType === 'ROOFTOP') score += 0.5;
  else if (locationType === 'RANGE_INTERPOLATED') score += 0.35;
  else if (locationType === 'GEOMETRIC_CENTER') score += 0.2;
  else if (locationType === 'APPROXIMATE') score -= 0.1;

  if (result?.partial_match) score -= 0.25;

  const queryNumbers = extractNumbers(query);
  const addressNumbers = extractNumbers(formatted);
  if (queryNumbers.size > 0) {
    let matchedNumbers = 0;
    queryNumbers.forEach((num) => {
      if (addressNumbers.has(num)) matchedNumbers += 1;
    });
    score += matchedNumbers > 0 ? 0.35 : -0.25;
  }

  const hasStreetNumber = addressComponents.some((component) => component?.types?.includes('street_number'));
  const hasRoute = addressComponents.some((component) => component?.types?.includes('route'));
  if (hasStreetNumber) score += 0.15;
  if (hasRoute) score += 0.1;

  const normalizedFormatted = normalizeForMatch(formatted);
  if (normalizedFormatted.includes('salta')) score += 0.2;
  if (types.includes('street_address')) score += 0.15;
  if (types.includes('intersection')) score += 0.1;

  // Penalización fuerte si ningún token de contenido real del query aparece en el resultado.
  // Evita que bonuses de tipo/locationType inflen scores de resultados sin relación semántica.
  const CITY_STOPWORDS = new Set(['salta', 'argentina', 'capital']);
  const contentQueryTokens = [...queryTokens].filter((t) => !CITY_STOPWORDS.has(t));
  if (contentQueryTokens.length > 0) {
    const hasAnyContentMatch = contentQueryTokens.some((t) => addressTokens.has(t));
    if (!hasAnyContentMatch) score -= 0.6;
  }

  return score;
}

/**
 * Detecta direcciones que Google Maps no puede geocodificar con precisión y requieren GPS:
 * - Pasajes / callejones: raramente indexados en Google Maps.
 * - Manzana + Lote: sistema catastral de barrios populares, no soportado por Google Maps.
 * - Km de ruta: referencia a un kilómetro de una ruta nacional/provincial, coordenadas imprecisas.
 * Retorna { required: boolean, reason: 'pasaje' | 'manzana_lote' | 'km_ruta' | null }
 */
function requiresGpsForAddress(address) {
  const normalized = normalizeForMatch(address || '');
  if (!normalized) return { required: false, reason: null };

  // Pasaje o callejón
  if (/\b(pasaje|pje\.?|callejon|callej[oó]n)\b/.test(normalized)) {
    return { required: true, reason: 'pasaje' };
  }

  // Manzana (con o sin lote) — el sistema catastral nunca geocodifica bien
  if (/\b(manzana|mz\.?)\s*\d+/.test(normalized)) {
    return { required: true, reason: 'manzana_lote' };
  }

  // Kilómetro de ruta nacional/provincial — Google Maps puede devolver un punto
  // en la ruta pero sin precisión de punto de retiro real.
  // Ej: "ruta 9 km 7", "km 12 de la ruta 68", "a 5 km de la salida norte"
  if (/\b(?:ruta\s*(?:nacional|provincial|nac\.?|prov\.?)?\s*\d+|km\s*\d+)\b/.test(normalized)) {
    return { required: true, reason: 'km_ruta' };
  }

  return { required: false, reason: null };
}

function inferTripHeuristics(combinedText) {
  const text = String(combinedText || '').trim();
  const normalized = normalizeForMatch(text);

  const looksLikeTripRequest = /(remis|taxi|movil|m[oó]vil|\bauto\b|coche|viaje|pasame\s+a\s+buscar|busc[aá][sm]e?|me\s+busc[aá]s|llevame|llevarme|quiero\s+ir|mand[aá](?:me)?\s+(?:un|una|uno|el|la|m[oó]vil|movil|remis|taxi|auto)|ven[ií]\s+a\s+buscarme)/i.test(normalized);

  // Casos de ruta completa en una sola oración.
  // Ej: "un remis para belgrano al 200, voy para mitre al 300"
  const fullTrip = extractFullTripByPattern(text);
  if (fullTrip) {
    return {
      pickup: fullTrip.pickup,
      destination: fullTrip.destination,
      looksLikeTripRequest,
    };
  }

  // "mandame uno a Belgrano al 200" / "necesito un remis para ..."
  // Tomamos explícitamente lo que sigue después de "a/para/en" como pickup.
  const directRequestPickupMatch = splitAddressFromIntentPhrase(
    text,
    /(?:mand[aá](?:me)?|necesito|quiero|pedido)\s+(?:un|una|uno|el|la)?\s*(?:remis|m[oó]vil|movil|taxi|auto|coche|viaje)?\s*(?:para|a|en)\s+/i
  );
  if (directRequestPickupMatch && looksLikeTripRequest) {
    return {
      pickup: sanitizeAddressInput(directRequestPickupMatch),
      destination: null,
      looksLikeTripRequest,
    };
  }

  // "un movil/remis/taxi para [dirección]" → pickup = dirección
  // Esto es lo más común: el pasajero pide que lo busquen EN ese lugar
  const movilParaMatch = splitAddressFromIntentPhrase(
    text,
    /(?:remis|m[oó]vil|movil|taxi|auto)\s+(?:para|a|en)\s+/i
  );
  if (movilParaMatch && looksLikeTripRequest) {
    return {
      pickup: sanitizeAddressInput(movilParaMatch),
      destination: null,
      looksLikeTripRequest,
    };
  }

  const pickupMatch = splitAddressFromIntentPhrase(
    text,
    /(?:pasame\s+a\s+buscar(?:me)?|busc[aá][sm]e?|me\s+busc[aá]s?\s+en|retiro(?:\s+en)?|estoy\s+en|origen(?:\s+es)?|desde)\s*[:,-]?\s*/i
  );
  const destinationMatch = splitAddressFromIntentPhrase(
    text,
    /(?:destino(?:\s+es)?|hacia|hasta|llevame\s+a|quiero\s+ir\s+a|voy\s+para|voy\s+a)\s*/i
  );

  let pickup = sanitizeAddressInput(pickupMatch || '');
  let destination = sanitizeAddressInput(destinationMatch || '');

  // Si el mensaje parece un pedido de viaje y tiene forma de intersección/dirección pero sin
  // keywords de destino, tratar el texto completo como pickup
  if (looksLikeTripRequest && !pickup && !destination) {
    // Detectar si el texto (sin la palabra del pedido) parece una dirección o intersección
    const addressPart = text
      .replace(/(?:remis|m[oó]vil|movil|taxi|auto|viaje|quiero|pedir?|necesito|manda(?:me)?|un|una|por\s+favor)\s*/gi, '')
      .trim();
    if (addressPart.length >= 4) {
      pickup = normalizeAddressPhrase(addressPart);
    }
  }

  if (pickup) pickup = normalizeAddressPhrase(pickup);
  if (destination) destination = normalizeAddressPhrase(destination);

  return {
    pickup,
    destination,
    looksLikeTripRequest,
  };
}

function isCoarseGeocodeResult(result, originalQuery) {
  const formatted = normalizeText(result?.formatted_address || '');
  const types = Array.isArray(result?.types) ? result.types : [];
  const locationType = result?.geometry?.location_type || '';
  const components = Array.isArray(result?.address_components) ? result.address_components : [];

  const hasRoute = components.some((c) => Array.isArray(c.types) && c.types.includes('route'));
  const hasStreetNumber = components.some((c) => Array.isArray(c.types) && c.types.includes('street_number'));
  const hasPremise = components.some((c) => Array.isArray(c.types) && (c.types.includes('premise') || c.types.includes('subpremise')));

  const queryNorm = normalizeText(originalQuery);
  const queryHasNumber = /\d{1,5}/.test(queryNorm);
  const queryNumbers = extractNumbers(queryNorm);
  const formattedNumbers = extractNumbers(formatted);
  let hasMatchingNumber = false;
  if (queryNumbers.size > 0) {
    queryNumbers.forEach((num) => {
      if (formattedNumbers.has(num)) hasMatchingNumber = true;
    });
  }
  const cityOnlyPatterns = ['salta, argentina', 'salta, salta, argentina'];
  const isCityOnly = cityOnlyPatterns.includes(formatted);

  const onlyBroadTypes = types.every((t) =>
    ['locality', 'administrative_area_level_1', 'administrative_area_level_2', 'country', 'political'].includes(t)
  );

  if (isCityOnly) return true;
  if (onlyBroadTypes) return true;
  if (locationType === 'APPROXIMATE' && !hasRoute && !hasStreetNumber && !hasPremise) return true;
  if (queryHasNumber && !hasStreetNumber) {
    // Accept route-level matches when Google omits street_number component
    // but the formatted address still includes the same house number.
    if (!hasRoute) return true;
    if (!hasMatchingNumber && !hasPremise) return true;
  }

  return false;
}

function extractDirectAddressCandidate(text) {
  const lines = String(text || '')
    .split('\n')
    .map((line) => sanitizeAddressInput(line))
    .filter(Boolean);
  if (lines.length === 0) return null;

  const candidate = lines[lines.length - 1];
  const hasStreetAndNumber = /[a-zA-ZÀ-ÿ]{2,}[\w\s.'-]*\s\d{1,5}\b/.test(candidate);
  if (!hasStreetAndNumber) return null;

  // Avoid stealing intent from explicit "de ... a ..." messages.
  if (/\bde\b.+\ba\b/i.test(candidate)) return null;

  return normalizeAddressPhrase(candidate);
}

function getKnowledgeCandidatesForHint(hint, allCandidates = [], maxResults = 6) {
  const cleanHint = sanitizeAddressInput(hint || '');
  if (!cleanHint) return [];

  const hintTokens = new Set(tokenizeAddress(cleanHint));
  const hintNumbers = extractNumbers(cleanHint);

  const scored = (allCandidates || [])
    .map((candidate) => {
      const address = sanitizeAddressInput(candidate || '');
      if (!address) return null;
      const candidateTokens = new Set(tokenizeAddress(address));
      const candidateNumbers = extractNumbers(address);
      let score = 0;

      hintNumbers.forEach((num) => {
        if (candidateNumbers.has(num)) score += 2;
      });
      hintTokens.forEach((token) => {
        if (candidateTokens.has(token)) score += 0.6;
      });

      return { address, score };
    })
    .filter(Boolean)
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map((item) => item.address);

  return scored;
}

function ensureServerConfig() {
  const missing = getMissingServerConfig();
  if (missing.length > 0) {
    throw new Error(`Faltan variables de entorno: ${missing.join(', ')}`);
  }
}

function getMissingServerConfig() {
  const missing = [];
  if (!process.env.SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!OPENAI_API_KEY) missing.push('OPENAI_API_KEY');
  if (!WASENDER_API_KEY) missing.push('WASENDER_API_KEY');
  if (!GOOGLE_MAPS_API_KEY) missing.push('GOOGLE_MAPS_API_KEY');
  return missing;
}

function getSupabase() {
  ensureServerConfig();
  if (!supabaseClient) {
    supabaseClient = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: { persistSession: false, autoRefreshToken: false },
      }
    );
  }
  return supabaseClient;
}

function getKnowledgeSupabase() {
  if (!SUPABASE_PUBLIC_URL || !SUPABASE_PUBLIC_ANON_KEY) {
    throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  if (!knowledgeSupabaseClient) {
    knowledgeSupabaseClient = createClient(SUPABASE_PUBLIC_URL, SUPABASE_PUBLIC_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return knowledgeSupabaseClient;
}

async function loadGlobalAddressKnowledge() {
  const now = Date.now();
  if (globalAddressKnowledgeCache.expiresAt > now && globalAddressKnowledgeCache.addresses.length > 0) {
    return globalAddressKnowledgeCache.addresses;
  }

  const { data, error } = await getSupabase()
    .from('whatsapp_messages')
    .select('content, created_at')
    .eq('direction', 'incoming')
    .eq('message_type', 'text')
    .not('content', 'is', null)
    .order('created_at', { ascending: false })
    .limit(MAX_GLOBAL_KNOWLEDGE_MESSAGES);

  if (error) {
    logWebhook('knowledge_global_load_error', { error: summarizeDbError(error) });
    return [];
  }

  const entries = [];
  for (const row of data || []) {
    const snippets = extractAddressSnippetsFromText(row.content);
    for (const snippet of snippets) {
      entries.push({ address: snippet, count: 1, lastSeenAt: row.created_at || null });
    }
  }

  const ranked = rankAddresses(entries, MAX_KNOWLEDGE_ADDRESSES);
  globalAddressKnowledgeCache = {
    expiresAt: Date.now() + GLOBAL_KNOWLEDGE_TTL_MS,
    addresses: ranked,
  };

  logWebhook('knowledge_global_loaded', {
    messagesAnalyzed: (data || []).length,
    addressesRanked: ranked.length,
  });

  return ranked;
}

async function loadPhoneAddressKnowledge(phone) {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) return [];

  const { data: conversations, error: convsError } = await getSupabase()
    .from('whatsapp_conversations')
    .select('id, updated_at')
    .eq('phone', normalizedPhone)
    .order('updated_at', { ascending: false })
    .limit(10);

  if (convsError) {
    logWebhook('knowledge_phone_chats_error', {
      phone: maskPhone(phone),
      error: summarizeDbError(convsError),
    });
    return [];
  }

  const conversationIds = (conversations || []).map((c) => c.id).filter(Boolean);
  if (conversationIds.length === 0) return [];

  const { data: messages, error: messagesError } = await getSupabase()
    .from('whatsapp_messages')
    .select('conversation_id, content, created_at')
    .eq('direction', 'incoming')
    .eq('message_type', 'text')
    .in('conversation_id', conversationIds)
    .not('content', 'is', null)
    .order('created_at', { ascending: false })
    .limit(MAX_PHONE_KNOWLEDGE_MESSAGES);

  if (messagesError) {
    logWebhook('knowledge_phone_messages_error', {
      phone: maskPhone(phone),
      error: summarizeDbError(messagesError),
    });
    return [];
  }

  const entries = [];
  for (const row of messages || []) {
    const snippets = extractAddressSnippetsFromText(row.content);
    for (const snippet of snippets) {
      entries.push({ address: snippet, count: 1, lastSeenAt: row.created_at || null });
    }
  }

  const ranked = rankAddresses(entries, MAX_KNOWLEDGE_ADDRESSES);
  logWebhook('knowledge_phone_loaded', {
    phone: maskPhone(phone),
    conversationsFound: conversationIds.length,
    messagesAnalyzed: (messages || []).length,
    addressesRanked: ranked.length,
  });

  return ranked;
}

async function getAddressKnowledgeContext({ phone, combinedText, pickupHint }) {
  try {
    await loadSaltaStreetCatalog().catch(() => null);

    const [globalAddresses, phoneAddresses] = await Promise.all([
      loadGlobalAddressKnowledge(),
      loadPhoneAddressKnowledge(phone),
    ]);

    const mergedKnowledgeCandidates = mergeKnowledgeCandidates({
      pickupHint,
      combinedText,
      phoneAddresses,
      globalAddresses,
    });

    const catalogCandidates = getCatalogAddressVariants(
      `${pickupHint || ''} ${combinedText || ''}`,
      6
    );

    const candidateAddresses = [];
    const seen = new Set();
    for (const candidate of [...mergedKnowledgeCandidates, ...catalogCandidates]) {
      const clean = sanitizeAddressInput(candidate || '');
      const key = normalizeAddressKey(clean);
      if (!clean || !key || seen.has(key)) continue;
      seen.add(key);
      candidateAddresses.push(clean);
      if (candidateAddresses.length >= 12) break;
    }

    return {
      owner: LEGACY_CHAT_OWNER,
      phoneAddresses,
      globalAddresses,
      candidateAddresses,
    };
  } catch (error) {
    logWebhook('knowledge_context_error', {
      phone: maskPhone(phone),
      owner: LEGACY_CHAT_OWNER,
      error: error?.message || 'unknown_error',
    });
    return {
      owner: LEGACY_CHAT_OWNER,
      phoneAddresses: [],
      globalAddresses: [],
      candidateAddresses: [],
    };
  }
}

function hydratePickupFromKnowledge(pickupLocation, knowledge = {}) {
  const current = sanitizeAddressInput(pickupLocation || '');
  const candidates = Array.isArray(knowledge?.candidateAddresses) ? knowledge.candidateAddresses : [];
  if (candidates.length === 0) return current;

  if (!current) return sanitizeAddressInput(candidates[0] || '');

  const currentTokens = new Set(tokenizeAddress(current));
  const currentNums = extractNumbers(current);

  // Si el usuario manda un texto corto o ambiguo, usamos el mejor match histórico.
  const isShortAmbiguous = current.length <= 8 || currentTokens.size <= 1;
  if (!isShortAmbiguous && currentNums.size > 0) return current;

  let bestMatch = null;
  let bestScore = -Infinity;
  for (const candidate of candidates) {
    const candidateTokens = new Set(tokenizeAddress(candidate));
    const candidateNums = extractNumbers(candidate);
    let score = 0;

    currentNums.forEach((num) => {
      if (candidateNums.has(num)) score += 3;
    });
    currentTokens.forEach((token) => {
      if (candidateTokens.has(token)) score += 0.7;
    });

    if (score > bestScore) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  if (bestMatch && bestScore >= 1) {
    logWebhook('knowledge_pickup_hydrated', {
      rawPickup: current,
      hydratedPickup: bestMatch,
      score: Math.round(bestScore * 100) / 100,
    });
    return sanitizeAddressInput(bestMatch);
  }

  return current;
}

function getOpenAI() {
  ensureServerConfig();
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: OPENAI_API_KEY });
  }
  return openaiClient;
}

function extractPhoneFromMessage(messageData) {
  const key = messageData?.key || {};
  return normalizePhone(
    key.cleanedSenderPn ||
      key.senderPn?.replace('@s.whatsapp.net', '').replace('@lid', '') ||
      key.remoteJid?.replace('@s.whatsapp.net', '').replace('@lid', '') ||
      ''
  );
}

function detectMessageType(message = {}) {
  if (message.imageMessage) return 'image';
  if (message.videoMessage) return 'video';
  if (message.audioMessage) return 'audio';
  if (message.documentMessage) return 'document';
  if (message.stickerMessage) return 'sticker';
  if (message.locationMessage) return 'location';
  if (message.contactMessage) return 'contact';
  if (message.pollUpdateMessage) return 'poll_response';
  return 'text';
}

function extractMessageText(messageData) {
  const message = messageData?.message || {};

  // Poll vote response: extract selected option name as plain text
  if (message.pollUpdateMessage) {
    const selected = message.pollUpdateMessage?.vote?.selectedOptions ||
      message.pollUpdateMessage?.selectedOptions || [];
    const names = (Array.isArray(selected) ? selected : [])
      .map((o) => (typeof o === 'string' ? o : o?.name || o?.optionName || ''))
      .filter(Boolean);
    if (names.length > 0) return names[0];
  }

  return (
    messageData?.messageBody ||
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.documentMessage?.caption ||
    message.text ||
    ''
  ).trim();
}

async function decryptAudioMessage(messageData) {
  const audioMessage = messageData?.message?.audioMessage;
  if (!audioMessage) return null;

  const payload = {
    data: {
      messages: {
        key: { id: messageData.key.id },
        message: {
          audioMessage: {
            url: audioMessage.url,
            mimetype: audioMessage.mimetype || 'audio/ogg',
            mediaKey: audioMessage.mediaKey,
            fileSha256: audioMessage.fileSha256 || undefined,
            fileLength: audioMessage.fileLength || undefined,
          },
        },
      },
    },
  };

  const response = await fetchWithRetry(`${WASENDER_BASE_URL}/decrypt-media`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WASENDER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`No se pudo desencriptar el audio: ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  return data.publicUrl || null;
}

async function transcribeAudioFromUrl(audioUrl) {
  const response = await fetchWithRetry(audioUrl, {}, { label: 'audio_download' });
  if (!response.ok) {
    throw new Error(`No se pudo descargar el audio: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 100) {
    throw new Error('Audio inválido o vacío');
  }

  const file = await toFile(buffer, 'audio.ogg', { type: 'audio/ogg' });
  const transcription = await getOpenAI().audio.transcriptions.create({
    model: 'whisper-1',
    file,
    language: 'es',
    response_format: 'text',
  });

  return typeof transcription === 'string' ? transcription.trim() : (transcription.text || '').trim();
}

async function appendIncomingMessage({
  phone,
  pushName,
  messageId,
  messageType,
  content,
  mediaUrl = null,
  transcription = null,
  rawPayload,
}) {
  logWebhook('db_append_incoming_start', {
    phone: maskPhone(phone),
    messageId,
    messageType,
    hasContent: Boolean(content),
    hasTranscription: Boolean(transcription),
  });

  const { data, error } = await getSupabase().rpc('append_whatsapp_message', {
    p_phone: normalizePhone(phone),
    p_push_name: pushName || null,
    p_external_message_id: messageId,
    p_direction: 'incoming',
    p_message_type: messageType,
    p_content: content || null,
    p_media_url: mediaUrl,
    p_transcription: transcription,
    p_raw_payload: rawPayload,
  });

  if (error) {
    logWebhook('db_append_incoming_error', { error: summarizeDbError(error) });
    throw error;
  }

  const result = Array.isArray(data) ? data[0] : data;
  logWebhook('db_append_incoming_ok', {
    conversationId: result?.conversation_id || null,
    inserted: Boolean(result?.inserted),
  });
  return result;
}

async function insertOutgoingMessage({ phone, messageId, content, rawPayload = null }) {
  // Registro de mensajes salientes omitido en arquitectura trips-only.
  // Los mensajes se envían vía WaSender; el log local en whatsapp_messages
  // ya no es necesario porque el estado del flujo vive en la tabla trips.
  // Dejar la función para no romper los callers; simplemente no hace nada.
  void phone; void messageId; void content; void rawPayload;
}

async function sendWhatsAppText(phone, text) {
  const to = toWhatsAppJid(phone);
  if (!to) {
    throw new Error(`Número de WhatsApp inválido: ${maskPhone(phone)}`);
  }

  const response = await fetchWithRetry(`${WASENDER_BASE_URL}/send-message`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WASENDER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ to, text }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`No se pudo enviar WhatsApp: ${body.slice(0, 200)}`);
  }

  const payload = await response.json();
  await insertOutgoingMessage({
    phone,
    messageId: String(payload?.data?.msgId || `out_${Date.now()}`),
    content: text,
    rawPayload: payload,
  });
  return payload;
}

/**
 * Resuelve un JID de WhatsApp a número de teléfono normalizado.
 * Soporta formato @s.whatsapp.net (directo) y @lid (requiere llamada API de WASender).
 * Retorna null si no se puede resolver.
 */
async function resolvePhoneFromJid(jid) {
  if (!jid) return null;
  const s = String(jid).trim();

  if (s.includes('@s.whatsapp.net')) {
    return normalizePhone(s.replace('@s.whatsapp.net', '')) || null;
  }

  if (s.includes('@lid')) {
    try {
      const response = await fetchWithRetry(
        `${WASENDER_BASE_URL}/pn-from-lid/${encodeURIComponent(s)}`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${WASENDER_API_KEY}` },
        }
      );
      if (response.ok) {
        const payload = await response.json();
        const pn = String(payload?.data?.pn || '').replace('@s.whatsapp.net', '');
        return normalizePhone(pn) || null;
      }
    } catch {
      // ignorar errores de resolución LID
    }
  }

  return null;
}

async function sendWhatsAppPoll(phone, question, options) {
  const to = toWhatsAppJid(phone);
  if (!to) {
    throw new Error(`Número de WhatsApp inválido para encuesta: ${maskPhone(phone)}`);
  }

  const response = await fetchWithRetry(`${WASENDER_BASE_URL}/send-message`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WASENDER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to,
      poll: {
        question,
        options,
        multiSelect: false,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`No se pudo enviar encuesta WhatsApp: ${body.slice(0, 200)}`);
  }

  const payload = await response.json();
  const msgId = String(payload?.data?.msgId || `poll_${Date.now()}`);
  await insertOutgoingMessage({
    phone,
    messageId: msgId,
    content: `[ENCUESTA] ${question}: ${options.join(' | ')}`,
    rawPayload: payload,
  });
  return { msgId, payload };
}

async function claimConversationBatch(conversationId) {
  logWebhook('db_claim_batch_start', { conversationId });
  const { data, error } = await getSupabase().rpc('claim_whatsapp_conversation_batch', {
    p_conversation_id: conversationId,
  });

  if (error) {
    logWebhook('db_claim_batch_error', { conversationId, error: summarizeDbError(error) });
    throw error;
  }

  const result = Array.isArray(data) ? data[0] : data;
  logWebhook('db_claim_batch_ok', {
    conversationId,
    claimed: Boolean(result?.id),
    status: result?.status || null,
  });
  return result;
}

async function finalizeConversation(conversationId, updates = {}) {
  const payload = {
    ...updates,
    updated_at: new Date().toISOString(),
  };
  const { error } = await getSupabase()
    .from('whatsapp_conversations')
    .update(payload)
    .eq('id', conversationId);
  if (error) {
    logWebhook('db_finalize_conversation_error', { conversationId, error: summarizeDbError(error) });
    throw error;
  }
  logWebhook('db_finalize_conversation_ok', {
    conversationId,
    status: updates?.status || null,
    hasContext: Boolean(updates?.context),
  });
}

async function getRecentConversationMessages(conversationId, limit = 12) {
  const { data, error } = await getSupabase()
    .from('whatsapp_messages')
    .select('direction, content, transcription, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  logWebhook('db_recent_messages_ok', {
    conversationId,
    limit,
    returned: (data || []).length,
  });
  return (data || []).reverse();
}

function isOpenTripStatus(status) {
  return OPEN_TRIP_STATUSES.includes(String(status || '').toLowerCase());
}

function getTripAgeMinutes(trip) {
  const createdAtMs = new Date(trip?.created_at || 0).getTime();
  if (!Number.isFinite(createdAtMs) || createdAtMs <= 0) return null;
  return Math.max(0, Math.round((Date.now() - createdAtMs) / 60000));
}

function shouldBlockForOpenTrip(trip) {
  if (!trip) return false;
  const status = String(trip.status || '').toLowerCase();
  if (status !== 'pending') return true;
  const ageMinutes = getTripAgeMinutes(trip);
  if (ageMinutes == null) return true;
  return ageMinutes <= PENDING_GUARD_MAX_AGE_MINUTES;
}

async function getOpenTripById(tripId) {
  if (!tripId) return null;
  const { data, error } = await getSupabase()
    .from('trips')
    .select('id, status, passenger_phone, destination_address, created_at, wa_context')
    .eq('id', tripId)
    .maybeSingle();
  if (error) throw error;
  if (!data || !isOpenTripStatus(data.status)) return null;
  return data;
}

async function getTripById(tripId) {
  if (!tripId) return null;
  const { data, error } = await getSupabase()
    .from('trips')
    .select('id, status, passenger_phone, destination_address, created_at, completed_at, wa_context')
    .eq('id', tripId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function getConversationFlowTripById(tripId) {
  if (!tripId) return null;

  const { data, error } = await getSupabase()
    .from('trips')
    .select(
      'id, driver_id, status, passenger_name, passenger_phone, tracking_token, origin_address, origin_lat, origin_lng, destination_address, destination_lat, destination_lng, notes, cancel_reason, created_at, assigned_at, accepted_at, started_at, completed_at, wa_notified_at'
    )
    .eq('id', tripId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function getDriverById(driverId) {
  if (!driverId) return null;

  const { data, error } = await getSupabase()
    .from('drivers')
    .select('id, full_name, phone, push_token, current_lat, current_lng, vehicle_brand, vehicle_model, vehicle_plate, vehicle_color')
    .eq('id', driverId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function getLatestOpenTripByPhone(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  const { data, error } = await getSupabase()
    .from('trips')
    .select('id, status, passenger_phone, destination_address, created_at, wa_context')
    .eq('passenger_phone', normalized)
    .in('status', OPEN_TRIP_STATUSES)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function getLatestConversationByPhone(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  const { data, error } = await getSupabase()
    .from('whatsapp_conversations')
    .select('id, phone, context, updated_at')
    .eq('phone', normalized)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

function readPassengerLifecycleFollowupState(context = {}) {
  const rawState = context?.passenger_lifecycle_followup;
  if (!rawState || typeof rawState !== 'object' || Array.isArray(rawState)) {
    return {
      lastSentAtMs: null,
      lastType: null,
      lastTripId: null,
    };
  }

  const lastSentAtMs = new Date(rawState.last_sent_at || 0).getTime();
  return {
    lastSentAtMs: Number.isFinite(lastSentAtMs) && lastSentAtMs > 0 ? lastSentAtMs : null,
    lastType: typeof rawState.last_type === 'string' ? rawState.last_type : null,
    lastTripId: rawState.last_trip_id ? String(rawState.last_trip_id) : null,
  };
}

async function sendPassengerLifecycleFollowup({
  phone,
  text,
  noticeType,
  relatedTripId = null,
} = {}) {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone || !text) {
    return { sent: false, reason: 'invalid_input' };
  }

  let conversation = null;
  let conversationContext = {};
  try {
    conversation = await getLatestConversationByPhone(normalizedPhone);
    conversationContext = safeJsonParse(conversation?.context, {});
  } catch (error) {
    logWebhook('passenger_lifecycle_followup_lookup_error', {
      phone: maskPhone(normalizedPhone),
      error: error?.message || 'unknown_error',
    });
  }

  const nowMs = Date.now();
  const persistentState = readPassengerLifecycleFollowupState(conversationContext);
  const memoryState = passengerLifecycleFollowupMemory.get(normalizedPhone) || {};
  const lastSentAtMs = Math.max(
    persistentState.lastSentAtMs || 0,
    Number(memoryState.lastSentAtMs) || 0
  );

  if (
    lastSentAtMs > 0 &&
    nowMs - lastSentAtMs < PASSENGER_LIFECYCLE_FOLLOWUP_MIN_INTERVAL_MS
  ) {
    logWebhook('passenger_lifecycle_followup_throttled', {
      phone: maskPhone(normalizedPhone),
      noticeType: noticeType || null,
      relatedTripId: relatedTripId || null,
      lastNoticeType: persistentState.lastType || memoryState.lastType || null,
      secondsSinceLast: Math.round((nowMs - lastSentAtMs) / 1000),
      minIntervalSeconds: Math.round(PASSENGER_LIFECYCLE_FOLLOWUP_MIN_INTERVAL_MS / 1000),
    });
    return { sent: false, reason: 'throttled' };
  }

  try {
    await sendWhatsAppText(normalizedPhone, text);
  } catch (error) {
    logWebhook('passenger_lifecycle_followup_send_error', {
      phone: maskPhone(normalizedPhone),
      noticeType: noticeType || null,
      relatedTripId: relatedTripId || null,
      error: error?.message || 'unknown_error',
    });
    return { sent: false, reason: 'send_error' };
  }

  const sentAtIso = new Date(nowMs).toISOString();
  passengerLifecycleFollowupMemory.set(normalizedPhone, {
    lastSentAtMs: nowMs,
    lastType: noticeType || null,
    lastTripId: relatedTripId ? String(relatedTripId) : null,
  });

  if (conversation?.id) {
    const updatedContext = {
      ...conversationContext,
      passenger_lifecycle_followup: {
        last_sent_at: sentAtIso,
        last_type: noticeType || null,
        last_trip_id: relatedTripId ? String(relatedTripId) : null,
      },
    };

    const { error } = await getSupabase()
      .from('whatsapp_conversations')
      .update({
        context: updatedContext,
        updated_at: sentAtIso,
      })
      .eq('id', conversation.id);

    if (error) {
      logWebhook('passenger_lifecycle_followup_context_error', {
        conversationId: conversation.id,
        phone: maskPhone(normalizedPhone),
        error: summarizeDbError(error),
      });
    }
  }

  logWebhook('passenger_lifecycle_followup_sent', {
    phone: maskPhone(normalizedPhone),
    noticeType: noticeType || null,
    relatedTripId: relatedTripId || null,
  });

  return { sent: true };
}

function buildDynamicSearchRadii(searchElapsedMs = 0) {
  const normalizedRadii = (SEARCH_RADII_KM || [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b)
    .filter((value, index, arr) => index === 0 || value !== arr[index - 1]);

  if (!normalizedRadii.length) {
    return {
      allowedRadiiKm: [1, 2],
      expansionStep: 0,
      maxRadiusKm: 2,
    };
  }

  const baseIndex = Math.min(1, normalizedRadii.length - 1); // Siempre iniciar con 1km y 2km si existen
  const safeElapsedMs = Math.max(0, Number(searchElapsedMs) || 0);
  const expansionStep = Math.max(0, Math.floor(safeElapsedMs / DRIVER_SEARCH_EXPANSION_INTERVAL_MS));
  const maxRadiusIndex = Math.min(normalizedRadii.length - 1, baseIndex + expansionStep);

  return {
    allowedRadiiKm: normalizedRadii.slice(0, maxRadiusIndex + 1),
    expansionStep,
    maxRadiusKm: normalizedRadii[maxRadiusIndex],
  };
}

function isAutomaticTimeoutCancellationReason(reasonValue) {
  const reason = normalizeReason(reasonValue);
  if (!reason) return false;
  return reason.includes('auto timeout') || (reason.includes('no acept') && reason.includes('tiempo'));
}

async function getPassengerReassignmentContext(phone) {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    return {
      timeoutCancelledDriverIds: [],
      timeoutAttempts: 0,
      timeoutElapsedMs: 0,
    };
  }

  const recentCutoff = new Date(Date.now() - REASSIGNMENT_LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
  const { data, error } = await getSupabase()
    .from('trips')
    .select('driver_id, cancel_reason, created_at')
    .eq('passenger_phone', normalizedPhone)
    .eq('status', 'cancelled')
    .gte('created_at', recentCutoff)
    .order('created_at', { ascending: true });

  if (error) {
    logWebhook('reassign_context_error', {
      phone: maskPhone(normalizedPhone),
      error: summarizeDbError(error),
    });
    return {
      timeoutCancelledDriverIds: [],
      timeoutAttempts: 0,
      timeoutElapsedMs: 0,
    };
  }

  const timeoutCancelledDriverIdSet = new Set();
  let timeoutAttempts = 0;
  let oldestTimeoutCreatedAtMs = null;

  for (const row of data || []) {
    if (!isAutomaticTimeoutCancellationReason(row?.cancel_reason)) continue;
    timeoutAttempts += 1;

    if (row?.driver_id) timeoutCancelledDriverIdSet.add(row.driver_id);

    const createdAtMs = new Date(row?.created_at || 0).getTime();
    if (Number.isFinite(createdAtMs) && createdAtMs > 0) {
      if (oldestTimeoutCreatedAtMs == null || createdAtMs < oldestTimeoutCreatedAtMs) {
        oldestTimeoutCreatedAtMs = createdAtMs;
      }
    }
  }

  const timeoutElapsedMs = oldestTimeoutCreatedAtMs != null
    ? Math.max(0, Date.now() - oldestTimeoutCreatedAtMs)
    : timeoutAttempts * PENDING_ACCEPT_TIMEOUT_MS;

  return {
    timeoutCancelledDriverIds: [...timeoutCancelledDriverIdSet],
    timeoutAttempts,
    timeoutElapsedMs,
  };
}

function getTripDispatchExcludedDriverIds(waContext) {
  const context = safeJsonParse(waContext, {});
  const excluded = Array.isArray(context?.dispatch_excluded_driver_ids)
    ? context.dispatch_excluded_driver_ids
    : [];
  const normalized = [];
  for (const value of excluded) {
    const id = String(value || '').trim();
    if (!id || normalized.includes(id)) continue;
    normalized.push(id);
  }
  return normalized;
}

async function addTripDispatchExcludedDriverId(tripId, driverId, reason = 'unknown') {
  if (!tripId || !driverId) return false;

  const { data: tripRow, error: readError } = await getSupabase()
    .from('trips')
    .select('wa_context')
    .eq('id', tripId)
    .maybeSingle();

  if (readError) {
    logWebhook('trip_dispatch_excluded_driver_read_error', {
      tripId,
      driverId,
      reason,
      error: summarizeDbError(readError),
    });
    return false;
  }

  const waContext = safeJsonParse(tripRow?.wa_context, {});
  const previousExcluded = getTripDispatchExcludedDriverIds(waContext);
  if (previousExcluded.includes(driverId)) {
    return true;
  }

  const updatedExcluded = [...previousExcluded, driverId];
  const updatedContext = {
    ...waContext,
    dispatch_excluded_driver_ids: updatedExcluded,
    dispatch_last_notify_fail_reason: String(reason || 'unknown').slice(0, 140),
    dispatch_last_excluded_at: new Date().toISOString(),
  };

  const { error: updateError } = await getSupabase()
    .from('trips')
    .update({ wa_context: updatedContext })
    .eq('id', tripId);

  if (updateError) {
    logWebhook('trip_dispatch_excluded_driver_update_error', {
      tripId,
      driverId,
      reason,
      error: summarizeDbError(updateError),
    });
    return false;
  }

  logWebhook('trip_dispatch_excluded_driver_added', {
    tripId,
    driverId,
    reason,
    excludedCount: updatedExcluded.length,
  });
  return true;
}

function getTripPickupPoint(trip) {
  return {
    address: trip?.destination_address || null,
    lat: Number(trip?.destination_lat),
    lng: Number(trip?.destination_lng),
  };
}

function shouldReassignCancelledTrip(trip) {
  const reason = normalizeReason(trip?.cancel_reason || '');
  if (!reason) return true;

  const nonReassignableReasons = [
    'pasajero cancelo',
    'pasajero cancelo el viaje',
    'pasajero no encontrado',
    'direccion incorrecta',
  ];

  return !nonReassignableReasons.includes(reason);
}

/**
 * Detecta cancelaciones causadas por fallo del sistema (push no entregado,
 * timeout de aceptación, etc.) donde el chofer original NUNCA rechazó el viaje.
 * En esos casos no se debe excluir al mismo chofer en el reintento.
 */
function isSystemFailureCancellation(trip) {
  const rawReason = trip?.cancel_reason || '';
  if (isAutomaticTimeoutCancellationReason(rawReason)) {
    return true;
  }

  const reason = normalizeReason(trip?.cancel_reason || '');
  return (
    reason.includes('no acepto en tiempo') ||
    reason.includes('no aceptado en tiempo') ||
    reason.includes('no notificado al chofer') ||
    reason.includes('reasignando automaticamente') ||
    reason.includes('auto reasignacion') ||
    reason.includes('reintento necesario')
  );
}

async function buildPassengerDriverConfirmationMessage(trip, driver) {
  const pickup = getTripPickupPoint(trip);
  let etaMinutes = null;
  let distanceToPickupKm = null;

  const driverLat = Number(driver?.current_lat);
  const driverLng = Number(driver?.current_lng);
  if (
    Number.isFinite(driverLat) &&
    Number.isFinite(driverLng) &&
    Number.isFinite(pickup.lat) &&
    Number.isFinite(pickup.lng)
  ) {
    distanceToPickupKm = Math.round(haversineKm(driverLat, driverLng, pickup.lat, pickup.lng) * 10) / 10;
    const routeToPickup = await getRouteMetrics({ lat: driverLat, lng: driverLng }, { lat: pickup.lat, lng: pickup.lng });
    etaMinutes = routeToPickup.durationMinutes;
  }

  const driverLabel = [driver?.vehicle_brand, driver?.vehicle_model].filter(Boolean).join(' ');
  const driverMeta = [driver?.full_name, driverLabel, driver?.vehicle_plate].filter(Boolean).join(' · ');
  const etaText = etaMinutes != null ? `\nLlegada estimada: *~${etaMinutes} min*` : '';
  const distText = distanceToPickupKm != null ? ` (a ${distanceToPickupKm} km)` : '';
  const trackingToken = String(trip?.tracking_token || '').trim() || String(trip?.id || '').trim() || null;
  const trackingLink = trackingToken
    ? `${TRACKING_BASE_URL}/seguimiento/${trackingToken}`
    : null;
  const trackingText = trackingLink
    ? `\nSeguimiento en vivo: ${trackingLink}`
    : '';

  return `Listo, tu viaje quedó confirmado.\n\nChofer: *${driver?.full_name || 'Sin nombre'}*${distText}${driverMeta ? `\n${driverMeta}` : ''}${etaText}\nRetiro: *${pickup.address || 'Sin dirección'}*${trackingText}`;
}

async function extractTripIntent({
  combinedText,
  context,
  pushName,
  phone,
  history,
  conversationStatus = 'open',
  lastBotReply = null,
}) {
  logWebhook('ai_extract_intent_start', {
    phone: maskPhone(phone),
    textLen: combinedText?.length || 0,
    historyCount: history?.length || 0,
    hasContext: Boolean(context && Object.keys(context).length),
    hasPushName: Boolean(pushName),
    conversationStatus,
    hasLastBotReply: Boolean(lastBotReply),
  });

  const passengerName = context?.passenger_name || pushName || null;
  const awaitingGps = Boolean(context?.awaiting_gps);
  const pendingCancelConfirm = Boolean(context?.pending_cancel_confirm);

  const stateDescription = {
    open: awaitingGps
      ? 'Esperando que el pasajero comparta su ubicación GPS o la dirección de retiro. NO volver a pedir lo mismo si ya se pidió.'
      : 'Sin viaje activo. El pasajero puede estar iniciando un nuevo pedido o retomando conversación.',
    awaiting_address_selection: 'Se envió una encuesta al pasajero para que elija su dirección exacta. Esperando respuesta.',
    paused: 'Conversación pausada, esperando atención humana.',
  }[conversationStatus] || 'Sin viaje activo. El pasajero puede estar iniciando un nuevo pedido.';

  const systemPrompt = `Sos el asistente de un servicio de remises en Salta Capital (Argentina). Respondés por WhatsApp en español rioplatense informal. Máximo 2 oraciones por reply. No repetís preguntas ya hechas. Si el pasajero dio info, la usás.

## ESTADO ACTUAL
- Estado: ${stateDescription}
- Pasajero: ${passengerName || 'desconocido'}
- Retiro registrado: ninguno (siempre se toma del mensaje actual)
- Esperando GPS: ${awaitingGps ? 'SÍ — si el mensaje actual contiene una dirección concreta, extraela como nuevo pickup_location y no pidas más nada. Solo si el mensaje NO contiene dirección, no insistas en texto y esperá GPS.' : 'no'}
- Esperando confirmación cancelación: ${pendingCancelConfirm ? 'SÍ' : 'no'}
- Último mensaje tuyo: ${lastBotReply ? `"${lastBotReply}"` : 'ninguno'}

## REGLA "PARA" EN PEDIDOS
"un remis/movil/auto para [lugar]" → [lugar] = RETIRO (pickup), no destino. Destino solo si hay "hasta/a/hacia" + segunda dirección explícita.

## FORMATO DE DIRECCIONES
- "Calle Número, Salta" | "Calle1 y Calle2, Salta" | "Barrio X, Salta"
- Intersecciones: "X c/ Y", "esq. X", "X casi Y", "entre X e Y" → "Calle1 y Calle2, Salta"
- Barrios: "tres cerr"→Tres Cerritos, "grand"→Grand Bourg, "castañ"→Castañares, "limache"→Limache, "portezuelo"→Portezuelo
- POIs: "el hospital"→Hospital San Bernardo Salta, "la terminal"→Terminal de Ómnibus Salta, "el shopping"→Shopping Salta
- Destino es SIEMPRE OPCIONAL. Nunca en missing_fields.
- Orden invertido: "llevame a X desde Y" → pickup=Y, destino=X.

## REGLAS DE PICKUP POR TIPO
1. Solo número real ("351", "al 200" SIN calle): pickup=null, missing_fields=["pickup_location"], preguntá la calle.
1.b Si viene calle + "al" + número (ej: "Belgrano al 200"), es dirección válida: pickup_location="Belgrano 200, Salta" y NO missing_fields.
2. Solo calle sin número: ponela en pickup, missing_fields=["pickup_number"], preguntá altura.
3. "Acá/aquí/donde estoy/en mi casa": pickup=null, pedí GPS o dirección.
4. "Mismo lugar de siempre": pickup=null y pedí dirección actual o GPS (NO usar historial).
5. "Frente a / al lado de [X]": pickup=null, pedí dirección exacta o GPS.
6. Pasaje/callejón ("pasaje X", "pje X", "callejón X"): pickup=texto completo. NO missing_fields. El sistema pedirá GPS.
7. Manzana/Lote ("manzana 14 lote 6", "mz 3 lt 2 barrio inta"): pickup=texto completo. NO missing_fields. El sistema pedirá GPS.
8. Edificio/empresa ("edificio Suizo", "oficina de Arcor"): pickup="Nombre, Salta". El sistema mostrará opciones.

## INTENTS
trip_request | status_query | cancel_trip | schedule_trip | ask_human | other

### Cuándo usar cada intent
- **trip_request**: SOLO si el pasajero pide explícitamente un remis/móvil/taxi/auto/viaje, o usa verbos como "buscame", "llevame", "mandame uno", "necesito que me busquen", etc. Mencionar lugares, estar yendo a algún lado, o hablar de colectivos/transporte en general NO es suficiente.
- **other**: Cualquier mensaje de chat que NO sea un pedido explícito de servicio de remis. Incluye: charla cotidiana, agradecimientos, mencionar que van en colectivo o a pie, coordinación de otra cosa, mensajes enviados por error, stickers, etc. En caso de duda, usar **other**.

## RESPUESTA — solo JSON válido:
{"intent":"...","passenger_name":null,"pickup_location":null,"origin":null,"destination":null,"notes":null,"reply":null,"confidence":0,"missing_fields":[],"cancel_confirmed":false,"schedule_time":null}

## REGLAS FINALES
1. awaiting_gps=true → si el mensaje contiene una dirección, extraela como nuevo pickup_location (reemplaza el contexto). Solo si no hay dirección en el mensaje, no pedir texto.
2. NO reutilices pickup de contexto ni historial: pickup_location siempre debe salir del mensaje actual.
2.b Si el mensaje contiene palabras clave de pedido de transporte (remis, móvil, taxi, etc.) junto a una dirección, el intent es SIEMPRE trip_request.
3. cancel_confirmed=true si el mensaje es claro: "cancelá/ya no/no quiero más/me surgió algo". Solo pedir confirmación si hay ambigüedad real.
4. Estado "trip_created" + cancelación clara → cancel_confirmed=true directo.
5. No uses ask_human por falta de datos del viaje. Solo para situaciones humanas graves.
6. Variá el vocabulario. Nunca mandés el mismo texto del lastBotReply.
7. Si no hay palabra clave explícita de pedido de transporte (remis, móvil, taxi, auto, viaje, buscame, llevame, etc.), el intent es SIEMPRE **other**.
8. Si "pickup_location" tiene un valor no nulo en tu respuesta JSON, NUNCA lo incluyas en "missing_fields". Solo ponés un campo en "missing_fields" si realmente no pudiste extraer su valor.`;

  // Formateamos el historial como turns reales de conversación para que el modelo entienda el contexto nativo
  const historyMessages = history
    .filter((item) => Boolean(item.transcription || item.content))
    .map((item) => ({
      role: item.direction === 'outgoing' ? 'assistant' : 'user',
      content: String(item.transcription || item.content || '').slice(0, 200),
    }));

  const contextForModel = Object.fromEntries(
    Object.entries(context || {}).filter(([k]) => !['last_bot_reply', 'pending_poll', 'pickup_location', 'origin'].includes(k))
  );

  // Mensaje de contexto actual para el modelo
  const contextParts = [
    passengerName ? `Nombre del pasajero: ${passengerName}` : null,
    Object.keys(contextForModel).length > 0
      ? `Contexto del viaje: ${JSON.stringify(contextForModel)}`
      : null,
    `Mensajes del pasajero:\n${combinedText}`,
  ].filter(Boolean).join('\n\n');

  let completion;
  try {
    completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 400,
      messages: [
        { role: 'system', content: systemPrompt },
        ...historyMessages,
        { role: 'user', content: contextParts },
      ],
    });
  } catch (error) {
    const status = Number(error?.status || 0);
    const code = String(error?.code || error?.error?.code || '').toLowerCase();
    const type = String(error?.type || error?.error?.type || '').toLowerCase();
    const isQuotaOrRateLimit =
      status === 429 ||
      code === 'insufficient_quota' ||
      code === 'rate_limit_exceeded' ||
      type === 'insufficient_quota' ||
      type === 'rate_limit_error';

    logWebhook('ai_extract_intent_provider_error', {
      phone: maskPhone(phone),
      status: status || null,
      code: code || null,
      type: type || null,
      message: error?.message || 'unknown_error',
      fallbackUsed: isQuotaOrRateLimit,
    });

    if (!isQuotaOrRateLimit) throw error;

    // Fallback operativo cuando OpenAI no está disponible por cuota/rate-limit.
    // Dejamos que el flujo continúe con heurísticas downstream para evitar perder mensajes.
    return {
      intent: 'other',
      passenger_name: passengerName,
      pickup_location: null,
      origin: null,
      destination: sanitizeAddressInput(context?.destination || ''),
      notes: null,
      reply: 'Perdón, estoy con mucha demanda ahora. ¿Me pasás la dirección exacta desde donde te busco?',
      confidence: 0,
      missing_fields: ['pickup_location'],
      cancel_confirmed: false,
      schedule_time: null,
    };
  }

  const raw = completion.choices[0]?.message?.content?.trim();
  const match = raw?.match(/\{[\s\S]*\}/);
  if (!match) {
    logWebhook('ai_extract_intent_fallback', { reason: 'no_json', rawSnippet: raw?.slice(0, 200) });
    return {
      intent: 'other',
      passenger_name: null,
      pickup_location: null,
      origin: null,
      destination: null,
      notes: null,
      reply: '¿Desde dónde te buscamos?',
      confidence: 0,
      missing_fields: ['pickup_location'],
      cancel_confirmed: false,
      schedule_time: null,
    };
  }

  const parsed = safeJsonParse(match[0], {
    intent: 'other',
    passenger_name: null,
    pickup_location: null,
    origin: null,
    destination: null,
    notes: null,
    reply: null,
    confidence: 0,
    missing_fields: [],
    cancel_confirmed: false,
    schedule_time: null,
  });

  logWebhook('ai_extract_intent_ok', {
    intent: parsed?.intent || null,
    confidence: parsed?.confidence ?? null,
    hasPickup: Boolean(parsed?.pickup_location),
    hasOrigin: Boolean(parsed?.origin),
    hasDestination: Boolean(parsed?.destination),
    cancelConfirmed: Boolean(parsed?.cancel_confirmed),
    missingFields: Array.isArray(parsed?.missing_fields) ? parsed.missing_fields : [],
  });
  return parsed;
}

async function geocodeAddress(address) {
  await loadSaltaStreetCatalog().catch(() => null);
  const variants = buildAddressVariants(address);
  if (variants.length === 0) {
    throw new Error(`No se pudo geocodificar: ${address}`);
  }

  const candidates = [];

  for (const query of variants) {
    logWebhook('maps_geocode_start', { query });
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('address', query);
    url.searchParams.set('language', 'es');
    url.searchParams.set('region', 'ar');
    url.searchParams.set('components', 'country:AR');
    // Bias results to Salta capital area.
    url.searchParams.set('bounds', '-24.90,-65.55|-24.70,-65.30');
    url.searchParams.set('key', GOOGLE_MAPS_API_KEY);

    const response = await fetchWithRetry(url, {}, { label: 'geocode' });
    const payload = await response.json();
    if (payload.status !== 'OK' || !payload.results?.length) {
      logWebhook('maps_geocode_variant_fail', {
        query,
        status: payload.status || null,
        resultCount: payload.results?.length || 0,
      });
      continue;
    }

    for (const result of payload.results) {
      if (isCoarseGeocodeResult(result, query)) continue;

      const score = scoreGeocodeResult(result, query);
      candidates.push({ result, score, query });
    }
  }

  if (candidates.length === 0) {
    logWebhook('maps_geocode_fail', {
      originalAddress: address,
      reason: 'no_non_coarse_candidates',
      variantsTried: variants,
    });
    throw new Error(`Dirección demasiado amplia o ambigua: ${address}`);
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best || best.score < 0.25) {
    logWebhook('maps_geocode_fail', {
      originalAddress: address,
      reason: 'low_confidence_candidate',
      topScore: best?.score ?? null,
      topAddress: best?.result?.formatted_address || null,
    });
    throw new Error(`No se pudo geocodificar con confianza: ${address}`);
  }

  const resultPayload = {
    formattedAddress: best.result.formatted_address,
    lat: best.result.geometry.location.lat,
    lng: best.result.geometry.location.lng,
  };
  logWebhook('maps_geocode_ok', {
    query: best.query,
    score: Math.round(best.score * 100) / 100,
    formattedAddress: resultPayload.formattedAddress,
    lat: resultPayload.lat,
    lng: resultPayload.lng,
  });
  return resultPayload;
}

async function geocodeAddressMultiple(address, maxResults = 5) {
  await loadSaltaStreetCatalog().catch(() => null);
  const variants = buildAddressVariants(address);
  if (variants.length === 0) return [];

  const candidates = [];
  const seenKeys = new Set();

  for (const query of variants) {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('address', query);
    url.searchParams.set('language', 'es');
    url.searchParams.set('region', 'ar');
    url.searchParams.set('components', 'country:AR');
    url.searchParams.set('bounds', '-24.90,-65.55|-24.70,-65.30');
    url.searchParams.set('key', GOOGLE_MAPS_API_KEY);

    try {
      const response = await fetchWithRetry(url, {}, { label: 'geocode_multi' });
      const payload = await response.json();
      if (payload.status !== 'OK' || !payload.results?.length) continue;

      for (const result of payload.results) {
        if (isCoarseGeocodeResult(result, query)) continue;
        const key = (result.formatted_address || '').toLowerCase().trim();
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        const score = scoreGeocodeResult(result, query);
        if (score >= 0.20) {
          candidates.push({
            formattedAddress: result.formatted_address,
            lat: result.geometry.location.lat,
            lng: result.geometry.location.lng,
            score,
          });
        }
      }
    } catch (err) {
      logWebhook('maps_geocode_multi_variant_error', { query, error: err?.message || 'unknown' });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, maxResults);
}

/**
 * Usa la API de Autocomplete de Google Places para obtener múltiples sugerencias
 * de calle/dirección para un query ambiguo (ej: "Güemes 200" → Luis Güemes + General Güemes).
 * Cada sugerencia se geocodifica por place_id para obtener coordenadas precisas.
 */
async function autocompleteAndGeocodeAddress(query, maxResults = 5) {
  const safeQuery = sanitizeAddressInput(query);
  if (!safeQuery) return [];

  const input = /salta/i.test(safeQuery) ? safeQuery : `${safeQuery}, Salta`;

  const acUrl = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
  acUrl.searchParams.set('input', input);
  acUrl.searchParams.set('language', 'es');
  acUrl.searchParams.set('region', 'ar');
  acUrl.searchParams.set('components', 'country:AR');
  acUrl.searchParams.set('location', '-24.7829,-65.4122'); // Salta Capital centro
  acUrl.searchParams.set('radius', '20000');
  acUrl.searchParams.set('key', GOOGLE_MAPS_API_KEY);

  let predictions;
  try {
    const acResp = await fetchWithRetry(acUrl, {}, { label: 'autocomplete_address' });
    const acData = await acResp.json();
    if (acData.status !== 'OK' || !Array.isArray(acData.predictions) || acData.predictions.length === 0) {
      logWebhook('maps_autocomplete_no_results', { query: safeQuery, status: acData.status || null });
      return [];
    }
    predictions = acData.predictions.slice(0, maxResults);
    logWebhook('maps_autocomplete_ok', { query: safeQuery, count: predictions.length });
  } catch (err) {
    logWebhook('maps_autocomplete_error', { query: safeQuery, error: err?.message || 'unknown' });
    return [];
  }

  const results = [];
  for (const prediction of predictions) {
    if (!prediction.place_id) continue;
    try {
      const geoUrl = new URL('https://maps.googleapis.com/maps/api/geocode/json');
      geoUrl.searchParams.set('place_id', prediction.place_id);
      geoUrl.searchParams.set('language', 'es');
      geoUrl.searchParams.set('key', GOOGLE_MAPS_API_KEY);

      const geoResp = await fetchWithRetry(geoUrl, {}, { label: 'geocode_place_id' });
      const geoData = await geoResp.json();
      if (geoData.status !== 'OK' || !geoData.results?.[0]) continue;

      const r = geoData.results[0];
      if (isCoarseGeocodeResult(r, safeQuery)) continue;

      const score = scoreGeocodeResult(r, safeQuery);
      if (score >= 0.10) {
        results.push({
          formattedAddress: r.formatted_address,
          lat: r.geometry.location.lat,
          lng: r.geometry.location.lng,
          score,
        });
      }
    } catch (err) {
      logWebhook('maps_autocomplete_geocode_place_error', { placeId: prediction.place_id, error: err?.message || 'unknown' });
    }
  }

  return results;
}

/**
 * Busca en OpenStreetMap vía Nominatim para completar lo que Google Maps no indexa,
 * especialmente pasajes, callejones y calles secundarias de Salta Capital.
 * Nominatim es gratuito, no requiere clave API, y usa datos colaborativos de OSM.
 */
async function nominatimGeocodeAddress(query, maxResults = 5) {
  const safeQuery = sanitizeAddressInput(query);
  if (!safeQuery) return [];

  const input = /salta/i.test(safeQuery) ? safeQuery : `${safeQuery}, Salta, Argentina`;

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', input);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', String(maxResults * 2));
  url.searchParams.set('countrycodes', 'ar');
  // viewbox: left(lon),top(lat),right(lon),bottom(lat)
  url.searchParams.set('viewbox', '-65.55,-24.70,-65.30,-24.90');
  url.searchParams.set('bounded', '1');

  try {
    const resp = await fetchWithRetry(
      url,
      { headers: { 'User-Agent': 'ProfesionalApp/1.0 (remises-salta)' } },
      { label: 'nominatim_geocode', retries: 1, delayMs: 500 }
    );
    const data = await resp.json();
    if (!Array.isArray(data) || data.length === 0) {
      logWebhook('nominatim_no_results', { query: safeQuery });
      return [];
    }

    const CITY_STOPWORDS = new Set(['salta', 'argentina', 'capital']);
    const queryTokens = new Set(tokenizeAddress(safeQuery));
    const contentQueryTokens = [...queryTokens].filter((t) => !CITY_STOPWORDS.has(t));

    const candidates = [];
    for (const item of data) {
      const lat = parseFloat(item.lat);
      const lng = parseFloat(item.lon);
      if (isNaN(lat) || isNaN(lng)) continue;

      const displayName = String(item.display_name || '');
      const road = String(
        item.address?.road ||
        item.address?.pedestrian ||
        item.address?.path ||
        item.address?.footway ||
        ''
      );

      const displayTokens = new Set(tokenizeAddress(displayName));
      const roadTokens = new Set(tokenizeAddress(road));

      // Token overlap base score
      let tokenOverlap = 0;
      queryTokens.forEach((t) => {
        if (displayTokens.has(t) || roadTokens.has(t)) tokenOverlap++;
      });
      let score = queryTokens.size > 0 ? tokenOverlap / queryTokens.size : 0;

      // Boost by OSM class/type
      const cls = item.class || '';
      const type = item.type || '';
      if (cls === 'highway') {
        if (['service', 'residential', 'unclassified', 'tertiary', 'secondary', 'primary', 'living_street'].includes(type)) {
          score += 0.4;
        } else {
          score += 0.2;
        }
      } else if (cls === 'place') {
        score += 0.1;
      }

      // Stronger boost if the road name itself matches query tokens
      if (contentQueryTokens.length > 0) {
        const hasRoadMatch = contentQueryTokens.some((t) => roadTokens.has(t));
        if (hasRoadMatch) {
          score += 0.3;
        } else {
          const hasAnyDisplayMatch = contentQueryTokens.some((t) => displayTokens.has(t));
          if (!hasAnyDisplayMatch) score -= 0.6;
        }
      }

      // Small tiebreaker from OSM importance
      score += (parseFloat(item.importance) || 0) * 0.1;

      if (score >= 0.15) {
        candidates.push({
          formattedAddress: displayName,
          lat,
          lng,
          score,
        });
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    logWebhook('nominatim_geocode_ok', { query: safeQuery, count: candidates.length });
    return candidates.slice(0, maxResults);
  } catch (err) {
    logWebhook('nominatim_geocode_error', { query: safeQuery, error: err?.message || 'unknown' });
    return [];
  }
}

/**
 * Combina geocodificación por variantes y autocomplete para obtener el conjunto
 * más completo de candidatos de dirección — especialmente útil cuando el nombre
 * de calle es ambiguo (ej: "Güemes" → Luis Güemes, General Güemes).
 */
async function getAddressCandidates(query, maxResults = 5) {
  const [geocodeResult, autocompleteResult, nominatimResult] = await Promise.allSettled([
    geocodeAddressMultiple(query, maxResults),
    autocompleteAndGeocodeAddress(query, maxResults),
    nominatimGeocodeAddress(query, maxResults),
  ]);

  const geocodeCandidates = geocodeResult.status === 'fulfilled' ? geocodeResult.value : [];
  const autocompleteCandidates = autocompleteResult.status === 'fulfilled' ? autocompleteResult.value : [];
  const nominatimCandidates = nominatimResult.status === 'fulfilled' ? nominatimResult.value : [];

  // Merge and deduplicate — first by formatted address string, then by lat/lng proximity (~100m)
  const seenKeys = new Set();
  const merged = [];
  for (const c of [...geocodeCandidates, ...autocompleteCandidates, ...nominatimCandidates]) {
    const key = (c.formattedAddress || '').toLowerCase().trim();
    if (!key || seenKeys.has(key)) continue;
    // Also skip if a previous candidate is within ~100m (different string, same place)
    const tooClose = merged.some(
      (prev) => Math.abs(prev.lat - c.lat) < 0.001 && Math.abs(prev.lng - c.lng) < 0.001
    );
    if (tooClose) continue;
    seenKeys.add(key);
    merged.push(c);
  }

  merged.sort((a, b) => b.score - a.score);
  logWebhook('maps_address_candidates_merged', {
    query,
    geocodeCount: geocodeCandidates.length,
    autocompleteCount: autocompleteCandidates.length,
    nominatimCount: nominatimCandidates.length,
    mergedCount: merged.length,
  });
  return merged.slice(0, maxResults);
}

/**
 * Puntúa un resultado de reverse-geocode por precisión.
 * Prioridad: tipo de resultado + tipo de ubicación geométrica.
 * Retorna un número mayor = mejor.
 */
function scoreReverseGeocodeResult(result) {
  const types = Array.isArray(result?.types) ? result.types : [];
  const locationType = result?.geometry?.location_type || '';
  const components = Array.isArray(result?.address_components) ? result.address_components : [];

  const hasStreetNumber = components.some((c) => Array.isArray(c.types) && c.types.includes('street_number'));
  const hasRoute = components.some((c) => Array.isArray(c.types) && c.types.includes('route'));

  let score = 0;

  // Tipo de resultado (cuanto más específico, mejor)
  if (types.includes('street_address')) score += 40;
  else if (types.includes('premise')) score += 35;
  else if (types.includes('subpremise')) score += 30;
  else if (types.includes('establishment')) score += 20;
  else if (types.includes('intersection')) score += 15;
  else if (types.includes('route')) score += 5;
  // Tipos muy generales = penalización fuerte
  if (types.some((t) => ['locality', 'administrative_area_level_1', 'administrative_area_level_2', 'country', 'political', 'postal_code'].includes(t))) {
    score -= 30;
  }

  // Tipo de geometría (ROOFTOP = coordenada exacta del edificio)
  if (locationType === 'ROOFTOP') score += 30;
  else if (locationType === 'RANGE_INTERPOLATED') score += 20;
  else if (locationType === 'GEOMETRIC_CENTER') score += 10;
  else if (locationType === 'APPROXIMATE') score -= 10;

  // Componentes de dirección completa
  if (hasStreetNumber) score += 15;
  if (hasRoute) score += 10;

  return score;
}

async function reverseGeocodeLatLng(lat, lng) {
  logWebhook('maps_reverse_geocode_start', { lat, lng });
  const fallback = `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`;

  // Primera pasada: pedir solo street_address con ROOFTOP o RANGE_INTERPOLATED
  // Esto filtra de entrada a Google para que devuelva solo direcciones exactas
  const urlPrecise = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  urlPrecise.searchParams.set('latlng', `${lat},${lng}`);
  urlPrecise.searchParams.set('result_type', 'street_address');
  urlPrecise.searchParams.set('location_type', 'ROOFTOP|RANGE_INTERPOLATED');
  urlPrecise.searchParams.set('language', 'es');
  urlPrecise.searchParams.set('region', 'ar');
  urlPrecise.searchParams.set('key', GOOGLE_MAPS_API_KEY);

  try {
    const preciseResp = await fetchWithRetry(urlPrecise, {}, { label: 'reverse_geocode_precise' });
    const precisePayload = await preciseResp.json();
    if (precisePayload.status === 'OK' && precisePayload.results?.length > 0) {
      // Tomar el resultado con mayor puntaje entre los devueltos
      const best = precisePayload.results
        .map((r) => ({ r, score: scoreReverseGeocodeResult(r) }))
        .sort((a, b) => b.score - a.score)[0];
      const formatted = best.r.formatted_address || fallback;
      logWebhook('maps_reverse_geocode_ok', {
        lat, lng,
        formattedAddress: formatted,
        locationType: best.r?.geometry?.location_type,
        resultType: (best.r?.types || [])[0] || null,
        score: best.score,
        pass: 'precise',
      });
      return formatted;
    }
  } catch (_) {
    // Si falla la pasada precisa, continuamos con la general
  }

  // Segunda pasada: consulta general, puntuamos todos los resultados y elegimos el mejor
  const urlGeneral = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  urlGeneral.searchParams.set('latlng', `${lat},${lng}`);
  urlGeneral.searchParams.set('language', 'es');
  urlGeneral.searchParams.set('region', 'ar');
  urlGeneral.searchParams.set('key', GOOGLE_MAPS_API_KEY);

  const response = await fetchWithRetry(urlGeneral, {}, { label: 'reverse_geocode_general' });
  const payload = await response.json();

  if (payload.status !== 'OK' || !payload.results?.length) {
    logWebhook('maps_reverse_geocode_fail', {
      lat, lng,
      status: payload.status || null,
      resultCount: payload.results?.length || 0,
    });
    return fallback;
  }

  // Puntuar y elegir el resultado más preciso disponible
  const scored = payload.results
    .map((r) => ({ r, score: scoreReverseGeocodeResult(r) }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  const formatted = best.r.formatted_address || fallback;

  logWebhook('maps_reverse_geocode_ok', {
    lat, lng,
    formattedAddress: formatted,
    locationType: best.r?.geometry?.location_type,
    resultType: (best.r?.types || [])[0] || null,
    score: best.score,
    totalResults: scored.length,
    pass: 'general',
  });
  return formatted;
}

async function getRouteMetrics(origin, destination) {
  logWebhook('maps_route_start', {
    originLat: origin?.lat,
    originLng: origin?.lng,
    destinationLat: destination?.lat,
    destinationLng: destination?.lng,
  });
  const url = new URL('https://maps.googleapis.com/maps/api/directions/json');
  url.searchParams.set('origin', `${origin.lat},${origin.lng}`);
  url.searchParams.set('destination', `${destination.lat},${destination.lng}`);
  url.searchParams.set('language', 'es');
  url.searchParams.set('key', GOOGLE_MAPS_API_KEY);

  const response = await fetchWithRetry(url, {}, { label: 'route_metrics' });
  const payload = await response.json();
  if (payload.status !== 'OK' || !payload.routes?.length) {
    logWebhook('maps_route_fail', {
      status: payload.status || null,
      routeCount: payload.routes?.length || 0,
    });
    return { distanceKm: null, durationMinutes: null };
  }

  const leg = payload.routes[0].legs[0];
  const metrics = {
    distanceKm: Math.round((leg.distance.value / 1000) * 10) / 10,
    durationMinutes: Math.round(leg.duration.value / 60),
  };
  logWebhook('maps_route_ok', metrics);
  return metrics;
}

async function getSettingsMap() {
  const { data, error } = await getSupabase().from('settings').select('key, value');
  if (error) throw error;
  const map = Object.fromEntries((data || []).map((item) => [item.key, item.value]));
  logWebhook('db_settings_ok', {
    total: (data || []).length,
    hasTariffPerKm: Object.prototype.hasOwnProperty.call(map, 'tariff_per_km'),
    hasTariffBase: Object.prototype.hasOwnProperty.call(map, 'tariff_base'),
    hasCommissionPercent: Object.prototype.hasOwnProperty.call(map, 'commission_percent'),
    hasWhatsappAmtFare: Object.prototype.hasOwnProperty.call(map, 'whatsapp_amt_fare'),
    hasWhatsappDriverCommission: Object.prototype.hasOwnProperty.call(map, 'whatsapp_driver_commission'),
  });
  return map;
}

function calculateWhatsAppTripPricing(settings, route) {
  const tariffPerKm = Number(settings.tariff_per_km || 0);
  const tariffBase = Number(settings.tariff_base || 0);
  const commissionPercent = Number(settings.commission_percent || 10);
  const whatsappAmtFare = Math.max(0, Number(settings.whatsapp_amt_fare || 0));
  const whatsappDriverCommission = Math.max(0, Number(settings.whatsapp_driver_commission || 0));

  const fallbackPrice = route.distanceKm == null ? null : Math.round(tariffBase + tariffPerKm * route.distanceKm);
  const fallbackCommission = fallbackPrice == null ? null : Math.round((fallbackPrice * commissionPercent) / 100);

  // WhatsApp AMT: per-km rate (uses same tariff_base as base)
  const whatsappPrice = whatsappAmtFare > 0 && route.distanceKm != null
    ? Math.round(tariffBase + whatsappAmtFare * route.distanceKm)
    : fallbackPrice;
  // WhatsApp commission: percentage of the WhatsApp price
  const whatsappCommission = whatsappDriverCommission > 0 && whatsappPrice != null
    ? Math.round((whatsappPrice * whatsappDriverCommission) / 100)
    : fallbackCommission;

  const price = whatsappAmtFare > 0 ? whatsappPrice : fallbackPrice;
  const commissionAmount = whatsappDriverCommission > 0 ? whatsappCommission : fallbackCommission;

  return {
    price,
    commissionAmount,
    pricingMode: whatsappAmtFare > 0 || whatsappDriverCommission > 0 ? 'whatsapp_amt' : 'distance_based',
    tariffPerKm,
    tariffBase,
    commissionPercent,
    whatsappAmtFare,
    whatsappDriverCommission,
  };
}

async function getBlockedDriverIds(driverIds) {
  if (driverIds.length === 0) return new Set();

  logWebhook('db_blocked_drivers_start', { driverCandidates: driverIds.length });

  const { data: trips, error: tripsError } = await getSupabase()
    .from('trips')
    .select('driver_id, commission_amount, completed_at')
    .in('driver_id', driverIds)
    .eq('status', 'completed')
    .gt('commission_amount', 0)
    .order('completed_at', { ascending: true });
  if (tripsError) throw tripsError;

  const { data: payments, error: paymentsError } = await getSupabase()
    .from('commission_payments')
    .select('driver_id, amount, created_at')
    .in('driver_id', driverIds)
    .order('created_at', { ascending: false });
  if (paymentsError) throw paymentsError;

  const paymentsByDriver = new Map();
  for (const payment of payments || []) {
    if (!paymentsByDriver.has(payment.driver_id)) paymentsByDriver.set(payment.driver_id, []);
    paymentsByDriver.get(payment.driver_id).push(payment);
  }

  const tripsByDriver = new Map();
  for (const trip of trips || []) {
    if (!tripsByDriver.has(trip.driver_id)) tripsByDriver.set(trip.driver_id, []);
    tripsByDriver.get(trip.driver_id).push(trip);
  }

  const blocked = new Set();
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  for (const driverId of driverIds) {
    const driverTrips = tripsByDriver.get(driverId) || [];
    if (driverTrips.length === 0) continue;
    const driverPayments = paymentsByDriver.get(driverId) || [];
    const totalCommission = driverTrips.reduce((sum, item) => sum + (Number(item.commission_amount) || 0), 0);
    const totalPaid = driverPayments.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const balance = totalCommission - totalPaid;
    if (balance <= 0) continue;

    const lastPaymentDate = driverPayments[0]?.created_at ? new Date(driverPayments[0].created_at) : null;
    const unpaidTrips = lastPaymentDate
      ? driverTrips.filter((trip) => new Date(trip.completed_at) > lastPaymentDate)
      : driverTrips;
    const oldestUnpaid = unpaidTrips[0];
    if (oldestUnpaid && new Date(oldestUnpaid.completed_at) < threeDaysAgo) {
      blocked.add(driverId);
    }
  }

  logWebhook('db_blocked_drivers_ok', {
    driverCandidates: driverIds.length,
    tripsRows: (trips || []).length,
    paymentsRows: (payments || []).length,
    blockedCount: blocked.size,
  });
  return blocked;
}

async function getDriverReliabilityPenaltyMap(driverIds) {
  const penalties = new Map();
  const validDriverIds = (driverIds || []).filter(Boolean);
  if (!validDriverIds.length) return penalties;

  const cutoff = new Date(Date.now() - DRIVER_RELIABILITY_LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
  const { data, error } = await getSupabase()
    .from('trips')
    .select('driver_id, cancel_reason, created_at')
    .in('driver_id', validDriverIds)
    .eq('status', 'cancelled')
    .gte('created_at', cutoff);

  if (error) {
    logWebhook('driver_reliability_penalty_error', {
      driverCandidates: validDriverIds.length,
      error: summarizeDbError(error),
    });
    return penalties;
  }

  const byDriver = new Map();
  for (const row of data || []) {
    const driverId = row?.driver_id;
    if (!driverId) continue;

    const current = byDriver.get(driverId) || { cancelled: 0, autoTimeouts: 0 };
    current.cancelled += 1;
    if (isAutomaticTimeoutCancellationReason(row?.cancel_reason)) {
      current.autoTimeouts += 1;
    }
    byDriver.set(driverId, current);
  }

  for (const driverId of validDriverIds) {
    const stats = byDriver.get(driverId) || { cancelled: 0, autoTimeouts: 0 };
    const normalCancels = Math.max(0, stats.cancelled - stats.autoTimeouts);
    const reliabilityPenaltyKm = Math.min(
      MAX_RELIABILITY_SCORE_PENALTY_KM,
      stats.autoTimeouts * AUTO_TIMEOUT_SCORE_PENALTY_KM + normalCancels * CANCEL_SCORE_PENALTY_KM
    );
    penalties.set(driverId, {
      reliabilityPenaltyKm,
      autoTimeouts: stats.autoTimeouts,
      cancelled: stats.cancelled,
    });
  }

  logWebhook('driver_reliability_penalty_ok', {
    driverCandidates: validDriverIds.length,
    cancelledRows: (data || []).length,
  });

  return penalties;
}

async function chooseDriver(
  origin,
  {
    excludedDriverIds = [],
    searchElapsedMs = 0,
    allowExclusionRelaxation = true,
    passengerPhone = null,
  } = {}
) {
  const passengerPhoneNormalized = normalizePhone(passengerPhone || '');
  const searchPlan = buildDynamicSearchRadii(searchElapsedMs);
  logWebhook('driver_select_start', {
    originLat: origin?.lat,
    originLng: origin?.lng,
    searchElapsedMs: Math.max(0, Math.round(Number(searchElapsedMs) || 0)),
    expansionStep: searchPlan.expansionStep,
    allowedRadiiKm: searchPlan.allowedRadiiKm,
    allowExclusionRelaxation,
    passengerPhone: passengerPhoneNormalized ? maskPhone(passengerPhoneNormalized) : null,
  });
  const { data: drivers, error } = await getSupabase()
    .from('drivers')
    .select('id, full_name, phone, push_token, current_lat, current_lng, vehicle_brand, vehicle_model, vehicle_plate, vehicle_color, is_available')
    .eq('is_available', true);
  if (error) throw error;

  const availableDrivers = (drivers || []).filter((driver) => driver.current_lat && driver.current_lng);
  if (availableDrivers.length === 0) {
    logWebhook('driver_select_no_available_coords', { totalAvailableFlagged: (drivers || []).length });
    return null;
  }

  const samePhoneFilteredDrivers = passengerPhoneNormalized
    ? availableDrivers.filter((driver) => normalizePhone(driver?.phone || '') === passengerPhoneNormalized)
    : [];
  const availableDriversForDispatch = passengerPhoneNormalized
    ? availableDrivers.filter((driver) => normalizePhone(driver?.phone || '') !== passengerPhoneNormalized)
    : availableDrivers;

  if (samePhoneFilteredDrivers.length > 0) {
    logWebhook('driver_select_skip_same_phone', {
      passengerPhone: maskPhone(passengerPhoneNormalized),
      skippedDrivers: samePhoneFilteredDrivers.length,
    });
  }

  if (availableDriversForDispatch.length === 0) {
    logWebhook('driver_select_no_available_after_same_phone_filter', {
      totalAvailableFlagged: (drivers || []).length,
      availableWithCoords: availableDrivers.length,
      samePhoneSkipped: samePhoneFilteredDrivers.length,
    });
    return null;
  }

  const { data: activeTrips, error: activeTripsError } = await getSupabase()
    .from('trips')
    .select('driver_id, status, created_at')
    .in('status', DRIVER_BUSY_TRIP_STATUSES);
  if (activeTripsError) throw activeTripsError;

  const busyDriverIds = new Set();
  let ignoredStalePending = 0;
  for (const trip of activeTrips || []) {
    if (!trip?.driver_id) continue;

    const status = String(trip.status || '').toLowerCase();
    if (status !== 'pending') {
      busyDriverIds.add(trip.driver_id);
      continue;
    }

    // Pending trips can remain stale if a driver never accepted/rejected; ignore old ones.
    const ageMinutes = getTripAgeMinutes(trip);
    if (ageMinutes == null || ageMinutes <= DRIVER_PENDING_BUSY_MAX_AGE_MINUTES) {
      busyDriverIds.add(trip.driver_id);
    } else {
      ignoredStalePending += 1;
    }
  }

  const excludedDriverIdSet = new Set((excludedDriverIds || []).filter(Boolean));
  const nonBusyDrivers = availableDriversForDispatch.filter((driver) => !busyDriverIds.has(driver.id));
  let candidateDrivers = nonBusyDrivers.filter((driver) => !excludedDriverIdSet.has(driver.id));
  let exclusionsRelaxed = false;

  // Si todos los candidatos no ocupados quedaron filtrados solo por exclusiones,
  // relajamos la exclusión para evitar deadlocks (ej: 1 chofer disponible excluido).
  if (
    allowExclusionRelaxation &&
    candidateDrivers.length === 0 &&
    nonBusyDrivers.length > 0 &&
    excludedDriverIdSet.size > 0
  ) {
    const excludedNonBusyCount = nonBusyDrivers.filter((driver) => excludedDriverIdSet.has(driver.id)).length;
    const allNonBusyExcluded = excludedNonBusyCount === nonBusyDrivers.length;

    if (allNonBusyExcluded) {
      candidateDrivers = nonBusyDrivers;
      exclusionsRelaxed = true;
      logWebhook('driver_select_exclusions_relaxed', {
        availableWithCoords: availableDriversForDispatch.length,
        samePhoneSkipped: samePhoneFilteredDrivers.length,
        nonBusyCount: nonBusyDrivers.length,
        excludedCount: excludedDriverIdSet.size,
      });
    }
  }

  if (
    !allowExclusionRelaxation &&
    candidateDrivers.length === 0 &&
    nonBusyDrivers.length > 0 &&
    excludedDriverIdSet.size > 0
  ) {
    logWebhook('driver_select_exclusions_kept', {
      availableWithCoords: availableDriversForDispatch.length,
      samePhoneSkipped: samePhoneFilteredDrivers.length,
      nonBusyCount: nonBusyDrivers.length,
      excludedCount: excludedDriverIdSet.size,
    });
  }

  if (candidateDrivers.length === 0) {
    logWebhook('driver_select_all_busy', {
      availableWithCoords: availableDriversForDispatch.length,
      samePhoneSkipped: samePhoneFilteredDrivers.length,
      busyCount: busyDriverIds.size,
      stalePendingIgnored: ignoredStalePending,
      excludedCount: excludedDriverIdSet.size,
    });
    return null;
  }

  const blockedDriverIds = await getBlockedDriverIds(candidateDrivers.map((driver) => driver.id));
  const finalCandidates = candidateDrivers.filter((driver) => !blockedDriverIds.has(driver.id));
  if (finalCandidates.length === 0) {
    logWebhook('driver_select_all_blocked', {
      candidateDrivers: candidateDrivers.length,
      blockedDrivers: blockedDriverIds.size,
    });
    return null;
  }

  const reliabilityPenaltyMap = await getDriverReliabilityPenaltyMap(finalCandidates.map((driver) => driver.id));

  // Calculate distance from each candidate to the passenger's pickup location
  const withDistance = finalCandidates
    .map((driver) => {
      const distanceToOriginKm = haversineKm(
        Number(driver.current_lat),
        Number(driver.current_lng),
        origin.lat,
        origin.lng
      );

      const reliability = reliabilityPenaltyMap.get(driver.id) || {
        reliabilityPenaltyKm: 0,
        autoTimeouts: 0,
        cancelled: 0,
      };
      const pushPenaltyKm = isLikelyFcmToken(driver.push_token) ? 0 : NO_PUSH_TOKEN_SCORE_PENALTY_KM;
      const dispatchScoreKm = distanceToOriginKm + reliability.reliabilityPenaltyKm + pushPenaltyKm;

      return {
        ...driver,
        distanceToOriginKm,
        reliabilityPenaltyKm: reliability.reliabilityPenaltyKm,
        reliabilityAutoTimeouts: reliability.autoTimeouts,
        reliabilityCancelled: reliability.cancelled,
        pushPenaltyKm,
        dispatchScoreKm,
      };
    })
    .sort((a, b) => {
      if (a.dispatchScoreKm !== b.dispatchScoreKm) return a.dispatchScoreKm - b.dispatchScoreKm;
      return a.distanceToOriginKm - b.distanceToOriginKm;
    });

  // Expanding radius search: always starts at 1km/2km and widens every 15s.
  for (const radiusKm of searchPlan.allowedRadiiKm) {
    const inRadius = withDistance.filter((d) => d.distanceToOriginKm <= radiusKm);
    if (inRadius.length > 0) {
      const selected = inRadius[0];
      logWebhook('driver_select_ok', {
        searchRadiusKm: radiusKm,
        searchElapsedMs: Math.max(0, Math.round(Number(searchElapsedMs) || 0)),
        expansionStep: searchPlan.expansionStep,
        allowedRadiiKm: searchPlan.allowedRadiiKm,
        totalAvailable: (drivers || []).length,
        availableWithCoords: availableDriversForDispatch.length,
        samePhoneSkipped: samePhoneFilteredDrivers.length,
        busyCount: busyDriverIds.size,
        blockedCount: blockedDriverIds.size,
        finalCandidates: finalCandidates.length,
        driversInRadius: inRadius.length,
        selectedDriverId: selected.id,
        selectedDistanceKm: Math.round(selected.distanceToOriginKm * 10) / 10,
        selectedScoreKm: Math.round(selected.dispatchScoreKm * 100) / 100,
        selectedReliabilityPenaltyKm: Math.round((selected.reliabilityPenaltyKm || 0) * 100) / 100,
        selectedAutoTimeouts: selected.reliabilityAutoTimeouts || 0,
        selectedCancelled: selected.reliabilityCancelled || 0,
        selectedPushPenaltyKm: Math.round((selected.pushPenaltyKm || 0) * 100) / 100,
        hasPushToken: isLikelyFcmToken(selected.push_token),
        hasLegacyExpoPushToken: isLegacyExpoPushToken(selected.push_token),
        exclusionsRelaxed,
      });
      return { ...selected, searchRadiusKm: radiusKm };
    }
    logWebhook('driver_radius_expand', {
      currentRadiusKm: radiusKm,
      driversInRadius: 0,
      nextRadiusKm: searchPlan.allowedRadiiKm[searchPlan.allowedRadiiKm.indexOf(radiusKm) + 1] || null,
      expansionStep: searchPlan.expansionStep,
    });
  }

  // No driver found within the currently allowed radius window.
  logWebhook('driver_select_none_in_max_radius', {
    maxRadiusKm: searchPlan.maxRadiusKm,
    searchElapsedMs: Math.max(0, Math.round(Number(searchElapsedMs) || 0)),
    expansionStep: searchPlan.expansionStep,
    allowedRadiiKm: searchPlan.allowedRadiiKm,
    totalAvailable: (drivers || []).length,
    availableWithCoords: availableDriversForDispatch.length,
    samePhoneSkipped: samePhoneFilteredDrivers.length,
    finalCandidates: finalCandidates.length,
    closestDriverKm: withDistance[0]?.distanceToOriginKm
      ? Math.round(withDistance[0].distanceToOriginKm * 10) / 10
      : null,
    closestDriverScoreKm: withDistance[0]?.dispatchScoreKm
      ? Math.round(withDistance[0].dispatchScoreKm * 100) / 100
      : null,
    exclusionsRelaxed,
  });
  return null;
}

async function sendPushNotification(pushToken, payload) {
  if (pushProviderBackoffUntil > Date.now()) {
    const retryAfterMs = Math.max(0, pushProviderBackoffUntil - Date.now());
    logWebhook('push_notification_skipped', {
      reason: 'push_provider_backoff',
      title: payload?.title,
      retryAfterMs,
    });
    return { ok: false, reason: 'push_provider_backoff', retryAfterMs };
  }

  const token = String(pushToken || '').trim();
  if (!token) {
    logWebhook('push_notification_skipped', { reason: 'no_push_token', title: payload.title });
    return { ok: false, reason: 'no_push_token' };
  }

  if (!isLikelyFcmToken(token)) {
    const reason = isLegacyExpoPushToken(token)
      ? 'legacy_expo_token_format'
      : 'invalid_push_token_format';
    logWebhook('push_notification_skipped', {
      reason,
      title: payload.title,
      tokenPreview: token.slice(0, 24),
    });
    return { ok: false, reason };
  }

  const compactTripForPush = (trip) => {
    if (!trip || typeof trip !== 'object') return null;
    const compact = {
      id: trip.id || null,
      driver_id: trip.driver_id || null,
      passenger_name: trip.passenger_name || null,
      passenger_phone: trip.passenger_phone || null,
      origin_address: trip.origin_address || null,
      destination_address: trip.destination_address || null,
      destination_lat: Number.isFinite(Number(trip.destination_lat)) ? Number(trip.destination_lat) : null,
      destination_lng: Number.isFinite(Number(trip.destination_lng)) ? Number(trip.destination_lng) : null,
      status: trip.status || 'pending',
      notes: typeof trip.notes === 'string' ? trip.notes.slice(0, 280) : null,
      created_at: trip.created_at || null,
    };
    return compact.id ? compact : null;
  };

  const buildPushData = (rawData) => {
    const data = rawData && typeof rawData === 'object' ? { ...rawData } : {};
    const compactTrip = compactTripForPush(data.trip);

    let notesTrimmed = false;
    let tripRemoved = false;

    if (compactTrip) {
      data.trip = compactTrip;
      data.tripId = data.tripId || compactTrip.id;
    }

    let serialized = JSON.stringify(data);
    if (serialized.length > 3300 && data.trip?.notes) {
      data.trip = { ...data.trip, notes: null };
      notesTrimmed = true;
      serialized = JSON.stringify(data);
    }

    if (serialized.length > 3300 && data.trip) {
      delete data.trip;
      tripRemoved = true;
      serialized = JSON.stringify(data);
    }

    return {
      data,
      meta: {
        bytes: serialized.length,
        notesTrimmed,
        tripRemoved,
      },
    };
  };

  const { data: pushData, meta: pushDataMeta } = buildPushData(payload.data || {});
  if (pushDataMeta.notesTrimmed || pushDataMeta.tripRemoved) {
    logWebhook('push_notification_data_compacted', {
      title: payload.title,
      bytes: pushDataMeta.bytes,
      notesTrimmed: pushDataMeta.notesTrimmed,
      tripRemoved: pushDataMeta.tripRemoved,
    });
  }

  const fcmData = normalizeFcmDataPayload(pushData);
  const fcmDataBytes = JSON.stringify(fcmData).length;

  logWebhook('push_notification_start', {
    title: payload.title,
    body: payload.body?.slice(0, 80),
    dataBytes: fcmDataBytes,
  });

  try {
    const messageId = await getFirebaseMessagingClient().send({
      token,
      notification: {
        title: String(payload?.title || ''),
        body: String(payload?.body || ''),
      },
      data: fcmData,
      android: {
        priority: 'high',
        notification: {
          channelId: 'trips',
          sound: 'default',
        },
      },
    });

    if (pushProviderBackoffUntil > 0) {
      pushProviderBackoffUntil = 0;
      logWebhook('push_notification_provider_recovered', {
        ticketId: messageId || null,
      });
    }

    logWebhook('push_notification_ok', {
      ticketStatus: 'ok',
      ticketId: messageId || null,
    });
    return { ok: true, ticketStatus: 'ok', ticketId: messageId || null };
  } catch (err) {
    const normalizedError = normalizeFirebaseSendError(err);
    const invalidCredentials =
      isFirebaseCredentialError(normalizedError.reason) ||
      isFirebaseCredentialError(normalizedError.code) ||
      isFirebaseCredentialError(normalizedError.message);

    if (invalidCredentials) {
      pushProviderBackoffUntil = Date.now() + PUSH_PROVIDER_BACKOFF_MS;
      logWebhook('push_notification_provider_invalid_credentials', {
        ticketStatus: 'error',
        ticketError: normalizedError.message || normalizedError.code || null,
        backoffMs: PUSH_PROVIDER_BACKOFF_MS,
      });
      return {
        ok: false,
        reason: 'push_invalid_credentials',
        ticketStatus: 'error',
        ticketError: normalizedError.message || normalizedError.code || null,
        backoffMs: PUSH_PROVIDER_BACKOFF_MS,
      };
    }

    logWebhook('push_notification_error', {
      ticketStatus: 'error',
      reason: normalizedError.reason || 'push_error',
      ticketError: normalizedError.message || normalizedError.code || null,
    });
    return {
      ok: false,
      reason: normalizedError.reason || 'push_error',
      ticketStatus: 'error',
      ticketError: normalizedError.message || normalizedError.code || null,
    };
  }
}

/**
 * Notifica al chofer por push notification. Si no tiene push_token registrado,
 * cae automáticamente a enviar un WhatsApp desde la cuenta de la empresa.
 */
async function notifyDriver(driver, { title, body, data } = {}) {
  let pushResult = { ok: false, reason: PUSH_NOTIFICATIONS_ENABLED ? 'no_push_token' : 'push_disabled' };
  if (!PUSH_NOTIFICATIONS_ENABLED && driver?.push_token) {
    logWebhook('push_notification_skipped', {
      reason: 'push_disabled_env',
      driverId: driver?.id || null,
      title,
    });
  }

  if (PUSH_NOTIFICATIONS_ENABLED && driver?.push_token) {
    pushResult = await sendPushNotification(driver.push_token, { title, body, data });
  }

  if (pushResult.ok) {
    return {
      ok: true,
      channel: 'push',
      reason: 'push_ok',
    };
  }

  if (driver?.id && pushResult.reason === 'device_not_registered') {
    const { error: clearTokenError } = await getSupabase()
      .from('drivers')
      .update({ push_token: null })
      .eq('id', driver.id);
    if (clearTokenError) {
      logWebhook('push_token_clear_failed', {
        driverId: driver.id,
        error: summarizeDbError(clearTokenError),
      });
    } else {
      logWebhook('push_token_cleared', {
        driverId: driver.id,
        reason: 'device_not_registered',
      });
    }
  }

  // Fallback: WhatsApp al número del chofer
  const driverPhone = normalizePhone(driver?.phone || '');
  if (!driverPhone) {
    logWebhook('notify_driver_no_channel', {
      driverId: driver?.id || null,
      title,
      pushReason: pushResult.reason || 'unknown',
    });
    return {
      ok: false,
      channel: null,
      reason: 'no_driver_channel',
      pushReason: pushResult.reason || 'unknown',
    };
  }
  const notifyType = String(data?.type || '').toLowerCase();
  const passengerPhone = normalizePhone(data?.passengerPhone || data?.trip?.passenger_phone || '');
  if (notifyType === 'new_trip' && passengerPhone && passengerPhone === driverPhone) {
    logWebhook('notify_driver_whatsapp_skipped_same_phone', {
      driverId: driver?.id || null,
      phone: maskPhone(driverPhone),
      title,
      pushReason: pushResult.reason || 'unknown',
    });
    return {
      ok: false,
      channel: 'whatsapp',
      reason: 'driver_phone_matches_passenger',
      pushReason: pushResult.reason || 'unknown',
    };
  }
  let notifyThrottleKey = null;
  if (notifyType === 'new_trip') {
    const dedupePassengerPhone = passengerPhone || 'unknown';
    const dedupeDestination = String(data?.trip?.destination_address || body || '')
      .trim()
      .toLowerCase()
      .slice(0, 160);
    const dedupeDriver = String(driver?.id || driverPhone || 'unknown');
    const now = Date.now();
    notifyThrottleKey = `${dedupeDriver}|${dedupePassengerPhone}|${dedupeDestination}`;
    const lastSentAt = Number(driverWhatsappNotifyMemory.get(notifyThrottleKey) || 0);

    if (now - lastSentAt < DRIVER_WHATSAPP_NOTIFY_MIN_INTERVAL_MS) {
      logWebhook('notify_driver_whatsapp_rate_limited', {
        driverId: driver?.id || null,
        phone: maskPhone(driverPhone),
        title,
        pushReason: pushResult.reason || 'unknown',
        retryInMs: DRIVER_WHATSAPP_NOTIFY_MIN_INTERVAL_MS - (now - lastSentAt),
      });
      return {
        ok: false,
        channel: 'whatsapp',
        reason: 'whatsapp_rate_limited',
        pushReason: pushResult.reason || 'unknown',
      };
    }

    driverWhatsappNotifyMemory.set(notifyThrottleKey, now);
  }
  const trip = data?.trip;
  const waMsg = [
    `🚖 *${title || 'Nuevo viaje asignado'}*`,
    trip?.passenger_name ? `Pasajero: *${trip.passenger_name}*` : null,
    trip?.destination_address ? `Retiro: *${trip.destination_address}*` : (body || null),
    ``,
    `Abrí la app para verlo.`,
  ].filter((l) => l !== null).join('\n');
  let whatsappOk = true;
  let whatsappError = null;
  await sendWhatsAppText(driverPhone, waMsg).catch((err) => {
    whatsappOk = false;
    whatsappError = err?.message || 'unknown';
    if (notifyThrottleKey) {
      driverWhatsappNotifyMemory.delete(notifyThrottleKey);
    }
    logWebhook('notify_driver_whatsapp_error', { driverId: driver?.id || null, error: whatsappError });
  });
  logWebhook('notify_driver_whatsapp_fallback', {
    driverId: driver?.id || null,
    phone: maskPhone(driverPhone),
    title,
    pushReason: pushResult.reason || 'unknown',
    whatsappOk,
  });

  if (!whatsappOk) {
    return {
      ok: false,
      channel: 'whatsapp',
      reason: 'whatsapp_send_error',
      pushReason: pushResult.reason || 'unknown',
      error: whatsappError,
    };
  }

  return {
    ok: true,
    channel: 'whatsapp',
    reason: pushResult.reason || 'push_failed_whatsapp_ok',
  };
}

async function requeuePendingTripAfterNotifyFailure(
  tripId,
  { source = 'unknown', driverId = null, notifyReason = 'unknown' } = {}
) {
  if (!tripId) return { ok: false, reason: 'missing_trip_id' };

  const { data: requeuedTrip, error } = await getSupabase()
    .from('trips')
    .update({
      driver_id: null,
      origin_address: null,
      origin_lat: null,
      origin_lng: null,
      status: 'queued',
      assigned_at: null,
      accepted_at: null,
    })
    .eq('id', tripId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();

  if (error) {
    logWebhook('trip_requeue_notify_fail_error', {
      tripId,
      source,
      driverId,
      notifyReason,
      error: summarizeDbError(error),
    });
    return { ok: false, reason: 'db_error' };
  }

  if (!requeuedTrip) {
    logWebhook('trip_requeue_notify_fail_skipped', {
      tripId,
      source,
      driverId,
      notifyReason,
      reason: 'trip_not_pending',
    });
    return { ok: false, reason: 'trip_not_pending' };
  }

  clearPendingTimeoutTimer(tripId, `notify_failed_${source}`);
  logWebhook('trip_requeued_after_notify_fail', {
    tripId,
    source,
    driverId,
    notifyReason,
  });

  return { ok: true };
}

// ── Zonas de servicio ─────────────────────────────────────────────────────────
// Algoritmo ray-casting para determinar si un punto está dentro de un polígono.
function isPointInPolygon(lat, lng, coordinates) {
  let inside = false;
  const n = coordinates.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const yi = coordinates[i].lat;
    const xi = coordinates[i].lng;
    const yj = coordinates[j].lat;
    const xj = coordinates[j].lng;
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

async function getActiveServiceZones() {
  try {
    const { data, error } = await getSupabase()
      .from('service_zones')
      .select('id, name, coordinates')
      .eq('is_active', true);
    if (error) {
      logWebhook('service_zones_load_error', { error: error.message || 'unknown' });
      return [];
    }
    return (data || []).filter(
      (z) => Array.isArray(z.coordinates) && z.coordinates.length >= 3
    );
  } catch (err) {
    logWebhook('service_zones_load_exception', { error: err?.message || 'unknown' });
    return [];
  }
}

// Devuelve true si el punto está dentro de al menos una zona activa,
// o si no hay zonas configuradas (sin restricción).
async function isPickupInServiceZone(lat, lng) {
  const zones = await getActiveServiceZones();
  if (zones.length === 0) return true; // sin zonas → aceptar todo
  return zones.some((zone) => isPointInPolygon(lat, lng, zone.coordinates));
}
// ── Fin Zonas de servicio ──────────────────────────────────────────────────────

async function createTripFromConversation({ conversation, extracted }) {
  logWebhook('trip_create_start', {
    conversationId: conversation?.id || null,
    phone: maskPhone(conversation?.phone || ''),
    hasOrigin: Boolean(extracted?.origin),
    hasDestination: Boolean(extracted?.destination),
  });

  const rawPickupQuery = extracted?.pickup_location || extracted?.origin || extracted?.destination || null;
  const pickupQuery = sanitizeAddressInput(rawPickupQuery);
  if (!pickupQuery) {
    return {
      ok: false,
      reason: 'missing_pickup_location',
      reply:
        'Necesito la ubicación donde te pasamos a buscar (calle y número). Mandamela y te derivo el móvil.',
      context: {
        passenger_name: extracted.passenger_name || conversation.push_name || 'Pasajero WhatsApp',
        pickup_location: extracted?.pickup_location || null,
        notes: extracted.notes || null,
      },
    };
  }

  const normalizedPickupQuery = normalizeAddressPhrase(pickupQuery);

  let pickupLocation;
  if (extracted._preGeocodedPickup?.lat && extracted._preGeocodedPickup?.lng) {
    pickupLocation = {
      formattedAddress: extracted._preGeocodedPickup.formattedAddress,
      lat: extracted._preGeocodedPickup.lat,
      lng: extracted._preGeocodedPickup.lng,
    };
    logWebhook('trip_create_pickup_pre_geocoded', { formattedAddress: pickupLocation.formattedAddress });
  } else {
  // Arrancar normalización por IA en paralelo con el primer geocoding para no agregar latencia.
  const conversationText = extracted?._conversationText || '';
  const aiNormPromise = normalizeAddressWithAI(normalizedPickupQuery || pickupQuery, conversationText);

  try {
    pickupLocation = await geocodeAddress(normalizedPickupQuery || pickupQuery);
    // Éxito inmediato — AI sigue corriendo en background, cancelarla implícitamente (no se usa)
  } catch (error) {
    // Normalización por IA: ya estaba corriendo en paralelo, solo esperamos el resultado.
    const aiCorrected = await aiNormPromise;
    if (aiCorrected) {
      try {
        pickupLocation = await geocodeAddress(aiCorrected);
        logWebhook('trip_create_geocode_ai_correction_ok', {
          conversationId: conversation?.id || null,
          originalQuery: pickupQuery,
          aiCorrected,
          formattedAddress: pickupLocation.formattedAddress,
        });
      } catch {
        // AI tampoco pudo resolver la dirección → falla definitiva
      }
    }

    if (!pickupLocation) {
    logWebhook('trip_create_geocode_error', {
      conversationId: conversation?.id || null,
      error: error?.message || 'geocode_error',
      pickupQuery,
      knowledgeCandidatesTried: 0,
    });
    return {
      ok: false,
      reason: 'invalid_address',
      reply:
        'No pude ubicar con precisión el punto de retiro. Mandame *calle y número exacto* (por ejemplo "Mitre 1234") o compartime tu *ubicación en tiempo real* desde WhatsApp para derivarte el chofer exacto.',
      context: {
        passenger_name: extracted.passenger_name || conversation.push_name || 'Pasajero WhatsApp',
        pickup_location: normalizedPickupQuery || pickupQuery,
        notes: extracted.notes || null,
        awaiting_gps: true,
      },
    };
    }
  }
  } // end pre-geocoded else

  const finalDestinationHint = normalizeAddressPhrase(extracted?.destination || '');
  const knowledgeCandidates = Array.isArray(extracted?._knowledgeAddressCandidates)
    ? extracted._knowledgeAddressCandidates
    : [];
  let finalDestinationGeo = null;
  let destinationNeedsGps = false;

  // Intentar geocodificar el destino final si el pasajero lo proporcionó.
  // Esto se hace ANTES de asignar chofer para no perder el destino cuando queda en cola.
  if (finalDestinationHint) {
    const destinationKnowledgeCandidates = getKnowledgeCandidatesForHint(
      finalDestinationHint,
      knowledgeCandidates,
      8
    );
    try {
      finalDestinationGeo = await geocodeAddress(finalDestinationHint);
      logWebhook('trip_final_destination_geocoded', {
        hint: finalDestinationHint,
        formattedAddress: finalDestinationGeo.formattedAddress,
        lat: finalDestinationGeo.lat,
        lng: finalDestinationGeo.lng,
      });
    } catch (geoErr) {
      for (const candidate of destinationKnowledgeCandidates) {
        try {
          finalDestinationGeo = await geocodeAddress(candidate);
          logWebhook('trip_final_destination_geocode_fallback_knowledge_ok', {
            hint: finalDestinationHint,
            candidate,
            formattedAddress: finalDestinationGeo.formattedAddress,
          });
          break;
        } catch {
          // try next
        }
      }

      if (!finalDestinationGeo) {
        destinationNeedsGps = true;
        logWebhook('trip_final_destination_geocode_fail', {
          hint: finalDestinationHint,
          error: geoErr?.message || 'unknown',
          knowledgeCandidatesTried: destinationKnowledgeCandidates.length,
        });
      }
    }
  }

  // Embeber el destino final geocodificado en notes como JSON parseable
  // para que la driver-app pueda pre-cargar el destino sin voz.
  const finalDestJson = finalDestinationGeo
    ? `[FINAL_DEST_JSON:${JSON.stringify({
        address: finalDestinationGeo.formattedAddress,
        lat: finalDestinationGeo.lat,
        lng: finalDestinationGeo.lng,
      })}]`
    : null;

  let destinationCandidates = [];
  if (destinationNeedsGps && finalDestinationHint) {
    const rawDestinationCandidates = await getAddressCandidates(finalDestinationHint, 4).catch(() => []);
    const distinctDestinationCandidates = rawDestinationCandidates.filter(
      (candidate, index, arr) =>
        index === 0 ||
        arr.slice(0, index).every(
          (prev) =>
            Math.abs(Number(prev.lat) - Number(candidate.lat)) > 0.001 ||
            Math.abs(Number(prev.lng) - Number(candidate.lng)) > 0.001
        )
    );

    const topScore = Number(distinctDestinationCandidates[0]?.score || 0);
    const secondScore = Number(distinctDestinationCandidates[1]?.score || 0);
    if (distinctDestinationCandidates.length >= 2 && topScore - secondScore < 0.4) {
      destinationCandidates = distinctDestinationCandidates
        .slice(0, 3)
        .map((candidate) => candidate?.formattedAddress)
        .filter(Boolean);

      logWebhook('trip_final_destination_candidates_suggested', {
        hint: finalDestinationHint,
        optionCount: destinationCandidates.length,
      });
    }
  }

  const destinationFollowupText = destinationCandidates.length > 0
    ? [
      'No pude ubicar con precisión el destino final. ¿Era alguna de estas opciones?',
      destinationCandidates.map((address, idx) => `${idx + 1}) ${address}`).join('\n'),
      'Respondeme con la dirección exacta o compartime la *ubicación del destino*.',
    ].join('\n')
    : destinationNeedsGps
      ? 'No pude ubicar con precisión el destino final. Si querés, mandame la *ubicación del destino* o una dirección más exacta y la dejo cargada para el chofer.'
      : null;

  // Validar que el punto de retiro esté dentro de una zona de servicio activa.
  // Si no hay zonas configuradas, se acepta cualquier dirección.
  const inServiceZone = await isPickupInServiceZone(pickupLocation.lat, pickupLocation.lng);
  if (!inServiceZone) {
    logWebhook('trip_create_outside_service_zone', {
      conversationId: conversation?.id || null,
      phone: maskPhone(conversation?.phone || ''),
      pickupAddress: pickupLocation.formattedAddress,
      lat: pickupLocation.lat,
      lng: pickupLocation.lng,
    });
    return {
      ok: false,
      reason: 'outside_service_zone',
      reply:
        'Disculpá, por el momento no contamos con servicio en esa zona. 🙏 Operamos dentro de las áreas de cobertura de Salta Capital. Si tenés otra dirección dentro de la ciudad, avisanos y con gusto te enviamos un chofer.',
      context: {
        passenger_name: extracted.passenger_name || conversation.push_name || 'Pasajero WhatsApp',
        pickup_location: null,
        notes: extracted.notes || null,
      },
    };
  }

  const driver = await chooseDriver(
    { lat: pickupLocation.lat, lng: pickupLocation.lng },
    {
      searchElapsedMs: 0,
      passengerPhone: conversation?.phone || null,
    }
  );
  if (!driver) {
    logWebhook('trip_create_no_driver', {
      conversationId: conversation?.id || null,
      phone: maskPhone(conversation?.phone || ''),
      pickupAddress: pickupLocation.formattedAddress,
    });

    // Sin chofer → crear viaje en cola directamente en la tabla trips.
    // El cron asignará un chofer cuando se libere uno (dispatchQueuedPassengers).
    const queuePayload = {
      driver_id: null,
      passenger_name: extracted.passenger_name || conversation.push_name || 'Pasajero WhatsApp',
      passenger_phone: conversation.phone,
      origin_address: null,
      origin_lat: null,
      origin_lng: null,
      destination_address: pickupLocation.formattedAddress,
      destination_lat: pickupLocation.lat,
      destination_lng: pickupLocation.lng,
      status: 'queued',
      price: null,
      commission_amount: null,
      distance_km: null,
      duration_minutes: null,
      notes: [
        '[APPROACH_ONLY]',
        extracted.notes || 'En cola de espera. Retiro confirmado.',
        finalDestJson || (finalDestinationHint
          ? `Destino final sugerido por pasajero: ${finalDestinationHint}`
          : null),
        extracted.catastral_nomenclature ? `[CATASTRAL] ${extracted.catastral_nomenclature}` : null,
      ].filter(Boolean).join('\n'),
    };
    const { data: queuedTrip, error: queueErr } = await getSupabase()
      .from('trips')
      .insert(queuePayload)
      .select()
      .single();
    if (queueErr) throw queueErr;

    logWebhook('trip_queued_insert_ok', { tripId: queuedTrip?.id });
    return {
      ok: true,
      queued: true,
      trip: queuedTrip,
      driver: null,
      reply: [
        'Estoy buscando un móvil para tu viaje y ya te sumé a la cola de prioridad. Apenas se confirme uno, te aviso automáticamente 🕐',
        finalDestinationGeo
          ? `Destino: *${finalDestinationGeo.formattedAddress}*`
          : finalDestinationHint
            ? `Destino indicado: *${finalDestinationHint}*`
            : null,
        destinationFollowupText,
      ].filter(Boolean).join('\n'),
      context: {
        passenger_name: extracted.passenger_name || conversation.push_name || 'Pasajero WhatsApp',
        pickup_location: normalizedPickupQuery || pickupQuery,
        destination: finalDestinationHint || null,
        notes: extracted.notes || null,
        awaiting_destination_gps: destinationNeedsGps,
        destination_candidates: destinationCandidates.length ? destinationCandidates : null,
      },
    };
  }

  const driverLat = Number(driver.current_lat);
  const driverLng = Number(driver.current_lng);
  const driverOriginAddress = await reverseGeocodeLatLng(driverLat, driverLng);
  const routeToPickup = await getRouteMetrics({ lat: driverLat, lng: driverLng }, pickupLocation);

  // Approach-only trip: driver -> pickup has no fare.
  logWebhook('trip_approach_only_created', {
    approachDistanceKm: routeToPickup.distanceKm,
    approachDurationMinutes: routeToPickup.durationMinutes,
    hasFinalDestinationHint: Boolean(finalDestinationHint),
    hasFinalDestinationGeo: Boolean(finalDestinationGeo),
  });

  const tripPayload = {
    driver_id: driver.id,
    passenger_name: extracted.passenger_name || conversation.push_name || 'Pasajero WhatsApp',
    passenger_phone: conversation.phone,
    origin_address: driverOriginAddress,
    origin_lat: driverLat,
    origin_lng: driverLng,
    destination_address: pickupLocation.formattedAddress,
    destination_lat: pickupLocation.lat,
    destination_lng: pickupLocation.lng,
    status: 'pending',
    assigned_at: new Date().toISOString(),
    price: null,
    commission_amount: null,
    distance_km: null,
    duration_minutes: null,
    notes: [
      '[APPROACH_ONLY]',
      extracted.notes || 'Creado automáticamente desde WhatsApp (chofer -> retiro pasajero, sin cobro inicial).',
      finalDestJson || (finalDestinationHint
        ? `Destino final sugerido por pasajero: ${finalDestinationHint}`
        : 'Destino final: se define al subir el pasajero.'),
      // Nomenclatura catastral (Manzana/Lote) cuando el pasajero no tiene dirección en Google Maps.
      // Preservada desde el contexto para que el chofer vea la referencia original.
      extracted.catastral_nomenclature
        ? `[CATASTRAL] ${extracted.catastral_nomenclature}`
        : null,
      // Conversación actual del pasajero como indicaciones extra para el chofer.
      // Se incluyen los mensajes del pedido, no el historial completo.
      extracted._conversationText
        ? `[INDICACIONES_PASAJERO] ${extracted._conversationText.replace(/\n+/g, ' | ').trim()}`
        : null,
    ].filter(Boolean).join('\n'),
  };

  const { data: trip, error } = await getSupabase().from('trips').insert(tripPayload).select().single();
  if (error) throw error;

  logWebhook('db_trip_insert_ok', {
    tripId: trip?.id || null,
    driverId: trip?.driver_id || null,
    price: trip?.price ?? null,
    distanceKm: trip?.distance_km ?? null,
  });

  const notifyResult = await notifyDriver(driver, {
    title: 'Nuevo viaje asignado',
    body: `${trip.passenger_name} → ${trip.destination_address}`,
    data: {
      type: 'new_trip',
      tripId: trip.id,
      trip,
    },
  });

  if (!notifyResult?.ok) {
    await requeuePendingTripAfterNotifyFailure(trip.id, {
      source: 'trip_create_pending',
      driverId: driver.id,
      notifyReason: notifyResult?.reason || 'unknown',
    });

    logWebhook('trip_create_notify_failed_requeued', {
      tripId: trip.id,
      driverId: driver.id,
      notifyReason: notifyResult?.reason || 'unknown',
      channel: notifyResult?.channel || null,
    });

    return {
      ok: true,
      queued: true,
      trip: {
        ...trip,
        driver_id: null,
        origin_address: null,
        origin_lat: null,
        origin_lng: null,
        status: 'queued',
        assigned_at: null,
        accepted_at: null,
      },
      driver: null,
      reply:
        'Encontré un chofer, pero no pude contactarlo en este momento. Te dejé en cola y te aviso apenas uno reciba la asignación.',
      context: {
        passenger_name: extracted.passenger_name || conversation.push_name || 'Pasajero WhatsApp',
        pickup_location: normalizedPickupQuery || pickupQuery,
        destination: finalDestinationHint || null,
        notes: extracted.notes || null,
        awaiting_destination_gps: destinationNeedsGps,
        destination_candidates: destinationCandidates.length ? destinationCandidates : null,
        confirmed_trip_id: null,
        last_cancellation_notified_trip_id: null,
      },
    };
  }

  schedulePendingTimeoutTimer(trip.id, { source: 'trip_create_pending' });

  const driverLabel = [driver.vehicle_brand, driver.vehicle_model].filter(Boolean).join(' ');
  const driverMeta = [driver.full_name, driverLabel, driver.vehicle_plate].filter(Boolean).join(' · ');

  const destinationConfirmLine = finalDestinationGeo
    ? `\nDestino: *${finalDestinationGeo.formattedAddress}*`
    : finalDestinationHint
      ? `\nDestino indicado: *${finalDestinationHint}*`
      : '';

  const destinationGpsLine = destinationFollowupText
    ? `\n${destinationFollowupText}`
    : '';

  return {
    ok: true,
    trip,
    driver,
    reply:
      `Tomé tu pedido y ya lo derivé. Apenas un chofer lo acepte, te paso por WhatsApp quién va a buscarte.\n\nRetiro: *${pickupLocation.formattedAddress}*${destinationConfirmLine}${destinationGpsLine}`,
    context: {
      passenger_name: extracted.passenger_name || conversation.push_name || 'Pasajero WhatsApp',
      pickup_location: normalizedPickupQuery || pickupQuery,
      destination: finalDestinationHint || null,
      notes: extracted.notes || null,
      awaiting_destination_gps: destinationNeedsGps,
      destination_candidates: destinationCandidates.length ? destinationCandidates : null,
      confirmed_trip_id: null,
      last_cancellation_notified_trip_id: null,
    },
  };
}

/**
 * Despacha automáticamente los viajes en cola (status='queued') al chofer libre más cercano.
 * Se ejecuta en cada ciclo de cron y cuando un chofer termina o cancela un viaje.
 * Orden: FIFO (el pasajero que lleva más tiempo esperando tiene prioridad).
 */
async function dispatchQueuedPassengers() {
  if (SUPABASE_DISPATCH_ONLY) {
    logWebhook('queue_dispatch_skipped', {
      reason: 'supabase_dispatch_only',
    });
    return { dispatched: 0, skipped: true };
  }

  logWebhook('queue_dispatch_start');

  const { data: queuedTrips, error } = await getSupabase()
    .from('trips')
    .select('id, passenger_name, passenger_phone, destination_address, destination_lat, destination_lng, notes, wa_context, created_at')
    .eq('status', 'queued')
    .order('created_at', { ascending: true }); // FIFO: el más antiguo primero

  if (error) {
    logWebhook('queue_dispatch_db_error', { error: summarizeDbError(error) });
    return { dispatched: 0 };
  }

  if (!queuedTrips?.length) {
    logWebhook('queue_dispatch_empty');
    return { dispatched: 0 };
  }

  logWebhook('queue_dispatch_found', { count: queuedTrips.length });

  // Deduplicar: solo el viaje más antiguo por pasajero (FIFO)
  const oldestByPhone = new Map();
  for (const trip of queuedTrips) {
    const phone = normalizePhone(trip.passenger_phone);
    if (phone && !oldestByPhone.has(phone)) oldestByPhone.set(phone, trip);
  }

  let dispatched = 0;

  for (const [phone, trip] of oldestByPhone) {
    const lockClaim = await claimTripQueueLock(trip);
    if (!lockClaim?.claimed) {
      logWebhook('queue_dispatch_lock_skipped', {
        tripId: trip.id,
        phone: maskPhone(phone),
        reason: lockClaim?.reason || 'not_claimed',
      });
      continue;
    }

    const queueLockToken = lockClaim?.lockToken || null;
    const releaseQueueLock = async (
      { result = 'retry', retrySeconds = QUEUE_DISPATCH_RETRY_SECONDS, errorMessage = null } = {}
    ) => {
      if (queueLockToken) {
        await releaseTripQueueLock(trip.id, queueLockToken, {
          result,
          retrySeconds,
          errorMessage,
        });
        return;
      }

      if (String(result || '').toLowerCase() === 'retry') {
        await postponeTripQueueRetry(trip.id, retrySeconds, errorMessage || 'retry');
      }
    };

    try {
      const pickupLat = Number(trip.destination_lat);
      const pickupLng = Number(trip.destination_lng);

      if (!Number.isFinite(pickupLat) || !Number.isFinite(pickupLng)) {
        logWebhook('queue_dispatch_skip_no_coords', { tripId: trip.id, phone: maskPhone(phone) });
        await releaseQueueLock({
          result: 'retry',
          retrySeconds: 90,
          errorMessage: 'missing_pickup_coordinates',
        });
        continue;
      }

      // Verificar zona de servicio
      const inZone = await isPickupInServiceZone(pickupLat, pickupLng);
      if (!inZone) {
        logWebhook('queue_dispatch_outside_zone', { tripId: trip.id, pickupLat, pickupLng });
        const { data: cancelledRows, error: outsideZoneUpdateErr } = await getSupabase()
          .from('trips')
          .update({
            status: 'cancelled',
            cancel_reason: 'Zona sin cobertura',
            wa_notified_at: new Date().toISOString(),
          })
          .eq('id', trip.id)
          .eq('status', 'queued')
          .select('id');

        if (outsideZoneUpdateErr) {
          logWebhook('queue_dispatch_outside_zone_update_error', {
            tripId: trip.id,
            error: summarizeDbError(outsideZoneUpdateErr),
          });
          await releaseQueueLock({
            result: 'retry',
            retrySeconds: 60,
            errorMessage: 'outside_zone_update_error',
          });
          continue;
        }

        if (!cancelledRows?.length) {
          logWebhook('queue_dispatch_outside_zone_claim_lost', { tripId: trip.id });
          await releaseQueueLock({ result: 'done', errorMessage: 'outside_zone_claim_lost' });
          continue;
        }

        await sendWhatsAppText(
          phone,
          'Disculpá, tu dirección de retiro está fuera de nuestras zonas de cobertura. Si tenés otra dirección dentro de Salta Capital, avisanos. 🙏'
        ).catch(() => {});

        await releaseQueueLock({ result: 'done', errorMessage: 'outside_zone_cancelled' });
        continue;
      }

      const queueCreatedAtMs = new Date(trip.created_at || 0).getTime();
      const queueElapsedMs = Number.isFinite(queueCreatedAtMs) && queueCreatedAtMs > 0
        ? Math.max(0, Date.now() - queueCreatedAtMs)
        : 0;

      const reassignmentContext = await getPassengerReassignmentContext(phone);
      const contextExcludedDriverIds = getTripDispatchExcludedDriverIds(trip?.wa_context);
      const excludedDriverIdSet = new Set([
        ...(reassignmentContext.timeoutCancelledDriverIds || []),
        ...contextExcludedDriverIds,
      ]);
      const searchElapsedMs = Math.max(queueElapsedMs, reassignmentContext.timeoutElapsedMs || 0);

      const driver = await chooseDriver(
        { lat: pickupLat, lng: pickupLng },
        {
          excludedDriverIds: [...excludedDriverIdSet],
          searchElapsedMs,
          allowExclusionRelaxation: false,
          passengerPhone: trip.passenger_phone || phone,
        }
      );
      if (!driver) {
        logWebhook('queue_dispatch_no_driver', { tripId: trip.id });
        await releaseQueueLock({
          result: 'retry',
          retrySeconds: QUEUE_DISPATCH_RETRY_SECONDS,
          errorMessage: 'no_driver_available',
        });
        continue; // sigue en cola
      }

      const driverLat = Number(driver.current_lat);
      const driverLng = Number(driver.current_lng);
      const driverOriginAddress = await reverseGeocodeLatLng(driverLat, driverLng).catch(
        () => `${driverLat.toFixed(5)}, ${driverLng.toFixed(5)}`
      );

      // Actualizar el viaje en cola con el chofer — la fila persiste, solo cambia el estado
      const assignedAt = new Date().toISOString();
      const { data: claimedRows, error: updateErr } = await getSupabase()
        .from('trips')
        .update({
          driver_id: driver.id,
          origin_address: driverOriginAddress,
          origin_lat: driverLat,
          origin_lng: driverLng,
          status: 'pending',
          assigned_at: assignedAt,
        })
        .eq('id', trip.id)
        .eq('status', 'queued')
        .select('id'); // guard contra race condition

      if (updateErr) {
        logWebhook('queue_dispatch_update_error', { tripId: trip.id, error: summarizeDbError(updateErr) });
        await releaseQueueLock({
          result: 'retry',
          retrySeconds: QUEUE_DISPATCH_RETRY_SECONDS,
          errorMessage: 'trip_update_error',
        });
        continue;
      }

      if (!claimedRows?.length) {
        logWebhook('queue_dispatch_claim_lost', { tripId: trip.id, driverId: driver.id });
        await releaseQueueLock({ result: 'done', errorMessage: 'trip_claim_lost' });
        continue;
      }

      const notifyResult = await notifyDriver(driver, {
        title: 'Nuevo viaje asignado',
        body: `${trip.passenger_name} → ${trip.destination_address}`,
        data: {
          type: 'new_trip',
          tripId: trip.id,
          passengerPhone: trip.passenger_phone || phone,
          trip: {
            id: trip.id,
            passenger_name: trip.passenger_name,
            passenger_phone: trip.passenger_phone || phone,
            destination_address: trip.destination_address,
          },
        },
      });

      if (!notifyResult?.ok) {
        const notifyReason = String(notifyResult?.reason || 'unknown');
        const shouldExcludeDriver =
          Boolean(driver?.id) &&
          (notifyReason === 'driver_phone_matches_passenger' || notifyReason === 'no_driver_channel');

        if (shouldExcludeDriver) {
          await addTripDispatchExcludedDriverId(trip.id, driver.id, `notify_fail:${notifyReason}`);
        }

        await requeuePendingTripAfterNotifyFailure(trip.id, {
          source: 'queue_dispatch_pending',
          driverId: driver.id,
          notifyReason,
        });
        logWebhook('queue_dispatch_notify_failed_requeued', {
          tripId: trip.id,
          phone: maskPhone(phone),
          driverId: driver.id,
          notifyReason,
          channel: notifyResult?.channel || null,
        });
        await releaseQueueLock({
          result: 'retry',
          retrySeconds: QUEUE_DISPATCH_NOTIFY_FAIL_RETRY_SECONDS,
          errorMessage: `notify_failed:${notifyReason}`,
        });
        continue;
      }

      schedulePendingTimeoutTimer(trip.id, { source: 'queue_dispatch_pending' });

      // NO se notifica al pasajero aquí — el chofer aún no aceptó.
      // La confirmación con ETA y datos del chofer se envía en
      // processTripLifecycleTransitions (Parte A) cuando el status
      // pasa a 'accepted', usando buildPassengerDriverConfirmationMessage.

      dispatched++;
      logWebhook('queue_dispatch_ok', { tripId: trip.id, phone: maskPhone(phone), driverId: driver.id });
      await releaseQueueLock({ result: 'done', errorMessage: null });
    } catch (error) {
      logWebhook('queue_dispatch_trip_error', {
        tripId: trip.id,
        phone: maskPhone(phone),
        error: error?.message || 'unknown',
      });
      await releaseQueueLock({
        result: 'retry',
        retrySeconds: QUEUE_DISPATCH_RETRY_SECONDS,
        errorMessage: error?.message || 'unexpected_queue_dispatch_error',
      });
    }
  }

  logWebhook('queue_dispatch_done', { dispatched, total: oldestByPhone.size });
  return { dispatched };
}

function clearPendingTimeoutTimer(tripId, reason = 'unknown') {
  if (!tripId) return;
  const timer = pendingTimeoutTimers.get(tripId);
  if (!timer) return;
  clearTimeout(timer);
  pendingTimeoutTimers.delete(tripId);
  logWebhook('pending_timeout_timer_cleared', { tripId, reason });
}

function schedulePendingTimeoutTimer(
  tripId,
  { delayMs = PENDING_ACCEPT_TIMEOUT_MS, source = 'unknown' } = {}
) {
  if (!tripId) return;

  if (SUPABASE_DISPATCH_ONLY) {
    logWebhook('pending_timeout_timer_skipped', {
      tripId,
      source,
      reason: 'supabase_dispatch_only',
    });
    return;
  }

  if (!ENABLE_PENDING_TIMEOUT_TIMER) {
    logWebhook('pending_timeout_timer_skipped', {
      tripId,
      source,
      reason: 'timer_disabled',
    });
    return;
  }

  clearPendingTimeoutTimer(tripId, 'rescheduled');
  const safeDelayMs = Math.max(250, Math.round(Number(delayMs) || PENDING_ACCEPT_TIMEOUT_MS));

  const timer = setTimeout(async () => {
    pendingTimeoutTimers.delete(tripId);
    try {
      await cancelTimedOutPendingTripAndRedispatch(tripId, {
        source: `timer:${source}`,
      });
    } catch (error) {
      logWebhook('pending_timeout_timer_error', {
        tripId,
        source,
        error: error?.message || 'unknown',
      });
    }
  }, safeDelayMs);

  pendingTimeoutTimers.set(tripId, timer);
  logWebhook('pending_timeout_timer_scheduled', {
    tripId,
    source,
    delayMs: safeDelayMs,
  });
}

async function cancelTimedOutPendingTripAndRedispatch(tripId, { source = 'unknown' } = {}) {
  if (!tripId) return { cancelled: false, reason: 'missing_trip_id' };

  let trip;
  try {
    trip = await getConversationFlowTripById(tripId);
  } catch (error) {
    logWebhook('pending_timeout_trip_fetch_error', {
      tripId,
      source,
      error: error?.message || 'unknown',
    });
    return { cancelled: false, reason: 'fetch_error' };
  }

  if (!trip) {
    clearPendingTimeoutTimer(tripId, 'trip_not_found');
    return { cancelled: false, reason: 'trip_not_found' };
  }

  const status = String(trip.status || '').toLowerCase();
  if (status !== 'pending') {
    clearPendingTimeoutTimer(tripId, `status_${status || 'unknown'}`);
    return { cancelled: false, reason: 'status_not_pending' };
  }

  const assignedAtMs = new Date(trip.assigned_at || trip.created_at || 0).getTime();
  const hasAssignedAt = Number.isFinite(assignedAtMs) && assignedAtMs > 0;
  const remainingMs = hasAssignedAt
    ? assignedAtMs + PENDING_ACCEPT_TIMEOUT_MS - Date.now()
    : 0;

  if (remainingMs > 250) {
    schedulePendingTimeoutTimer(tripId, {
      delayMs: remainingMs,
      source: `${source}:reschedule`,
    });
    return { cancelled: false, reason: 'not_expired_yet', remainingMs };
  }

  const { data: cancelledTrip, error: cancelError } = await getSupabase()
    .from('trips')
    .update({
      status: 'cancelled',
      cancel_reason: PENDING_TIMEOUT_CANCEL_REASON,
    })
    .eq('id', tripId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();

  if (cancelError) {
    logWebhook('pending_timeout_cancel_error', {
      tripId,
      source,
      error: summarizeDbError(cancelError),
    });
    return { cancelled: false, reason: 'cancel_error' };
  }

  if (!cancelledTrip) {
    clearPendingTimeoutTimer(tripId, 'already_moved');
    return { cancelled: false, reason: 'already_moved' };
  }

  clearPendingTimeoutTimer(tripId, 'auto_cancelled');
  const secondsPending = hasAssignedAt
    ? Math.max(0, Math.round((Date.now() - assignedAtMs) / 1000))
    : null;

  logWebhook('pending_timeout_cancelled', {
    tripId,
    source,
    secondsPending,
  });

  const transitions = await processTripLifecycleTransitionsForTripId(tripId);
  return { cancelled: true, transitions };
}

/**
 * Fallback por cron: cancela viajes `pending` vencidos y dispara la
 * reasignación inmediata. Se mantiene como red de seguridad si el timer
 * en memoria no llegó a ejecutarse.
 */
async function expireTimedOutPendingTrips() {
  logWebhook('expire_pending_start');

  const cutoff = new Date(Date.now() - PENDING_ACCEPT_TIMEOUT_MS).toISOString();

  const { data: timedOut, error } = await getSupabase()
    .from('trips')
    .select('id')
    .eq('status', 'pending')
    .not('assigned_at', 'is', null)
    .lt('assigned_at', cutoff);

  if (error) {
    logWebhook('expire_pending_db_error', { error: summarizeDbError(error) });
    return { expired: 0 };
  }

  if (!timedOut?.length) {
    logWebhook('expire_pending_none');
    return { expired: 0 };
  }

  logWebhook('expire_pending_found', { count: timedOut.length });

  let expired = 0;
  for (const trip of timedOut) {
    const result = await cancelTimedOutPendingTripAndRedispatch(trip.id, {
      source: 'cron_fallback',
    });
    if (result?.cancelled) expired += 1;
  }

  logWebhook('expire_pending_done', { expired });
  return { expired };
}

/**
 * Fallback DB-first: cuando el dispatch vive en /api/dispatch-worker,
 * este cron solo reencola pending vencidos sin ejecutar redispatch legacy.
 */
async function requeueTimedOutPendingTripsSupabaseDispatchOnly() {
  logWebhook('expire_pending_db_first_start');

  const cutoff = new Date(Date.now() - PENDING_ACCEPT_TIMEOUT_MS).toISOString();

  const { data: staleAssigned, error: staleAssignedError } = await getSupabase()
    .from('trips')
    .select('id, assigned_at')
    .eq('status', 'pending')
    .not('assigned_at', 'is', null)
    .lt('assigned_at', cutoff);

  if (staleAssignedError) {
    logWebhook('expire_pending_db_first_error', {
      scope: 'assigned_at',
      error: summarizeDbError(staleAssignedError),
    });
    return { expired: 0, error: true };
  }

  const { data: staleWithoutAssigned, error: staleWithoutAssignedError } = await getSupabase()
    .from('trips')
    .select('id, status_updated_at')
    .eq('status', 'pending')
    .is('assigned_at', null)
    .lt('status_updated_at', cutoff);

  if (staleWithoutAssignedError) {
    logWebhook('expire_pending_db_first_error', {
      scope: 'status_updated_at',
      error: summarizeDbError(staleWithoutAssignedError),
    });
    return { expired: 0, error: true };
  }

  const { data: staleLegacyPending, error: staleLegacyPendingError } = await getSupabase()
    .from('trips')
    .select('id, created_at')
    .eq('status', 'pending')
    .is('assigned_at', null)
    .is('status_updated_at', null)
    .lt('created_at', cutoff);

  if (staleLegacyPendingError) {
    logWebhook('expire_pending_db_first_error', {
      scope: 'created_at_legacy',
      error: summarizeDbError(staleLegacyPendingError),
    });
    return { expired: 0, error: true };
  }

  const candidateIds = [
    ...(staleAssigned || []).map((row) => row?.id).filter(Boolean),
    ...(staleWithoutAssigned || []).map((row) => row?.id).filter(Boolean),
    ...(staleLegacyPending || []).map((row) => row?.id).filter(Boolean),
  ].filter((id, index, arr) => arr.indexOf(id) === index);

  logWebhook('expire_pending_db_first_candidates', {
    cutoff,
    withAssignedCount: (staleAssigned || []).length,
    withoutAssignedCount: (staleWithoutAssigned || []).length,
    legacyPendingCount: (staleLegacyPending || []).length,
    candidateCount: candidateIds.length,
  });

  if (!candidateIds.length) {
    logWebhook('expire_pending_db_first_none');
    return { expired: 0, error: false };
  }

  const { data: requeuedRows, error: requeueError } = await getSupabase()
    .from('trips')
    .update({
      driver_id: null,
      origin_address: null,
      origin_lat: null,
      origin_lng: null,
      status: 'queued',
      assigned_at: null,
      accepted_at: null,
    })
    .in('id', candidateIds)
    .eq('status', 'pending')
    .select('id');

  if (requeueError) {
    logWebhook('expire_pending_db_first_requeue_error', {
      candidateCount: candidateIds.length,
      error: summarizeDbError(requeueError),
    });
    return { expired: 0, error: true };
  }

  const expired = Array.isArray(requeuedRows) ? requeuedRows.length : 0;
  logWebhook('expire_pending_db_first_done', {
    expired,
    candidateCount: candidateIds.length,
  });

  if (expired < candidateIds.length) {
    logWebhook('expire_pending_db_first_partial', {
      candidateCount: candidateIds.length,
      expired,
    });
  }

  return { expired, error: false };
}

/**
 * OBSOLETO: la lógica de re-despacho ahora vive en processTripLifecycleTransitions,
 * que lee directamente de la tabla trips (status='cancelled' + wa_notified_at IS NULL).
 */
async function redispatchOrphanedCancelledTrips() {
  return { redispatched: 0 };
}

async function processTripLifecycleTransitions() {
  logWebhook('trip_transition_scan_start');

  let confirmed = 0;
  let reassigned = 0;
  let queued = 0;

  // ── Parte A: Notificar pasajeros cuando el chofer acepta ──────────────────────
  const { data: activeTrips, error: activeErr } = await getSupabase()
    .from('trips')
    .select('id, driver_id, passenger_name, passenger_phone, status, destination_address, destination_lat, destination_lng, wa_notified_at, created_at')
    .in('status', ACTIVE_TRIP_STATUSES)
    .is('wa_notified_at', null)
    .not('driver_id', 'is', null)
    .gte('created_at', new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString());

  if (activeErr) {
    logWebhook('trip_transition_active_error', { error: summarizeDbError(activeErr) });
  } else {
    for (const trip of activeTrips || []) {
      // Claim atómico: solo uno de webhook/cron notifica al pasajero
      const { data: claimed } = await getSupabase()
        .from('trips')
        .update({ wa_notified_at: new Date().toISOString() })
        .eq('id', trip.id)
        .is('wa_notified_at', null)
        .select('id');
      if (!claimed?.length) continue;

      const driver = await getDriverById(trip.driver_id);
      if (!driver) continue;
      const reply = await buildPassengerDriverConfirmationMessage(trip, driver);
      await sendWhatsAppText(trip.passenger_phone, reply).catch(() => {});
      confirmed++;
      logWebhook('trip_transition_passenger_notified', { tripId: trip.id, status: trip.status });
    }
  }

  // ── Parte B: Reasignar viajes cancelados por el chofer ────────────────────────
  const { data: cancelledTrips, error: cancelErr } = await getSupabase()
    .from('trips')
    .select('id, driver_id, passenger_name, passenger_phone, cancel_reason, notes, destination_address, destination_lat, destination_lng, wa_notified_at, created_at')
    .eq('status', 'cancelled')
    .is('wa_notified_at', null)
    .not('driver_id', 'is', null)
    .gte('created_at', new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString());

  if (cancelErr) {
    logWebhook('trip_transition_cancelled_error', { error: summarizeDbError(cancelErr) });
  } else {
    for (const trip of cancelledTrips || []) {
      // Claim atómico
      const { data: claimed } = await getSupabase()
        .from('trips')
        .update({ wa_notified_at: new Date().toISOString() })
        .eq('id', trip.id)
        .is('wa_notified_at', null)
        .select('id');
      if (!claimed?.length) continue;

      if (!shouldReassignCancelledTrip(trip)) continue;

      // Verificar que no haya otro viaje abierto para este pasajero
      const existingTrip = await getLatestOpenTripByPhone(trip.passenger_phone);
      if (existingTrip) {
        logWebhook('trip_transition_skip_has_open', { tripId: trip.id, existingTripId: existingTrip.id });
        continue;
      }

      const pickup = getTripPickupPoint(trip);
      if (!Number.isFinite(pickup.lat) || !Number.isFinite(pickup.lng)) continue;

      const reassignmentContext = await getPassengerReassignmentContext(trip.passenger_phone);
      const tripCreatedAtMs = new Date(trip.created_at || 0).getTime();
      const tripElapsedMs = Number.isFinite(tripCreatedAtMs) && tripCreatedAtMs > 0
        ? Math.max(0, Date.now() - tripCreatedAtMs)
        : 0;
      const searchElapsedMs = Math.max(tripElapsedMs, reassignmentContext.timeoutElapsedMs || 0);

      const systemFailure = isSystemFailureCancellation(trip);
      const excludedDriverIdSet = new Set(systemFailure ? [] : [trip.driver_id].filter(Boolean));
      if (!systemFailure) {
        for (const timeoutDriverId of reassignmentContext.timeoutCancelledDriverIds || []) {
          excludedDriverIdSet.add(timeoutDriverId);
        }
      }

      const excludedDriverIds = [...excludedDriverIdSet];
      const driver = await chooseDriver(
        { lat: pickup.lat, lng: pickup.lng },
        {
          excludedDriverIds,
          searchElapsedMs,
          allowExclusionRelaxation: false,
          passengerPhone: trip.passenger_phone || null,
        }
      );

      if (driver) {
        const driverLat = Number(driver.current_lat);
        const driverLng = Number(driver.current_lng);
        const driverOriginAddress = await reverseGeocodeLatLng(driverLat, driverLng).catch(
          () => `${driverLat.toFixed(5)}, ${driverLng.toFixed(5)}`
        );
        const { data: newTrip, error: insertErr } = await getSupabase()
          .from('trips')
          .insert({
            driver_id: driver.id,
            passenger_name: trip.passenger_name,
            passenger_phone: trip.passenger_phone,
            origin_address: driverOriginAddress,
            origin_lat: driverLat,
            origin_lng: driverLng,
            destination_address: pickup.address,
            destination_lat: pickup.lat,
            destination_lng: pickup.lng,
            status: 'pending',
            assigned_at: new Date().toISOString(),
            notes: trip.notes || '[APPROACH_ONLY] Reasignado automáticamente.',
          })
          .select().single();

        if (!insertErr) {
          const notifyResult = await notifyDriver(driver, {
            title: 'Nuevo viaje asignado',
            body: `${trip.passenger_name} → ${pickup.address}`,
            data: {
              type: 'new_trip',
              tripId: newTrip.id,
              passengerPhone: newTrip?.passenger_phone || trip.passenger_phone,
              trip: newTrip,
            },
          });

          if (!notifyResult?.ok) {
            await requeuePendingTripAfterNotifyFailure(newTrip.id, {
              source: 'transition_reassign_pending',
              driverId: driver.id,
              notifyReason: notifyResult?.reason || 'unknown',
            });
            await sendPassengerLifecycleFollowup({
              phone: trip.passenger_phone,
              text: 'No pudimos contactar al chofer asignado. Seguís en cola y te avisamos apenas se confirme uno.',
              noticeType: 'queued_no_driver',
              relatedTripId: newTrip.id,
            });
            queued++;
            logWebhook('trip_transition_reassign_notify_failed_requeued', {
              cancelledTripId: trip.id,
              newTripId: newTrip.id,
              driverId: driver.id,
              notifyReason: notifyResult?.reason || 'unknown',
              channel: notifyResult?.channel || null,
            });
            continue;
          }

          schedulePendingTimeoutTimer(newTrip.id, { source: 'transition_reassign_pending' });
          await sendPassengerLifecycleFollowup({
            phone: trip.passenger_phone,
            text: 'El chofer no pudo tomar el viaje. Ya encontré otro y te aviso cuando lo acepte.',
            noticeType: 'reassigned_pending',
            relatedTripId: newTrip.id,
          });
          reassigned++;
          logWebhook('trip_transition_reassigned', { cancelledTripId: trip.id, newTripId: newTrip.id });
        }
      } else {
        // Sin chofer → crear viaje en cola
        const { data: queuedTrip } = await getSupabase()
          .from('trips')
          .insert({
            driver_id: null,
            passenger_name: trip.passenger_name,
            passenger_phone: trip.passenger_phone,
            origin_address: null,
            origin_lat: null,
            origin_lng: null,
            destination_address: pickup.address,
            destination_lat: pickup.lat,
            destination_lng: pickup.lng,
            status: 'queued',
            notes: trip.notes || '[APPROACH_ONLY] En cola de espera.',
          })
          .select().single();

        await sendPassengerLifecycleFollowup({
          phone: trip.passenger_phone,
          text: 'Seguimos buscando móvil para tu viaje. Ya quedaste en cola y te avisamos apenas se confirme uno 🕐',
          noticeType: 'queued_no_driver',
          relatedTripId: queuedTrip?.id || trip.id,
        });
        queued++;
        logWebhook('trip_transition_queued', { cancelledTripId: trip.id, newTripId: queuedTrip?.id });
      }
    }
  }

  const queueResult = await dispatchQueuedPassengers();
  logWebhook('trip_transition_scan_done', { confirmed, reassigned, queued: queueResult.dispatched });
  return { confirmed, reassigned, queued: queueResult.dispatched };
}

async function processTripLifecycleTransitionsForTripId(tripId) {
  if (!tripId) return { confirmed: 0, reassigned: 0, queued: 0 };

  logWebhook('trip_transition_trip_scan_start', { tripId });

  const trip = await getConversationFlowTripById(tripId);
  if (!trip) {
    logWebhook('trip_transition_trip_scan_done', { tripId, reason: 'trip_not_found' });
    return { confirmed: 0, reassigned: 0, queued: 0 };
  }

  const tripStatus = String(trip.status || '').toLowerCase();

  if (tripStatus === 'pending') {
    schedulePendingTimeoutTimer(tripId, { source: 'trip_scan_pending' });
  } else {
    clearPendingTimeoutTimer(tripId, `trip_scan_${tripStatus || 'unknown'}`);
  }

  // Notificar pasajero cuando chofer acepta
  if (ACTIVE_TRIP_STATUSES.includes(tripStatus) && !trip.wa_notified_at) {
    const { data: claimed } = await getSupabase()
      .from('trips')
      .update({ wa_notified_at: new Date().toISOString() })
      .eq('id', trip.id)
      .is('wa_notified_at', null)
      .select('id');

    if (claimed?.length && trip.driver_id) {
      const driver = await getDriverById(trip.driver_id);
      if (driver) {
        const reply = await buildPassengerDriverConfirmationMessage(trip, driver);
        await sendWhatsAppText(trip.passenger_phone, reply).catch(() => {});
        logWebhook('trip_transition_passenger_notified', { tripId, status: tripStatus });
      }
    }
    const queueResult = await dispatchQueuedPassengers();
    logWebhook('trip_transition_trip_scan_done', { tripId, confirmed: claimed?.length ? 1 : 0 });
    return { confirmed: claimed?.length ? 1 : 0, reassigned: 0, queued: queueResult.dispatched };
  }

  // Reasignar si el chofer canceló
  if (tripStatus === 'cancelled' && !trip.wa_notified_at) {
    const { data: claimed } = await getSupabase()
      .from('trips')
      .update({ wa_notified_at: new Date().toISOString() })
      .eq('id', trip.id)
      .is('wa_notified_at', null)
      .select('id');

    if (!claimed?.length) {
      logWebhook('trip_transition_trip_scan_done', { tripId, claimed: false });
      return { confirmed: 0, reassigned: 0, queued: 0 };
    }

    if (!shouldReassignCancelledTrip(trip)) {
      logWebhook('trip_transition_trip_scan_done', { tripId, reason: 'no_reassign' });
      const queueResult = await dispatchQueuedPassengers();
      return { confirmed: 0, reassigned: 0, queued: queueResult.dispatched };
    }

    const existingTrip = await getLatestOpenTripByPhone(trip.passenger_phone);
    if (existingTrip) {
      logWebhook('trip_transition_skip_has_open', { tripId, existingTripId: existingTrip.id });
      const queueResult = await dispatchQueuedPassengers();
      return { confirmed: 0, reassigned: 0, queued: queueResult.dispatched };
    }

    const pickup = getTripPickupPoint(trip);
    const reassignmentContext = await getPassengerReassignmentContext(trip.passenger_phone);
    const tripCreatedAtMs = new Date(trip.created_at || 0).getTime();
    const tripElapsedMs = Number.isFinite(tripCreatedAtMs) && tripCreatedAtMs > 0
      ? Math.max(0, Date.now() - tripCreatedAtMs)
      : 0;
    const searchElapsedMs = Math.max(tripElapsedMs, reassignmentContext.timeoutElapsedMs || 0);

    const systemFailure = isSystemFailureCancellation(trip);
    const excludedDriverIdSet = new Set(systemFailure ? [] : [trip.driver_id].filter(Boolean));
    if (!systemFailure) {
      for (const timeoutDriverId of reassignmentContext.timeoutCancelledDriverIds || []) {
        excludedDriverIdSet.add(timeoutDriverId);
      }
    }
    const excludedDriverIds = [...excludedDriverIdSet];
    const driver = Number.isFinite(pickup.lat) && Number.isFinite(pickup.lng)
      ? await chooseDriver(
        { lat: pickup.lat, lng: pickup.lng },
        {
          excludedDriverIds,
          searchElapsedMs,
          allowExclusionRelaxation: false,
          passengerPhone: trip.passenger_phone || null,
        }
      )
      : null;

    if (driver) {
      const driverLat = Number(driver.current_lat);
      const driverLng = Number(driver.current_lng);
      const driverOriginAddress = await reverseGeocodeLatLng(driverLat, driverLng).catch(
        () => `${driverLat.toFixed(5)}, ${driverLng.toFixed(5)}`
      );
      const { data: newTrip, error: insertErr } = await getSupabase()
        .from('trips')
        .insert({
          driver_id: driver.id,
          passenger_name: trip.passenger_name,
          passenger_phone: trip.passenger_phone,
          origin_address: driverOriginAddress,
          origin_lat: driverLat,
          origin_lng: driverLng,
          destination_address: pickup.address,
          destination_lat: pickup.lat,
          destination_lng: pickup.lng,
          status: 'pending',
          assigned_at: new Date().toISOString(),
          notes: trip.notes || '[APPROACH_ONLY] Reasignado automáticamente.',
        })
        .select().single();

      if (!insertErr) {
        const notifyResult = await notifyDriver(driver, {
          title: 'Nuevo viaje asignado',
          body: `${trip.passenger_name} → ${pickup.address}`,
          data: {
            type: 'new_trip',
            tripId: newTrip.id,
            passengerPhone: newTrip?.passenger_phone || trip.passenger_phone,
            trip: newTrip,
          },
        });

        if (!notifyResult?.ok) {
          await requeuePendingTripAfterNotifyFailure(newTrip.id, {
            source: 'transition_trip_reassign_pending',
            driverId: driver.id,
            notifyReason: notifyResult?.reason || 'unknown',
          });
          await sendPassengerLifecycleFollowup({
            phone: trip.passenger_phone,
            text: 'No pudimos contactar al chofer asignado. Seguís en cola y te avisamos apenas se confirme uno.',
            noticeType: 'queued_no_driver',
            relatedTripId: newTrip.id,
          });
          logWebhook('trip_transition_reassign_notify_failed_requeued', {
            cancelledTripId: tripId,
            newTripId: newTrip.id,
            driverId: driver.id,
            notifyReason: notifyResult?.reason || 'unknown',
            channel: notifyResult?.channel || null,
          });
          const queueResult = await dispatchQueuedPassengers();
          return { confirmed: 0, reassigned: 0, queued: queueResult.dispatched };
        }

        schedulePendingTimeoutTimer(newTrip.id, { source: 'transition_trip_reassign_pending' });
        await sendPassengerLifecycleFollowup({
          phone: trip.passenger_phone,
          text: 'El chofer no pudo tomar el viaje. Ya encontré otro y te aviso cuando lo acepte.',
          noticeType: 'reassigned_pending',
          relatedTripId: newTrip.id,
        });
        logWebhook('trip_transition_reassigned', { cancelledTripId: tripId, newTripId: newTrip.id });
        const queueResult = await dispatchQueuedPassengers();
        return { confirmed: 0, reassigned: 1, queued: queueResult.dispatched };
      }
    }

    // Sin chofer → crear viaje en cola
    const { data: queuedTrip } = await getSupabase()
      .from('trips')
      .insert({
        driver_id: null,
        passenger_name: trip.passenger_name,
        passenger_phone: trip.passenger_phone,
        origin_address: null,
        origin_lat: null,
        origin_lng: null,
        destination_address: pickup.address,
        destination_lat: pickup.lat,
        destination_lng: pickup.lng,
        status: 'queued',
        notes: trip.notes || '[APPROACH_ONLY] En cola de espera.',
      })
      .select().single();

    await sendPassengerLifecycleFollowup({
      phone: trip.passenger_phone,
      text: 'Seguimos buscando móvil para tu viaje. Ya quedaste en cola y te avisamos apenas se confirme uno 🕐',
      noticeType: 'queued_no_driver',
      relatedTripId: queuedTrip?.id || trip.id,
    });
    logWebhook('trip_transition_queued', { cancelledTripId: tripId, newTripId: queuedTrip?.id });
    const queueResult = await dispatchQueuedPassengers();
    return { confirmed: 0, reassigned: 0, queued: queueResult.dispatched };
  }

  logWebhook('trip_transition_trip_scan_done', { tripId, status: tripStatus });
  const queueResult = await dispatchQueuedPassengers();
  return { confirmed: 0, reassigned: 0, queued: queueResult.dispatched };
}

async function processClaimedConversation(batch) {
  logWebhook('conversation_process_start', {
    conversationId: batch?.id || null,
    phone: maskPhone(batch?.phone || ''),
    currentStatus: batch?.status || null,
  });

  const pendingMessages = safeJsonParse(batch.pending_messages, []);
  if (!Array.isArray(pendingMessages) || pendingMessages.length === 0) {
    logWebhook('conversation_process_no_pending', { conversationId: batch?.id || null });
    return { handled: false, updates: { processing_started_at: null } };
  }

  logWebhook('conversation_pending_loaded', {
    conversationId: batch?.id || null,
    pendingCount: pendingMessages.length,
  });

  // --- Resolución temprana de selección de dirección por encuesta ---
  // Cuando el pasajero vota en el poll de dirección, lo resolvemos aquí ANTES de
  // cualquier lógica de reset de contexto, porque el pending_poll vive en batch.context
  // y necesitamos preservarlo.
  if (batch.status === 'awaiting_address_selection') {
    // Si el último trip ya se cerró (completed/cancelled), el poll quedó huérfano.
    // Limpiar contexto y procesar como conversación nueva (fall-through al flujo normal).
    const lastTripCheck = await getTripById(batch.last_trip_id);
    const lastTripIsClosed = lastTripCheck && !isOpenTripStatus(lastTripCheck.status);
    if (!lastTripCheck && batch.last_trip_id) {
      // last_trip_id apunta a un trip que no existe — también limpiar
    }
    if (lastTripIsClosed || (!batch.last_trip_id && !lastTripCheck)) {
      // Verificar por teléfono si hay algún trip abierto antes de limpiar
      const openByPhone = await getLatestOpenTripByPhone(batch.phone);
      if (!openByPhone) {
        logWebhook('conversation_poll_cleared_trip_closed', {
          conversationId: batch?.id || null,
          tripId: lastTripCheck?.id || null,
          tripStatus: lastTripCheck?.status || null,
        });
        batch.context = JSON.stringify({});
        batch.status = 'open';
        // fall-through al flujo normal con contexto limpio
      }
    }
  }

  if (batch.status === 'awaiting_address_selection') {
    const savedContext = safeJsonParse(batch.context, {});
    const pendingPoll = savedContext.pending_poll;
    const votedText = pendingMessages.map((m) => m?.contenido).filter(Boolean).join(' ').trim();

    if (pendingPoll?.candidates?.length > 0 && votedText) {
      const normVoted = normalizeForMatch(votedText);
      const match = pendingPoll.candidates.find((c) => {
        const normLabel = normalizeForMatch(c.label || c.formattedAddress || '');
        const normFmt = normalizeForMatch(c.formattedAddress || '');
        if (!normLabel && !normFmt) return false;
        // Coincidencia exacta
        if (normFmt === normVoted || normLabel === normVoted) return true;
        // Coincidencia parcial: el texto votado empieza con los primeros tokens del candidato
        const candidatePrefix = normLabel.split(' ').slice(0, 4).join(' ');
        const votedPrefix = normVoted.split(' ').slice(0, 4).join(' ');
        return candidatePrefix && votedPrefix && (
          normVoted.startsWith(candidatePrefix) || normLabel.startsWith(votedPrefix)
        );
      });

      if (match) {
        // "Ninguna de estas opciones" → pedir GPS o calle y número
        if (normalizeForMatch(match.label || '').startsWith('ninguna')) {
          const ctxNoPoll = { ...savedContext };
          delete ctxNoPoll.pending_poll;
          await sendWhatsAppText(
            batch.phone,
            'Entendido. Compartí tu *ubicación en tiempo real* desde WhatsApp (ícono de ubicación → "Ubicación en tiempo real"), o mandame la *calle y número exacto* y te mando el móvil enseguida.'
          );
          logWebhook('conversation_address_poll_none_selected', { conversationId: batch?.id || null });
          return {
            handled: true,
            updates: {
              status: 'open',
              context: { ...ctxNoPoll, awaiting_gps: true },
              last_trip_id: batch.last_trip_id || null,
              processing_started_at: null,
              last_processed_at: new Date().toISOString(),
            },
          };
        }

        logWebhook('conversation_address_poll_resolved', {
          conversationId: batch?.id || null,
          votedText,
          matchedAddress: match.formattedAddress,
          lat: match.lat,
          lng: match.lng,
        });

        const extractedFromPoll = {
          ...(pendingPoll.extracted || {}),
          pickup_location: match.formattedAddress,
          _preGeocodedPickup: {
            formattedAddress: match.formattedAddress,
            lat: match.lat,
            lng: match.lng,
          },
        };

        const tripResult = await createTripFromConversation({
          conversation: batch,
          extracted: extractedFromPoll,
        });
        await sendWhatsAppText(batch.phone, tripResult.reply);

        logWebhook('conversation_trip_result', {
          conversationId: batch?.id || null,
          ok: Boolean(tripResult?.ok),
          reason: tripResult?.reason || null,
          tripId: tripResult?.trip?.id || null,
          driverId: tripResult?.driver?.id || null,
        });

        return {
          handled: true,
          updates: {
            status: 'open',
            context: tripResult.context || {},
            last_trip_id: tripResult.trip?.id || batch.last_trip_id || null,
            processing_started_at: null,
            last_processed_at: new Date().toISOString(),
          },
        };
      }

      // El texto no coincide con ningún candidato del poll (ej: "hola", sticker, etc.)
      // → ignorar silenciosamente. El poll sigue vigente en whatsapp_conversations.context.
      // El pasajero debe votar en la encuesta o elegir "Ninguna de estas opciones".
      logWebhook('conversation_address_poll_no_match_ignored', {
        conversationId: batch?.id || null,
        votedText,
        candidateCount: pendingPoll.candidates.length,
      });
      return {
        handled: true,
        updates: {
          status: 'awaiting_address_selection', // mantener el poll abierto
          processing_started_at: null,
          last_processed_at: new Date().toISOString(),
        },
      };
    }
  }

  const lastTripById = await getTripById(batch.last_trip_id);

  // If the previous trip is already closed, start the new request with a clean context/history.
  let shouldResetConversationState = Boolean(lastTripById && !isOpenTripStatus(lastTripById.status));
  if (shouldResetConversationState) {
    logWebhook('conversation_reset_closed_trip_context', {
      conversationId: batch?.id || null,
      tripId: lastTripById.id,
      tripStatus: lastTripById.status,
      completedAt: lastTripById.completed_at || null,
    });
  }

  // Si last_trip_id es null (fue limpiado al completar un viaje previo), verificar si el
  // último viaje del pasajero ya está cerrado para resetear el historial y evitar
  // que GPT use contexto contaminado de sesiones anteriores.
  if (!shouldResetConversationState && !batch.last_trip_id) {
    const { data: latestTripByPhone } = await getSupabase()
      .from('trips')
      .select('id, status, completed_at')
      .eq('passenger_phone', normalizePhone(batch.phone))
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestTripByPhone && !isOpenTripStatus(latestTripByPhone.status)) {
      // No resetear si ya hay datos parciales acumulados en la conversación actual
      // (el pasajero está en medio de dar los datos de un nuevo viaje).
      const existingCtx = safeJsonParse(batch.context, {});
      // passenger_name NO cuenta como contexto de viaje en curso —
      // es dato de identidad que persiste entre sesiones.
      // Solo destination o pickup_location indican que el pasajero está
      // en medio de un nuevo pedido y no se debe resetear el historial.
      const hasMeaningfulContext = Boolean(
        existingCtx.destination || existingCtx.pickup_location
      );
      if (!hasMeaningfulContext) {
        shouldResetConversationState = true;
        logWebhook('conversation_reset_last_trip_closed_by_phone', {
          conversationId: batch?.id || null,
          tripId: latestTripByPhone.id,
          tripStatus: latestTripByPhone.status,
          completedAt: latestTripByPhone.completed_at || null,
        });
      }
    }
  }

  // Idempotency guard: if the passenger already has an open trip, do not create another one.
  const openTripByLastId = lastTripById && isOpenTripStatus(lastTripById.status) ? lastTripById : null;
  const openTripByPhone = openTripByLastId || await getLatestOpenTripByPhone(batch.phone);

  // ── Fast path: viaje activo/en cola/pendiente sin GPS/poll pendiente ──────────
  // Si el pasajero ya tiene un viaje abierto y bloqueante, skip full AI classification.
  // Solo se omite si el trip tiene wa_context (GPS o poll pendiente), en cuyo caso
  // el flujo normal maneja la respuesta de texto del pasajero.
  if (openTripByPhone && shouldBlockForOpenTrip(openTripByPhone) && !openTripByPhone.wa_context) {
    const fastText = pendingMessages.map((m) => m?.contenido).filter(Boolean).join('\n');
    const savedFastCtx = safeJsonParse(batch.context, {});

    // ─ Confirmación de cancelación pendiente ─────────────────────────────────
    if (savedFastCtx.pending_cancel_confirm) {
      const confirmsCancel = /\b(s[ií]|si+|cancel[aá]|confirm[ao]|dale|ok)\b/i.test(fastText);
      const deniesCancel = /\b(no|mantené?|conserv[aá]|dejá? (como está|así)|olvid[aá])\b/i.test(fastText);

      if (confirmsCancel) {
        const fullTripFast = await getConversationFlowTripById(openTripByPhone.id);
        await getSupabase()
          .from('trips')
          .update({ status: 'cancelled', cancel_reason: 'Pasajero canceló por WhatsApp' })
          .eq('id', openTripByPhone.id);
        if (fullTripFast?.driver_id) {
          const dFast = await getDriverById(fullTripFast.driver_id);
          if (dFast) {
            await notifyDriver(dFast, {
              title: 'Viaje cancelado',
              body: 'El pasajero canceló el viaje por WhatsApp.',
              data: { type: 'trip_cancelled', tripId: openTripByPhone.id },
            });
          }
        }
        await sendWhatsAppText(batch.phone, 'Listo, cancelé el pedido. Avisame cuando necesites otro móvil.');
        logWebhook('conversation_fast_path_cancel_confirmed', { conversationId: batch?.id || null, tripId: openTripByPhone.id });
        return {
          handled: true,
          updates: { status: 'open', context: {}, last_trip_id: null, processing_started_at: null, last_processed_at: new Date().toISOString() },
        };
      }

      if (deniesCancel) {
        await sendWhatsAppText(batch.phone, 'Bueno, tu viaje sigue activo. Avisame si necesitás algo más.');
        logWebhook('conversation_fast_path_cancel_denied', { conversationId: batch?.id || null, tripId: openTripByPhone.id });
        return {
          handled: true,
          updates: { status: 'open', context: { ...savedFastCtx, pending_cancel_confirm: false }, last_trip_id: openTripByPhone.id, processing_started_at: null, last_processed_at: new Date().toISOString() },
        };
      }

      // Respuesta ambigua → volver a pedir confirmación
      await sendWhatsAppText(batch.phone, 'Respondé *sí* para confirmar la cancelación o *no* para mantener el viaje.');
      logWebhook('conversation_fast_path_cancel_unclear', { conversationId: batch?.id || null, tripId: openTripByPhone.id });
      return {
        handled: true,
        updates: { status: 'open', context: savedFastCtx, last_trip_id: openTripByPhone.id, processing_started_at: null, last_processed_at: new Date().toISOString() },
      };
    }

    // ─ Detección liviana de intent de cancelación ─────────────────────────────
    const wantsCancelFast = /\b(cancel[aá][r]?|ya no (quiero|lo necesito)|no (lo )?mandes|olvid[aáo](lo)?|me surg[ióo]|para el remis|no necesito (el |)remis|no quiero (el |más |)remis)\b/i.test(fastText);

    if (wantsCancelFast) {
      await sendWhatsAppText(batch.phone, '¿Confirmás que querés cancelar el viaje? Respondé *sí* para cancelar o *no* para mantener.');
      logWebhook('conversation_fast_path_cancel_requested', { conversationId: batch?.id || null, tripId: openTripByPhone.id });
      return {
        handled: true,
        updates: { status: 'open', context: { ...savedFastCtx, pending_cancel_confirm: true }, last_trip_id: openTripByPhone.id, processing_started_at: null, last_processed_at: new Date().toISOString() },
      };
    }

    // ─ Responder con estado actual del viaje ─────────────────────────────────
    const fastStatus = String(openTripByPhone.status || '').toLowerCase();
    const fastStatusMsg =
      fastStatus === 'queued'
        ? 'Ya estás en la cola de espera. Te avisamos en cuanto haya un chofer disponible 🕐'
        : fastStatus === 'pending'
          ? `Tu pedido ya está tomado, esperando confirmación del chofer.${openTripByPhone.destination_address ? `\nRetiro: *${openTripByPhone.destination_address}*` : ''}`
          : `Ya tenés un móvil asignado. Tu viaje sigue en curso.${openTripByPhone.destination_address ? `\nRetiro: *${openTripByPhone.destination_address}*` : ''}`;
    await sendWhatsAppText(batch.phone, fastStatusMsg);
    logWebhook('conversation_fast_path_status_sent', { conversationId: batch?.id || null, tripId: openTripByPhone.id, tripStatus: openTripByPhone.status });
    return {
      handled: true,
      updates: { status: 'open', context: safeJsonParse(batch.context, {}), last_trip_id: openTripByPhone.id, processing_started_at: null, last_processed_at: new Date().toISOString() },
    };
  }
  // ── Fin fast path ─────────────────────────────────────────────────────────────

  // Clasificación AI: solo llega aquí si NO hay viaje activo/bloqueante (o si tiene
  // wa_context pendiente que requiere el flujo completo para resolver GPS o poll).
  const combinedText = pendingMessages
    .map((item) => item?.contenido)
    .filter(Boolean)
    .join('\n');

  const persistedContext = safeJsonParse(batch.context, {});

  // El historial de mensajes NO se usa para clasificar intención.
  // La fuente de verdad es el estado del último trip del pasajero.
  // Si el último trip está cerrado (completed/cancelled) → contexto limpio.
  // Si está abierto → el fast path ya lo maneja antes de llegar aquí.
  const context = shouldResetConversationState ? {} : persistedContext;
  const history = []; // siempre vacío — evita que mensajes previos contaminen la clasificación

  const lastBotReply = null; // sin historial, no hay último reply del bot

  const extracted = await extractTripIntent({
    combinedText,
    context,
    pushName: batch.push_name,
    phone: batch.phone,
    history,
    conversationStatus: batch.status || 'open',
    lastBotReply,
  });

  const heuristics = inferTripHeuristics(combinedText);
  if (extracted.intent === 'other' && heuristics.looksLikeTripRequest) {
    logWebhook('conversation_override_other_to_trip_request', {
      conversationId: batch?.id || null,
      reason: 'heuristics_detected_trip_request',
    });
    extracted.intent = 'trip_request';
    // Cuando GPT clasificó como "other", pudo haber re-usado la dirección del contexto
    // en lugar de extraer la nueva del mensaje actual. Si las heurísticas encontraron
    // un pickup en el texto del mensaje, descartamos el pickup de GPT (contaminado por contexto)
    // y dejamos que el pickup de heurísticas tome prioridad.
    if (heuristics.pickup) {
      extracted.pickup_location = null;
      extracted.origin = null;
    }
  }

  const extractedPickupRaw = sanitizeAddressInput(extracted.pickup_location || extracted.origin || '');
  const heuristicPickupRaw = sanitizeAddressInput(heuristics.pickup || '');
  const directPickupRaw = sanitizeAddressInput(extractDirectAddressCandidate(combinedText) || '');

  let pickupLocation =
    extractedPickupRaw ||
    heuristicPickupRaw ||
    directPickupRaw ||
    null;

  const extractedIsLessSpecific =
    extractedPickupRaw &&
    !isSpecificStreetAddress(extractedPickupRaw) &&
    isSpecificStreetAddress(heuristicPickupRaw);

  if (
    extractedPickupRaw &&
    heuristicPickupRaw &&
    (isGenericStreetWithoutName(extractedPickupRaw) || extractedIsLessSpecific)
  ) {
    pickupLocation = heuristicPickupRaw;
    logWebhook('pickup_override_heuristics', {
      conversationId: batch?.id || null,
      extractedPickup: extractedPickupRaw,
      heuristicPickup: heuristicPickupRaw,
      reason: extractedIsLessSpecific ? 'extracted_less_specific_than_heuristic' : 'generic_extracted_pickup',
    });
  }

  const destinationHint =
    extracted.destination ||
    heuristics.destination ||
    context.destination ||
    null;

  const nextContext = {
    passenger_name: extracted.passenger_name || context.passenger_name || batch.push_name || null,
    // Pickup should map to passenger origin. Destination remains only as final-destination hint.
    pickup_location: sanitizeAddressInput(pickupLocation),
    origin: sanitizeAddressInput(extracted.origin || heuristics.pickup || ''),
    destination: sanitizeAddressInput(destinationHint),
    notes: extracted.notes || context.notes || null,
    awaiting_destination_gps: Boolean(context.awaiting_destination_gps) && !sanitizeAddressInput(destinationHint),
  };

  const tripExtracted = {
    ...nextContext,
    // Últimos mensajes del pasajero (hasta 500 caracteres) para incluirlos como
    // indicaciones del viaje visibles para el chofer.
    _conversationText: combinedText ? combinedText.slice(0, 500) : null,
  };

  // AI-detected intent drives the guard bypass — no fragile regex needed.
  const passengerWantsToCancel = extracted.intent === 'cancel_trip';

  // --- Reasignación de dirección de retiro cuando el viaje está 'pending' (Caso 18) ---
  // Si el pasajero corrige la dirección antes de que el chofer acepte el viaje,
  // actualizamos las coordenadas y notificamos al chofer del cambio.
  if (
    openTripByPhone &&
    String(openTripByPhone.status || '').toLowerCase() === 'pending' &&
    extracted.intent === 'trip_request' &&
    !passengerWantsToCancel &&
    nextContext.pickup_location
  ) {
    const fullPendingTrip = await getConversationFlowTripById(openTripByPhone.id);
    const currentPickup = fullPendingTrip?.destination_address || '';
    const newPickup = sanitizeAddressInput(nextContext.pickup_location || '');

    // Verificar si la nueva dirección difiere significativamente de la actual
    const currentTokens = new Set(tokenizeAddress(currentPickup));
    const newTokens = new Set(tokenizeAddress(newPickup));
    const overlapCount = [...newTokens].filter((t) => currentTokens.has(t)).length;
    const minSize = Math.min(currentTokens.size, newTokens.size);
    const isSameAddress = minSize > 0 && overlapCount / minSize >= 0.75;

    if (!isSameAddress && newPickup) {
      try {
        const newGeo = await geocodeAddress(normalizeAddressPhrase(newPickup));

        const { error: updateErr } = await getSupabase()
          .from('trips')
          .update({
            destination_address: newGeo.formattedAddress,
            destination_lat: newGeo.lat,
            destination_lng: newGeo.lng,
          })
          .eq('id', openTripByPhone.id)
          .eq('status', 'pending'); // Solo actualizar si aún está pendiente

        if (!updateErr) {
          // Notificar al chofer del cambio de dirección
          if (fullPendingTrip?.driver_id) {
            const updatedDriver = await getDriverById(fullPendingTrip.driver_id);
            if (updatedDriver) {
              await notifyDriver(updatedDriver, {
                title: 'Dirección de retiro actualizada',
                body: `Nuevo retiro: ${newGeo.formattedAddress}`,
                data: { type: 'pickup_updated', tripId: openTripByPhone.id, newPickup: newGeo.formattedAddress },
              });
            }
          }

          await sendWhatsAppText(
            batch.phone,
            `Actualicé el punto de retiro:\n\n*${newGeo.formattedAddress}*\n\nEl chofer ya fue notificado del cambio.`
          );

          logWebhook('pickup_reassigned', {
            conversationId: batch?.id || null,
            tripId: openTripByPhone.id,
            oldPickup: currentPickup,
            newPickup: newGeo.formattedAddress,
          });

          return {
            handled: true,
            updates: {
              status: 'open',
              context: {
                ...nextContext,
                pickup_formatted_address: newGeo.formattedAddress,
                pickup_lat: newGeo.lat,
                pickup_lng: newGeo.lng,
              },
              last_trip_id: openTripByPhone.id,
              processing_started_at: null,
              last_processed_at: new Date().toISOString(),
            },
          };
        }
      } catch (geoErr) {
        logWebhook('pickup_reassign_geocode_fail', {
          conversationId: batch?.id || null,
          newPickup,
          error: geoErr?.message || 'geocode_error',
        });
        // Si la geocodificación falla, caemos al flujo normal
      }
    }
  }

  // Trips en pending estancado (stale) que no bloquean: logear para debug y caer al flujo normal.
  if (openTripByPhone && !shouldBlockForOpenTrip(openTripByPhone)) {
    logWebhook('conversation_open_trip_guard_ignored_stale_pending', {
      conversationId: batch?.id || null,
      tripId: openTripByPhone.id,
      tripStatus: openTripByPhone.status,
      ageMinutes: getTripAgeMinutes(openTripByPhone),
      maxAgeMinutes: PENDING_GUARD_MAX_AGE_MINUTES,
      matchedBy: openTripByLastId ? 'last_trip_id' : 'phone',
    });
  }

  // --- Cancelación solicitada por el pasajero ---
  if (extracted.intent === 'cancel_trip') {
    if (!extracted.cancel_confirmed) {
      // Enviar encuesta nativa de WhatsApp para confirmar la cancelación
      await sendWhatsAppPoll(
        batch.phone,
        '¿Confirmás la cancelación de tu viaje?',
        ['Sí, cancelar', 'No, mantener el viaje']
      );
      logWebhook('conversation_cancel_pending_confirm', { conversationId: batch?.id || null });
      return {
        handled: true,
        updates: {
          status: batch.status || 'open',
          context: { ...nextContext, pending_cancel_confirm: true },
          last_trip_id: batch.last_trip_id || null,
          processing_started_at: null,
          last_processed_at: new Date().toISOString(),
        },
      };
    }

    // cancel_confirmed = true: cancelar el viaje abierto si existe
    const tripToCancel =
      openTripByPhone && isOpenTripStatus(openTripByPhone.status) ? openTripByPhone : null;
    if (tripToCancel) {
      // Obtener datos completos del viaje (incluye driver_id) para notificar al chofer
      const fullTripToCancel = await getConversationFlowTripById(tripToCancel.id);
      const { error: cancelErr } = await getSupabase()
        .from('trips')
        .update({ status: 'cancelled', cancel_reason: 'Pasajero canceló por WhatsApp' })
        .eq('id', tripToCancel.id);
      if (cancelErr) {
        logWebhook('conversation_cancel_trip_error', {
          conversationId: batch?.id || null,
          tripId: tripToCancel.id,
          error: summarizeDbError(cancelErr),
        });
      } else {
        logWebhook('conversation_passenger_cancelled_trip', {
          conversationId: batch?.id || null,
          tripId: tripToCancel.id,
          driverId: fullTripToCancel?.driver_id || null,
        });
        // Notificar al chofer que el pasajero canceló
        if (fullTripToCancel?.driver_id) {
          const cancelledDriver = await getDriverById(fullTripToCancel.driver_id);
          if (cancelledDriver) {
            await notifyDriver(cancelledDriver, {
              title: 'Viaje cancelado',
              body: 'El pasajero canceló el viaje por WhatsApp.',
              data: { type: 'trip_cancelled', tripId: tripToCancel.id },
            });
          }
        }
      }
    }
    const cancelReply =
      extracted.reply ||
      (tripToCancel
        ? 'Listo, cancelé el pedido. Avisame cuando necesites otro móvil.'
        : 'No encontré ningún viaje activo para cancelar. ¿Necesitás un móvil?');
    await sendWhatsAppText(batch.phone, cancelReply);
    return {
      handled: true,
      updates: {
        status: 'open',
        context: {},
        last_trip_id: null,
        processing_started_at: null,
        last_processed_at: new Date().toISOString(),
      },
    };
  }

  // --- Consulta de estado del viaje ---
  if (extracted.intent === 'status_query') {
    const tripForStatus =
      openTripByPhone && isOpenTripStatus(openTripByPhone.status) ? openTripByPhone : null;
    let statusReply;
    if (!tripForStatus) {
      statusReply = extracted.reply || '¿Necesitás un móvil? Mandame desde dónde te busco.';
    } else {
      const ts = String(tripForStatus.status || '').toLowerCase();
      if (ts === 'pending') {
        statusReply =
          extracted.reply ||
          'Tu pedido está tomado, esperando que el chofer lo confirme. Te aviso apenas quede asignado.';
      } else if (ts === 'accepted' || ts === 'going_to_pickup') {
        statusReply = extracted.reply || 'El chofer ya aceptó y está yendo a buscarte.';
      } else if (ts === 'in_progress') {
        statusReply = extracted.reply || 'Tu viaje está en curso.';
      } else {
        statusReply = extracted.reply || 'Tu viaje está activo.';
      }
    }
    await sendWhatsAppText(batch.phone, statusReply);
    logWebhook('conversation_status_query', {
      conversationId: batch?.id || null,
      tripStatus: tripForStatus?.status || null,
    });
    return {
      handled: true,
      updates: {
        status: batch.status || 'open',
        context: nextContext,
        last_trip_id: batch.last_trip_id || null,
        processing_started_at: null,
        last_processed_at: new Date().toISOString(),
      },
    };
  }

  // --- Solicitud programada (no soportada automáticamente) ---
  if (extracted.intent === 'schedule_trip') {
    const scheduleReply =
      extracted.reply ||
      'Por ahora solo tomamos pedidos inmediatos. Cuando estés listo para salir, mandame un mensaje y te mando el móvil enseguida.';
    await sendWhatsAppText(batch.phone, scheduleReply);
    logWebhook('conversation_schedule_trip', {
      conversationId: batch?.id || null,
      scheduleTime: extracted.schedule_time || null,
    });
    return {
      handled: true,
      updates: {
        status: 'open',
        context: { ...nextContext, schedule_time: extracted.schedule_time || null },
        last_trip_id: shouldResetConversationState ? null : batch.last_trip_id || null,
        processing_started_at: null,
        last_processed_at: new Date().toISOString(),
      },
    };
  }

  if (extracted.intent === 'other') {
    // Sin interés en viajar y sin viaje activo → ignorar silenciosamente.
    // No responder evita que el agente conteste mensajes de chat genéricos
    // ("hola", "gracias", stickers, etc.) que no son pedidos de viaje.
    logWebhook('conversation_intent_other_ignored', { conversationId: batch?.id || null });
    return {
      handled: true,
      updates: {
        status: 'open',
        context: nextContext,
        last_trip_id: shouldResetConversationState ? null : batch.last_trip_id || null,
        processing_started_at: null,
        last_processed_at: new Date().toISOString(),
      },
    };
  }

  if (extracted.intent === 'ask_human') {
    // If there's a partial trip address, the AI misclassified — treat as trip_request with missing info
    const hasPartialTripData = extracted.destination || extracted.origin || nextContext.pickup_location;
    if (hasPartialTripData) {
      logWebhook('conversation_ask_human_overridden_to_trip', {
        conversationId: batch?.id || null,
        hasDestination: Boolean(extracted.destination),
        hasOrigin: Boolean(extracted.origin),
      });
      extracted.intent = 'trip_request';
      // Fall through to trip_request handling below
    } else {
      const reply = extracted.reply || 'Te paso con un operador para revisar bien el pedido.';
      await sendWhatsAppText(batch.phone, reply);
      logWebhook('conversation_intent_ask_human', { conversationId: batch?.id || null });
      return {
        handled: true,
        updates: {
          status: 'paused',
          context: nextContext,
          last_trip_id: shouldResetConversationState ? null : batch.last_trip_id || null,
          processing_started_at: null,
          last_processed_at: new Date().toISOString(),
        },
      };
    }
  }

  if (!nextContext.pickup_location) {
    // Si ya estamos esperando el GPS, no volver a pedir
    const alreadyAwaitingGps = safeJsonParse(batch.context, {})?.awaiting_gps === true;
    const reply = alreadyAwaitingGps
      ? null
      : extracted.reply ||
        'Para derivarte un móvil necesito tu ubicación de retiro. Podés mandarme la dirección (calle y número) o compartir tu *ubicación en tiempo real* tocando el ícono de ubicación en WhatsApp.';
    if (reply) await sendWhatsAppText(batch.phone, reply);
    logWebhook('conversation_missing_fields', {
      conversationId: batch?.id || null,
      missingPickupLocation: true,
      alreadyAwaitingGps,
    });

    // Crear/actualizar viaje placeholder en trips.wa_context para que el GPS handler lo encuentre.
    // Solo si no hay ya uno activo para este pasajero.
    if (!alreadyAwaitingGps) {
      const { data: existingGpsTrip } = await getSupabase()
        .from('trips')
        .select('id')
        .eq('passenger_phone', normalizePhone(batch.phone))
        .eq('status', 'queued')
        .not('wa_context', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existingGpsTrip) {
        try {
          await getSupabase()
            .from('trips')
            .update({ wa_context: { awaiting_gps: true, extracted: nextContext } })
            .eq('id', existingGpsTrip.id);
        } catch {}
      } else {
        try {
          await getSupabase()
            .from('trips')
            .insert({
              passenger_name: nextContext.passenger_name || batch.push_name || 'Pasajero WhatsApp',
              passenger_phone: normalizePhone(batch.phone),
              status: 'queued',
              notes: '[APPROACH_ONLY] Esperando GPS del pasajero. Destino final: se define al subir el pasajero.',
              wa_context: { awaiting_gps: true, extracted: nextContext },
            });
        } catch {}
      }
    }

    return {
      handled: true,
      updates: {
        status: 'open',
        context: { ...nextContext, awaiting_gps: true },
        last_trip_id: shouldResetConversationState ? null : batch.last_trip_id || null,
        processing_started_at: null,
        last_processed_at: new Date().toISOString(),
      },
    };
  }

  // --- Caso 1: solo número o "calle 200" sin nombre real de calle ---
  // normalizeAddressPhrase convierte "altura 500" → "500". Si el resultado es solo
  // dígitos (sin nombre de calle), no tiene sentido geocodificar ni mandar poll;
  // hay que pedir la calle al pasajero.
  const pickupForValidation = (nextContext.pickup_location || '').trim();
  const isBareNumberOnly = /^\d{1,5}$/.test(pickupForValidation);
  const isGenericStreetOnly = isGenericStreetWithoutName(pickupForValidation);
  if (isBareNumberOnly || isGenericStreetOnly) {
    const detectedNumber = (pickupForValidation.match(/\b\d{1,5}\b/) || [null])[0];
    const askNumber = detectedNumber || 'ese número';
    const bareNumberReply = `¿En qué calle es el número *${askNumber}*? Mandame calle y número (por ejemplo "Mitre ${askNumber}") o compartí tu *ubicación en tiempo real* desde WhatsApp.`;
    await sendWhatsAppText(batch.phone, bareNumberReply);
    logWebhook('conversation_missing_fields', {
      conversationId: batch?.id || null,
      missingPickupLocation: true,
      reason: isBareNumberOnly ? 'bare_number_without_street' : 'generic_street_without_name',
      bareNumber: detectedNumber,
      rawPickup: nextContext.pickup_location,
    });
    return {
      handled: true,
      updates: {
        status: 'open',
        context: { ...nextContext, pickup_location: null, awaiting_gps: true },
        last_trip_id: shouldResetConversationState ? null : batch.last_trip_id || null,
        processing_started_at: null,
        last_processed_at: new Date().toISOString(),
      },
    };
  }

  // --- Caso 25/26/27: Pasaje, Manzana/Lote, Km de ruta → GPS obligatorio ---
  // Google Maps no indexa pasajes angostos, el sistema catastral manzana/lote,
  // ni tiene precisión de punto de retiro para kilómetros de ruta.
  const gpsCheck = requiresGpsForAddress(nextContext.pickup_location);
  if (gpsCheck.required) {
    const alreadyAwaitingGps = safeJsonParse(batch.context, {})?.awaiting_gps === true;
    if (!alreadyAwaitingGps) {
      const gpsReply =
        gpsCheck.reason === 'pasaje'
          ? `Los pasajes y callejones no aparecen en el GPS. Compartí tu *ubicación en tiempo real* desde WhatsApp (tocá el ícono de ubicación → "Ubicación en tiempo real") para que el chofer te encuentre exactamente.`
          : gpsCheck.reason === 'km_ruta'
            ? `Las referencias por kilómetro de ruta no tienen punto de retiro preciso. Para que el chofer llegue exactamente donde estás, compartí tu *ubicación en tiempo real* desde WhatsApp (tocá el ícono de ubicación → "Ubicación en tiempo real").`
            : `Las direcciones por manzana y lote no figuran en el GPS. Compartí tu *ubicación en tiempo real* desde WhatsApp (tocá el ícono de ubicación → "Ubicación en tiempo real") para que el chofer llegue con precisión.`;
      await sendWhatsAppText(batch.phone, gpsReply);
      logWebhook('conversation_gps_required_for_address', {
        conversationId: batch?.id || null,
        reason: gpsCheck.reason,
        pickup: nextContext.pickup_location,
      });
    }
    return {
      handled: true,
      updates: {
        status: 'open',
        context: {
          ...nextContext,
          awaiting_gps: true,
          // Preservar la nomenclatura catastral original para incluirla como
          // indicación al chofer una vez que llegue el GPS del pasajero.
          ...(gpsCheck.reason === 'manzana_lote' && nextContext.pickup_location
            ? { catastral_nomenclature: nextContext.pickup_location }
            : {}),
        },
        last_trip_id: shouldResetConversationState ? null : batch.last_trip_id || null,
        processing_started_at: null,
        last_processed_at: new Date().toISOString(),
      },
    };
  }

  // --- Desambiguación de dirección: obtener candidatos de geocodificación ---
  // Usamos autocomplete + geocoding por variantes para capturar calles ambiguas
  // (ej: "Güemes 200" → Luis Güemes 200 Y General Güemes 200)
  // El poll solo se envía cuando hay una dirección real (calle + número, intersección o POI).
  // Un pickup sin nombre de calle fue capturado arriba.
  const addressCandidates = await getAddressCandidates(nextContext.pickup_location, 5).catch(() => []);
  const distinctCandidates = addressCandidates.filter(
    (c, i, arr) =>
      i === 0 ||
      arr.slice(0, i).every(
        (prev) =>
          Math.abs(prev.lat - c.lat) > 0.001 ||
          Math.abs(prev.lng - c.lng) > 0.001
      )
  );

  if (
    distinctCandidates.length >= 2 &&
    distinctCandidates[0].score - (distinctCandidates[1]?.score ?? 0) < 0.40
  ) {
    const orderedPollCandidates = [...distinctCandidates].sort((a, b) => {
      const aIsSaltaCapital = isSaltaCapitalCandidate(a);
      const bIsSaltaCapital = isSaltaCapitalCandidate(b);

      if (aIsSaltaCapital !== bIsSaltaCapital) return aIsSaltaCapital ? -1 : 1;

      const scoreDiff = Number(b?.score || 0) - Number(a?.score || 0);
      if (scoreDiff !== 0) return scoreDiff;

      return String(a?.formattedAddress || '').localeCompare(String(b?.formattedAddress || ''));
    });

    const pollTopCandidates = orderedPollCandidates.slice(0, 4);
    const saltaCapitalOptionsCount = pollTopCandidates.filter((candidate) =>
      isSaltaCapitalCandidate(candidate)
    ).length;

    // Limitar a 4 opciones reales + "Ninguna de estas opciones" siempre al final
    const pollOptions = [
      ...pollTopCandidates.map((c) => c.formattedAddress),
      'Ninguna de estas opciones',
    ];
    let pollMsgId = null;
    try {
      const pollResult = await sendWhatsAppPoll(
        batch.phone,
        '¿Cuál es tu dirección de retiro?',
        pollOptions
      );
      pollMsgId = pollResult.msgId;
    } catch (err) {
      logWebhook('poll_send_error', { conversationId: batch?.id || null, error: err?.message });
    }

    if (pollMsgId) {
      logWebhook('conversation_address_poll_sent', {
        conversationId: batch?.id || null,
        pollMsgId,
        optionCount: pollOptions.length,
        saltaCapitalOptionsCount,
      });

      const pollCandidatesForTrip = [
        ...pollTopCandidates.map((c) => ({
          label: c.formattedAddress,
          formattedAddress: c.formattedAddress,
          lat: c.lat,
          lng: c.lng,
        })),
        { label: 'Ninguna de estas opciones', formattedAddress: 'Ninguna de estas opciones', lat: null, lng: null },
      ];

      // Los candidatos del poll se guardan SOLO en whatsapp_conversations.context
      // (vía finalizeConversation al retornar). NO se crea ningún trip placeholder
      // aquí porque no tenemos dirección confirmada todavía.
      // El trip se crea en el handler de poll.results con la dirección ya elegida.
      return {
        handled: true,
        updates: {
          status: 'awaiting_address_selection',
          context: {
            ...nextContext,
            pending_poll: {
              msg_id: pollMsgId,
              phone: batch.phone,
              candidates: pollCandidatesForTrip,
              extracted: nextContext,
            },
          },
          last_trip_id: shouldResetConversationState ? null : batch.last_trip_id || null,
          processing_started_at: null,
          last_processed_at: new Date().toISOString(),
        },
      };
    }
  }

  const tripResult = await createTripFromConversation({ conversation: batch, extracted: tripExtracted });
  await sendWhatsAppText(batch.phone, tripResult.reply);

  logWebhook('conversation_trip_result', {
    conversationId: batch?.id || null,
    ok: Boolean(tripResult?.ok),
    reason: tripResult?.reason || null,
    tripId: tripResult?.trip?.id || null,
    driverId: tripResult?.driver?.id || null,
  });

  return {
    handled: true,
    updates: {
      status: 'open',
      context: tripResult.context,
      last_trip_id: tripResult.trip?.id || (shouldResetConversationState ? null : batch.last_trip_id || null),
      processing_started_at: null,
      last_processed_at: new Date().toISOString(),
    },
  };
}

async function processConversationById(conversationId) {
  logWebhook('conversation_process_by_id_start', { conversationId });
  const batch = await claimConversationBatch(conversationId);
  if (!batch?.id) {
    logWebhook('conversation_process_by_id_skipped', { conversationId, reason: 'not_claimed' });
    return { ok: true, skipped: true };
  }

  // Declarar fuera del try para poder acceder al contexto nuevo en el catch
  let claimedResult = null;
  try {
    claimedResult = await processClaimedConversation(batch);
    await finalizeConversation(conversationId, claimedResult.updates);
    logWebhook('conversation_process_by_id_ok', {
      conversationId,
      skipped: false,
      nextStatus: claimedResult?.updates?.status || null,
    });
    return { ok: true, skipped: false };
  } catch (error) {
    // Preservar el contexto nuevo (ej: pending_poll con candidatos de dirección)
    // para que el handler de poll.results pueda encontrarlo aunque el status falle.
    const fallbackContext = claimedResult?.updates?.context || safeJsonParse(batch.context, {});
    await finalizeConversation(conversationId, {
      status: 'open',
      processing_started_at: null,
      context: fallbackContext,
      last_processed_at: new Date().toISOString(),
    }).catch(() => {});
    logWebhook('conversation_process_by_id_error', {
      conversationId,
      error: error?.message || 'unknown_error',
    });
    throw error;
  }
}

function scheduleConversationProcessing(conversationId, delayMs = ACCUMULATION_MS) {
  if (IS_SERVERLESS) {
    logWebhook('timer_skipped', {
      reason: 'serverless_runtime',
      conversationId,
      delayMs,
    });
    return;
  }

  if (processingTimers.has(conversationId)) {
    clearTimeout(processingTimers.get(conversationId));
  }

  const timer = setTimeout(async () => {
    processingTimers.delete(conversationId);
    try {
      await processConversationById(conversationId);
    } catch (error) {
      console.error('Error procesando conversación programada:', error);
    }
  }, delayMs);

  processingTimers.set(conversationId, timer);
}

async function processPendingConversations() {
  logWebhook('pending_scan_start', { accumulationMs: ACCUMULATION_MS });
  const threshold = new Date(Date.now() - ACCUMULATION_MS).toISOString();
  const { data, error } = await getSupabase()
    .from('whatsapp_conversations')
    .select('id')
    .eq('is_collecting', true)
    .lt('accumulation_started_at', threshold);
  if (error) throw error;

  logWebhook('pending_scan_found', { total: (data || []).length, threshold });

  let processed = 0;
  let skipped = 0;
  // Procesamiento en paralelo: cada número de teléfono es independiente,
  // permitiendo manejar múltiples pedidos simultáneos sin bloqueos.
  const parallelResults = await Promise.allSettled(
    (data || []).map((item) => processConversationById(item.id))
  );
  for (const r of parallelResults) {
    if (r.status === 'rejected') {
      console.error('Error procesando conversación:', r.reason?.message || r.reason);
    } else if (r.value?.skipped) {
      skipped += 1;
    } else {
      processed += 1;
    }
  }

  logWebhook('pending_scan_done', { processed, skipped, total: (data || []).length });

  // Intentar despachar pasajeros en cola después de procesar todos los mensajes pendientes.
  // Esto cubre el caso donde en el mismo ciclo de cron hay nuevos pasajeros en cola Y
  // choferes que terminaron viajes (y por ende ya no están en DRIVER_BUSY_TRIP_STATUSES).
  const queueResult = await dispatchQueuedPassengers();

  return { processed, skipped, total: (data || []).length, queueDispatched: queueResult.dispatched };
}

async function processWebhookBody(body, requestMeta = {}) {
  try {
    const payloadBody = body || {};
    const event = payloadBody.event;
    logWebhook('received', { event: event || 'unknown' });

    if (event === 'trip.transition') {
      const authHeader = requestMeta.authHeader || '';
      const tripTransitionSecretHeader = requestMeta.tripTransitionSecretHeader || '';

      const tripId = String(payloadBody.tripId || '').trim();
      if (!tripId) {
        return { status: 400, body: { success: false, error: 'tripId is required' } };
      }

      const authorizedBySecret = isTripTransitionAuthorized({ authHeader, tripTransitionSecretHeader });
      let authMode = 'trip_transition_secret';
      let driverAuthMeta = null;

      if (!authorizedBySecret) {
        driverAuthMeta = await authorizeDriverTripTransitionRequest({ authHeader, tripId });
        if (!driverAuthMeta.ok) {
          logWebhook('trip_transition_unauthorized', {
            tripId,
            reason: driverAuthMeta.reason || 'unknown',
          });
          return { status: 401, body: { success: false, error: 'Unauthorized' } };
        }
        authMode = 'driver_jwt';
        logWebhook('trip_transition_driver_authorized', {
          tripId,
          driverId: driverAuthMeta.driverId,
          tripStatus: driverAuthMeta.tripStatus || null,
        });
      }

      const transitionStatus = normalizeText(payloadBody.status || '');

      if (SUPABASE_DISPATCH_ONLY) {
        logWebhook('trip_transition_dispatch_mode', {
          tripId,
          status: transitionStatus || null,
          authMode,
          mode: 'supabase_dispatch_only',
          queueDispatch: 'disabled_in_agente_ia',
          lifecycleTransitions: 'enabled',
        });
      }

      if (transitionStatus === 'pending') {
        schedulePendingTimeoutTimer(tripId, { source: 'trip_transition_event' });
      } else if (transitionStatus) {
        clearPendingTimeoutTimer(tripId, `trip_transition_${transitionStatus}`);
      }

      ensureServerConfig();
      const transitions = await processTripLifecycleTransitionsForTripId(tripId);
      return {
        status: 200,
        body: {
          success: true,
          event: 'trip.transition',
          tripId,
          authMode,
          transitions,
        },
      };
    }

    if (event === 'webhook.test') {
      logWebhook('ignored', { reason: 'webhook_test' });
      return { status: 200, body: { success: true, ignored: true, reason: 'webhook_test' } };
    }

    if (UPSERT_ONLY && event === 'messages.received') {
      logWebhook('ignored', { reason: 'received_ignored_upsert_only' });
      return { status: 200, body: { success: true, ignored: true, reason: 'received_ignored_upsert_only' } };
    }

    if (event === 'poll.results') {
      const missing = getMissingServerConfig();
      if (missing.length > 0) {
        return { status: 200, body: { success: true, ignored: true, reason: 'missing_server_env' } };
      }

      const pollMsgId = String(body?.data?.key?.id || '').trim();
      const pollResult = Array.isArray(body?.data?.pollResult) ? body.data.pollResult : [];

      if (!pollMsgId) {
        logWebhook('poll_results_ignored', { reason: 'missing_poll_msg_id' });
        return { status: 200, body: { success: true, ignored: true, reason: 'missing_poll_msg_id' } };
      }

      const voted = pollResult.find((r) => Array.isArray(r.voters) && r.voters.length > 0);
      if (!voted) {
        logWebhook('poll_results_ignored', { reason: 'no_votes_yet', pollMsgId });
        return { status: 200, body: { success: true, ignored: true, reason: 'no_votes_yet' } };
      }

      // Extraer el teléfono del votante lo antes posible.
      // Según docs de WASender, voters[] contiene el JID del votante.
      // Si fromMe=true, remoteJid también es el JID del pasajero.
      // En ambos casos puede ser @s.whatsapp.net (directo) o @lid (necesita resolución).
      const voterJid =
        voted.voters[0] ||
        body?.data?.key?.remoteJid ||
        '';
      const voterPhone = await resolvePhoneFromJid(voterJid).catch(() => null);
      logWebhook('poll_results_voter_phone', {
        voterJid,
        voterPhone: voterPhone ? maskPhone(voterPhone) : null,
        pollMsgId,
      });

      // ── Resolución del poll: fuente única = whatsapp_conversations.context ────────
      // El trip NO existe todavía cuando llega poll.results — se crea aquí
      // con la dirección ya confirmada. Los candidatos están en el contexto
      // de la conversación (guardado por finalizeConversation al enviar el poll).

      if (!voterPhone) {
        logWebhook('poll_results_ignored', { reason: 'voter_phone_unresolvable', pollMsgId });
        return { status: 200, body: { success: true, ignored: true, reason: 'voter_phone_unresolvable' } };
      }

      // 1️⃣ Buscar la conversación del votante (fuente de verdad del pending_poll)
      const { data: pollConv } = await getSupabase()
        .from('whatsapp_conversations')
        .select('id, phone, context, last_trip_id, push_name')
        .eq('phone', normalizePhone(voterPhone))
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const pollConvCtx = safeJsonParse(pollConv?.context, {});
      const pendingPoll = pollConvCtx?.pending_poll;
      const pollCandidates = pendingPoll?.candidates || [];
      const pollExtracted = pendingPoll?.extracted || {};

      if (!pollCandidates.length) {
        logWebhook('poll_results_ignored', { reason: 'no_pending_poll_in_conv', pollMsgId, votedName: voted.name, convId: pollConv?.id || null });
        return { status: 200, body: { success: true, ignored: true, reason: 'no_pending_poll_in_conv' } };
      }

      const selectedCandidate = pollCandidates.find(
        (c) => c.label === voted.name || c.formattedAddress === voted.name
      );

      if (!selectedCandidate) {
        logWebhook('poll_results_ignored', { reason: 'voted_option_not_in_candidates', pollMsgId, votedName: voted.name });
        return { status: 200, body: { success: true, ignored: true, reason: 'voted_option_not_in_candidates' } };
      }

      const pollPassengerPhone = normalizePhone(voterPhone);
      const pollPassengerName = pollExtracted.passenger_name || pollConv?.push_name || 'Pasajero WhatsApp';

      // 2️⃣ Limpiar pending_poll de la conversación (no bloquear el flujo si falla)
      const ctxWithoutPoll = { ...pollConvCtx };
      delete ctxWithoutPoll.pending_poll;
      if (pollConv?.id) {
        try {
          await getSupabase()
            .from('whatsapp_conversations')
            .update({ context: ctxWithoutPoll, status: 'open' })
            .eq('id', pollConv.id);
        } catch (_) {}
      }

      // "Ninguna de estas opciones" → pedir GPS/calle directamente
      if (normalizeForMatch(voted.name || '').startsWith('ninguna')) {
        await sendWhatsAppText(
          pollPassengerPhone,
          'Entendido. Compartí tu *ubicación en tiempo real* desde WhatsApp (ícono de ubicación → "Ubicación en tiempo real"), o mandame la *calle y número exacto* y te mando el móvil enseguida.'
        );
        // Marcar awaiting_gps en conversación para el próximo mensaje
        if (pollConv?.id) {
          try {
            await getSupabase()
              .from('whatsapp_conversations')
              .update({ context: { ...ctxWithoutPoll, awaiting_gps: true }, status: 'open' })
              .eq('id', pollConv.id);
          } catch (_) {}
        }
        logWebhook('poll_results_none_selected', { convId: pollConv?.id || null, votedName: voted.name });
        return { status: 200, body: { success: true, event: 'poll.results', noneSelected: true } };
      }

      // 3️⃣ Geocodificar si el candidato no tiene coordenadas (opciones del historial)
      let confirmedCandidate = selectedCandidate;
      if (!confirmedCandidate.lat || !confirmedCandidate.lng) {
        try {
          const geo = await geocodeAddress(voted.name);
          confirmedCandidate = { label: voted.name, formattedAddress: geo.formattedAddress, lat: geo.lat, lng: geo.lng };
          logWebhook('poll_results_geocoded_candidate', { votedName: voted.name });
        } catch (geoErr) {
          logWebhook('poll_results_geocode_fail', { votedName: voted.name, error: geoErr?.message });
        }
      }

      if (!confirmedCandidate.lat || !confirmedCandidate.lng) {
        logWebhook('poll_results_ignored', { reason: 'candidate_no_coords', votedName: voted.name });
        return { status: 200, body: { success: true, ignored: true, reason: 'candidate_no_coords' } };
      }

      logWebhook('poll_results_address_selected', {
        phone: maskPhone(pollPassengerPhone),
        selectedAddress: confirmedCandidate.formattedAddress,
      });

      // 4️⃣ Crear el viaje reutilizando el flujo canónico para no perder
      // geocodificación de destino final ni contexto de seguimiento.
      const tripResult = await createTripFromConversation({
        conversation: {
          id: pollConv?.id || null,
          phone: pollPassengerPhone,
          push_name: pollPassengerName,
        },
        extracted: {
          ...pollExtracted,
          passenger_name: pollPassengerName,
          pickup_location: confirmedCandidate.formattedAddress,
          _preGeocodedPickup: {
            formattedAddress: confirmedCandidate.formattedAddress,
            lat: Number(confirmedCandidate.lat),
            lng: Number(confirmedCandidate.lng),
          },
          _conversationText: pollExtracted?._conversationText || null,
        },
      });

      if (!tripResult?.ok || !tripResult?.trip?.id) {
        if (tripResult?.reply) {
          await sendWhatsAppText(pollPassengerPhone, tripResult.reply).catch(() => {});
        }
        if (pollConv?.id) {
          try {
            await getSupabase()
              .from('whatsapp_conversations')
              .update({
                status: 'open',
                context: tripResult?.context || ctxWithoutPoll,
                last_processed_at: new Date().toISOString(),
              })
              .eq('id', pollConv.id);
          } catch (_) {}
        }
        logWebhook('poll_results_trip_create_not_ready', {
          convId: pollConv?.id || null,
          phone: maskPhone(pollPassengerPhone),
          reason: tripResult?.reason || 'trip_not_created',
        });
        return {
          status: 200,
          body: {
            success: true,
            event: 'poll.results',
            ignored: true,
            reason: tripResult?.reason || 'trip_not_created',
          },
        };
      }

      logWebhook('poll_results_trip_created', {
        tripId: tripResult.trip.id,
        phone: maskPhone(pollPassengerPhone),
        address: confirmedCandidate.formattedAddress,
        queued: Boolean(tripResult?.queued),
        driverId: tripResult?.driver?.id || null,
      });

      // 5️⃣ Actualizar la conversación: last_trip_id + contexto del resultado + estado 'open'
      if (pollConv?.id) {
        try {
          await getSupabase()
            .from('whatsapp_conversations')
            .update({
              last_trip_id: tripResult.trip.id,
              status: 'open',
              context: tripResult.context || {},
              last_processed_at: new Date().toISOString(),
            })
            .eq('id', pollConv.id);
        } catch (_) {}
      }

      if (tripResult?.reply) {
        await sendWhatsAppText(pollPassengerPhone, tripResult.reply).catch(() => {});
      }
      if (tripResult?.queued) {
        await dispatchQueuedPassengers();
      }

      logWebhook('poll_results_trip_dispatched', {
        tripId: tripResult.trip.id,
        queued: Boolean(tripResult?.queued),
      });
      return {
        status: 200,
        body: {
          success: true,
          event: 'poll.results',
          tripId: tripResult.trip.id,
          queued: Boolean(tripResult?.queued),
        },
      };
    }

    if (!['messages.upsert', 'messages.received'].includes(event)) {
      logWebhook('ignored', { reason: 'event_not_supported', event: event || 'unknown' });
      return { status: 200, body: { success: true, ignored: true, reason: 'event_not_supported' } };
    }

    const missing = getMissingServerConfig();
    if (missing.length > 0) {
      logWebhook('ignored', { reason: 'missing_server_env', missing });
      return {
        status: 200,
        body: {
          success: true,
          ignored: true,
          reason: 'missing_server_env',
          missing,
        },
      };
    }

    const rawMessage = payloadBody?.data?.messages || payloadBody?.data;
    const messageData = Array.isArray(rawMessage) ? rawMessage[0] : rawMessage;
    if (!messageData?.key) {
      logWebhook('ignored', { reason: 'invalid_payload' });
      return { status: 200, body: { success: true, ignored: true, reason: 'invalid_payload' } };
    }

    if (messageData.key.fromMe) {
      logWebhook('ignored', { reason: 'outgoing' });
      return { status: 200, body: { success: true, ignored: true, reason: 'outgoing' } };
    }

    if (messageData.key.remoteJid?.includes('@g.us')) {
      logWebhook('ignored', { reason: 'group' });
      return { status: 200, body: { success: true, ignored: true, reason: 'group' } };
    }

    const phone = extractPhoneFromMessage(messageData);
    if (!phone || phone.length < 8) {
      logWebhook('ignored', { reason: 'invalid_phone' });
      return { status: 200, body: { success: true, ignored: true, reason: 'invalid_phone' } };
    }

    if (!isAuthorizedPhone(phone)) {
      logWebhook('ignored', { reason: 'phone_not_allowed', phone: maskPhone(phone) });
      return { status: 200, body: { success: true, ignored: true, reason: 'phone_not_allowed' } };
    }

    const messageType = detectMessageType(messageData.message);
    const pushName = messageData.pushName || messageData.key.pushName || null;
    const messageId = messageData.key.id;
    let content = extractMessageText(messageData);
    let transcription = null;
    let mediaUrl = null;

    // --- Manejo especial de ubicación GPS en tiempo real ---
    if (messageType === 'location') {
      const locMsg = messageData.message?.locationMessage || {};
      const gpsLat = locMsg.degreesLatitude;
      const gpsLng = locMsg.degreesLongitude;

      if (typeof gpsLat === 'number' && typeof gpsLng === 'number') {
        logWebhook('location_message_received', { phone: maskPhone(phone), lat: gpsLat, lng: gpsLng });

        // Resolver dirección: WhatsApp ya la trae en el payload, si no → reverse geocode.
        // El flujo GPS no depende de contexto previo: crea viaje directo igual que calle+altura.
        const waName = String(locMsg.name || '').trim();
        const waAddress = String(locMsg.address || '').trim();
        const waProvidedAddress = waAddress || waName || null;

        let pickupAddress;
        if (waProvidedAddress) {
          pickupAddress = waProvidedAddress;
          logWebhook('location_address_from_wa_payload', {
            phone: maskPhone(phone),
            waAddress: waProvidedAddress,
          });
        } else {
          try {
            pickupAddress = await reverseGeocodeLatLng(gpsLat, gpsLng);
          } catch {
            pickupAddress = `${gpsLat.toFixed(6)}, ${gpsLng.toFixed(6)}`;
          }
        }

        const latestOpenTrip = await getLatestOpenTripByPhone(phone).catch(() => null);
        const latestOpenTripContext = safeJsonParse(latestOpenTrip?.wa_context, {});
        const isGpsPlaceholderTrip =
          Boolean(latestOpenTrip) &&
          String(latestOpenTrip?.status || '').toLowerCase() === 'queued' &&
          latestOpenTripContext?.awaiting_gps === true;

        // Si ya tiene un viaje activo real, mantener idempotencia y no duplicar.
        if (latestOpenTrip && shouldBlockForOpenTrip(latestOpenTrip) && !isGpsPlaceholderTrip) {
          const activeStatus = String(latestOpenTrip.status || '').toLowerCase();
          const activeStatusReply =
            activeStatus === 'queued'
              ? 'Ya estás en la cola de espera. Te avisamos en cuanto haya un chofer disponible 🕐'
              : activeStatus === 'pending'
                ? `Tu pedido ya está tomado, esperando confirmación del chofer.${latestOpenTrip.destination_address ? `\nRetiro: *${latestOpenTrip.destination_address}*` : ''}`
                : `Ya tenés un móvil asignado. Tu viaje sigue en curso.${latestOpenTrip.destination_address ? `\nRetiro: *${latestOpenTrip.destination_address}*` : ''}`;

          await sendWhatsAppText(phone, activeStatusReply).catch(() => {});
          logWebhook('location_open_trip_blocked', {
            phone: maskPhone(phone),
            tripId: latestOpenTrip.id,
            tripStatus: latestOpenTrip.status,
          });
          return {
            status: 200,
            body: {
              success: true,
              gpsHandled: true,
              blockedByOpenTrip: true,
              tripId: latestOpenTrip.id,
            },
          };
        }

        const latestConversation = await getLatestConversationByPhone(phone).catch(() => null);

        const tripResult = await createTripFromConversation({
          conversation: {
            id: latestConversation?.id || null,
            phone,
            push_name: pushName || null,
          },
          extracted: {
            passenger_name: pushName || null,
            pickup_location: pickupAddress,
            origin: pickupAddress,
            destination: null,
            notes: null,
            _preGeocodedPickup: {
              formattedAddress: pickupAddress,
              lat: Number(gpsLat),
              lng: Number(gpsLng),
            },
            _conversationText: '[UBICACION_WHATSAPP]',
          },
        });

        // Si había un placeholder de GPS en cola, se invalida para evitar duplicados.
        if (isGpsPlaceholderTrip && latestOpenTrip?.id && tripResult?.trip?.id !== latestOpenTrip.id) {
          await getSupabase()
            .from('trips')
            .update({
              status: 'cancelled',
              cancel_reason: '[AUTO_SUPERSEDED] GPS recibido; se creó un viaje directo',
              wa_notified_at: new Date().toISOString(),
              wa_context: null,
            })
            .eq('id', latestOpenTrip.id)
            .eq('status', 'queued')
            .catch(() => {});
        }

        if (latestConversation?.id) {
          const conversationUpdates = {
            status: 'open',
            context: tripResult?.context || {},
            last_processed_at: new Date().toISOString(),
          };
          if (tripResult?.trip?.id) {
            conversationUpdates.last_trip_id = tripResult.trip.id;
          }

          await getSupabase()
            .from('whatsapp_conversations')
            .update(conversationUpdates)
            .eq('id', latestConversation.id)
            .catch(() => {});
        }

        if (tripResult?.reply) {
          await sendWhatsAppText(phone, tripResult.reply).catch(() => {});
        }

        if (tripResult?.queued) {
          await dispatchQueuedPassengers();
        }

        logWebhook('location_trip_direct_result', {
          phone: maskPhone(phone),
          ok: Boolean(tripResult?.ok),
          reason: tripResult?.reason || null,
          tripId: tripResult?.trip?.id || null,
          queued: Boolean(tripResult?.queued),
        });

        return {
          status: 200,
          body: {
            success: true,
            gpsHandled: true,
            ok: Boolean(tripResult?.ok),
            reason: tripResult?.reason || null,
            tripId: tripResult?.trip?.id || null,
            queued: Boolean(tripResult?.queued),
          },
        };
      }

      // Si no hay viaje en cola esperando GPS, dejar que fluya normal como mensaje
    }

    if (messageType === 'audio') {
      mediaUrl = await decryptAudioMessage(messageData);
      transcription = mediaUrl ? await transcribeAudioFromUrl(mediaUrl) : null;
      content = transcription || content || '[audio]';
    }

    const appendResult = await appendIncomingMessage({
      phone,
      pushName,
      messageId,
      messageType,
      content: content || `[${messageType}]`,
      mediaUrl,
      transcription,
      rawPayload: payloadBody,
    });

    if (!appendResult?.inserted) {
      logWebhook('ignored', { reason: 'duplicate_message', phone: maskPhone(phone), messageId });
      return { status: 200, body: { success: true, ignored: true, reason: 'duplicate_message' } };
    }

    // Los mensajes de tipo poll_response son votos en encuestas de dirección.
    // El evento poll.results (siempre posterior) los procesa de forma canónica con la
    // opción ya descifrada. Si intentamos procesar aquí también, corremos el riesgo de
    // que la coincidencia de texto falle y borre el pending_poll del contexto antes de
    // que llegue poll.results. Por eso, simplemente registramos el mensaje y salimos.
    if (messageType === 'poll_response') {
      logWebhook('poll_response_deferred', {
        conversationId: appendResult.conversation_id,
        phone: maskPhone(phone),
        messageId,
        reason: 'handled_by_poll_results_event',
      });
      return {
        status: 200,
        body: { success: true, queued: false, deferred: true, reason: 'poll_response_handled_by_poll_results' },
      };
    }

    scheduleConversationProcessing(appendResult.conversation_id, ACCUMULATION_MS);
    logWebhook('queued', {
      phone: maskPhone(phone),
      messageId,
      messageType,
      conversationId: appendResult.conversation_id,
      accumulationMs: ACCUMULATION_MS,
    });

    if (IMMEDIATE_PROCESSING) {
      const processResult = await processConversationById(appendResult.conversation_id);
      logWebhook('processed_immediately', {
        conversationId: appendResult.conversation_id,
        skipped: Boolean(processResult?.skipped),
      });
      return {
        status: 200,
        body: {
          success: true,
          queued: true,
          processedImmediately: true,
          conversationId: appendResult.conversation_id,
        },
      };
    }

    logWebhook('awaiting_cron', {
      conversationId: appendResult.conversation_id,
      accumulationMs: ACCUMULATION_MS,
      immediateProcessing: false,
    });

    return {
      status: 200,
      body: {
        success: true,
        queued: true,
        awaitingCron: true,
        conversationId: appendResult.conversation_id,
      },
    };
  } catch (error) {
    console.error('Error en webhook Wasender:', error);
    return { status: 500, body: { success: false, error: error.message } };
  }
}

function isVercelCronInvocation({ userAgent = '', xVercelCron = '' } = {}) {
  const ua = String(userAgent || '').toLowerCase();
  const cronHeader = String(xVercelCron || '').toLowerCase();
  return cronHeader === '1' || ua.includes('vercel-cron');
}

async function processPendingConversationsRequest({ authHeader = '', userAgent = '', xVercelCron = '' } = {}) {
  try {
    const isVercelCron = isVercelCronInvocation({ userAgent, xVercelCron });
    if (CRON_SECRET) {
      if (!isVercelCron && authHeader !== `Bearer ${CRON_SECRET}`) {
        return { status: 401, body: { success: false, error: 'Unauthorized' } };
      }
    }

    logWebhook('cron_run', {
      viaVercelCron: isVercelCron,
      hasAuthHeader: Boolean(authHeader),
    });

    ensureServerConfig();
    const expireResult = SUPABASE_DISPATCH_ONLY
      ? await requeueTimedOutPendingTripsSupabaseDispatchOnly()
      : await expireTimedOutPendingTrips();
    const pendingResult = await processPendingConversations();
    const transitionResult = await processTripLifecycleTransitions();
    return {
      status: 200,
      body: {
        success: true,
        ...pendingResult,
        expiredPending: expireResult.expired,
        tripTransitions: transitionResult,
      },
    };
  } catch (error) {
    console.error('Error procesando pendientes:', error);
    return { status: 500, body: { success: false, error: error.message } };
  }
}

function getHealthPayload() {
  return { success: true, status: 'ok', accumulationMs: ACCUMULATION_MS };
}

async function warmPendingTimers() {
  const { data, error } = await getSupabase()
    .from('whatsapp_conversations')
    .select('id, accumulation_started_at')
    .eq('is_collecting', true)
    .not('accumulation_started_at', 'is', null);

  if (error) throw error;

  for (const conversation of data || []) {
    const startedAt = new Date(conversation.accumulation_started_at).getTime();
    const remaining = Math.max(0, ACCUMULATION_MS - (Date.now() - startedAt));
    scheduleConversationProcessing(conversation.id, remaining);
  }
}

async function ensureWarm() {
  if (warmed) return;
  warmed = true;

  const missing = getMissingServerConfig();
  if (missing.length > 0) {
    console.warn(`Warmup omitido por variables faltantes: ${missing.join(', ')}`);
    return;
  }

  try {
    await warmPendingTimers();
  } catch (error) {
    console.error('No se pudieron rehidratar timers pendientes:', error.message);
  }

  try {
    await loadSaltaStreetCatalog();
  } catch (error) {
    console.warn('No se pudo precargar catálogo de calles de Salta:', error?.message || 'unknown');
  }
}

export async function POST(req) {
  await ensureWarm();
  const body = await req.json();
  const authHeader = req.headers.get('authorization') || '';
  const tripTransitionSecretHeader = req.headers.get('x-trip-transition-secret') || '';
  logWebhook('http_post', {
    vercelId: req.headers.get('x-vercel-id') || null,
    hasEvent: Boolean(body?.event),
    event: body?.event || null,
  });
  const result = await processWebhookBody(body, { authHeader, tripTransitionSecretHeader });
  logWebhook('http_post_result', { status: result.status, success: result.body?.success === true });
  return Response.json(result.body, { status: result.status });
}

export async function GET(req) {
  await ensureWarm();
  const url = new URL(req.url);

  if (url.searchParams.get('health') === '1') {
    return Response.json(getHealthPayload(), { status: 200 });
  }

  const authHeader = req.headers.get('authorization') || '';
  const userAgent = req.headers.get('user-agent') || '';
  const xVercelCron = req.headers.get('x-vercel-cron') || '';
  const result = await processPendingConversationsRequest({ authHeader, userAgent, xVercelCron });
  return Response.json(result.body, { status: result.status });
}
