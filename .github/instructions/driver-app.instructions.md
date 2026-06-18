---
applyTo: "driver-app/**"
---

# Driver App — Convenciones y Arquitectura

## Stack tecnológico

| Librería | Versión | Rol |
|---|---|---|
| Expo | 54 | Plataforma base de la app móvil |
| React Native | 0.81 | Framework de UI nativo |
| React | 19 | Capa de componentes |
| NativeWind | v4 | Tailwind CSS para React Native |
| Zustand | v5 | Estado global del cliente |
| React Query | v5 | Estado del servidor (caché, invalidación por Realtime, mutaciones) |
| Supabase JS | v2 | Backend, autenticación y Realtime |
| React Navigation | v7 | Navegación entre pantallas |
| react-native-maps | 1.20.1 | Mapa interactivo |
| expo-location | ~19 | GPS foreground y background |
| expo-notifications | ~0.32 | Notificaciones push |
| expo-av | ~16 | Grabación de audio (voz) |
| expo-print | ^55.0.13 | Generación de PDF desde HTML en dispositivo |
| expo-sharing | ^55.0.18 | Compartir archivos (PDF, etc.) vía share sheet nativo |
| expo-image | ~3.0.11 | Imágenes estáticas y avatares (reemplaza `Image` de RN) |

---

## Estructura de carpetas

Todo el código fuente vive dentro de `src/`. La raíz solo contiene configuración.

```
driver-app/
  App.js                    ← Punto de entrada real de la app
  App.full.js               ← Backup de referencia (NO es el entry point)
  src/
    screens/                ← Una pantalla por archivo, PascalCase.jsx
    components/
      driver/               ← UI específica del conductor (ej: StatusToggle)
      map/                  ← TripMap, RoutePolyline, DriverMarker
      trip/                 ← Modal de aceptar viaje, tarjeta de viaje
      ui/                   ← Componentes genéricos: Button, Card, Badge,
    hooks/                  ←   Avatar, Skeleton, EmptyState
      useAuth.js            ← Sesión, login/logout, registro de push token
      useTrips.js           ← React Query: viaje activo, historial
      useLocation.js        ← GPS foreground + background
      useRealtime.js        ← Suscripciones Supabase Realtime
      useOwner.js           ← Datos de flota para el dueño
      useVoiceChat.js       ← Interfaz de voz para destino
    stores/
      authStore.js          ← Usuario, conductor, sesión
      tripStore.js          ← Viaje activo, viaje pendiente, timers
      locationStore.js      ← Coordenadas actuales, velocidad, heading
    services/
      supabase.js           ← Cliente Supabase singleton
      googleMaps.js         ← Directions, geocoding, autocomplete
      notifications.js      ← Push tokens y notificaciones locales
      voiceDestination.js   ← Grabación → transcripción → destino
    navigation/
      AppNavigator.jsx      ← Raíz: bifurca entre Auth y Main
      AuthNavigator.jsx     ← Stack de login
      MainNavigator.jsx     ← Bottom tabs: Home, Historial, Perfil
    theme/                  ← colors.js, spacing.js, typography.js
    utils/                  ← constants.js, formatters.js, mapHelpers.js
```

---

## Convenciones de UI (building-native-ui skill)

El proyecto sigue las reglas del skill `building-native-ui` instalado en `.agents/skills/building-native-ui/`.

### Sombras — SIEMPRE usar `boxShadow`

```js
// ✅ Correcto
boxShadow: '0 2px 8px rgba(0,0,0,0.10)'

// ❌ Incorrecto — legacy, no usar
shadowColor: '#000'
shadowOffset: { width: 0, height: 2 }
shadowOpacity: 0.1
shadowRadius: 4
elevation: 3
```

Excepción: el tab bar en `MainNavigator` mantiene `elevation` por compatibilidad con Android además de `boxShadow`.

### Interactividad — usar `Pressable` en lugar de `TouchableOpacity`

```jsx
// ✅ Correcto
<Pressable style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>

// ❌ Incorrecto
<TouchableOpacity activeOpacity={0.8}>
```

`activeOpacity` **no es una prop válida** en `Pressable`. El feedback se implementa con `style={({ pressed }) => ...}`.

### Imágenes estáticas y avatares — usar `expo-image`

```jsx
import { Image } from 'expo-image';
// contentFit="cover" para avatares, contentFit="contain" para logos
<Image source={...} contentFit="cover" transition={200} />
```

### Bordes redondeados modernos

```js
borderRadius: 16,
borderCurve: 'continuous', // iOS 13+ — curva suave estilo Apple
```

---

## Gestión de estado

Se usa **Zustand** para estado global sincrónico y **React Query** para datos del servidor.

