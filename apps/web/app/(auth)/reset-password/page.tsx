'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

const schema = z
  .object({
    password: z
      .string()
      .min(8, 'Mínimo 8 caracteres')
      .regex(/[A-Z]/, 'Debe incluir al menos una mayúscula')
      .regex(/[0-9]/, 'Debe incluir al menos un número'),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: 'Las contraseñas no coinciden',
    path: ['confirm'],
  })

type FormData = z.infer<typeof schema>

export default function ResetPasswordPage() {
  const [status, setStatus] = useState<'idle' | 'success' | 'error' | 'no_session'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  // Si llegamos con hash fragment (flujo legacy: #access_token=...&type=recovery),
  // Supabase lo detecta automáticamente al llamar getSession() después de que onAuthStateChange
  // procesa el hash. Esperamos la sesión un momento antes de marcar como inválida.
  useEffect(() => {
    const supabase = createSupabaseBrowserClient()

    // Supabase procesa el hash automáticamente — esperar el evento
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        if (session) {
          setStatus('idle')
          return
        }
      }
    })

    // También verificar sesión existente (llegamos via /auth/callback PKCE)
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        // Dar 1s para que onAuthStateChange procese el hash antes de marcar inválido
        setTimeout(async () => {
          const { data: { session: s2 } } = await supabase.auth.getSession()
          if (!s2) setStatus('no_session')
        }, 1000)
      }
    }
    check()

    return () => subscription.unsubscribe()
  }, [])

  async function onSubmit(data: FormData) {
    setErrorMsg(null)
    const supabase = createSupabaseBrowserClient()
    const { error } = await supabase.auth.updateUser({ password: data.password })

    if (error) {
      setErrorMsg(error.message)
      setStatus('error')
      return
    }

    setStatus('success')
    // Dar 2s para leer el mensaje, luego ir al dashboard
    setTimeout(() => {
      window.location.href = '/dashboard'
    }, 2000)
  }

  if (status === 'no_session') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
        <div className="w-full max-w-sm rounded-xl border border-red-900 bg-red-950/30 p-8 text-center">
          <p className="text-sm font-medium text-red-300">Enlace expirado o inválido</p>
          <p className="mt-2 text-xs text-red-600">
            Solicita un nuevo correo de recuperación desde el panel de administración.
          </p>
          <a
            href="/login"
            className="mt-4 inline-block text-xs text-sky-400 hover:underline"
          >
            Volver al login
          </a>
        </div>
      </main>
    )
  }

  if (status === 'success') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
        <div className="w-full max-w-sm rounded-xl border border-emerald-800 bg-emerald-950/30 p-8 text-center">
          <p className="text-sm font-medium text-emerald-300">Contraseña actualizada</p>
          <p className="mt-2 text-xs text-slate-400">Redirigiendo al dashboard…</p>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="mb-3 flex items-center justify-center gap-2">
            <div className="h-8 w-1 rounded-full bg-sky-500" />
            <span className="text-2xl font-semibold tracking-tight text-white">FluCore</span>
          </div>
          <p className="text-xs uppercase tracking-widest text-slate-500">
            Medplan Service Platform
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
          <h1 className="mb-1 text-base font-medium text-slate-200">Nueva contraseña</h1>
          <p className="mb-6 text-xs text-slate-500">
            Mínimo 8 caracteres, una mayúscula y un número.
          </p>

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            <div>
              <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-slate-400">
                Nueva contraseña
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                {...register('password')}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2.5 text-sm text-white placeholder-slate-600 outline-none ring-sky-500 transition focus:border-sky-500 focus:ring-1"
                placeholder="••••••••"
              />
              {errors.password && (
                <p className="mt-1.5 text-xs text-red-400">{errors.password.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="confirm" className="mb-1.5 block text-xs font-medium text-slate-400">
                Confirmar contraseña
              </label>
              <input
                id="confirm"
                type="password"
                autoComplete="new-password"
                {...register('confirm')}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2.5 text-sm text-white placeholder-slate-600 outline-none ring-sky-500 transition focus:border-sky-500 focus:ring-1"
                placeholder="••••••••"
              />
              {errors.confirm && (
                <p className="mt-1.5 text-xs text-red-400">{errors.confirm.message}</p>
              )}
            </div>

            {errorMsg && (
              <div className="rounded-lg border border-red-900 bg-red-950/50 px-4 py-3">
                <p className="text-xs text-red-400">{errorMsg}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-2 w-full rounded-lg bg-sky-600 py-2.5 text-sm font-medium text-white transition hover:bg-sky-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? 'Guardando…' : 'Guardar contraseña'}
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}
