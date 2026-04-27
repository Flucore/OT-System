# FLUCORE — Tech Stack Definiciones y Decisiones
**Versión:** 1.1 (Offline-First + Railway + PDF decididos)
**Propósito:** Referencia técnica completa para agentes IA y desarrolladores.

---

## 1. LENGUAJES Y ENTORNO BASE

| Tecnología | Versión mínima | Notas |
|-----------|---------------|-------|
| Node.js | 20 LTS | Requerido por Hono + Next.js 14 |
| TypeScript | 5.x | `strict: true` + `noImplicitAny: true` obligatorio |
| npm | 10+ | Gestor de paquetes |

### tsconfig base
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "moduleResolution": "bundler",
    "target": "ES2022"
  }
}
```

---

## 2. FRONTEND — Next.js

| Aspecto | Decisión | Por qué |
|---------|---------|---------|
| Framework | Next.js 14+ App Router | RSC nativos, mejor DX con Supabase SSR |
| Deploy | Vercel | Integración nativa, zero-config |
| Fuentes | IBM Plex Sans o DM Sans | Estética técnica/industrial. NO Inter, NO Roboto |
| UI Components | shadcn/ui | La única librería de componentes aprobada |
| Estado servidor | React Server Components + Supabase directo | Sin intermediarios para lecturas |
| Estado cliente | @tanstack/react-query v5 | Caché, invalidación, optimistic updates |
| Formularios | react-hook-form + zod resolvers | Sin re-renders innecesarios |
| PDF | @react-pdf/renderer ✅ DECIDIDO | Funciona offline — ver sección 10b |

### Variables de entorno frontend
```env
NEXT_PUBLIC_SUPABASE_URL=https://[proyecto].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
NEXT_PUBLIC_API_URL=http://localhost:8787
```
**NUNCA en NEXT_PUBLIC_:** `SERVICE_ROLE_KEY`, `DATABASE_URL`, `ANTHROPIC_API_KEY`

---

## 3. BACKEND — Hono

| Aspecto | Decisión | Por qué |
|---------|---------|---------|
| Framework | Hono v4+ | TypeScript nativo, ultraligero |
| Runtime | Node.js (@hono/node-server) | Compatibilidad con librerías Node |
| Deploy | **Railway.app ✅ DECIDIDO** | Zero-config Node.js, ~$5/mes |
| Validación | zod | Integración nativa con TypeScript |
| ORM | Ninguno — Supabase client directo | El RLS requiere el cliente Supabase |

### Variables de entorno backend
```env
SUPABASE_URL=https://[proyecto].supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # NUNCA exponer fuera del backend
DATABASE_URL=postgresql://...
ANTHROPIC_API_KEY=sk-ant-...
PORT=8787
```

### Deploy Railway — configuración
```toml
# railway.toml en /apps/api
[build]
  builder = "NIXPACKS"

[deploy]
  startCommand = "node dist/index.js"
  restartPolicyType = "ON_FAILURE"
  restartPolicyMaxRetries = 3
```

---

## 4. BASE DE DATOS — PostgreSQL + Supabase

| Aspecto | Decisión |
|---------|---------|
| Motor | PostgreSQL 15+ vía Supabase |
| Multi-tenancy | Row Level Security + `tenant_id` en JWT |
| JSONB | `diagnostic_data` en `tickets` (39 puntos de diagnóstico) |
| Auditoría | `ticket_logs` inmutable (nunca DELETE/UPDATE) |
| Soft delete | `deleted_at TIMESTAMPTZ` o `is_active BOOLEAN` |
| Offline sync | `_client_updated_at` + `sync_origin` en `tickets` |

### Supabase features en uso

| Feature | Uso |
|---------|-----|
| Auth | Login, JWT, custom_access_token_hook |
| Row Level Security | Aislamiento multi-tenant completo |
| Storage | Bucket `flucore-vault` — fotos, PDFs, OC |
| Realtime | Kanban dashboard + vista TV |

---

## 5. OFFLINE-FIRST ✅ DECISIONES TOMADAS

| Componente | Tecnología | Versión | Decisión |
|-----------|-----------|---------|---------|
| Almacenamiento local | `dexie` | ^4.x | ✅ DECIDIDO |
| Queries reactivas | `dexie-react-hooks` | ^4.x | ✅ DECIDIDO |
| PWA + Service Worker | `next-pwa` | ^5.x | ✅ DECIDIDO |
| PDF offline | `@react-pdf/renderer` | ^3.x | ✅ DECIDIDO |
| Sync engine | `@flucore/offline` (interno) | 1.0.0 | ✅ IMPLEMENTADO |

### Paquete @flucore/offline — estructura
```
/packages/offline/src/
  types.ts                    → Tipos del sistema offline
  db.ts                       → Dexie schema (LocalTicket, SyncQueueItem, caches)
  sync-queue.ts               → CRUD de la cola FIFO
  sync-engine.ts              → Procesamiento + backoff exponencial
  index.ts                    → Exports del paquete
  hooks/
    use-network-status.ts     → Online/offline detection
    use-sync-status.ts        → Estado de cola para la UI
    use-offline-ticket.ts     → createTicket / updateDiagnostic / changeStatus
