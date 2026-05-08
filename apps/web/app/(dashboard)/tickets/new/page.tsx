// FUI — Formulario Único de Ingreso
// Prompt #11 (Día 6): implementación completa con equipo, cliente, técnico asignado.
// Por ahora: estructura base + acceso verificado.

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

export default async function NewTicketPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createSupabaseAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  const canCreate = ['admin', 'manager', 'supervisor'].includes(profile?.role ?? '')
  if (!canCreate) redirect('/dashboard')

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center gap-3">
        <a href="/dashboard" className="text-slate-500 transition hover:text-white">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </a>
        <div>
          <h1 className="text-xl font-semibold text-white">Nuevo FUI</h1>
          <p className="text-xs text-slate-500">Formulario Único de Ingreso</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-8">
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-sky-800 bg-sky-950">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <p className="text-base font-medium text-white">Módulo de tickets — Día 6</p>
            <p className="mt-1 max-w-sm text-sm text-slate-400">
              El formulario completo (búsqueda de equipo, asignación de técnico y
              diagnóstico de 39 puntos) se implementa en el Prompt #11.
            </p>
          </div>
          <div className="mt-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-left text-xs text-slate-400">
            <p className="mb-1 font-medium text-slate-300">Incluirá:</p>
            <ul className="space-y-1 list-disc list-inside">
              <li>Búsqueda de equipo por N° serie (offline-first)</li>
              <li>Selección de cliente y sucursal</li>
              <li>Asignación de técnico de diagnóstico</li>
              <li>Observaciones iniciales del supervisor</li>
              <li>Generación de QR y PDF del FUI</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