### Stores de Zustand

| Store | Estado que maneja |
|---|---|
| `authStore` | `user`, `driver`, `session`, `isAuthenticated`, `isLoading` |
| `tripStore` | `activeTrip`, `pendingTrip`, `showNewTripModal`, `tripTimer`, `tripDistanceKm`, `lastTrackingLocation` |
| `locationStore` | `currentLocation`, `isTracking`, `speed`, `heading`, `permissionStatus` |

## Comandos de testing

Siempre usar estos comandos desde la carpeta `driver-app/`:

```bash
npm test                 # Corre todos los tests una vez y muestra el resultado
npm run test:watch       # Modo watch: re-corre automáticamente al guardar un archivo
npm run test:coverage    # Genera reporte de cobertura HTML en driver-app/coverage/
```

- Los tests viven en `driver-app/__tests__/`.
- El preset usado es `jest-expo` (configurado en `package.json`).
- Los mocks de módulos nativos de Expo están centralizados en `jest.setup.js`.
- El contrato de datos compartido con profesional-dashboard está en `shared/trip-contract.js` (raíz del monorepo).
- **Ejecutar `npm test` siempre después de modificar `tripStore.js`, `useRealtime.js` o `constants.js`** para verificar que el ciclo de vida del viaje no se rompió.

## Comandos de ejecución y release

Todos los comandos deben correrse desde `driver-app/`.

```bash
cd driver-app
npx expo start                 # Metro normal
npx expo start --dev-client    # usar con Development Build instalado
npx expo run:android           # build+run local Android (requiere Android Studio + emulador o dispositivo)
npx expo run:ios               # build+run local iOS (requiere macOS + Xcode instalado)
```

OTA update (rama preview):

```bash
cd driver-app
eas update --branch preview --message "descripcion del cambio"
```

- Si querés modo no interactivo en CI, usar `CI=1`. Evitar `--non-interactive` en `eas update` local porque puede fallar durante el bundling.
- Si agregás módulos nativos (por ejemplo `expo-print`, `expo-sharing`), generar nuevo build de desarrollo antes de probar en dispositivo.

### Setup para build iOS (requiere macOS)

Para compilar en iOS por primera vez:

