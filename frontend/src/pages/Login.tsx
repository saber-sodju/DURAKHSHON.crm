import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { GraduationCap } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { apiErrorMessage } from '../lib/api'
import { Button, Input, Field } from '../components/ui'
import LanguageSwitcher from '../components/LanguageSwitcher'

export default function Login() {
  const { user, loading, login } = useAuth()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [error, setError] = useState('')

  const schema = z.object({
    username: z.string().min(1, t('login.usernameRequired')),
    password: z.string().min(1, t('login.passwordRequired')),
  })
  type FormData = z.infer<typeof schema>
  const { register, handleSubmit, formState } = useForm<FormData>({ resolver: zodResolver(schema) })

  if (!loading && user) return <Navigate to="/" replace />

  async function onSubmit(data: FormData) {
    setError('')
    try {
      await login(data.username, data.password)
      navigate('/')
    } catch (e) {
      setError(apiErrorMessage(e))
    }
  }

  return (
    <div className="relative flex min-h-full items-center justify-center bg-slate-900 p-4">
      <LanguageSwitcher className="absolute right-4 top-4" />
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="rounded-2xl bg-blue-600/20 p-4">
            <GraduationCap size={40} className="text-blue-400" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-wide text-white">{t('login.appTitle')}</h1>
          <p className="text-sm text-slate-400">{t('login.appSubtitle')}</p>
        </div>
        <form onSubmit={handleSubmit(onSubmit)}
              className="space-y-4 rounded-2xl bg-white p-8 shadow-2xl">
          <h2 className="text-lg font-bold text-slate-800">{t('login.heading')}</h2>
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          <Field label={t('login.username')} error={formState.errors.username?.message} required>
            <Input placeholder="username" autoComplete="username" {...register('username')} />
          </Field>
          <Field label={t('login.password')} error={formState.errors.password?.message} required>
            <Input type="password" placeholder="••••••••" autoComplete="current-password" {...register('password')} />
          </Field>
          <Button type="submit" className="w-full" loading={formState.isSubmitting}>
            {t('login.signIn')}
          </Button>
          <p className="text-center text-xs text-slate-400">
            {t('login.demoUsers')}
          </p>
        </form>
      </div>
    </div>
  )
}
