'use client'
/**
 * FLUCORE @flucore/offline — Hook para operaciones de tickets con soporte offline
 * Implementa el patrón Local-First, Sync-Second.
 *
 * Orden de operación para cada mutación:
 * 1. Guardar en IndexedDB SIEMPRE (inmediato, sin importar red)
 * 2. Si hay red: intentar sync inmediato al backend Hono
 * 3. Si no hay red o falla: encolar para sync posterior automático
 */

import { useCallback } from 'react'
import { localDB, generateProvisionalTicketNumber } from '../db'
import { enqueue } from '../sync-queue'
import { useNetworkStatus } from './use-network-status'
import type { LocalTicket, TicketStatus } from '../types'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787'

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
        const res = await fetch(`${API_BASE}/api/v1/tickets`, {
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
      } catch { /* fallback a cola */ }
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
        const res = await fetch(`${API_BASE}/api/v1/tickets/${input.ticketId}/diagnostic`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ diagnostic_data: input.diagnostic_data, _client_updated_at: now }),
        })
        if (res.ok) {
          await localDB.tickets.update(input.ticketId, { sync_status: 'synced' })
          return
        }
      } catch { /* fallback a cola */ }
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
        const res = await fetch(`${API_BASE}/api/v1/tickets/${input.ticketId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ status: input.newStatus, notes: input.notes, _client_updated_at: now }),
        })
        if (res.ok) {
          await localDB.tickets.update(input.ticketId, { sync_status: 'synced' })
          return
        }
      } catch { /* fallback a cola */ }
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

  return { createTicket, updateDiagnostic, changeStatus }
}

function statusDateField(status: TicketStatus): string | null {
  const map: Partial<Record<TicketStatus, string>> = {
    PENDIENTE_REVISION: 'diagnosed_at',
    CERRADA: 'closed_at',
    EN_REPARACION: 'repaired_at',
  }
  return map[status] ?? null
}
