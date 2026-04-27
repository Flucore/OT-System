# FLUCORE AI CONTEXT — Documento Maestro para Agentes IA
**Versión:** 2.3 (Offline-First + Railway deploy + PDF frontend + @flucore/offline)
**Uso:** Adjuntar a TODA conversación con Claude Code, Cursor, MCP tools o cualquier agente IA.
**Regla de Oro:** Este documento tiene precedencia sobre cualquier suposición del agente. Si hay ambigüedad, preguntar antes de asumir.

---

## 1. CONTEXTO DE NEGOCIO

**Cliente:** Medplan — empresa biomédica chilena especializada en servicio técnico de endoscopía (Olympus, Fuji, Pentax). Repara, arrienda y comercializa endoscopios refaccionados como alternativa a los representantes oficiales.

**Problema que resuelve FluCore:**
- Ingresos y diagnósticos en papel / Excel / WhatsApp → cero trazabilidad
- Sin historial por número de serie
- Dos fuentes de repuestos desconectadas: "Kame" (ERP, piezas nuevas) y "Desarme" (canibalización de equipos viejos)
- Supervisor pierde horas transcribiendo reportes en vez de gestionar producción

**Usuarios del sistema:**

| Rol | `user_role` ENUM | Puede hacer |
|---|---|---|
| Administrador | `admin` | Control total del tenant |
| Gerente | `manager` | Control total operacional, BI, reportes |
| Supervisor | `supervisor` | Crear FUI, aprobar informes, aprobar cotizaciones, descargar docs, cerrar OT, cambiar estados, asignar técnicos |
| Técnico de Diagnóstico | `diag_tech` | Completar formulario dinámico de diagnóstico (39 puntos) |
| Técnico de Reparación | `repair_tech` | Completar OT: repuestos, tareas, comentarios, fotos, checklist de cierre |

**Hardware en producción:**
- 3 computadores: supervisores / gerencia
- 2 tablets: técnicos de diagnóstico
- 1 computador: técnico de reparación
- 1 computador: administración del sistema
- 3 pantallas TV: dashboards en tiempo real (estados de proceso, sin login requerido)

---

## 2. STACK TECNOLÓGICO (RESTRICCIONES ESTRICTAS)

> ❌ No instalar librerías externas sin justificación explícita.
> ❌ Prohibido JavaScript puro. Solo TypeScript con tipado estricto (`"strict": true`).
> ❌ No crear microservicios separados en la fase inicial.

| Capa | Tecnología | Notas |
|---|---|---|
| **Lenguaje** | TypeScript strict | Frontend y backend |
| **Frontend** | Next.js 14+ (App Router) | Deploy en Vercel |
| **Backend** | Hono (Node.js) | API REST. Elegido por ser nativo TS y liviano. No Express. |
| **Base de datos** | PostgreSQL 15+ vía Supabase | Motor principal |
| **Auth** | Supabase Auth + JWT | `tenant_id` y `role` en claims |
| **Storage** | Supabase Storage | Un solo bucket: `flucore-vault` |
| **Infraestructura** | Cloudflare | DNS, WAF |
| **Deploy backend** | Railway.app | ~$5/mes, Node.js, zero-config ✅ DECIDIDO |
| **Offline** | Dexie (IndexedDB) + next-pwa | Local-First, sync queue FIFO, PWA ✅ DECIDIDO |
| **PDF** | `@react-pdf/renderer` (frontend) | Funciona offline, no pasa por Hono ✅ DECIDIDO |
| **Monorepo** | `/apps/web` + `/apps/api` + `/packages/offline` | Sin Turborepo en fase inicial |

**Variables de entorno (`.env.example`):**
```env
# Supabase — compartidas
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=   # NUNCA exponer al cliente browser

# Solo en el backend (Hono API)
DATABASE_URL=
ANTHROPIC_API_KEY=

# Solo en el frontend (Next.js) — prefijo NEXT_PUBLIC_ = seguro exponerlo
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_API_URL=          # URL del backend Hono
```

---

## 3. ARQUITECTURA — MONOLITO MODULAR

