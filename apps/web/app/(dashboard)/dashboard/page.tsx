import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { NetworkStatusWidget } from './_components/NetworkStatusWidget'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  manager: 'Gerente',
  supervisor: 'Supervisor',
  diag_tech: 'Técnico de Diagnóstico',
  repair_tech: 'Técnico de Reparación',
}

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createSupabaseAdminClient()

  // Leer perfil, tenant y stats en paralelo
  const [{ data: profile }, { data: tenant }, ticketStats] = await Promise.all([
    admin.from('profiles').select('full_name, role, tenant_id').eq('id', user.id).single(),
    admin.from('tenants').select('name').eq('id', '00000000-0000-0000-0000-000000000001').single(),
    admin.from('tickets')
      .select('status', { count: 'exact', head: false })
      .neq('status', 'CERRADA')
      .neq('status', 'CANCELADA')
      .then(({ data, error }) => {
        if (error || !data) return { open: 0, inDiag: 0, pendingDelivery: 0 }
        const open = data.length
        const inDiag = data.filter(t => t.status === 'EN_DIAGNOSTICO').length
        const pendingDelivery = data.filter(t =>
          ['INFORME_APROBADO', 'COTIZADO', 'ESPERANDO_CLIENTE'].includes(t.status)
        ).length
        return { open, inDiag, pendingDelivery }
      }),
  ])

  const userName = profile?.full_name ?? user.email ?? 'Usuario'
  const roleLabel = ROLE_LABELS[profile?.role ?? ''] ?? profile?.role ?? ''
  const tenantName = tenant?.name ?? 'Medplan'

  const canCreateFUI = ['admin', 'manager', 'supervisor'].includes(profile?.role ?? '')

  const stats = [
    { label: 'Tickets abiertos', value: ticketStats.open },
    { label: 'En diagnóstico', value: ticketStats.inDiag },
    { label: 'Pendientes de entrega', value: ticketStats.pendingDelivery },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">
            Bienvenido, {userName}
          </h1>
          <p className="mt-0.5 text-sm text-slate-400">
            {roleLabel && `${roleLabel} · `}{tenantName}
          </p>
        </div>

        {/* FUI Button */}
        {canCreateFUI && (
          <a
            href="/tickets/new"
            className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-sky-500 active:scale-[0.98]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Nuevo FUI
          </a>
        )}
      </div>

      {/* Offline warning */}
      <NetworkStatusWidget />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {stats.map(({ label, value }) => (
          <div key={label} className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-white">
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Quick access — futuro Día 5+ */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-500">
            Acceso rápido
          </p>
          <div className="space-y-2">
            <QuickLink href="/tickets" label="Ver todos los tickets" />
            <QuickLink href="/equipment" label="Gestión de equipos" />
            {['admin', 'manager'].includes(profile?.role ?? '') && (
              <QuickLink href="/admin/users" label="Administrar usuarios" />
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-500">
            Estado del sistema
          </p>
          <div className="space-y-2 text-xs text-slate-400">
            <div className="flex items-center justify-between">
              <span>Tenant</span>
              <span className="text-slate-300">{tenantName}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Rol</span>
              <span className="text-slate-300">{roleLabel || '—'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Módulos</span>
              <span className="rounded-full bg-amber-900/50 px-2 py-0.5 text-amber-400">
                En desarrollo
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-slate-400 transition hover:bg-slate-800 hover:text-white"
    >
      {label}
      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </a>
  )
}
