import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, ExternalLink, Unlink } from 'lucide-react'
import { api, apiErrorMessage } from '../lib/api'
import type { Parent } from '../lib/types'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { formatDate } from '../lib/utils'
import PageHeader from '../components/PageHeader'
import { Card, Badge, EmptyState, TableSkeleton, ConfirmDialog } from '../components/ui'
import AccountBlock from '../components/AccountBlock'

export default function ParentDetails() {
  const { id } = useParams()
  const { user } = useAuth()
  const { t } = useTranslation()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const isStaff = user?.role === 'director' || user?.role === 'admin'

  const [unlinkTarget, setUnlinkTarget] = useState<{ id: number; name: string } | null>(null)

  const { data: parent, isLoading } = useQuery({
    queryKey: ['parents', id],
    queryFn: async () => (await api.get<Parent>(`/parents/${id}`)).data,
  })

  const unlinkMutation = useMutation({
    mutationFn: async (studentId: number) => (await api.delete(`/students/${studentId}/parents/${id}`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parents', id] })
      toast(t('studentForm.parentUnlinked'))
      setUnlinkTarget(null)
    },
    onError: (e) => toast(apiErrorMessage(e), 'error'),
  })

  if (isLoading || !parent) return <Card><TableSkeleton /></Card>

  return (
    <>
      <Link to="/parents" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:underline">
        <ArrowLeft size={15} /> {t('parentDetails.back')}
      </Link>
      <PageHeader
        title={`${parent.first_name} ${parent.last_name}`}
        subtitle={t('parentDetails.subtitle')}
        actions={<Badge value={parent.status} className="text-sm" />}
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-3 font-bold text-slate-800">{t('studentDetails.details')}</h2>
            <dl className="space-y-2.5 text-sm">
              {[
                [t('students.phone'), parent.phone || '—'],
                [t('students.email'), parent.email || '—'],
                [t('common.notes'), parent.notes || '—'],
                [t('users.columnCreated'), formatDate(parent.created_at)],
              ].map(([label, value]) => (
                <div key={label as string} className="flex justify-between gap-4">
                  <dt className="shrink-0 font-semibold text-slate-500">{label}</dt>
                  <dd className="text-right text-slate-800">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          {isStaff && (
            <AccountBlock
              userId={parent.user_id}
              createAccountUrl={`/parents/${id}/create-account`}
              resetPasswordUrl={`/parents/${id}/reset-password`}
              onChanged={() => queryClient.invalidateQueries({ queryKey: ['parents', id] })}
            />
          )}
        </div>

        <div className="space-y-6 xl:col-span-2">
          <Card className="p-5">
            <h2 className="mb-3 font-bold text-slate-800">{t('parentDetails.children')}</h2>
            {parent.children.length === 0 ? <EmptyState title={t('parents.noStudentsHint')} /> : (
              <div className="space-y-2.5">
                {parent.children.map((c) => (
                  <div key={c.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-bold text-slate-800">{c.first_name} {c.last_name}</span>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {c.relation && <Badge value={c.relation} />}
                        {c.status && <Badge value={c.status} />}
                      </div>
                    </div>
                    {isStaff && (
                      <div className="mt-2 flex gap-3">
                        <Link to={`/students/${c.id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline">
                          <ExternalLink size={12} /> {t('studentForm.viewStudent')}
                        </Link>
                        <button type="button" onClick={() => setUnlinkTarget({ id: c.id, name: `${c.first_name} ${c.last_name}` })}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-red-500 hover:underline">
                          <Unlink size={12} /> {t('studentForm.removeLink')}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={!!unlinkTarget}
        onClose={() => setUnlinkTarget(null)}
        onConfirm={() => unlinkTarget && unlinkMutation.mutate(unlinkTarget.id)}
        loading={unlinkMutation.isPending}
        title={t('studentForm.removeLinkTitle')}
        message={t('studentForm.removeLinkMessage', { name: unlinkTarget?.name })}
      />
    </>
  )
}
