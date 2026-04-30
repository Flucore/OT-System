import type { Profile } from '@flucore/types'
import type { CreateProfileInput, UpdateProfileInput } from './iam.types'

export interface IIamService {
  getMe(userId: string, tenantId: string): Promise<Profile>
  getById(id: string, tenantId: string): Promise<Profile>
  list(tenantId: string): Promise<Profile[]>
  create(dto: CreateProfileInput, tenantId: string): Promise<Profile>
  update(id: string, dto: UpdateProfileInput, tenantId: string): Promise<Profile>
}
