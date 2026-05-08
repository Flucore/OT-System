import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { DashboardShell } from './_components/DashboardShell'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  manager: 'Gerente',
  supervisor: 'Supervisor',
  diag_tech: 'Técnico de Diagnóstico',
  repair_tech: 'Técnico de Reparación',
}

// Layout protegido — valida sesión en servidor antes de renderizar.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Admin client bypassa RLS para leer el perfil propio.
  // Seguro porque ya verificamos que el usuario está autenticado.
  const admin = createSupabaseAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('full_name, role, tenant_id')
    .eq('id', user.id)
    .single()

  const userEmail = profile?.full_name ?? user.email ?? ''
  const userRole = ROLE_LABELS[profile?.role ?? ''] ?? (profile?.role ?? '')
  const tenantId = profile?.tenant_id ?? ''

  return (
    <DashboardShell userEmail={userEmail} userRole={userRole} tenantId={tenantId}>
      {children}
    </DashboardShell>
  )
}