```

### PDF de informes ✅ DECIDIDO — Frontend
```typescript
// Client Component — funciona sin servidor
import { PDFDownloadLink } from '@react-pdf/renderer'
<PDFDownloadLink document={<DiagnosticReportPDF ticket={localTicket} />}
  fileName={`${ticket.ticket_number}_informe.pdf`}>
  {({ loading }) => loading ? 'Generando...' : 'Descargar PDF'}
</PDFDownloadLink>
```

---

## 6. AUTH — Supabase Auth

| Aspecto | Decisión |
|---------|---------|
| Provider | Email + Password |
| JWT custom claims | `tenant_id` (UUID) + `role` (string) |
| Sesión | Cookies via @supabase/ssr — NO localStorage |

### Claims JWT requeridos
```json
{ "sub": "uuid", "email": "usuario@medplan.cl", "tenant_id": "uuid", "role": "supervisor" }
```

---

## 7. STORAGE — Supabase Storage

| Aspecto | Decisión |
|---------|---------|
| Bucket | `flucore-vault` (privado) |
| Path | `{tenant_id}/{modulo}/{entidad_id}/{tipo}/{timestamp}_{filename}` |
| Upload | Directo desde cliente (NUNCA via Hono) |
| Helper | `buildStoragePath()` en `/packages/utils/storage-path.ts` |

---

## 8. IA — MÓDULO DE INFORMES

| Aspecto | Decisión |
|---------|---------|
| Proveedor | Anthropic Claude |
| Modelo | `claude-sonnet-4-20250514` |
| SDK | Fetch nativo (sin SDK) |
| Retry | Exponencial, máx 3 intentos |
| Ubicación | Solo en backend Hono — requiere red |

---

## 9. LIBRERÍAS APROBADAS

| Librería | Versión | Propósito | Dónde |
|---------|---------|---------|-------|
| `zod` | ^3.x | Validación | Frontend + Backend |
| `react-hook-form` | ^7.x | Formularios | Frontend |
| `@hookform/resolvers` | ^3.x | RHF + Zod | Frontend |
| `@tanstack/react-query` | ^5.x | Fetching y caché | Frontend |
| `date-fns` | ^3.x | Fechas | Frontend + Backend |
| `decimal.js` | ^10.x | Precios | Frontend + Backend |
| `qrcode` | ^1.x | QR codes | Frontend |
| `@react-pdf/renderer` | ^3.x | PDF offline | Frontend |
| `shadcn/ui` | latest | Componentes UI | Frontend |
| `@hello-pangea/dnd` | ^16.x | Drag & drop Kanban | Frontend |
| `hono` | ^4.x | Framework API | Backend |
| `@hono/node-server` | ^1.x | Adapter Node | Backend |
| `vitest` | ^1.x | Testing | Backend |
| `dexie` | ^4.x | IndexedDB offline | Frontend |
| `dexie-react-hooks` | ^4.x | `useLiveQuery` | Frontend |
| `next-pwa` | ^5.x | Service Worker PWA | Frontend |

---

## 10. HERRAMIENTAS DE DESARROLLO

| Herramienta | Propósito |
|------------|---------|
| Cursor IDE | Editor principal + agente IA |
| Supabase Dashboard | SQL Editor, gestión Auth, Storage |
| Railway Dashboard | Deploy y variables de entorno del backend |
| Postman / curl | Probar endpoints Hono |
| Git | Control de versiones |

---

## 11. DECISIONES PENDIENTES

| Decisión | Módulo | Prioridad | Estado |
|---------|--------|-----------|--------|
| ~~PDF cotizaciones~~ | ~~Cotizaciones~~ | — | ✅ @react-pdf/renderer frontend |
| ~~Deploy backend~~ | ~~Infraestructura~~ | — | ✅ Railway.app |
| Email notificaciones: Resend vs Sendgrid | Notificaciones | Baja | Pendiente |
| Supabase plan: Free vs Pro | Producción | Media | Pendiente |
| CI/CD pipeline | Todo | Baja | Pendiente |
| Staging separado de dev | Producción | Baja | Pendiente |
| Cuántos tickets cachear en IndexedDB | Offline | Media | Pendiente |

---

*Documento: FluCore Tech Stack v1.1 — Abr 2026*
