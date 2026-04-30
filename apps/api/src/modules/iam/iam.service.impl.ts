import type { Profile } from '@flucore/types'
import { supabaseAdmin } from '../../lib/supabase-admin'
import { IamError, PROFILE_COLUMNS, type CreateProfileInput, type UpdateProfileInput } from './iam.types'
import type { IIamService } from './iam.service'

export class IamServiceImpl implements IIamService {
  async getMe(userId: string, tenantId: string): Promise<Profile> {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', userId)
      .eq('tenant_id', tenantId)
      .single()

    if (error || !data) throw new IamError('PROFILE_NOT_FOUND', 'Perfil no encontrado', 404)
    return data as Profile
  }

  async getById(id: string, tenantId: string): Promise<Profile> {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single()

    if (error || !data) throw new IamError('PROFILE_NOT_FOUND', 'Perfil no encontrado', 404)
    return data as Profile
  }

  async list(tenantId: string): Promise<Profile[]> {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('tenant_id', tenantId)
      .order('full_name', { ascending: true })

    if (error) throw new IamError('UNHANDLED', 'Error al listar perfiles', 500)
    return (data ?? []) as Profile[]
  }

  async create(dto: CreateProfileInput, tenantId: string): Promise<Profile> {
    // Paso 1: crear usuario en Supabase Auth (email_confirm: true para bypasear verificación)
    const {
      data: { user: authUser },
      error: authError,
    } = await supabaseAdmin.auth.admin.createUser({
      email: dto.email,
      password: dto.password,
      email_confirm: true,
    })

    if (authError || !authUser) {
      // Supabase devuelve "already registered" si el email existe
      const isEmailTaken = authError?.message?.toLowerCase().includes('already')
      throw new IamError(
        isEmailTaken ? 'CONFLICT' : 'UNHANDLED',
        isEmailTaken ? 'El email ya está registrado' : (authError?.message ?? 'Error al crear usuario'),
        isEmailTaken ? 409 : 500
      )
    }

    // Paso 2: insertar perfil usando service_role (bypass profiles_insert_block RLS)
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: authUser.id,       // UUID del auth.users — enlace entre auth y profiles
        tenant_id: tenantId,
        full_name: dto.full_name,
        role: dto.role,
        email: dto.email,
      })
      .select(PROFILE_COLUMNS)
      .single()

    if (profileError || !profile) {
      // Rollback: eliminar auth user para no dejar huérfano en auth.users
      await supabaseAdmin.auth.admin.deleteUser(authUser.id)
      throw new IamError('UNHANDLED', 'Error al crear perfil — auth user eliminado', 500)
    }

    return profile as Profile
  }

  async update(id: string, dto: UpdateProfileInput, tenantId: string): Promise<Profile> {
    // .single() lanza error si no hay filas — captura "no encontrado" y cross-tenant
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update(dto)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select(PROFILE_COLUMNS)
      .single()

    if (error || !data) {
      throw new IamError('PROFILE_NOT_FOUND', 'Perfil no encontrado', 404)
    }

    return data as Profile
  }
}

// Singleton — todos los handlers importan esta instancia
export const iamService = new IamServiceImpl()
