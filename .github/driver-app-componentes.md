# Driver App - Estructura y origen de componentes

Este documento describe todos los componentes ubicados en `driver-app/src/components`, su origen funcional y donde se usan con la ruta de import relativa exacta.

## Arbol de componentes

```text
src/components/
  ErrorBoundary.jsx
  VoiceChatModal.jsx
  driver/
    StatsCard.jsx
    StatusToggle.jsx
  map/
    DriverMarker.jsx
    RoutePolyline.jsx
    TripMap.jsx
  trip/
    NewTripModal.jsx
    TripCard.jsx
    TripStepper.jsx
    TripSummary.jsx
  ui/
    Avatar.jsx
    Badge.jsx
    Button.jsx
    Card.jsx
    EmptyState.jsx
    Skeleton.jsx
```

## Origen funcional por carpeta

- `src/components/`: infraestructura y modales globales.
- `src/components/driver/`: widgets del estado operativo del chofer.
- `src/components/map/`: visualizacion geoespacial y navegacion.
- `src/components/trip/`: flujo de viajes (aceptacion, progreso, resumen).
- `src/components/ui/`: primitives y bloques reutilizables de interfaz.

## Catalogo completo

### 1) Infraestructura global (`src/components`)

#### `ErrorBoundary`
- Ruta: `driver-app/src/components/ErrorBoundary.jsx`
- Que hace: captura errores de render del arbol React y muestra una UI de recuperacion para reintentar.
- Usado por:
  - `driver-app/App.js` -> `import { ErrorBoundary } from './src/components/ErrorBoundary';`
  - `driver-app/App.full.js` -> `import { ErrorBoundary } from './src/components/ErrorBoundary';`

#### `VoiceChatModal`
- Ruta: `driver-app/src/components/VoiceChatModal.jsx`
- Que hace: modal de radio base para listar mensajes de voz y permitir grabar/enviar/reproducir audio.
- Usado por:
  - `driver-app/src/screens/HomeScreen.jsx` -> `import { VoiceChatModal } from '../components/VoiceChatModal';`

### 2) Componentes de conductor (`src/components/driver`)

#### `StatsCard`
- Ruta: `driver-app/src/components/driver/StatsCard.jsx`
- Que hace: tarjeta estadistica animada para metricas del chofer (valor + etiqueta + icono).
- Usado por:
  - `driver-app/src/screens/HomeScreen.old.jsx` -> `import { StatsCard } from '../components/driver/StatsCard';`

#### `StatusToggle`
- Ruta: `driver-app/src/components/driver/StatusToggle.jsx`
- Que hace: switch visual online/offline, persiste estado en Supabase y notifica feedback al usuario.
- Usado por:
  - `driver-app/src/screens/HomeScreen.old.jsx` -> `import { StatusToggle } from '../components/driver/StatusToggle';`

### 3) Componentes de mapa (`src/components/map`)

#### `DriverMarker`
- Ruta: `driver-app/src/components/map/DriverMarker.jsx`
- Que hace: marcador visual del chofer con icono de auto y anillo de realce.
- Usado por:
  - Sin imports directos detectados actualmente en driver-app.

#### `RoutePolyline`
- Ruta: `driver-app/src/components/map/RoutePolyline.jsx`
- Que hace: consulta direcciones, decodifica la polyline y la dibuja en el mapa.
- Usado por:
  - Sin imports directos detectados actualmente en driver-app.

#### `TripMap`
- Ruta: `driver-app/src/components/map/TripMap.jsx`
- Que hace: mapa principal del viaje con marcadores, ruta restante, foco de camara y modo navegacion.
- Usado por:
  - `driver-app/src/screens/ActiveTripScreen.jsx` -> `import { TripMap } from '../components/map/TripMap';`

### 4) Componentes del flujo de viaje (`src/components/trip`)

