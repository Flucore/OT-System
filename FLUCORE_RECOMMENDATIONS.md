# FLUCORE — Listado Completo de Recomendaciones
**Versión:** 1.1  
**Origen:** Auditoría de estructura previa al desarrollo (Abr 2026)

---

## CATEGORÍA A — SEGURIDAD CRÍTICA

### A1. RLS en tabla `tenants` ✅ APLICADO en SQL
- Sin RLS, cualquier usuario autenticado lista todas las empresas del SaaS.
- **Solución:** `ALTER TABLE tenants ENABLE ROW LEVEL SECURITY` + políticas solo-lectura del propio tenant. INSERT/UPDATE/DELETE bloqueados desde el cliente.
- **Validar:** Usuario tenant A intenta leer tenants → solo ve el suyo.

### A2. Políticas RLS granulares en lugar de `FOR ALL` ✅ APLICADO en SQL
- `FOR ALL USING (...)` no impone `WITH CHECK` en INSERT → un cliente podía insertar con `tenant_id` de otro tenant.
- **Solución:** Políticas separadas: `_select`, `_insert` (con `WITH CHECK`), `_update`, `_no_delete`.
- **Validar:** Insertar ticket con `tenant_id` hardcodeado de otro tenant → rechazado.

### A3. `ticket_logs` inviolable desde el cliente ✅ APLICADO en SQL
- **Solución:** `FOR INSERT WITH CHECK (false)` + `FOR UPDATE USING (false)`. Solo el backend (service role) puede escribir.

### A4. `profiles` bloqueado para INSERT desde el cliente ✅ APLICADO en SQL
- Los perfiles los crea el backend Hono con `SERVICE_ROLE_KEY`.
- **Solución:** `FOR INSERT WITH CHECK (false)`.

### A5. `SERVICE_ROLE_KEY` nunca en el frontend
- **Verificación periódica:** `rg "SERVICE_ROLE" apps/web/` → debe retornar 0 resultados.

### A6. `custom_access_token_hook` es prerequisito de todo el sistema
- Sin el hook, `auth.jwt() ->> 'tenant_id'` retorna `null` → todas las políticas RLS fallan silenciosamente.
- **Orden:** Configurar el hook ANTES de crear el primer usuario de prueba.

### A7. Validar permisos por rol SIEMPRE en Hono
```typescript
if (!['supervisor', 'manager'].includes(user.role)) {
  return c.json({ error: { code: 'FORBIDDEN' } }, 403)
}
```

---

## CATEGORÍA B — INTEGRIDAD DE DATOS

### B1. Integridad cross-tenant en tickets ✅ APLICADO en SQL
- Trigger `trg_validate_ticket_equipment_tenant` valida `BEFORE INSERT OR UPDATE`.
- **Nota técnica:** CHECK constraints de PostgreSQL NO pueden referenciar otras tablas.

### B2. Soft delete obligatorio en tablas transaccionales
- Nunca `DELETE` en `tickets`, `ticket_logs`, `ticket_parts`, `quotations`.
- **Implementación:** `deleted_at TIMESTAMPTZ` o `is_active = false`.

### B3. `ticket_number` es el identificador de negocio — no el UUID
- En la UI mostrar siempre el `ticket_number` (ej: `MED-2026-0047`).
- En offline: el número provisional `OFFLINE-YYYYMMDD-XXX` se reemplaza al sincronizar.

### B4. Precios con `decimal.js`, nunca floats
- `const total = new Decimal(subtotal).times(new Decimal(1).plus(taxRate))`

### B5. `applied_price` en `ticket_parts` es inmutable
- Se congela al cotizar. Nunca actualizar aunque cambie el inventario.

---

## CATEGORÍA C — PERFORMANCE

### C1. Índice GIN con `jsonb_path_ops` ✅ APLICADO en SQL
- 20-40% más rápido para consultas `@>` y `@?` sobre `diagnostic_data`.

### C2. Índice compuesto `(tenant_id, status)` ya en el schema
- Cubre la query más frecuente: tickets del tenant en un estado dado (Kanban).

