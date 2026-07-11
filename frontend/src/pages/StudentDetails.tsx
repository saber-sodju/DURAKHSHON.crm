import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, UserPlus, ExternalLink, Unlink } from 'lucide-react'
import { api, apiErrorMessage, getDuplicateParents } from '../lib/api'
import type { Student, Page, AttendanceRecord, Payment, Grade, GeneratedAccount } from '../lib/types'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { formatDate, formatMoney } from '../lib/utils'
import PageHeader from '../components/PageHeader'
import {
  Card, Badge, TableShell, Th, Td, EmptyState, TableSkeleton, Button, Modal, ConfirmDialog,
} from '../components/ui'
import ParentPicker, { type GuardianEntry } from '../components/ParentPicker'
import CredentialsModal from '../components/CredentialsModal'
import AccountBlock from '../components/AccountBlock'

export default function StudentDetails() {
  const { id } = useParams()
  const { user } = useAuth()
  const { t } = useTranslation()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const canSeePayments = user?.role !== 'teacher'
  const isStaff = user?.role === 'director' || user?.role === 'admin'

  const [addParentOpen, setAddParentOpen] = useState(false)
  const [addEntries, setAddEntries] = useState<GuardianEntry[]>([])
  const [saving, setSaving] = useState(false)
  const [pendingAccounts, setPendingAccounts] = useState<GeneratedAccount[]>([])
  const [unlinkTarget, setUnlinkTarget] = useState<{ id: number; name: string } | null>(null)

  const { data: student, isLoading } = useQuery({
    queryKey: ['students', id],
    queryFn: async () => (await api.get<Student>(`/students/${id}`)).data,
  })
  const { data: attendance } = useQuery({
    queryKey: ['attendance', { student: id }],
    queryFn: async () => (await api.get<Page<AttendanceRecord>>('/attendance', {
      params: { student_id: id, page_size: 10 },
    })).data,
  })
  const { data: payments } = useQuery({
    queryKey: ['payments', { student: id }],
    queryFn: async () => (await api.get<Page<Payment>>('/payments', {
      params: { student_id: id, page_size: 10 },
    })).data,
    enabled: canSeePayments,
  })
  const { data: grades } = useQuery({
    queryKey: ['grades', { student: id }],
    queryFn: async () => (await api.get<Page<Grade>>('/grades', {
      params: { student_id: id, page_size: 10 },
    })).data,
  })

  const unlinkMutation = useMutation({
    mutationFn: async (parentId: number) => (await api.delete(`/students/${id}/parents/${parentId}`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students', id] })
      toast(t('studentForm.parentUnlinked'))
      setUnlinkTarget(null)
    },
    onError: (e) => toast(apiErrorMessage(e), 'error'),
  })

  async function saveNewParents() {
    setSaving(true)
    const created: GeneratedAccount[] = []
    for (const entry of addEntries) {
      try {
        if (entry.kind === 'existing') {
          await api.post(`/students/${id}/parents`, {
            parent_id: entry.existingParent!.id, relation: entry.relation,
          })
        } else {
          const res = await api.post(`/students/${id}/parents/new`, {
            first_name: entry.newData!.first_name, last_name: entry.newData!.last_name,
            phone: entry.newData!.phone, email: entry.newData!.email, notes: entry.newData!.notes,
            relation: entry.relation, create_user_account: entry.newData!.create_user_account,
            allow_duplicate: !!entry.allowDuplicate,
          })
          if (res.data.account) created.push(res.data.account)
        }
        setAddEntries((prev) => prev.filter((e) => e.key !== entry.key))
      } catch (e) {
        const duplicates = getDuplicateParents(e)
        if (duplicates && duplicates[0]) {
          setAddEntries((prev) => prev.map((x) => (x.key === entry.key ? { ...x, duplicateWarning: duplicates[0] } : x)))
        } else {
          toast(apiErrorMessage(e), 'error')
        }
        setSaving(false)
        return
      }
    }
    setSaving(false)
    queryClient.invalidateQueries({ queryKey: ['students', id] })
    setAddParentOpen(false)
    if (created.length > 0) setPendingAccounts(created)
    toast(t('studentForm.parentsUpdated'))
  }

  if (isLoading || !student) return <Card><TableSkeleton /></Card>

  const genderLabel = student.gender === 'male' ? t('common.male')
    : student.gender === 'female' ? t('common.female') : '—'

  return (
    <>
      <Link to="/students" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:underline">
        <ArrowLeft size={15} /> {t('studentDetails.back')}
      </Link>
      <PageHeader
        title={`${student.first_name} ${student.last_name}`}
        subtitle={t('studentDetails.subtitle', { date: formatDate(student.enrollment_date) })}
        actions={<Badge value={student.status} className="text-sm" />}
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-3 font-bold text-slate-800">{t('studentDetails.details')}</h2>
            <dl className="space-y-2.5 text-sm">
              {[
                [t('students.phone'), student.phone || '—'],
                [t('students.email'), student.email || '—'],
                [t('students.dateOfBirth'), formatDate(student.date_of_birth)],
                [t('students.gender'), genderLabel],
                [t('common.notes'), student.notes || '—'],
              ].map(([label, value]) => (
                <div key={label as string} className="flex justify-between gap-4">
                  <dt className="shrink-0 font-semibold text-slate-500">{label}</dt>
                  <dd className="text-right text-slate-800">{value}</dd>
                </div>
              ))}
            </dl>
            <h3 className="mb-2 mt-5 text-xs font-bold uppercase tracking-wide text-slate-500">{t('students.groups')}</h3>
            {student.groups.length === 0 ? <p className="text-sm text-slate-400">{t('studentDetails.notInGroup')}</p> : (
              <div className="flex flex-wrap gap-1.5">
                {student.groups.map((g) => (
                  <Link key={g.id} to={`/groups/${g.id}`}
                        className="rounded-md bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100">
                    {g.name}
                  </Link>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold text-slate-800">{t('studentForm.parentsGuardians')}</h2>
              {isStaff && (
                <Button type="button" size="sm" variant="secondary" onClick={() => { setAddEntries([]); setAddParentOpen(true) }}>
                  <UserPlus size={14} /> {t('studentForm.addParent')}
                </Button>
              )}
            </div>
            {student.parents.length === 0 ? (
              <p className="text-sm text-slate-400">{t('studentDetails.notLinked')}</p>
            ) : (
              <div className="space-y-2.5">
                {student.parents.map((p) => (
                  <div key={p.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-bold text-slate-800">{p.first_name} {p.last_name}</span>
                      {p.relation && <Badge value={p.relation} className="shrink-0" />}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {p.phone || '—'}
                      {' · '}
                      {p.user_id ? t('studentForm.hasAccount') : t('studentForm.noAccountYet')}
                    </div>
                    {isStaff && (
                      <div className="mt-2 flex gap-3">
                        <Link to={`/parents/${p.id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline">
                          <ExternalLink size={12} /> {t('studentForm.viewParent')}
                        </Link>
                        <button type="button" onClick={() => setUnlinkTarget({ id: p.id, name: `${p.first_name} ${p.last_name}` })}
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

          {isStaff && (
            <AccountBlock
              userId={student.user_id}
              createAccountUrl={`/students/${id}/create-account`}
              resetPasswordUrl={`/students/${id}/reset-password`}
              onChanged={() => queryClient.invalidateQueries({ queryKey: ['students', id] })}
            />
          )}
        </div>

        <div className="space-y-6 xl:col-span-2">
          <Card>
            <div className="flex items-center justify-between px-5 pt-4">
              <h2 className="font-bold text-slate-800">{t('studentDetails.recentAttendance')}</h2>
              <Link to={`/attendance?student_id=${student.id}`}><Button variant="secondary" size="sm">{t('studentDetails.viewAll')}</Button></Link>
            </div>
            {!attendance || attendance.items.length === 0 ? <EmptyState title={t('studentDetails.noAttendance')} /> : (
              <TableShell>
                <thead><tr><Th>{t('studentDetails.columnDate')}</Th><Th>{t('studentDetails.columnGroup')}</Th><Th>{t('studentDetails.columnStatus')}</Th><Th>{t('studentDetails.columnNote')}</Th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {attendance.items.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <Td>{formatDate(r.date)}</Td>
                      <Td>{r.group_name}</Td>
                      <Td><Badge value={r.status} /></Td>
                      <Td className="text-slate-400">{r.note || '—'}</Td>
                    </tr>
                  ))}
                </tbody>
              </TableShell>
            )}
          </Card>

          <Card>
            <h2 className="px-5 pt-4 font-bold text-slate-800">{t('studentDetails.examResults')}</h2>
            {!grades || grades.items.length === 0 ? <EmptyState title={t('studentDetails.noGrades')} /> : (
              <TableShell>
                <thead><tr><Th>{t('studentDetails.columnExam')}</Th><Th>{t('studentDetails.columnGroup')}</Th><Th>{t('studentDetails.columnScore')}</Th><Th>%</Th><Th>{t('studentDetails.columnGrade')}</Th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {grades.items.map((g) => (
                    <tr key={g.id} className="hover:bg-slate-50">
                      <Td className="font-semibold">{g.exam_title}</Td>
                      <Td>{g.group_name}</Td>
                      <Td>{g.score}{g.max_score ? ` / ${g.max_score}` : ''}</Td>
                      <Td>{g.percentage}%</Td>
                      <Td><span className="font-bold text-slate-800">{g.grade_label || '—'}</span></Td>
                    </tr>
                  ))}
                </tbody>
              </TableShell>
            )}
          </Card>

          {canSeePayments && (
            <Card>
              <h2 className="px-5 pt-4 font-bold text-slate-800">{t('studentDetails.payments')}</h2>
              {!payments || payments.items.length === 0 ? <EmptyState title={t('studentDetails.noPayments')} /> : (
                <TableShell>
                  <thead><tr><Th>{t('studentDetails.columnPeriod')}</Th><Th>{t('studentDetails.columnGroup')}</Th><Th>{t('studentDetails.columnAmount')}</Th><Th>{t('studentDetails.columnPaid')}</Th><Th>{t('studentDetails.columnStatus')}</Th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {payments.items.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <Td>{p.month.toString().padStart(2, '0')}/{p.year}</Td>
                        <Td>{p.group_name ?? '—'}</Td>
                        <Td>{formatMoney(p.amount)}</Td>
                        <Td>{formatMoney(p.paid_amount)}</Td>
                        <Td><Badge value={p.status} /></Td>
                      </tr>
                    ))}
                  </tbody>
                </TableShell>
              )}
            </Card>
          )}
        </div>
      </div>

      <Modal open={addParentOpen} onClose={() => setAddParentOpen(false)} title={t('studentForm.addParent')} wide
             footer={
               <div className="flex justify-end gap-2">
                 <Button type="button" variant="secondary" onClick={() => setAddParentOpen(false)}>{t('common.cancel')}</Button>
                 <Button type="button" loading={saving} disabled={addEntries.length === 0} onClick={saveNewParents}>
                   {t('common.save')}
                 </Button>
               </div>
             }>
        <ParentPicker entries={addEntries} onChange={setAddEntries} />
      </Modal>

      <CredentialsModal
        open={pendingAccounts.length > 0}
        onClose={() => setPendingAccounts([])}
        accounts={pendingAccounts}
      />

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
