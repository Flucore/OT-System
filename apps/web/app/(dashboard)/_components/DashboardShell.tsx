'use client'

import { useEffect } from 'react'
import { initSyncEngine } from '@flucore/offline'
import { getAccessToken } from '@/lib/api/client'
import { NetworkStatusIndicator } from '@/components/network/NetworkStatusIndicator'
import { SyncStatusBadge } from '@/components/sync/SyncStatusBadge'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

interface DashboardShellProps {
  children: React.ReactNode
  userEmail: string
  userRole: string
  tenantId: string
}

export function DashboardShell({ children, userEmail, userRole, tenantId: _tenantId }: DashboardShellProps) {
  // Inicializar el motor de sync una sola vez al montar el layout protegido.
  // getAccessToken usa la sesión activa de Supabase — no bloquea la UI.
  useEffect(() => {
    initSyncEngine({ getAccessToken })
  }, [])

  async function handleLogout() {
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <div className="flex min-h-screen bg-slate-950">
      {/* Sidebar */}
      <aside className="flex w-56 flex-col border-r border-slate-800 bg-slate-900 p-4">
        <div className="mb-8 flex items-center gap-2 px-2 pt-2">
          <div className="h-6 w-0.5 rounded-full bg-sky-500" />
          <span className="text-sm font-semibold tracking-tight text-white">FluCore</span>
        </div>

        <nav className="flex-1 space-y-1">
          <NavLink href="/dashboard" label="Dashboard" />
          <NavLink href="/tickets" label="Tickets" />
          <NavLink href="/equipment" label="Equipos" />
        </nav>

        <div className="mt-4 border-t border-slate-800 pt-4">
          <div className="mb-3 px-2">
            <p className="truncate text-xs font-medium text-slate-300">{userEmail}</p>
            <p className="text-xs text-slate-500">{userRole}</p>
          </div>
          <button
            onClick={handleLogout}
            className="w-full rounded-lg px-2 py-2 text-left text-xs text-slate-400 transition hover:bg-slate-800 hover:text-white"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col">
        {/* Header */}
        <header className="flex h-12 items-center justify-between border-b border-slate-800 px-6">
          <div />
          <div className="flex items-center gap-3">
            <NetworkStatusIndicator />
            <SyncStatusBadge getAccessToken={getAccessToken} />
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="flex items-center rounded-lg px-3 py-2 text-sm text-slate-400 transition hover:bg-slate-800 hover:text-white"
    >
      {label}
    </a>
  )
}
