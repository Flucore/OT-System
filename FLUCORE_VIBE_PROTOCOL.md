# FLUCORE — Protocolo de Vibe Coding
**Versión:** 1.1  
**Principio central:** El vibe coding comprime el boilerplate, no el orden de dependencias ni la seguridad.

---

## ⚠️ LECCIÓN CRÍTICA: CÓMO EVITAR PÉRDIDA DE TRABAJO

**Lo que pasó:** En la sesión del 2026-04-26 se generaron ~15 archivos y todos se perdieron porque no se hizo commit antes de cerrar Cursor.

**Regla nueva (obligatoria):** Hacer commit al finalizar CADA archivo importante, no al final de la sesión.

```bash
# Después de cada archivo de infraestructura/documentación:
git add . && git commit -m "docs: add flucore-core rule and recommendations"

# NUNCA dejar una sesión sin commit si se generaron archivos nuevos
```

---

## PARTE 1 — CHECKLIST DE SESIÓN

### INICIO de sesión
```
[ ] git log -1 --pretty=%B → leer dónde quedé
[ ] Revisar "Estado actual" al final de este documento
[ ] Verificar que Supabase responde (cuando ya esté configurado)
[ ] Adjuntar FLUCORE_AI_CONTEXT_v2.2.md + archivo del día al agente
```

### CIERRE de sesión (CRÍTICO)
```
[ ] git add -A && git commit -m "[formato]" → OBLIGATORIO antes de cerrar
[ ] Probar el test manual del día
[ ] Actualizar "Estado actual" al final de este documento
[ ] Anotar deuda técnica nueva
```

---

## PARTE 2 — PROTOCOLO DE COMMITS

### Formato
```
{tipo}({scope}): {descripción en tiempo presente, ≤ 60 chars}
```

### Tipos válidos
| Tipo | Cuándo |
|------|--------|
| `feat` | Nueva funcionalidad |
| `fix` | Corrección de bug |
| `sec` | Mejora de seguridad |
| `schema` | Cambio en DB |
| `config` | Configuración, reglas, env |
| `docs` | Solo documentación |
| `refactor` | Sin cambio de comportamiento |
| `test` | Tests |
| `chore` | Mantenimiento |

### Scopes válidos
`db` · `auth` · `iam` · `tickets` · `equipment` · `inventory` · `quotations` · `ai` · `kanban` · `storage` · `offline` · `frontend` · `backend` · `infra` · `rules`

### Ejemplos
```bash
git commit -m "config(rules): add 4 cursor rules flucore-core/ts/sql/offline"
git commit -m "docs: add tech stack, recommendations, vibe protocol, offline arch"
git commit -m "feat(offline): add @flucore/offline package with dexie + sync engine"
git commit -m "schema(db): add offline sync support migration 003"
git commit -m "feat(auth): implement custom_access_token_hook"
```

### Frecuencia mínima
- **Obligatorio:** 1 commit por archivo importante generado
- **Obligatorio:** 1 commit antes de cerrar Cursor
- **Prohibido:** `"update"`, `"fix"`, `"changes"`, `"wip"` sin descripción

---

## PARTE 3 — VERSIONADO

### Esquema
```
v0.{sprint}.{día}  →  durante desarrollo activo
v1.0.0             →  primer deploy a producción
```

### Tags de hitos
| Tag | Hito |
|----|------|
| `v0.0.1` | Documentación base + schema SQL |
| `v0.0.2` | Reglas Cursor + Tech Stack + Offline arch + paquete offline |
| `v0.1.0` | Monorepo inicializado, ambas apps compilan |
| `v0.1.4` | Auth completo: login, JWT hook, /me |
| `v0.2.0` | FUI creada y persistida |
| `v0.2.7` | Checklist 39 puntos con auto-save |
| `v0.2.9` | Kanban + vista TV |
| `v1.0.0` | Deploy a producción |

---

## PARTE 4 — PROTOCOLO DE CAMBIOS DE SCHEMA

```
001_core_schema.sql          → No tocar después de ejecutar
002_jwt_hook.sql             → Hook JWT
003_offline_sync_support.sql → Soporte offline-first ← PENDIENTE EJECUTAR
seed/001_medplan_seed.sql    → Datos iniciales
```

**Cada migración lleva header:**
```sql
-- Migración: 00X_nombre.sql
-- Fecha: YYYY-MM-DD
-- Descripción: ...
-- Ambiente: dev (pendiente en producción)
```