**Estructura de carpetas del repositorio:**
```
/flucore
  /apps
    /web              → Next.js frontend
      /app            → App Router pages y layouts
      /components     → Componentes React reutilizables
      /lib
        /supabase     → Clientes Supabase (server.ts y client.ts — ver sección 4)
        /api          → Funciones para llamar a Hono API
    /api              → Hono backend
      /src
        /modules
          /iam        → Auth, tenants, perfiles, roles
          /tickets    → FUI, OT, estados, logs
          /equipment  → Equipos, modelos, QR
          /clients    → Clientes y sucursales
          /inventory  → Repuestos Kame + Desarme
          /quotations → Cotizaciones
          /ai-agents  → Integración LLM (informes)
          /dashboard  → Métricas y BI
        /middleware   → Auth, error handler, logging
        /shared       → Types compartidos dentro del backend
  /packages
    /types            → Interfaces TypeScript compartidas frontend-backend
    /utils            → Helpers compartidos
  /supabase
    /migrations       → SQL versionado (001_core_schema.sql, etc.)
    /seed             → Datos iniciales
```

**Regla de dependencia entre módulos:**
Un módulo del backend NO puede importar directamente desde otro módulo. La comunicación es a través de interfaces en `/packages/types`. Esto permite extraer cualquier módulo como microservicio en el futuro sin reescribir.

**Principios de código:**
1. API-First: Toda respuesta del backend es JSON estructurado con el formato estándar de la sección 8.
2. Soft delete siempre: Nunca `DELETE` en tablas transaccionales. Usar `deleted_at TIMESTAMPTZ`.
3. Auditoría obligatoria: Todo cambio de estado en tickets se registra en `ticket_logs`.
4. Cero credenciales hardcodeadas.
5. Middleware global de errores en Hono que captura todos los errores no controlados.

---

## 4. PATRÓN DE COMUNICACIÓN FRONTEND-BACKEND (CQRS-LITE)

Esta es la regla arquitectónica más importante del proyecto. Toda generación de código debe respetarla.

### La regla simple:

| Operación | Canal | Por qué |
|---|---|---|
| `GET` — leer datos para mostrar | Supabase client directo desde Next.js | Rápido, RLS garantiza seguridad, evita escribir docenas de endpoints GET |
| `POST / PATCH / PUT` — mutar estado | Hono API (`/api/v1/...`) | Permite validar permisos, registrar en `ticket_logs`, orquestar efectos secundarios (IA, notificaciones) |
| Upload de archivos | Supabase Storage SDK desde el cliente | Los archivos binarios NO deben pasar por Hono — es innecesario y lento |

### Detalle crítico — dos clientes Supabase, NO uno:

```typescript
// /apps/web/lib/supabase/server.ts
// Para React Server Components, Route Handlers y Server Actions
// Usa cookies de la sesión del usuario. NUNCA exponer SERVICE_ROLE_KEY aquí.
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function createSupabaseServerClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, // ANON KEY — el RLS protege
    { cookies: { get: (n) => cookieStore.get(n)?.value } }
  )
}
```

```typescript
// /apps/web/lib/supabase/client.ts
// Para Client Components ('use client') — solo ANON KEY, nunca SERVICE_ROLE_KEY
import { createBrowserClient } from '@supabase/ssr'

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

> ❌ NUNCA usar `SUPABASE_SERVICE_ROLE_KEY` en archivos que tengan `'use client'` o en variables `NEXT_PUBLIC_*`.
> ❌ NUNCA crear un único cliente Supabase global compartido entre server y client.
> ✅ El SERVICE_ROLE_KEY se usa SOLO en el backend Hono para operaciones que requieren bypassear RLS (ej: crear el perfil inicial de un usuario nuevo).

### Ejemplo de lectura correcta (Server Component):

```typescript
// /apps/web/app/tickets/page.tsx — Server Component (por defecto en App Router)
import { createSupabaseServerClient } from '@/lib/supabase/server'

