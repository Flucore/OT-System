'use client'
/**
 * FLUCORE @flucore/offline — Hook para operaciones de tickets con soporte offline
 * Implementa el patrón Local-First, Sync-Second.
 *
 * Orden de operación para cada mutación:
 * 1. Guardar en IndexedDB SIEMPRE (inmediato, sin importar red)
 * 2. Si hay red: intentar sync inmediato al backend Hono
 *    - HTTP 4xx (validación/negocio) → lanzar error a la UI, NO encolar
 *    - Error de red o HTTP 5xx → enqueue para reintento automático
 * 3. Si no hay red: encolar para sync posterior automático
 */

import { useCallback } from 'react'
import { localDB, generateProvisionalTicketNumber } from '../db'
import { enqueue } from '../sync-queue'
import { useNetworkStatus } from './use-network-status'
import type { LocalTicket, TicketStatus } from '../types'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787'

// Error de negocio/validación — el servidor lo rechazó explícitamente.
// NO debe encolarse: reintentarlo producirá el mismo 4xx infinitamente.
export class BusinessError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'BusinessError'
  }
}

// Helper: distingue "la red no existe" de "el servidor respondió con error"
function isNetworkError(e: unknown): boolean {
  return e instanceof TypeError && /fetch|network|failed/i.test((e as TypeError).message)
}

// Ejecuta fetch + lanza BusinessError si 4xx, devuelve Response si ok/5xx
async function fetchWithBusinessErrorGuard(
  url: string,
  init: RequestInit,
): Promise<Response> {
  const res = await fetch(url, init)

  if (res.status >= 400 && res.status < 500) {
    const body = await res.json().catch(() => ({})) as { error?: { message?: string } }
    throw new BusinessError(res.status, body?.error?.message ?? `Error ${res.status}`)
  }

  return res
}

interface CreateTicketInput {
  equipment_id: string
  tenant_id: string
  received_with_accessories: boolean
  accessories_detail?: string
  client_request_notes?: string
  assigned_diag_tech_id?: string
}

interface UpdateDiagnosticInput {
  ticketId: string
  diagnostic_data: Record<string, unknown>
}

interface ChangeStatusInput {
  ticketId: string
  newStatus: TicketStatus
  notes?: string
}

interface UploadPhotoInput {
  ticketId: string
  tenantId: string
  phase: 'DIAGNOSTICO' | 'REPARACION'
  storagePath: string  // construido con buildStoragePath() antes de llamar al hook
  blob: Blob
}