#### `NewTripModal`
- Ruta: `driver-app/src/components/trip/NewTripModal.jsx`
- Que hace: modal de viaje entrante con cuenta regresiva, detalle de recorrido y acciones de aceptar/rechazar.
- Usado por:
  - `driver-app/src/screens/HomeScreen.jsx` -> `import { NewTripModal } from '../components/trip/NewTripModal';`
  - `driver-app/src/screens/HomeScreen.old.jsx` -> `import { NewTripModal } from '../components/trip/NewTripModal';`

#### `TripCard`
- Ruta: `driver-app/src/components/trip/TripCard.jsx`
- Que hace: tarjeta resumida de viaje historico con estado, trayecto y metrica de precio/tiempo.
- Usado por:
  - `driver-app/src/screens/HomeScreen.old.jsx` -> `import { TripCard } from '../components/trip/TripCard';`

#### `TripStepper`
- Ruta: `driver-app/src/components/trip/TripStepper.jsx`
- Que hace: indicador visual por pasos para el estado del viaje en curso.
- Usado por:
  - Sin imports directos detectados actualmente en driver-app.

#### `TripSummary`
- Ruta: `driver-app/src/components/trip/TripSummary.jsx`
- Que hace: resumen final de viaje completado con ruta y metricas destacadas.
- Usado por:
  - Sin imports directos detectados actualmente en driver-app.

### 5) Componentes UI reutilizables (`src/components/ui`)

#### `Avatar`
- Ruta: `driver-app/src/components/ui/Avatar.jsx`
- Que hace: avatar con foto o iniciales, con opcion de indicador online/offline.
- Usado por:
  - `driver-app/src/screens/HomeScreen.old.jsx` -> `import { Avatar } from '../components/ui/Avatar';`
  - `driver-app/src/screens/OwnerDashboardScreen.jsx` -> `import { Avatar } from '../components/ui/Avatar';`
  - `driver-app/src/screens/OwnerDriverDetailScreen.jsx` -> `import { Avatar } from '../components/ui/Avatar';`
  - `driver-app/src/screens/ProfileScreen.jsx` -> `import { Avatar } from '../components/ui/Avatar';`

#### `Badge`
- Ruta: `driver-app/src/components/ui/Badge.jsx`
- Que hace: etiqueta de estado configurable (texto, color y tamano).
- Usado por:
  - `driver-app/src/components/trip/TripCard.jsx` -> `import { Badge } from '../ui/Badge';`
  - `driver-app/src/screens/ProfileScreen.jsx` -> `import { Badge } from '../components/ui/Badge';`
  - `driver-app/src/screens/TripDetailScreen.jsx` -> `import { Badge } from '../components/ui/Badge';`

#### `Button`
- Ruta: `driver-app/src/components/ui/Button.jsx`
- Que hace: boton reusable con variantes, gradientes, haptics y estado loading.
- Usado por:
  - Sin imports directos detectados actualmente en driver-app.

#### `Card`
- Ruta: `driver-app/src/components/ui/Card.jsx`
- Que hace: contenedor base con estilo uniforme (fondo, borde, radio y sombra).
- Usado por:
  - `driver-app/src/components/trip/TripCard.jsx` -> `import { Card } from '../ui/Card';`
  - `driver-app/src/components/trip/TripSummary.jsx` -> `import { Card } from '../ui/Card';`
  - `driver-app/src/screens/HomeScreen.old.jsx` -> `import { Card } from '../components/ui/Card';`

#### `EmptyState`
- Ruta: `driver-app/src/components/ui/EmptyState.jsx`
- Que hace: pantalla vacia con icono, titulo y mensaje para ausencia de datos.
- Usado por:
  - Sin imports directos detectados actualmente en driver-app.

#### `Skeleton`
- Ruta: `driver-app/src/components/ui/Skeleton.jsx`
- Que hace: placeholders animados para estados de carga en varios formatos.
- Usado por:
  - `driver-app/src/screens/HomeScreen.old.jsx` -> `import { Skeleton } from '../components/ui/Skeleton';`

## Nota de mantenimiento

Cuando se cree un componente nuevo en `src/components`, actualizar este archivo y agregar el encabezado de documentacion en el propio archivo del componente.