export default async function TicketsPage() {
  const supabase = createSupabaseServerClient()
  const { data: tickets } = await supabase
    .from('tickets')
    .select('id, ticket_number, status, equipment(serial_number, device_models(brand, model_name))')
    .order('created_at', { ascending: false })
  // RLS aplica automáticamente — el usuario solo ve sus tickets
  return <TicketList tickets={tickets} />
}
```

### Ejemplo de escritura correcta (Command → Hono):

```typescript
// /apps/web/lib/api/tickets.ts
export async function approveReport(ticketId: string, finalReport: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/tickets/${ticketId}/approve-report`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ai_report_final: finalReport }),
    credentials: 'include' // envía cookie de sesión para auth en Hono
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}
```

```typescript
// /apps/api/src/modules/tickets/handlers/approve-report.handler.ts
// Hono valida el rol, actualiza estado, registra en ticket_logs, llama a IA si aplica
export const approveReportHandler = async (c: Context) => {
  const user = c.get('user') // inyectado por auth middleware
  if (user.role !== 'supervisor' && user.role !== 'manager') {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Solo supervisores pueden aprobar informes' } }, 403)
  }
  // ... lógica de negocio
}
```

### Regla para uploads de archivos:

```typescript
// Upload desde Client Component — directo a Supabase Storage, SIN pasar por Hono
const supabase = createSupabaseBrowserClient()
const path = `${user.tenant_id}/tickets/${ticketId}/photos/${Date.now()}_${file.name}`
const { error } = await supabase.storage.from('flucore-vault').upload(path, file)
// Luego registrar el path en la DB vía Hono (POST /api/v1/tickets/:id/photos)
```

---

## 5. ALMACENAMIENTO — SUPABASE STORAGE

**Bucket único:** `flucore-vault` (privado — requiere token de sesión válido para acceder).

**Estructura de paths (regla estricta):**
```
{tenant_id} / {modulo} / {entidad_id} / {tipo} / {timestamp}_{filename}
```

**Ejemplos para Medplan:**
```
{tenant_id}/tickets/{ticket_id}/photos/1704067200000_frente.jpg
{tenant_id}/tickets/{ticket_id}/photos/1704067201000_detalle_cabezal.jpg
{tenant_id}/tickets/{ticket_id}/reports/informe_tecnico_v1.pdf
{tenant_id}/quotations/{quotation_id}/document/cotizacion_redsalud.pdf
{tenant_id}/quotations/{quotation_id}/purchase_orders/oc_redsalud_2025.pdf
```

**Política RLS de Storage (una sola regla cubre todo):**
```sql
-- El usuario solo puede acceder a archivos dentro de su tenant_id
CREATE POLICY "tenant_storage_isolation" ON storage.objects
  FOR ALL USING (
    bucket_id = 'flucore-vault'
    AND (storage.foldername(name))[1] = (auth.jwt() ->> 'tenant_id')
  );
```

**Regla para Claude Code:** Al generar código de upload, SIEMPRE construir el path con la función helper:
```typescript
// /packages/utils/storage-path.ts
export function buildStoragePath(
  tenantId: string,
  module: 'tickets' | 'quotations',
  entityId: string,
  type: 'photos' | 'reports' | 'purchase_orders' | 'document',
  filename: string
): string {
  const timestamp = Date.now()
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  return `${tenantId}/${module}/${entityId}/${type}/${timestamp}_${sanitized}`
}
```

---

## 6. BASE DE DATOS — ESQUEMA (MVP v2.1)

### ENUMs

```sql
CREATE TYPE user_role AS ENUM (
  'admin', 'manager', 'supervisor', 'diag_tech', 'repair_tech'
);

CREATE TYPE ticket_status AS ENUM (
  'INGRESADO',           -- FUI creada, equipo recibido físicamente
  'EN_DIAGNOSTICO',      -- Técnico llenando los 39 puntos
  'PENDIENTE_REVISION',  -- Diagnóstico completo, esperando supervisor
  'INFORME_APROBADO',    -- Supervisor aprobó informe IA
  'COTIZADO',            -- Cotización generada
  'ESPERANDO_CLIENTE',   -- Esperando aprobación del cliente
  'OT_GENERADA',         -- Cliente aprobó, OT asignada a repair_tech
  'EN_REPARACION',       -- Técnico reparando
  'ESPERANDO_REPUESTO',  -- OT detenida por falta de stock
  'CONTROL_CALIDAD',     -- Inspección final por supervisor
  'CERRADA',             -- Equipo listo para despacho
  'CANCELADA'            -- Con motivo obligatorio en ticket_logs
);

CREATE TYPE inventory_source AS ENUM ('KAME_NEW', 'DISASSEMBLY_RECYCLED');
CREATE TYPE ot_assignment_type AS ENUM ('SIN_OC', 'CON_OC');
CREATE TYPE ticket_photo_phase AS ENUM ('DIAGNOSTICO', 'REPARACION');
```

### Tablas principales

Ver archivo `001_core_schema.sql` para el DDL completo. Resumen de entidades:

| Tabla | Propósito |
|---|---|
| `tenants` | Empresas cliente de FluCore (ej: Medplan) |
| `profiles` | Personal del tenant, vinculado a `auth.users` |
| `clients` | Holdings clientes de Medplan (ej: RedSalud) |
| `branches` | Sucursales físicas con RUT propio de facturación |
| `device_models` | Catálogo de marcas/modelos de endoscopios |
| `equipment` | Equipos individuales con N° de serie y QR único |
| `tickets` | Entidad central: FUI + OT en un solo registro |
| `ticket_logs` | Auditoría inmutable. NUNCA hacer DELETE/UPDATE aquí |
| `ticket_photos` | Fotos de diagnóstico y reparación (paths en Storage) |
| `quotations` | Cotizaciones generadas por ticket |
| `inventory_items` | Repuestos Kame (nuevos) y Desarme (reciclados) |
| `ticket_parts` | Repuestos usados en una OT, precio congelado al cotizar |

### Estructura JSONB — `diagnostic_data` (Los 39 Pasos)

Ver sección completa en el documento previo (v2.1). Resumen del contrato:

```typescript
// /packages/types/diagnostic.ts
export interface DiagnosticStep {
  status: 'OK' | 'NO_CRITICO' | 'CRITICO' | 'PEDIDO_USUARIO' | 'NO_APLICA'
  details?: string[]      // checkboxes del formulario
  value?: number | number[] // valores numéricos (MΩ, %, ángulos U/D/R/L)
  comments?: string
}

export interface DiagnosticData {
  step_01_exera_id: DiagnosticStep
  step_02_imagen_evis: DiagnosticStep
  // ... hasta step_39_reparacion_no_standard
  _metadata: {
    form_version: string
    completed_at: string | null
    completed_by_tech_id: string | null
  }
}
```

---

## 7. FLUJO DE ESTADOS (MÁQUINA DE ESTADOS)

```
INGRESADO
  └─► EN_DIAGNOSTICO       [supervisor asigna diag_tech]
        └─► PENDIENTE_REVISION  [diag_tech completa 39 puntos]
              └─► INFORME_APROBADO  [supervisor aprueba borrador IA]
                    └─► COTIZADO      [sistema genera cotización PDF]
                          └─► ESPERANDO_CLIENTE
                                ├─► OT_GENERADA   [cliente aprueba]
                                │     └─► EN_REPARACION
                                │           ├─► ESPERANDO_REPUESTO
                                │           │     └─► EN_REPARACION
                                │           └─► CONTROL_CALIDAD
                                │                 └─► CERRADA
                                └─► CANCELADA    [cliente rechaza]

Cualquier estado → CANCELADA  [motivo obligatorio en ticket_logs.notes]
```

**Transiciones válidas por rol (validar en Hono, no en el frontend):**

| De → A | Quién puede |
|---|---|
| `INGRESADO` → `EN_DIAGNOSTICO` | `supervisor`, `manager`, `admin` |
| `EN_DIAGNOSTICO` → `PENDIENTE_REVISION` | `diag_tech`, `supervisor` |
| `PENDIENTE_REVISION` → `INFORME_APROBADO` | `supervisor`, `manager` |
| `INFORME_APROBADO` → `COTIZADO` | Sistema automático (trigger post-aprobación) |
| `COTIZADO` → `ESPERANDO_CLIENTE` | `supervisor`, `manager` |
| `ESPERANDO_CLIENTE` → `OT_GENERADA` | `supervisor`, `manager` |
| `OT_GENERADA` → `EN_REPARACION` | `supervisor`, `manager` |
| `EN_REPARACION` → `ESPERANDO_REPUESTO` | `repair_tech`, `supervisor` |
| `EN_REPARACION` → `CONTROL_CALIDAD` | `repair_tech`, `supervisor` |
| `CONTROL_CALIDAD` → `CERRADA` | `supervisor`, `manager` |
| Cualquiera → `CANCELADA` | `supervisor`, `manager`, `admin` |

---

## 8. MÓDULO IA — AGENTE DE INFORMES

**Ubicación:** `/apps/api/src/modules/ai-agents/`
**Principio:** El módulo es intercambiable. Solo se modifica `provider.ts` para cambiar de Claude a OpenAI o Llama sin tocar la lógica de negocio.

**Endpoint:** `POST /api/v1/tickets/:id/generate-report`

**Flujo:**
1. Hono valida que el ticket esté en estado `PENDIENTE_REVISION`
2. Hono valida que el usuario sea `supervisor` o `manager`
3. El módulo `ai-agents` recibe el `diagnostic_data` del ticket
4. Llama a Claude API con el system prompt de endoscopía
5. Guarda el borrador en `tickets.ai_report_draft`
6. Cambia estado a (sigue en `PENDIENTE_REVISION` hasta aprobación manual)
7. Registra en `ticket_logs`

**System prompt base para el agente:**
```
Eres un experto técnico en endoscopía médica con 15 años de experiencia en servicio técnico de equipos Olympus, Fuji y Pentax.

Tu tarea es generar un informe técnico de diagnóstico profesional en español basado en los resultados del formulario de inspección de 39 puntos completado por el técnico.

El informe debe:
1. Comenzar con un resumen ejecutivo del estado general del equipo (1 párrafo)
2. Listar las fallas CRÍTICAS con descripción técnica detallada y recomendación de acción
3. Listar las fallas NO CRÍTICAS ordenadas por prioridad
4. Indicar los puntos sin novedad (OK) de forma resumida
5. Concluir con las reparaciones recomendadas en orden de prioridad e impacto en funcionalidad

Restricciones:
- Usar terminología técnica estándar de endoscopía flexible
- NO inventar información que no esté en los datos del formulario
- Formato profesional apto para ser presentado al cliente
- Idioma: español de Chile
```

---

## 9. POLÍTICAS RLS

> ❌ NUNCA usar `FOR ALL` — es demasiado permisivo. Permite INSERT/UPDATE sin control de `WITH CHECK`.
> ✅ Siempre separar por operación: SELECT / INSERT / UPDATE / DELETE.
> ✅ El `SERVICE_ROLE_KEY` del backend Hono bypasea RLS por diseño de Supabase — `WITH CHECK (false)` solo bloquea al cliente browser.

**Patrón estándar para tablas operacionales:**

```sql
ALTER TABLE [tabla] ENABLE ROW LEVEL SECURITY;

CREATE POLICY "[tabla]_select" ON [tabla]
  FOR SELECT USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

CREATE POLICY "[tabla]_insert" ON [tabla]
  FOR INSERT WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

CREATE POLICY "[tabla]_update" ON [tabla]
  FOR UPDATE USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- Soft delete: nunca DELETE real en tablas transaccionales
CREATE POLICY "[tabla]_no_delete" ON [tabla]
  FOR DELETE USING (false);
```

**Tablas con restricciones especiales:**

```sql
-- tenants: usuarios solo ven su propio tenant, nunca mutan desde el cliente
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenants_select" ON tenants
  FOR SELECT USING (id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "tenants_no_insert" ON tenants FOR INSERT WITH CHECK (false);
CREATE POLICY "tenants_no_update" ON tenants FOR UPDATE USING (false);
CREATE POLICY "tenants_no_delete" ON tenants FOR DELETE USING (false);

-- profiles: visibilidad por rol + INSERT bloqueado (crea el backend con service role)
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    AND (
      id = auth.uid()
      OR (auth.jwt() ->> 'role') IN ('admin', 'manager', 'supervisor')
    )
  );
CREATE POLICY "profiles_insert_block" ON profiles FOR INSERT WITH CHECK (false);

-- ticket_logs: auditoría inmutable — solo el backend puede insertar
CREATE POLICY "ticket_logs_select" ON ticket_logs
  FOR SELECT USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "ticket_logs_no_insert" ON ticket_logs FOR INSERT WITH CHECK (false);
CREATE POLICY "ticket_logs_no_update" ON ticket_logs FOR UPDATE USING (false);
CREATE POLICY "ticket_logs_no_delete" ON ticket_logs FOR DELETE USING (false);

-- storage: el primer segmento del path debe ser el tenant_id
CREATE POLICY "tenant_storage_isolation" ON storage.objects
  FOR ALL USING (
    bucket_id = 'flucore-vault'
    AND (storage.foldername(name))[1] = (auth.jwt() ->> 'tenant_id')
  );
```

**JWT claims requeridos (configurar en Supabase Auth hook `custom_access_token`):**
```json
{
  "sub": "uuid-usuario",
  "email": "tecnico@medplan.cl",
  "tenant_id": "uuid-del-tenant",
  "role": "diag_tech"
}
```

> ⚠️ CRÍTICO: Todo el sistema de RLS depende del `custom_access_token_hook`. Sin él, `auth.jwt() ->> 'tenant_id'` retorna `null` y todas las policies fallan silenciosamente (el usuario no verá datos, no un error).

**Nota para Claude Code:** El hook se configura en Supabase Dashboard → Authentication → Hooks → `custom_access_token`. La función Postgres lee `tenant_id` y `role` desde `profiles` y los inyecta en el JWT. Es el **paso 3 obligatorio** antes de poder probar cualquier endpoint con RLS.

---

## 10. CONVENCIONES PARA AGENTES IA

### Nomenclatura

| Elemento | Convención | Ejemplo |
|---|---|---|
| Tablas SQL | `snake_case` plural | `ticket_logs`, `inventory_items` |
| Columnas SQL | `snake_case` | `tenant_id`, `created_at` |
| Archivos TS | `kebab-case` | `ticket.service.ts`, `approve-report.handler.ts` |
| Interfaces TS | `PascalCase` | `Ticket`, `CreateTicketDto` |
| Servicios TS (interfaz) | `IPascalCase` | `ITicketService` |
| ENUMs TS | `PascalCase` con valores `UPPER_SNAKE` | `TicketStatus.EN_REPARACION` |
| Rutas API | `/api/v1/[recurso]` | `PATCH /api/v1/tickets/:id/approve-report` |

### Formato de respuesta API estándar

```typescript
// Éxito
interface ApiSuccess<T> {
  data: T
  meta?: { timestamp: string; total?: number }
}

// Error
interface ApiError {
  error: {
    code: string       // 'TICKET_NOT_FOUND', 'FORBIDDEN', 'INVALID_TRANSITION'
    message: string    // Mensaje legible
    status: number     // HTTP status code
  }
}
```

### Patrón de módulo estándar (Hono)

```
/modules/tickets/
  ticket.types.ts          → Interfaces y DTOs
  ticket.service.ts        → Interfaz ITicketService
  ticket.service.impl.ts   → Implementación
  ticket.router.ts         → Rutas Hono
  handlers/
    create-ticket.handler.ts
    update-status.handler.ts
    approve-report.handler.ts
```

### Libraries aprobadas

| Librería | Propósito |
|---|---|
| `zod` | Validación de input en endpoints |
| `react-hook-form` + `zod` | Formularios frontend |
| `@tanstack/react-query` | Fetching y caché en cliente |
| `date-fns` | Manipulación de fechas |
| `decimal.js` | Cálculos de precios (evitar float) |
| `qrcode` | Generación de QR codes |
| `@react-pdf/renderer` | Generación de PDFs en el frontend |
| `shadcn/ui` | Componentes UI (única excepción a la regla de no librerías pesadas) |

### Anti-patrones — nunca hacer esto

```
❌ `any` en TypeScript
❌ SERVICE_ROLE_KEY en variables NEXT_PUBLIC_ o archivos 'use client'
❌ DELETE en tablas transaccionales (tickets, ticket_logs, ticket_parts)
❌ Hardcodear tenant_id en cualquier lugar del código
❌ Lógica de validación de roles en el frontend (solo en Hono)
❌ Pasar archivos binarios por Hono API (ir directo a Supabase Storage)
❌ Un único cliente Supabase global compartido entre server y browser
❌ select * en queries de producción
❌ Crear columnas SQL para datos que pertenecen en JSONB
```

---

## 11. ESTADO ACTUAL DEL PROYECTO

| Módulo | Estado | Próximo paso |
|---|---|---|
| Esquema DB (SQL) | ✅ Listo (v2.2 — RLS granular) | `001_core_schema.sql` en `/supabase/migrations/` |
| Arquitectura comunicación | ✅ Definida | Ver sección 4 de este documento |
| Storage paths | ✅ Definido | Ver sección 5 de este documento |
| Estructura carpetas | ✅ Definida | Ver sección 3 de este documento |
| Supabase proyecto | 🔲 Pendiente | Crear proyecto, ejecutar migración, configurar JWT hook |
| IAM / Auth middleware | 🔲 Pendiente | Primer módulo a implementar |
| CRUD tickets (FUI) | 🔲 Pendiente | Depende de IAM |
| Checklist 39 puntos | 🔲 Pendiente | Componente React + Hono endpoint |
| Agente IA informes | 🔲 Pendiente | Depende de checklist |
| Cotizaciones | 🔲 Pendiente | — |
| Dashboard Kanban | 🔲 Pendiente | — |

---

## 12. PRIMER PASO DE DESARROLLO (SIGUIENTE SESIÓN)

Orden de implementación para la primera semana:

1. Crear proyecto en Supabase (dev)
2. Ejecutar `001_core_schema.sql`
3. Configurar JWT custom hook en Supabase para inyectar `tenant_id` y `role`
4. Insertar seed: tenant Medplan + device_models
5. Inicializar monorepo: `/apps/web` (Next.js) + `/apps/api` (Hono)
6. Implementar módulo IAM: middleware de auth en Hono que lee JWT y expone `c.get('user')`
7. Primer endpoint funcional: `GET /api/v1/me` que devuelve perfil del usuario autenticado
8. Página de login en Next.js con Supabase Auth

---

---

## 13. ARQUITECTURA OFFLINE-FIRST

> Documento completo: `FLUCORE_OFFLINE_ARCH.md` | Código: `packages/offline/`

**Principio:** Local-First, Sync-Second. El sistema funciona siempre localmente y sincroniza cuando puede.

### Decisiones definitivas

| Decisión | Elección |
|---------|---------|
| PDF informes y cotizaciones | `@react-pdf/renderer` frontend — funciona offline |
| Deploy Hono backend | Railway.app (~$5/mes) |
| Almacenamiento local | Dexie.js v4 (IndexedDB) |
| Cola de sync | Custom FIFO en IndexedDB + backoff exponencial |
| PWA | next-pwa (Workbox) |

### Qué funciona sin internet

| Proceso | Estado offline |
|---------|---------------|
| Crear FUI | ✅ Provisional → sync al reconectar |
| Ver tickets asignados | ✅ Desde IndexedDB cache |
| Completar diagnóstico 39 puntos | ✅ Auto-save local |
| Exportar informe PDF manual | ✅ @react-pdf/renderer en browser |
| Avance de OT | ✅ Local → sync automático |
| Generar informe con IA | ❌ Requiere Claude API |
| Kanban Realtime | ❌ Requiere Supabase Realtime |

### Paquete @flucore/offline (`/packages/offline/`)

```typescript
// Inicializar en el layout protegido (una vez)
useEffect(() => initSyncEngine(getAccessToken), [])

// Mutaciones — siempre via el hook, nunca fetch directo
const { createTicket, updateDiagnostic, changeStatus } = useOfflineTicket(getAccessToken)

// Lecturas — reactivas desde IndexedDB
const tickets = useLiveQuery(() => localDB.tickets.where('[tenant_id+status]')...)
```

### Ticket number provisional
Offline: `OFFLINE-YYYYMMDD-XXX`. El trigger SQL genera el número real al sincronizar. Columna `_client_updated_at` para conflictos. Ver migración `003_offline_sync_support.sql`.

### Nuevas librerías aprobadas
`dexie` · `dexie-react-hooks` · `next-pwa`

---

*Fin del documento de contexto. Versión 2.3*
*Archivos relacionados: `001_core_schema_1.sql`, `FLUCORE_OFFLINE_ARCH.md`, `packages/offline/`, `supabase/migrations/003_offline_sync_support.sql`*
