import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { KeyRound, Languages, ShieldAlert } from 'lucide-react'
import { api, apiErrorMessage } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { SUPPORTED_LANGUAGES } from '../i18n'
import PageHeader from '../components/PageHeader'
import { Button, Card, Input, Field, Badge, Select } from '../components/ui'
import SessionsPanel from '../components/SessionsPanel'
import BackupsPanel from '../components/BackupsPanel'

export default function SettingsPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const { t, i18n } = useTranslation()

  const schema = z.object({
    current_password: z.string().min(1, t('settings.required')),
    new_password: z.string().min(8, t('settings.minChars')),
    confirm: z.string(),
  }).refine((d) => d.new_password === d.confirm, { message: t('settings.passwordsNoMatch'), path: ['confirm'] })
  type FormData = z.infer<typeof schema>

  const { register, handleSubmit, reset, formState } = useForm<FormData>({ resolver: zodResolver(schema) })

  async function onSubmit(data: FormData) {
    try {
      await api.post('/auth/change-password', {
        current_password: data.current_password,
        new_password: data.new_password,
      })
      toast(t('settings.passwordChanged'))
      reset()
    } catch (e) {
      toast(apiErrorMessage(e), 'error')
    }
  }

  return (
    <>
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />
      {user?.must_change_password && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <ShieldAlert size={20} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-bold">{t('settings.mustChangePasswordTitle')}</p>
            <p className="mt-0.5">{t('settings.mustChangePasswordBody')}</p>
          </div>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="mb-4 font-bold text-slate-800">{t('settings.account')}</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between"><dt className="font-semibold text-slate-500">{t('settings.username')}</dt><dd>{user?.username}</dd></div>
              <div className="flex justify-between"><dt className="font-semibold text-slate-500">{t('settings.fullName')}</dt><dd>{user?.full_name || '—'}</dd></div>
              <div className="flex justify-between"><dt className="font-semibold text-slate-500">{t('settings.email')}</dt><dd>{user?.email ?? '—'}</dd></div>
              <div className="flex justify-between items-center"><dt className="font-semibold text-slate-500">{t('settings.role')}</dt><dd><Badge value={user?.role ?? ''} /></dd></div>
            </dl>
          </Card>
          <Card className="p-6">
            <h2 className="mb-4 flex items-center gap-2 font-bold text-slate-800">
              <Languages size={17} /> {t('settings.language')}
            </h2>
            <Select value={i18n.resolvedLanguage ?? i18n.language}
                    onChange={(e) => i18n.changeLanguage(e.target.value)}>
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>{lang.label}</option>
              ))}
            </Select>
          </Card>
        </div>
        <Card className="p-6">
          <h2 className="mb-4 flex items-center gap-2 font-bold text-slate-800">
            <KeyRound size={17} /> {t('settings.changePassword')}
          </h2>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Field label={t('settings.currentPassword')} required error={formState.errors.current_password?.message}>
              <Input type="password" autoComplete="current-password" {...register('current_password')} />
            </Field>
            <Field label={t('settings.newPassword')} required error={formState.errors.new_password?.message}>
              <Input type="password" autoComplete="new-password" {...register('new_password')} />
            </Field>
            <Field label={t('settings.confirmNewPassword')} required error={formState.errors.confirm?.message}>
              <Input type="password" autoComplete="new-password" {...register('confirm')} />
            </Field>
            <Button type="submit" loading={formState.isSubmitting}>{t('settings.updatePassword')}</Button>
          </form>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <SessionsPanel />
        {user?.role === 'director' && <BackupsPanel />}
      </div>
    </>
  )
}
