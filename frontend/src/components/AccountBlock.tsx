import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { KeyRound, UserPlus, ShieldCheck, ShieldOff } from 'lucide-react'
import { api, apiErrorMessage } from '../lib/api'
import { useToast } from '../context/ToastContext'
import type { AppUser, GeneratedAccount } from '../lib/types'
import { formatDate } from '../lib/utils'
import { Card, Button, Badge } from './ui'
import CredentialsModal from './CredentialsModal'

export default function AccountBlock({ userId, createAccountUrl, resetPasswordUrl, onChanged }: {
  userId: number | null
  createAccountUrl: string
  resetPasswordUrl: string
  onChanged: () => void
}) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const [account, setAccount] = useState<GeneratedAccount | null>(null)

  const { data: linkedUser } = useQuery({
    queryKey: ['users', userId],
    queryFn: async () => (await api.get<AppUser>(`/users/${userId}`)).data,
    enabled: userId !== null,
  })

  async function createAccount() {
    setBusy(true)
    try {
      const res = await api.post<GeneratedAccount>(createAccountUrl)
      setAccount(res.data)
      onChanged()
    } catch (e) {
      toast(apiErrorMessage(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function resetPassword() {
    setBusy(true)
    try {
      const res = await api.post<GeneratedAccount>(resetPasswordUrl)
      setAccount(res.data)
    } catch (e) {
      toast(apiErrorMessage(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-5">
      <h2 className="mb-3 font-bold text-slate-800">{t('studentForm.userAccount')}</h2>
      {userId === null ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-400">{t('studentForm.noAccountYet')}</p>
          <Button type="button" size="sm" loading={busy} onClick={createAccount}>
            <UserPlus size={14} /> {t('studentForm.createLoginAccount')}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="font-semibold text-slate-500">{t('users.username')}</dt>
              <dd className="text-slate-800">{linkedUser?.username ?? '…'}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="font-semibold text-slate-500">{t('common.status')}</dt>
              <dd>{linkedUser && <Badge value={linkedUser.is_active ? 'active' : 'inactive'} />}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="font-semibold text-slate-500">{t('studentForm.forcePasswordChange')}</dt>
              <dd className="flex items-center gap-1 text-slate-800">
                {linkedUser?.must_change_password
                  ? <><ShieldOff size={14} className="text-amber-600" /> {t('common.badge.active') /* yes */}</>
                  : <><ShieldCheck size={14} className="text-emerald-600" /> —</>}
              </dd>
            </div>
            {linkedUser?.last_login_at && (
              <div className="flex justify-between gap-3">
                <dt className="font-semibold text-slate-500">{t('sessions.lastActive')}</dt>
                <dd className="text-slate-800">{formatDate(linkedUser.last_login_at)}</dd>
              </div>
            )}
          </dl>
          <Button type="button" size="sm" variant="secondary" loading={busy} onClick={resetPassword}>
            <KeyRound size={14} /> {t('studentForm.resetPassword')}
          </Button>
        </div>
      )}

      <CredentialsModal
        open={!!account}
        onClose={() => setAccount(null)}
        accounts={account ? [account] : []}
      />
    </Card>
  )
}
