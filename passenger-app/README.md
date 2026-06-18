# Profesional Pasajero — App móvil de pasajeros

App React Native / Expo para que los pasajeros pidan viajes de remis en Salta Capital. Comparte backend con `driver-app` (Supabase) y `profesional-dashboard` (APIs y OTP por WhatsApp).

**Plataformas:** Android e iOS (build nativo con EAS + expo-dev-client).

---

## Stack

- **Expo ~54** / React Native 0.81
- **Supabase JS v2** — mismo proyecto que el dashboard
- **React Navigation 7** — Stack + Bottom Tabs
- **Zustand 5** — perfil y viaje activo
- **react-native-maps** — Google Maps (Android e iOS)
- **Login OTP** — teléfono + código de 4 dígitos por WhatsApp

---

## Requisitos previos

1. **Node.js** 18+
2. **Cuenta Expo** (`npx eas login`)
3. **Supabase** — ejecutar el SQL de setup (ver abajo)
4. **Google Cloud** — Maps SDK for Android **y** Maps SDK for iOS habilitados para la API key del mapa
5. **iOS** — cuenta Apple Developer para instalar en dispositivo físico o publicar en App Store

---

## Variables de entorno

Copiá `.env.example` a `.env`:

```bash
cp .env.example .env
```

```
SUPABASE_URL=https://xzabzbrolmkezljsyycr.supabase.co
SUPABASE_ANON_KEY=sb_publishable_...
EXPO_PUBLIC_DASHBOARD_URL=https://profesional-dashboard.vercel.app
```

---

## Base de datos (Supabase)

Ejecutá **una vez** en el Editor SQL de Supabase:

```
supabase/passenger_full_setup.sql
```

Incluye políticas RLS, Realtime, tablas OTP (`passenger_otp_codes`, `passenger_auth_sessions`) y push (`passenger_devices`).

Scripts individuales si preferís aplicar por partes:

| Archivo | Uso |
|---|---|
| `passenger_rls_policy.sql` | Solo políticas RLS |
| `passenger_otp_auth.sql` | Solo login OTP |
| `passenger_devices.sql` | Solo tokens push |

---

## Desarrollo local

```bash
cd passenger-app
npm install
npm start
```

> Esta app usa **expo-dev-client** (cliente de desarrollo nativo), no Expo Go puro. Necesitás un build de desarrollo instalado en el celular antes de escanear el QR.

### Android (Windows / Mac / Linux)

```bash
# Build de desarrollo en la nube (recomendado la primera vez)
npm run build:android:dev

# O compilación local si tenés Android Studio
npm run android
```

### iOS

**No se puede compilar iOS localmente desde Windows.** Usá EAS Build en la nube:

```bash
# iPhone / iPad físico (perfil development)
npm run build:ios:dev

# Simulador en Mac (perfil development-simulator)
npm run build:ios:sim
```

Después de instalar el build, conectá el dispositivo a la misma red y ejecutá `npm start` para cargar el bundle JS.

En **Mac** con Xcode también podés usar `npm run ios` tras `npx expo prebuild`.

---

## Builds de producción

```bash
eas build --profile production --platform android
eas build --profile production --platform ios
```

Para publicar en App Store:

```bash
eas submit --platform ios
```

---

## Credenciales iOS (notificaciones push)

1. Subí la clave APNs en EAS: `eas credentials` → iOS → Push Notifications
2. El `GoogleService-Info.plist` ya está configurado en `app.json` para Firebase/FCM en Android
3. En iOS, Expo Push usa APNs a través del servicio de Expo (no hace falta Firebase en la app)

---

## Flujo de la app

1. **Login** — Teléfono argentino (10 dígitos) → código OTP por WhatsApp → sesión guardada localmente
2. **Inicio** — Mapa con ubicación actual
3. **Pedir viaje** — Recogida, destino opcional, notas
4. **Seguimiento** — Estados en tiempo real (Realtime Supabase)
5. **Historial** — Todos los viajes del pasajero
6. **Perfil** — Nombre editable; teléfono verificado (solo lectura)

---

## Estructura

```
passenger-app/
├── App.js
├── app.json              ← Bundle ID iOS/Android, plugins Maps y notificaciones
├── eas.json              ← Perfiles: development, development-simulator, preview, production
├── GoogleService-Info.plist
├── google-services.json
├── src/
│   ├── services/         ← supabase, authService, tripService, notifications
│   ├── stores/           ← authStore, tripStore
│   ├── screens/          ← OnboardingScreen (OTP), Home, ActiveTrip, etc.
│   └── components/
└── supabase/             ← Scripts SQL
```

---

## Diferencias con driver-app

| | driver-app | passenger-app |
|---|---|---|
| Autenticación | Email + contraseña (Supabase Auth) | OTP WhatsApp (API dashboard) |
| Rol | Conductor | Pasajero |
| Mapas | Google Maps | Google Maps (iOS + Android) |
| Build iOS | EAS | EAS (mismo flujo) |

---

## Solución de problemas

| Error | Causa probable |
|---|---|
| `503 Falta configurar base de datos OTP` | No ejecutaste `passenger_otp_auth.sql` o `passenger_full_setup.sql` |
| `404` al enviar código | Dashboard sin desplegar o `EXPO_PUBLIC_DASHBOARD_URL` incorrecta |
| Mapa beige/gris sin calles (Android) | La API key no autoriza `com.remises.passengerapp`. Ejecutá `npm run maps:setup` y agregá el package + SHA-1 en Google Cloud Console (junto a `com.remises.driverapp` si ya existe) |
| Mapa en blanco en iOS | Falta **Maps SDK for iOS** en Google Cloud Console o el bundle ID no está en la restricción de la API key |
| `passenger_devices` no existe | Ejecutá la sección 8 de `passenger_full_setup.sql` |
| No aparece el teclado al tocar OTP/teléfono | Actualizá a la última versión (fix blur+focus) |
