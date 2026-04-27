// Roles del sistema — refleja el ENUM user_role de PostgreSQL
export enum UserRole {
  Admin = 'admin',
  Manager = 'manager',
  Supervisor = 'supervisor',
  DiagTech = 'diag_tech',
  RepairTech = 'repair_tech',
}

export type UserRoleValue = `${UserRole}`

// Perfil de usuario del tenant (tabla profiles)
export interface Profile {
  id: string               // UUID = auth.users.id
  tenant_id: string
  full_name: string
  role: UserRoleValue
  email: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface CreateProfileDto {
  email: string
  full_name: string
  role: UserRoleValue
  password: string         // Solo para creación; el backend llama admin.createUser
}

export interface UpdateProfileDto {
  full_name?: string
  role?: UserRoleValue
  is_active?: boolean
}

// Claims que el custom_access_token_hook inyecta en el JWT
export interface JwtClaims {
  sub: string
  email: string
  tenant_id: string
  role: UserRoleValue
}
