import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { KeyRound } from 'lucide-react'
import { api, apiErrorMessage } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import PageHeader from '../components/PageHeader'
import { Button, Card, Input, Field, Badge } from '../components/ui'

const schema = z.object({
  current_password: z.string().min(1, 'Required'),
  new_password: z.string().min(8, 'At least 8 characters'),
  confirm: z.string(),
}).refine((d) => d.new_password === d.confirm, { message: 'Passwords do not match', path: ['confirm'] })

type FormData = z.infer<typeof schema>

export default function SettingsPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const { register, handleSubmit, reset, formState } = useForm<FormData>({ resolver: zodResolver(schema) })

  async function onSubmit(data: FormData) {
    try {
      await api.post('/auth/change-password', {
        current_password: data.current_password,
        new_password: data.new_password,
      })
      toast('Password changed')
      reset()
    } catch (e) {
      toast(apiErrorMessage(e), 'error')
    }
  }

  return (
    <>
      <PageHeader title="Settings" subtitle="Your account" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="mb-4 font-bold text-slate-800">Account</h2>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between"><dt className="font-semibold text-slate-500">Username</dt><dd>{user?.username}</dd></div>
            <div className="flex justify-between"><dt className="font-semibold text-slate-500">Full name</dt><dd>{user?.full_name || '—'}</dd></div>
            <div className="flex justify-between"><dt className="font-semibold text-slate-500">Email</dt><dd>{user?.email ?? '—'}</dd></div>
            <div className="flex justify-between items-center"><dt className="font-semibold text-slate-500">Role</dt><dd><Badge value={user?.role ?? ''} /></dd></div>
          </dl>
        </Card>
        <Card className="p-6">
          <h2 className="mb-4 flex items-center gap-2 font-bold text-slate-800">
            <KeyRound size={17} /> Change Password
          </h2>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Field label="Current password" required error={formState.errors.current_password?.message}>
              <Input type="password" autoComplete="current-password" {...register('current_password')} />
            </Field>
            <Field label="New password" required error={formState.errors.new_password?.message}>
              <Input type="password" autoComplete="new-password" {...register('new_password')} />
            </Field>
            <Field label="Confirm new password" required error={formState.errors.confirm?.message}>
              <Input type="password" autoComplete="new-password" {...register('confirm')} />
            </Field>
            <Button type="submit" loading={formState.isSubmitting}>Update password</Button>
          </form>
        </Card>
      </div>
    </>
  )
}
