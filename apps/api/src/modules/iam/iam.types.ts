import { z } from 'zod'

// Columnas explícitas — nunca SELECT * (diagnostic_data puede pesar varios KB)
export const PROFILE_COLUMNS =
  'id, tenant_id, full_name, role, email, is_active, created_at, updated_at' as const

const ROLE_VALUES = ['admin', 'manager', 'supervisor', 'diag_tech', 'repair_tech'] as const

export const CreateProfileSchema = z.object({
  email: z.string().email('Email inválido'),
  full_name: z.string().min(2, 'Nombre muy corto').max(100, 'Nombre muy largo'),
  role: z.enum(ROLE_VALUES, { errorMap: () => ({ message: 'Rol inválido' }) }),
  // La contraseña nunca se almacena aquí — solo para auth.admin.createUser
  password: z.string().min(8, 'Contraseña mínimo 8 caracteres'),
})

export const UpdateProfileSchema = z
  .object({
    full_name: z.string().min(2).max(100).optional(),
    role: z.enum(ROLE_VALUES).optional(),
    // is_active: false = soft delete; true = reactivar
    is_active: z.boolean().optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: 'Al menos un campo es requerido para actualizar',
  })

export type CreateProfileInput = z.infer<typeof CreateProfileSchema>
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>

// Error tipado del módulo — los handlers lo capturan explícitamente
// para retornar el status HTTP correcto sin pasar por errorMiddleware genérico
export class IamError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: 400 | 403 | 404 | 409 | 500
  ) {
    super(message)
    this.name = 'IamError'
  }
}
