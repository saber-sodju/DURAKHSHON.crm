import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, Check, ShieldAlert } from 'lucide-react'
import type { GeneratedAccount } from '../lib/types'
import { Modal, Button, Card } from './ui'

function CopyField({ label, value }: { label: string; value: string }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  async function copy() {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
        <div className="truncate font-mono text-sm font-bold text-slate-800">{value}</div>
      </div>
      <Button type="button" size="sm" variant="secondary" onClick={copy} className="shrink-0">
        {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
        {copied ? t('studentForm.copied') : t('studentForm.copy')}
      </Button>
    </div>
  )
}

export default function CredentialsModal({ open, onClose, accounts, onCreateAnother, onViewProfile }: {
  open: boolean
  onClose: () => void
  accounts: GeneratedAccount[]
  /** omit both to show a single "Close" button instead (e.g. single reset-password action) */
  onCreateAnother?: () => void
  onViewProfile?: () => void
}) {
  const { t } = useTranslation()
  const [copiedAll, setCopiedAll] = useState(false)

  async function copyAll() {
    const text = accounts.map((a) =>
      `${a.role === 'student' ? t('studentForm.studentAccount') : t('studentForm.parentAccount')} — ${a.owner_name}\n` +
      `${t('studentForm.username')}: ${a.username}\n${t('studentForm.temporaryPassword')}: ${a.temporary_password}`,
    ).join('\n\n')
    await navigator.clipboard.writeText(text)
    setCopiedAll(true)
    setTimeout(() => setCopiedAll(false), 1500)
  }

  return (
    <Modal open={open} onClose={onClose} title={t('studentForm.credentialsTitle')}
           footer={
             <div className="flex flex-wrap justify-end gap-2">
               {onCreateAnother && onViewProfile ? (
                 <>
                   <Button type="button" variant="secondary" onClick={onCreateAnother}>{t('studentForm.createAnother')}</Button>
                   <Button type="button" onClick={onViewProfile}>{t('studentForm.goToProfile')}</Button>
                 </>
               ) : (
                 <Button type="button" onClick={onClose}>{t('common.close')}</Button>
               )}
             </div>
           }>
      <div className="space-y-4">
        {accounts.length === 0 ? (
          <p className="text-sm text-slate-500">{t('studentForm.noAccountsCreated')}</p>
        ) : (
          <>
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <ShieldAlert size={16} className="mt-0.5 shrink-0" />
              <span>{t('studentForm.credentialsShownOnce')}</span>
            </div>
            {accounts.map((a) => (
              <Card key={a.user_id} className="p-4">
                <div className="mb-2 text-sm font-bold text-slate-800">
                  {a.role === 'student' ? t('studentForm.studentAccount') : t('studentForm.parentAccount')}
                  {' — '}{a.owner_name}
                </div>
                <div className="space-y-2">
                  <CopyField label={t('studentForm.username')} value={a.username} />
                  <CopyField label={t('studentForm.temporaryPassword')} value={a.temporary_password} />
                </div>
              </Card>
            ))}
            <Button type="button" variant="secondary" className="w-full" onClick={copyAll}>
              {copiedAll ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}
              {t('studentForm.copyAllCredentials')}
            </Button>
          </>
        )}
      </div>
    </Modal>
  )
}
