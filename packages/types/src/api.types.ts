// Formato estándar de respuesta exitosa de la API Hono
export interface ApiSuccess<T> {
  data: T
  meta?: {
    timestamp: string
    total?: number
    page?: number
    page_size?: number
  }
}

// Formato estándar de respuesta de error de la API Hono
export interface ApiError {
  error: {
    code: string      // 'TICKET_NOT_FOUND' | 'FORBIDDEN' | 'INVALID_TRANSITION' | etc.
    message: string   // Mensaje legible en español
    status: number    // HTTP status code
    details?: unknown // Para errores de validación Zod (422)
  }
}

// Códigos de error conocidos
export type ApiErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'TICKET_NOT_FOUND'
  | 'EQUIPMENT_NOT_FOUND'
  | 'PROFILE_NOT_FOUND'
  | 'INVALID_TRANSITION'
  | 'VALIDATION_ERROR'
  | 'CROSS_TENANT_VIOLATION'
  | 'CONFLICT'
  | 'UNHANDLED'

// Helper para construir respuestas exitosas
export function ok<T>(data: T, meta?: ApiSuccess<T>['meta']): ApiSuccess<T> {
  return {
    data,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta,
    },
  }
}

// Helper para construir respuestas de error
export function err(
  code: ApiErrorCode | string,
  message: string,
  status: number,
  details?: unknown
): ApiError {
  return {
    error: { code, message, status, details },
  }
}