---

## PARTE 5 — USO EFICIENTE DE CURSOR

### Modos
| Modo | Cuándo | Atajo |
|------|--------|-------|
| **Agent Mode** | Generar módulos completos | `Ctrl+Shift+I` |
| **Ask Mode** | Auditar código, preguntas | `Ctrl+L` |
| **Editor directo** | Ediciones < 5 líneas | Tab |

### Estructura de prompt efectivo
```
[1] Adjuntar: FLUCORE_AI_CONTEXT_v2.2.md + archivo relevante
[2] Objetivo: Una sola tarea concreta
[3] Restricciones: Lo que NO debe hacer
[4] Output: Lista de archivos a crear/modificar
[5] Criterio: Cómo verificar que funcionó
```

### Atajos útiles
| Acción | Atajo |
|--------|-------|
| Adjuntar archivo | `@{nombre-archivo}` |
| Buscar en codebase | `@codebase {pregunta}` |
| Aceptar cambios | `Ctrl+Shift+Y` |
| Rechazar cambios | `Ctrl+Shift+N` |

---

## PARTE 6 — MANEJO DE ERRORES DEL AGENTE

### Si el agente rompe algo
```bash
git diff HEAD                          # Ver qué cambió
git checkout HEAD -- {archivo-roto}    # Revertir archivo específico
git revert HEAD --no-edit              # Revertir commit completo
```

### Auditoría de seguridad rápida
```bash
rg "SERVICE_ROLE" apps/web/      # Debe dar 0 resultados
rg ": any" apps/                 # Debe dar 0 resultados
rg "FOR ALL" supabase/           # Debe dar 0 resultados
```

---

## PARTE 7 — ESTADO ACTUAL DEL PROYECTO

*(Actualizar al cierre de cada sesión)*

```
Última actualización: 2026-04-26 (sesión 3 — recuperación)
Último commit: PENDIENTE — hacer commit ahora
Versión actual: v0.0.2 (documentación completa)

Estado por módulo:
  [✅] Schema DB: 001_core_schema_1.sql — RLS granular, índices, triggers
  [✅] Cursor Rules: 4 reglas activas (core, typescript, sql, offline)
  [✅] FLUCORE_AI_CONTEXT_v2.2.md: Actualizado a v2.3 con offline-first
  [✅] FLUCORE_TECH_STACK.md: Decisiones offline + Railway + PDF tomadas
  [✅] FLUCORE_RECOMMENDATIONS.md: 30+ recomendaciones categorizadas
  [✅] FLUCORE_VIBE_PROTOCOL.md: Protocolo de sesión completo
  [✅] FLUCORE_OFFLINE_ARCH.md: Arquitectura offline-first completa
  [✅] packages/offline/: @flucore/offline paquete completo
  [⚠️] supabase/migrations/003_offline_sync_support.sql: Creado, pendiente ejecutar
  [⏳] Supabase proyecto: Pendiente crear y ejecutar migraciones
  [⏳] JWT Hook: Pendiente configurar
  [⏳] Monorepo flucore/: Pendiente inicializar (Sprint 1 Día 1)
  [⏳] Auth Hono + Next.js: Pendiente
  [⏳] IAM: Pendiente
  [⏳] Tickets/FUI: Pendiente
  [⏳] Checklist 39 puntos: Pendiente
  [⏳] IA Informes: Pendiente
  [⏳] Kanban: Pendiente

Próxima sesión:
  PRIMERO: git add -A && git commit -m "config: restore all docs and cursor rules"
  LUEGO: Ejecutar Sprint 1 Día 1 (Supabase + Monorepo base)
```

---

## PARTE 8 — DEUDA TÉCNICA

| # | Deuda | Módulo | Prioridad |
|---|-------|--------|-----------|
| 1 | Ejecutar 003_offline_sync_support.sql en Supabase | db | Alta |
| 2 | RLS granular por rol dentro del tenant | tickets | Baja |
| 3 | Rate limiting en `/generate-report` | ai-agents | Media |
| 4 | Supabase CLI migrations (reemplazar SQL Editor) | infra | Media |
| 5 | Índice parcial para tickets activos | db | Baja |
| 6 | CI/CD pipeline | infra | Baja |
| 7 | Sistema de notificaciones | tickets | Post-MVP |

---

*Documento: FluCore Vibe Protocol v1.1 — Abr 2026*