### C3. Supabase Realtime solo en Kanban y vista TV
- Cada suscripción activa consume conexiones. Limite del plan gratuito.

### C4. React Query para caché de lecturas en el cliente
- Datos frecuentes (`device_models`, `clients`, `branches`) → `useQuery` con `staleTime`.

### C5. `select *` prohibido en producción
- `diagnostic_data` puede pesar varios KB. No traerlo en listados del Kanban.

---

## CATEGORÍA D — ARQUITECTURA OFFLINE-FIRST

### D1. Local-First, Sync-Second — patrón central ✅ IMPLEMENTADO
- Todo `useOfflineTicket` → IndexedDB primero, Hono segundo.
- SyncEngine procesa cola FIFO con backoff exponencial (1m, 2m, 4m, 8m, 16m).

### D2. Ticket number provisional → real ✅ IMPLEMENTADO
- Offline: `OFFLINE-YYYYMMDD-XXX`. Al sincronizar el servidor genera `MED-YYYY-XXXX`.
- El trigger SQL fue modificado para respetar números ya provistos.

### D3. PDF en el frontend con `@react-pdf/renderer` ✅ DECIDIDO
- Funciona sin servidor. Informes de diagnóstico y cotizaciones generados en el browser.

### D4. Resolución de conflictos: Last-Write-Wins con `_client_updated_at` ✅ IMPLEMENTADO
- Columna en `tickets`. El backend detecta conflictos al recibir sync offline.

### D5. Cache de referencia en IndexedDB
- `device_models`, `clients`, `branches`, `profiles` → hidratados al login, refrescados periódicamente.
- Formularios offline pueden cargar dropdowns desde el cache local.

---

## CATEGORÍA E — ARQUITECTURA DE CÓDIGO

### E1. Orden de dependencias inviolable
```
DB + RLS + JWT Hook → Backend Auth (Hono) → Frontend Auth → Offline Engine → Features
```

### E2. Un módulo no importa directamente de otro módulo
- Los módulos de Hono se comunican solo a través de `/packages/types`.

### E3. Adjuntar siempre `FLUCORE_AI_CONTEXT_v2.2.md` en cada sesión de agente

### E4. Storage paths via helper, nunca construidos a mano

### E5. Archivos binarios nunca pasan por Hono

---

## CATEGORÍA F — ENTORNO CURSOR

### F1. 4 Cursor Rules activas
- `flucore-core.mdc` → siempre activa
- `flucore-typescript.mdc` → en .ts/.tsx
- `flucore-sql.mdc` → en .sql
- `flucore-offline.mdc` → en .ts/.tsx (offline patterns)

### F2. Agent Mode para módulos completos (`Ctrl+Shift+I`)
### F3. Ask Mode para auditorías (`Ctrl+L`)
### F4. Commit antes de cada día del sprint

---

## CATEGORÍA G — DEPLOY Y PRODUCCIÓN

### G1. Railway.app para el backend Hono ✅ DECIDIDO (~$5/mes)
### G2. Vercel para Next.js frontend (gratuito en MVP)
### G3. Supabase (Pro en producción, Free en dev)
### G4. Cloudflare para DNS + WAF

---

## CATEGORÍA H — PENDIENTES FUTUROS (post-MVP)

| # | Pendiente | Módulo | Prioridad |
|---|-----------|--------|-----------|
| 1 | Rate limiting en `/generate-report` | ai-agents | Media |
| 2 | Notificaciones email/WhatsApp al cambiar estado | tickets | Post-MVP |
| 3 | RLS granular por rol dentro del tenant | tickets | Baja |
| 4 | Supabase CLI + migrations locales (reemplazar SQL Editor) | infra | Media |
| 5 | Índice parcial para tickets activos | db | Baja |
| 6 | CI/CD pipeline (GitHub Actions) | infra | Baja |
| 7 | Ambiente staging separado | infra | Baja |

---

*Documento: FluCore Recommendations v1.1 — Abr 2026*