export function useOfflineTicket(getAccessToken: () => Promise<string | null>) {
  const { isOnline } = useNetworkStatus()

  const createTicket = useCallback(async (input: CreateTicketInput): Promise<LocalTicket> => {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const provisionalNumber = await generateProvisionalTicketNumber()

    const localTicket: LocalTicket = {
      id,
      ticket_number: provisionalNumber,
      equipment_id: input.equipment_id,
      tenant_id: input.tenant_id,
      status: 'INGRESADO',
      assigned_diag_tech_id: input.assigned_diag_tech_id ?? null,
      assigned_repair_tech_id: null,
      received_with_accessories: input.received_with_accessories,
      accessories_detail: input.accessories_detail ?? null,
      client_request_notes: input.client_request_notes ?? null,
      diagnostic_data: {},
      ai_report_draft: null,
      ai_report_final: null,
      repair_comments: null,
      received_at: now,
      diagnosed_at: null,
      repaired_at: null,
      closed_at: null,
      created_at: now,
      updated_at: now,
      sync_status: 'pending',
      _provisional: true,
      _client_updated_at: now,
    }

    await localDB.tickets.add(localTicket)

    if (isOnline) {
      try {
        const token = await getAccessToken()
        const res = await fetchWithBusinessErrorGuard(`${API_BASE}/api/v1/tickets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(localTicket),
        })
        if (res.ok) {
          const { data } = await res.json() as { data: { ticket_number: string } }
          await localDB.tickets.update(id, {
            ticket_number: data.ticket_number,
            _provisional: false,
            sync_status: 'synced',
          })
          return { ...localTicket, ticket_number: data.ticket_number, _provisional: false, sync_status: 'synced' }
        }
        // 5xx → fallback a cola
      } catch (e) {
        if (e instanceof BusinessError) throw e  // 4xx: re-lanzar a la UI
        if (!isNetworkError(e)) throw e          // error inesperado: re-lanzar
        // TypeError de red → fallback a cola
      }
    }

    await enqueue({
      operation: 'CREATE_TICKET',
      entity_type: 'ticket',
      entity_id: id,
      payload: localTicket,
      http_method: 'POST',
      endpoint: '/api/v1/tickets',
    })

    return localTicket
  }, [isOnline, getAccessToken])

  const updateDiagnostic = useCallback(async (input: UpdateDiagnosticInput): Promise<void> => {
    const now = new Date().toISOString()

    await localDB.tickets.update(input.ticketId, {
      diagnostic_data: input.diagnostic_data,
      updated_at: now,
      sync_status: 'pending',
      _client_updated_at: now,
    })

    if (isOnline) {
      try {
        const token = await getAccessToken()
        const res = await fetchWithBusinessErrorGuard(
          `${API_BASE}/api/v1/tickets/${input.ticketId}/diagnostic`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ diagnostic_data: input.diagnostic_data, _client_updated_at: now }),
          }
        )
        if (res.ok) {
          await localDB.tickets.update(input.ticketId, { sync_status: 'synced' })
          return
        }
      } catch (e) {
        if (e instanceof BusinessError) throw e
        if (!isNetworkError(e)) throw e
      }
    }

    await enqueue({
      operation: 'UPDATE_DIAGNOSTIC',
      entity_type: 'ticket',
      entity_id: input.ticketId,
      payload: { diagnostic_data: input.diagnostic_data, _client_updated_at: now },
      http_method: 'PATCH',
      endpoint: '/api/v1/tickets/:entity_id/diagnostic',
    })
  }, [isOnline, getAccessToken])

  const changeStatus = useCallback(async (input: ChangeStatusInput): Promise<void> => {
    const now = new Date().toISOString()
    const dateField = statusDateField(input.newStatus)

    await localDB.tickets.update(input.ticketId, {
      status: input.newStatus,
      ...(dateField ? { [dateField]: now } : {}),
      updated_at: now,
      sync_status: 'pending',
      _client_updated_at: now,
    })

    if (isOnline) {
      try {
        const token = await getAccessToken()
        const res = await fetchWithBusinessErrorGuard(
          `${API_BASE}/api/v1/tickets/${input.ticketId}/status`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ status: input.newStatus, notes: input.notes, _client_updated_at: now }),
          }
        )
        if (res.ok) {
          await localDB.tickets.update(input.ticketId, { sync_status: 'synced' })
          return
        }
      } catch (e) {
        if (e instanceof BusinessError) throw e
        if (!isNetworkError(e)) throw e
      }
    }

    await enqueue({
      operation: 'CHANGE_TICKET_STATUS',
      entity_type: 'ticket',
      entity_id: input.ticketId,
      payload: { status: input.newStatus, notes: input.notes, _client_updated_at: now },
      http_method: 'PATCH',
      endpoint: '/api/v1/tickets/:entity_id/status',
    })
  }, [isOnline, getAccessToken])

  /**
   * uploadPhoto — guarda un Blob localmente y lo encola para subir a Supabase Storage.
   * El sync-engine lo sube cuando haya red usando el `uploadBlob` que el app provee.
   * El storagePath DEBE construirse con buildStoragePath() antes de llamar esta función.
   */
  const uploadPhoto = useCallback(async (input: UploadPhotoInput): Promise<string> => {
    const operationId = crypto.randomUUID()

    await localDB.localFiles.add({
      id: operationId,
      storagePath: input.storagePath,
      blob: input.blob,
      mimeType: input.blob.type,
      created_at: new Date().toISOString(),
    })

    await enqueue({
      operation: 'UPLOAD_PHOTO',
      entity_type: 'photo',
      entity_id: operationId,
      payload: {
        localFileId: operationId,
        storagePath: input.storagePath,
        ticketId: input.ticketId,
        tenantId: input.tenantId,
        phase: input.phase,
      },
      http_method: 'POST',
      endpoint: '/api/v1/tickets/:ticket_id/photos',
    })

    return operationId
  }, [])

  return { createTicket, updateDiagnostic, changeStatus, uploadPhoto }
}

function statusDateField(status: TicketStatus): string | null {
  const map: Partial<Record<TicketStatus, string>> = {
    PENDIENTE_REVISION: 'diagnosed_at',
    CERRADA: 'closed_at',
    EN_REPARACION: 'repaired_at',
  }
  return map[status] ?? null
}
