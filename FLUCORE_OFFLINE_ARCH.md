# FLUCORE — Arquitectura Offline-First
**Versión:** 1.0  
**Fecha:** Abr 2026  
**Impacto:** Cambio estructural que afecta frontend, backend, schema y protocolo de sincronización.

---

## 1. POR QUÉ OFFLINE-FIRST CAMBIA TODO

Un taller de servicio técnico biomédico opera en condiciones reales:
- Red Wi-Fi inestable en zonas de trabajo
- Tablets de técnicos sin conexión celular
- Pérdida de datos = pérdida de horas de trabajo del técnico
- El sistema **no puede ser rehén de la conectividad**

La arquitectura estándar (online-required) falla en este escenario. La arquitectura offline-first **invierte el modelo**: el sistema funciona siempre localmente y sincroniza con el servidor **cuando puede**, no **cuando debe**.

---

## 2. MODELO MENTAL — "Local-First, Sync-Second"

```
ANTES (arquitectura reactiva):
  Acción del técnico → esperar respuesta del servidor → continuar

AHORA (arquitectura offline-first):
  Acción del técnico → guardar localmente (inmediato) → sincronizar cuando hay red
                                              ↑
                                    invisible para el usuario
```

---

## 3. QUÉ FUNCIONA SIN INTERNET (por proceso)

| Proceso | Offline OK | Requiere red |
|---------|-----------|-------------|
| Crear FUI (ingreso de equipo) | ✅ Provisional local | Solo para sync final |
| Ver lista de tickets asignados | ✅ Desde cache local | Actualización inicial |
| Completar diagnóstico 39 puntos | ✅ Auto-save local | Solo para sync |
| Exportar informe PDF manual | ✅ @react-pdf/renderer en browser | — |
| Avance de OT (reparación) | ✅ Local | Solo para sync |
| Cambio de estado de ticket | ✅ Local con cola | Sync automático al reconectar |
| Generar informe con IA (Claude) | ❌ Requiere red | Claude API remota |
| Kanban en tiempo real | ❌ Requiere red | Supabase Realtime |
| Cotización (aprobación cliente) | ❌ Requiere red | Flujo de negocio |
| Login inicial | ❌ Requiere red | Supabase Auth |
| Login con sesión cacheada | ✅ JWT en cache | — |

---

## 4. DECISIONES TÉCNICAS DEFINITIVAS

### 4.1 PDF → FRONTEND (`@react-pdf/renderer`) ✅
El único enfoque que funciona offline. El PDF se genera desde IndexedDB sin servidor.

### 4.2 Deploy backend Hono → Railway ✅
Railway.app Starter ~$5/mes. Zero-config Node.js, auto-deploy desde Git.

### 4.3 Almacenamiento local → Dexie.js v4 ✅
Wrapper más ergonómico de IndexedDB. API TypeScript nativa, queries complejas, sin límite práctico de almacenamiento.

### 4.4 Cola de sincronización → Custom FIFO en IndexedDB ✅
La lógica de FluCore requiere control de conflictos específico del dominio (ticket_number provisional → real).

### 4.5 Service Worker → next-pwa (Workbox) ✅
Precache de assets estáticos + Runtime cache + Background Sync para la cola de escrituras.

### 4.6 Detección de red → Navigator.onLine + EventListeners ✅
Hook `useNetworkStatus` universal — compatible con iOS Safari.

---

## 5. SCHEMA DE INDEXEDDB (Dexie)

### Tablas locales

```typescript
// LocalTicket — espejo de la tabla tickets con campos de control offline
interface LocalTicket {
  id: string                    // UUID generado client-side (crypto.randomUUID())
  ticket_number: string         // 'OFFLINE-20260501-001' → 'MED-2026-0047' al sincronizar
  equipment_id: string
  status: TicketStatus
  diagnostic_data: Record<string, unknown>
  sync_status: 'synced' | 'pending' | 'conflict' | 'failed'
  _provisional: boolean         // true = aún no confirmado por el servidor
  _client_updated_at: string    // Para resolución de conflictos
  // ... resto de campos del schema
}

// SyncQueueItem — operaciones pendientes de enviar al servidor
interface SyncQueueItem {
  id: string                    // UUID local de la operación
  operation: SyncOperation
  entity_type: 'ticket' | 'equipment' | 'ot_progress'
  entity_id: string
  payload: unknown
  http_method: 'POST' | 'PATCH' | 'PUT'
  endpoint: string              // '/api/v1/tickets' o '/api/v1/tickets/:entity_id/diagnostic'
  created_at: string
  retry_count: number           // 0 a 5
  status: 'pending' | 'syncing' | 'failed' | 'completed'
  error: string | null
}
```

