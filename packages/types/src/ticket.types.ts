import type { DiagnosticData } from './diagnostic.types'

// Refleja el ENUM ticket_status de PostgreSQL
export enum TicketStatus {
  Ingresado = 'INGRESADO',
  EnDiagnostico = 'EN_DIAGNOSTICO',
  PendienteRevision = 'PENDIENTE_REVISION',
  InformeAprobado = 'INFORME_APROBADO',
  Cotizado = 'COTIZADO',
  EsperandoCliente = 'ESPERANDO_CLIENTE',
  OtGenerada = 'OT_GENERADA',
  EnReparacion = 'EN_REPARACION',
  EsperandoRepuesto = 'ESPERANDO_REPUESTO',
  ControlCalidad = 'CONTROL_CALIDAD',
  Cerrada = 'CERRADA',
  Cancelada = 'CANCELADA',
}

export type TicketStatusValue = `${TicketStatus}`

export type SyncOrigin = 'online' | 'offline_sync'

// Ticket completo (refleja tabla tickets + joins)
export interface Ticket {
  id: string
  ticket_number: string            // 'MED-2026-0001' o 'OFFLINE-20260501-001' si provisional
  tenant_id: string
  equipment_id: string
  status: TicketStatusValue
  client_request: string | null    // Pedido del cliente al ingresar
  accessories_included: boolean
  accessories_detail: string | null
  assigned_diag_tech_id: string | null
  assigned_repair_tech_id: string | null
  diagnostic_data: Partial<DiagnosticData> | null
  ai_report_draft: string | null
  ai_report_final: string | null
  report_approved_at: string | null
  report_approved_by: string | null
  diagnosed_at: string | null
  repaired_at: string | null
  closed_at: string | null
  _client_updated_at: string | null  // Para resolución offline Last-Write-Wins
  sync_origin: SyncOrigin
  created_at: string
  updated_at: string
  // Joins opcionales que pueden incluirse en queries
  equipment?: {
    id: string
    serial_number: string
    qr_code: string
    device_models?: {
      id: string
      brand: string
      model_name: string
    } | null
    clients?: {
      id: string
      name: string
    } | null
    branches?: {
      id: string
      name: string
      address: string | null
    } | null
  } | null
}

// DTO para crear una FUI (POST /api/v1/tickets)
export interface CreateTicketDto {
  equipment_id: string
  client_request?: string
  accessories_included?: boolean
  accessories_detail?: string
  assigned_diag_tech_id?: string
  // Campos de soporte offline:
  ticket_number?: string          // Si viene 'OFFLINE-...', el trigger lo reemplaza
  _client_updated_at?: string     // ISO8601 timestamp del cliente
  sync_origin?: SyncOrigin
}

// DTO para actualizar diagnostic_data (PATCH /api/v1/tickets/:id/diagnostic)
export interface UpdateDiagnosticDto {
  diagnostic_data: Partial<DiagnosticData>
  _client_updated_at?: string
}

// DTO para cambiar estado (PATCH /api/v1/tickets/:id/status)
export interface UpdateTicketStatusDto {
  status: TicketStatusValue
  notes?: string                  // Obligatorio si cambia a CANCELADA
  _client_updated_at?: string
}

// DTO para asignar técnico (PATCH /api/v1/tickets/:id/assign)
export interface AssignTechDto {
  diag_tech_id?: string
  repair_tech_id?: string
}

// Entrada del log de auditoría (tabla ticket_logs)
export interface TicketLog {
  id: string
  ticket_id: string
  tenant_id: string
  changed_by: string
  from_status: TicketStatusValue | null
  to_status: TicketStatusValue
  notes: string | null
  created_at: string
}
