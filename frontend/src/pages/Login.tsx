import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
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

  // page background matches the logo artwork's own background, and the image
  // edges are faded out with a mask, so the logo melts into the page instead
  // of sitting in a visible square
  const logoFade = 'radial-gradient(ellipse at center, black 76%, transparent 98%)'

  return (
    <div className="relative flex min-h-full items-center justify-center p-4"
         style={{ backgroundColor: '#031429' }}>
      <LanguageSwitcher className="absolute right-4 top-4" />
      <div className="w-full max-w-md">
        <div className="mb-4 flex flex-col items-center">
          <img src="/logo.webp" alt="DURAKHSHON Learning Center"
               className="h-64 w-64 select-none sm:h-72 sm:w-72"
               style={{ maskImage: logoFade, WebkitMaskImage: logoFade }} />
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
        </form>
      </div>
    </div>
  )
}