### Operaciones de la cola

```typescript
type SyncOperation =
  | 'CREATE_TICKET'
  | 'UPDATE_DIAGNOSTIC'
  | 'CHANGE_TICKET_STATUS'
  | 'CREATE_EQUIPMENT'
  | 'UPDATE_OT_PROGRESS'
  | 'UPLOAD_PHOTO_METADATA'
```

---

## 6. FLUJO COMPLETO — FUI OFFLINE

```
TÉCNICO (sin Wi-Fi)
       │
       ▼
1. Abre /tickets/new
   → App sirve desde cache del Service Worker
   → Dropdowns cargan desde IndexedDB (cache local de clients, branches, device_models)
       │
       ▼
2. Técnico ingresa datos → presiona "Crear FUI"
   → crypto.randomUUID() genera el ID client-side
   → ticket_number provisional: OFFLINE-20260501-001
   → Guardado en IndexedDB inmediatamente (_provisional: true)
   → Encolado en SyncQueue: { operation: 'CREATE_TICKET', payload: {...} }
   → UI muestra: "FUI creada (pendiente sincronización ☁)"
       │
       ▼
3. Wi-Fi vuelve → useNetworkStatus detecta 'online'
   → SyncEngine.processQueue() se ejecuta automáticamente (debounce 2s)
       │
       ▼
4. Sync de CREATE_TICKET
   → POST /api/v1/tickets con el payload
   → Trigger SQL genera ticket_number real: MED-2026-0047
   → Cliente actualiza IndexedDB: ticket_number, _provisional: false, sync_status: 'synced'
   → UI actualiza el número visible (reactivo via useLiveQuery de Dexie)
```

---

## 7. FLUJO COMPLETO — DIAGNÓSTICO OFFLINE

```
TÉCNICO (tablet, sin Wi-Fi)
       │
       ▼
1. Abre ticket asignado → datos desde IndexedDB (cache local)
       │
       ▼
2. Completa pasos del checklist
   → Auto-save (debounce 2s):
       * PRIMERO: guarda en IndexedDB (siempre)
       * Si hay red: también PATCH /api/v1/tickets/:id/diagnostic
       * Si no hay red: encola UPDATE_DIAGNOSTIC en SyncQueue
   → Indicador: "Guardado localmente ✓" vs "Guardado en servidor ✓"
       │
       ▼
3. Técnico completa todos los 39 puntos
   → "Enviar a Revisión" → CHANGE_TICKET_STATUS → PENDIENTE_REVISION
   → Si hay red: sync inmediato
   → Si no hay red: encola + UI muestra "Estado actualizado localmente"
       │
       ▼
4. EXPORTAR INFORME MANUAL (sin IA, sin red)
   → @react-pdf/renderer toma LocalTicket.diagnostic_data
   → Genera PDF en el browser → descarga como {ticket_number}_informe.pdf
   → Se puede copiar a pendrive
   (Este informe es provisional — la IA lo completa cuando haya red)
```

---

## 8. MANEJO DE CONFLICTOS — Last-Write-Wins

**Estrategia:** El campo `_client_updated_at` permite al servidor detectar conflictos.

```typescript
// En el sync handler del backend (Hono):
// Si DB.updated_at > payload._client_updated_at → conflicto → el servidor gana
// Si payload._client_updated_at > DB.updated_at → el cliente gana → aplicar cambio

// Payload de sync siempre incluye:
{ ...datos, _client_updated_at: "2026-05-01T10:30:00Z" }
```

**Casos de conflicto imposibles por diseño:**
- Diagnóstico: Solo el técnico asignado puede editarlo
- Transiciones de estado: máquina lineal → sin colisión
- Creación de FUI: UUID client-side → sin colisión posible

---

## 9. COLA DE SINCRONIZACIÓN — ALGORITMO