1. **Obtener `GoogleService-Info.plist`** desde [Firebase Console](https://console.firebase.google.com) → proyecto → iOS app (`com.remises.driverapp`) → descargar el archivo y colocarlo en `driver-app/GoogleService-Info.plist`.

2. **Generar el proyecto nativo iOS**:
   ```bash
   cd driver-app
   npx expo prebuild --platform ios
   ```
   Esto genera la carpeta `ios/` con el Xcode project y corre CocoaPods automáticamente.

3. **Compilar y correr en simulador**:
   ```bash
   npx expo run:ios
   ```

4. **Build de producción vía EAS** (no requiere macOS local):
   ```bash
   eas build --platform ios --profile production
   ```

> ⚠️ La carpeta `ios/` no está commiteada en el repo. Siempre regenerarla con `expo prebuild` en la máquina de build. Es generada automáticamente por EAS Build en la nube.

> ⚠️ `GoogleService-Info.plist` contiene credenciales — no commitear al repo. Cargarlo como secret en EAS Build: `eas secret:create --scope project --name GOOGLE_SERVICE_INFO_PLIST --type file --value ./GoogleService-Info.plist`.

---

**Reglas de uso de stores:**

```js
// ✅ Correcto — selector granular para evitar re-renders innecesarios
const driver = useAuthStore(s => s.driver);

// ❌ Incorrecto — suscribe al store completo, re-renderiza ante cualquier cambio
const store = useAuthStore();

// ❌ Incorrecto — no llamar getState() dentro del render
const driver = useAuthStore.getState().driver;
```

### React Query

- `useActiveTrip()` — obtiene el viaje activo y se revalida por eventos Realtime de `trips`.
- `useTripHistory()` — historial con scroll infinito.
- `useTodayStats()` y `useCommissionBalance()` — se revalidan por eventos Realtime (`trips`, `drivers`, `commission_payments`).
- Las mutaciones (aceptar, cancelar, completar viaje) también usan React Query para invalidar el caché automáticamente.

---

## Hooks principales

### `useAuth`
Bootstrap de sesión al inicio de la app. Se llama **una sola vez** en `AppNavigator`. Responsabilidades:
- Suscribirse a `onAuthStateChange` de Supabase.
- Al detectar sesión activa, carga el perfil del conductor desde la tabla `drivers`.
- Registra el push token automáticamente tras el login.
- Maneja el caso de refresh token inválido: hace logout limpio.

### `useRealtime`
Suscripciones en tiempo real. Debe inicializarse **una vez por sesión** (actualmente desde `HomeScreen`). Métodos:
- `subscribeToNewTrips()` — escucha `INSERT` en `trips` filtrado por `driver_id`. Cuando llega un viaje pendiente, activa vibración, notificación local y muestra el modal de aceptación.
- `subscribeToMessages()` — escucha `INSERT` en `dispatcher_messages` para mensajes del despachador.
- `subscribeToCommissionPayments()` — escucha `INSERT` en `commission_payments` del chofer para actualizar estado de comisión.

### Notificaciones push — `src/services/notifications.js`

#### Canales de Android (todos deben tener `importance: HIGH`)

| Canal | Para qué |  
|---|---|
| `trips` | Nuevo viaje asignado |
| `messages` | Mensajes del despachador |
| `commission` | Confirmación de pago de comisión |

> ⚠️ Android **no permite bajar** la importancia de un canal ya creado. Si se creó con `DEFAULT`, el usuario debe reinstalar la app para que tome efecto `HIGH`. Siempre definir los canales con `AndroidImportance.HIGH` desde el primer build.

#### Función disponible

```js
import { sendPaymentSuccessNotification } from '../services/notifications';
// Envía notificación local inmediata al confirmar pago de comisión
await sendPaymentSuccessNotification('$1.500');
```

### `useTrips`
Wrapper de React Query para operaciones de viajes. No hace fetch directo a Supabase — siempre pasar por este hook.

### `useLocation`
- Solicita permisos de ubicación al iniciar.
- Actualiza `locationStore` con coordenadas en tiempo real.
- En background, actualiza `drivers.current_location` en Supabase (columna PostGIS `geography`).
- El task de background **debe registrarse al nivel superior del módulo**, no dentro de un componente o efecto.

---

## Cliente de Supabase

```js
// ✅ Siempre importar el singleton
import { supabase } from '../services/supabase';

// ❌ Nunca crear un cliente nuevo
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(url, key); // Esto rompe el Realtime y duplica conexiones
```

El singleton está guardado en `globalThis.__driverAppSupabaseClient` para sobrevivir hot reloads de Expo sin crear clientes duplicados.

El listener de `AppState` (foreground/background) está también guardado en `globalThis` para evitar duplicación.

---

## Máquina de estados local del viaje (ActiveTripScreen)

`ActiveTripScreen` tiene su propio estado local `flowStep`, **independiente del `status` en la BD**:

```
GOING_TO_PICKUP → AT_PICKUP → SET_DESTINATION → IN_PROGRESS
```

Cada transición de `flowStep` **también actualiza el `status` en Supabase**, pero no al revés. No confundir uno con el otro.

**Por qué existe esta separación:** el `status` en BD es la fuente de verdad para el pasajero y el dashboard. El `flowStep` local controla qué UI se muestra al conductor (pasos intermedios que la BD no necesita conocer).

### Viajes de tipo "Approach Only"

Algunos viajes originados por WhatsApp son solo de acercamiento. Se identifican por tener `[APPROACH_ONLY]` en el campo `notes`. En esos casos, los campos `pickup` y `destination` están **invertidos** en la BD y deben swapearse antes de mostrarse. La función `enrichApproachTrip()` en `ActiveTripScreen` hace este swap.

---

## Integración con Google Maps

Todas las llamadas a la API de Google Maps pasan por `src/services/googleMaps.js`. Nunca llamar a la API directamente desde un componente o pantalla.

| Función | Retorna |
|---|---|
| `getDirections(origin, dest)` | Polyline codificada + pasos de navegación turn-by-turn |
| `geocodeAddress(address)` | `{ latitude, longitude }` |
| `getPlaceAutocomplete(query, sessionToken)` | Lista de sugerencias de lugares |

Las polylines codificadas se decodifican con `decodePolyline()` definida en el mismo archivo.

---

## Pantallas principales

| Pantalla | Archivo | Función |
|---|---|---|
| `HomeScreen` | `screens/HomeScreen.jsx` | Mapa en vivo, toggle online/offline, estadísticas del día, historial reciente |
| `ActiveTripScreen` | `screens/ActiveTripScreen.jsx` | Flujo de viaje activo: recoger → destino → completar |
| `CommissionPaymentScreen` | `screens/CommissionPaymentScreen.jsx` | Pago de comisión vía WebView (Paypertic), generación de PDF recibo y notificación de pago |
| `HistoryScreen` | `screens/HistoryScreen.jsx` | Historial completo de viajes con scroll infinito |
| `ProfileScreen` | `screens/ProfileScreen.jsx` | Datos del conductor, vehículo, configuración |
| `TripDetailScreen` | `screens/TripDetailScreen.jsx` | Detalle de un viaje histórico |
| `OwnerDriverDetailScreen` | `screens/OwnerDriverDetailScreen.jsx` | Vista del dueño de flota: detalle de conductor individual |

### `CommissionPaymentScreen` — detalles de implementación

- Usa `WebView` para mostrar el formulario de Paypertic.
- **Gray screen fix**: el state `showVerifyingOverlay` detecta cuando el WebView navega fuera del formulario original y muestra un overlay `VerifyingPaymentCard` ("Verificando tu pago") hasta confirmar el resultado.
- **PDF**: usa `expo-print` (`Print.printToFileAsync({ html })`) + `expo-file-system` (mover a cache con nombre estable) + `expo-sharing` (`Sharing.shareAsync(uri, { mimeType: 'application/pdf' })`).
- **Notificación**: llama a `sendPaymentSuccessNotification(formattedAmount)` al confirmar el pago aprobado.

---

## Errores frecuentes y trampas conocidas

### Helpers duplicados
`haversineKm`, `haversineMeters` y `parseSettingNumber` están copiados en múltiples archivos (`tripStore`, `ActiveTripScreen`, `googleMaps`). **No agregar otra copia.** Si necesitas usarlos en un archivo nuevo, importarlos desde el más cercano o migrarlos a `utils/`.

### Task de background
`expo-task-manager` requiere que el task se registre **al nivel del módulo**, fuera de cualquier componente o función. Si se registra dentro de un `useEffect`, puede no funcionar en background.

```js
// ✅ Correcto — nivel de módulo
TaskManager.defineTask(LOCATION_TASK_NAME, ({ data, error }) => { ... });

// ❌ Incorrecto — dentro de un componente
useEffect(() => {
  TaskManager.defineTask(...);
}, []);
```

### Plataforma web deshabilitada
No agregar código con `Platform.OS === 'web'` ni imports condicionados a web. El script de inicio termina con error si se intenta correr en web.

### Archivo de entrada correcto
- ✅ Entry point real: `App.js`
- ❌ `App.full.js` es un backup de referencia — no modificar ni importar.

### Compatibilidad de tests (Expo + Jest)
- Mantener `jest` en rama `29.x` cuando el preset sea `jest-expo` 55.x para evitar errores de runtime del entorno de tests.

### Íconos de MaterialCommunityIcons — nombres inválidos frecuentes

| ❌ No existe | ✅ Usar en su lugar |
|---|---|
| `car-sport` | `car-cog`, `car-estate`, `car-hatchback` |

Antes de usar un ícono nuevo, verificar en [materialdesignicons.com](https://materialdesignicons.com) que el nombre exista exactamente como aparece en la librería.

### `expo-print` y `expo-sharing` requieren build nativo

Estos módulos no funcionan con Expo Go. Requieren un build de desarrollo (`eas build --profile development`) o un build de producción. Si se agregan nuevas dependencias con módulos nativos, siempre disparar un nuevo EAS build antes de probar.

### `activeOpacity` no es válida en `Pressable`

Todos los botones del proyecto usan `Pressable`. La prop `activeOpacity` **no existe** en `Pressable` — genera una advertencia silenciosa y no tiene efecto. Usar siempre `style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}` para el feedback visual.

### Compatibilidad iOS — puntos críticos

| Módulo | Comportamiento en iOS |
|---|---|
| `react-native-maps` | Usar **siempre** `provider={PROVIDER_GOOGLE}` en todos los `MapView` del proyecto para consistencia entre plataformas. Sin esto, iOS usa Apple Maps con estilos y API distintos. |
| `expo-speech` | `es-419` puede no estar instalado en todos los dispositivos iOS. El hook `useVoiceNavigation` detecta automáticamente el idioma disponible vía `getAvailableVoicesAsync()` con fallback `es-AR → es-MX → es-419 → es`. |
| Firebase FCM | iOS requiere `GoogleService-Info.plist` y que la app llame `messaging().registerDeviceForRemoteMessages()` antes de `messaging().getToken()`. Ambos ya están implementados en `notifications.js`. |
| Background location | `UIBackgroundModes: [location, fetch, remote-notification, audio]` ya declarados en `app.json`. El task de `expo-task-manager` funciona igual en iOS y Android. |
| Notificaciones | iOS no tiene canales (`setNotificationChannelAsync` es solo Android). El código ya maneja esto con `Platform.OS === 'android'`. |
| Deep links Google Maps | iOS usa `comgooglemaps://` con fallback a `https://maps.google.com`. El fallback se activa automáticamente si Google Maps no está instalado. |