```
processQueue():
  1. Obtener items con status='pending', ordenados por created_at ASC (FIFO)
  2. Para cada item:
     a. Respetar backoff: si retry_count > 0, verificar que ya pasó el tiempo de espera
     b. Marcar como 'syncing'
     c. Ejecutar request HTTP con header X-Flucore-Offline-Sync: true
     d. Si éxito (2xx):
        - Marcar como 'completed'
        - Aplicar respuesta al IndexedDB (reemplazar ticket_number provisional, etc.)
     e. Si error 4xx (error permanente de negocio):
        - Marcar como 'failed' (requiere intervención manual)
        - Continuar con el siguiente item
     f. Si error 5xx o de red (temporal):
        - Incrementar retry_count
        - Si retry_count >= 5: marcar como 'failed'
        - Si retry_count < 5: backoff exponencial (1m, 2m, 4m, 8m, 16m)
  3. Emitir evento de estado actualizado a la UI
```

---

## 10. INDICADORES DE ESTADO EN LA UI

```typescript
type SyncUIState =
  | 'online_synced'       // ✅ Verde — todo sincronizado
  | 'online_syncing'      // 🔄 Azul pulsando — procesando cola
  | 'online_sync_error'   // ⚠️ Amarillo — algo falló, reintentando
  | 'offline_pending'     // ☁ Gris — sin red, N operaciones pendientes
  | 'offline_no_pending'  // Sin indicador — funciona normal offline

// Componente <SyncStatusBar /> en el header del layout protegido
// Solo visible cuando NO está en 'online_synced'
```

---

## 11. CACHE DE REFERENCIA

| Datos | Frecuencia de actualización |
|-------|---------------------------|
| `device_models` | Al login + cada 24h |
| `clients` + `branches` | Al login + cada 1h |
| `profiles` del tenant | Al login + cada 30min |
| Tickets asignados | Al login + cada 5min (Background Sync) |

**Estrategia:** Stale-While-Revalidate — mostrar cache inmediato, actualizar en background.

---

## 12. SERVICE WORKER (next-pwa / Workbox)

```javascript
// PRECACHE: assets estáticos de _next/static/ + página /offline (fallback)

// RUNTIME:
// Páginas app: NetworkFirst con fallback a cache (1h TTL)
// Datos referencia (Supabase): StaleWhileRevalidate
// Mutaciones (Hono API): NetworkOnly + BackgroundSync si falla
```

---

## 13. CAMBIOS EN EL SCHEMA SQL

Mínimos — el schema existente es compatible. Migración `003_offline_sync_support.sql`:
- Trigger `generate_ticket_number` modificado para respetar números `OFFLINE-` del cliente
- Columna `_client_updated_at TIMESTAMPTZ` en `tickets`
- Columna `sync_origin ENUM('online','offline_sync')` en `tickets`
- Índice parcial para detectar tickets provisionales

---

## 14. PAQUETE @flucore/offline

```
packages/offline/src/
  types.ts                    → LocalTicket, SyncQueueItem, SyncOperation, SyncUIState
  db.ts                       → Dexie schema + helpers (generateProvisionalTicketNumber, hydrateReferenceCache)
  sync-queue.ts               → enqueue, getPendingItems, markAsSyncing, markAsCompleted, backoff
  sync-engine.ts              → initSyncEngine, processQueue, onSyncStats (eventos para UI)
  index.ts                    → Exports públicos del paquete
  hooks/
    use-network-status.ts     → isOnline, isOffline, offlineSince, justReconnected
    use-sync-status.ts        → stats (state, pending, failed), retryAll, syncNow
    use-offline-ticket.ts     → createTicket, updateDiagnostic, changeStatus (local-first)
```

---

## 15. IMPACTO EN EL PLAN DE DESARROLLO

### Sprint 1 — agregar:
- **Tarea 1.4:** Configurar `next-pwa` en `/apps/web`
- **Tarea 1.5:** Inicializar `@flucore/offline` + hidratación de cache al login

### Sprint 2 — cambios en implementación:
- **Prompt #8 (Tickets):** Implementar con `useOfflineTicket` (ya no fetch directo)
- **Prompt #10 (Checklist):** Auto-save → IndexedDB primero, luego HTTP
- **Prompt #12 (Kanban):** Initial state desde IndexedDB, Realtime solo si hay red

---

*Documento: FluCore Offline Architecture v1.0 — Abr 2026*
