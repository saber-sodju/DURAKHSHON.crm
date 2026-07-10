import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Pencil, Trash2, Search, Plus } from 'lucide-react'
import { api, apiErrorMessage } from '../lib/api'
import type { Page, Payment, Group, Student } from '../lib/types'
import { useMonthNames } from '../lib/i18nLists'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { formatDate, formatMoney } from '../lib/utils'
import PageHeader from '../components/PageHeader'
import {
  Button, Input, Select, Textarea, Field, Badge, Card, Modal, ConfirmDialog,
  TableSkeleton, Pagination,
} from '../components/ui'
import { ResponsiveTable } from '../components/ResponsiveTable'

interface PaymentDraft {
  student_id: string
  group_id: string
  month: string
  year: string
  amount: string
  paid_amount: string
  due_date: string
  paid_date: string
  method: string
  note: string
}

const now = new Date()
const emptyDraft: PaymentDraft = {
  student_id: '', group_id: '', month: String(now.getMonth() + 1), year: String(now.getFullYear()),
  amount: '', paid_amount: '0', due_date: '', paid_date: '', method: 'cash', note: '',
}

export default function Payments() {
  const { user } = useAuth()
  const { toast } = useToast()
  const { t } = useTranslation()
  const monthNames = useMonthNames()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const isStaff = user?.role === 'director' || user?.role === 'admin'

  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Payment | null>(null)
  const [deleting, setDeleting] = useState<Payment | null>(null)
  const [draft, setDraft] = useState<PaymentDraft>(emptyDraft)

  useEffect(() => {
    if (searchParams.get('new') === '1' && isStaff) {
      openCreate()
      searchParams.delete('new')
      setSearchParams(searchParams, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { data, isLoading } = useQuery({
    queryKey: ['payments', { search, statusFilter, page }],
    queryFn: async () => (await api.get<Page<Payment>>('/payments', {
      params: { search: search || undefined, status: statusFilter || undefined, page },
    })).data,
  })

  const { data: students } = useQuery({
    queryKey: ['students', 'all'],
    queryFn: async () => (await api.get<Page<Student>>('/students', { params: { page_size: 100 } })).data,
    enabled: isStaff,
  })
  const { data: groups } = useQuery({
    queryKey: ['groups', 'all'],
    queryFn: async () => (await api.get<Page<Group>>('/groups', { params: { page_size: 100 } })).data,
    enabled: isStaff,
  })

  function updateDraft(patch: Partial<PaymentDraft>) {
    const next = { ...draft, ...patch }
    // business rule: suggest the group price automatically
    if (patch.group_id !== undefined && !editing) {
      const group = groups?.items.find((g) => String(g.id) === patch.group_id)
      if (group && (!draft.amount || draft.amount === '0')) next.amount = group.price_per_month
      if (group && draft.amount && draft.group_id !== patch.group_id) next.amount = group.price_per_month
    }
    setDraft(next)
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        student_id: Number(draft.student_id),
        group_id: draft.group_id ? Number(draft.group_id) : null,
        month: Number(draft.month),
        year: Number(draft.year),
        amount: draft.amount,
        paid_amount: draft.paid_amount || '0',
        due_date: draft.due_date || null,
        paid_date: draft.paid_date || null,
        method: draft.method,
        note: draft.note,
      }
      if (editing) return (await api.put(`/payments/${editing.id}`, payload)).data
      return (await api.post('/payments', payload)).data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      toast(editing ? t('toasts.paymentUpdated') : t('toasts.paymentCreated'))
      setModalOpen(false)
    },
    onError: (e) => toast(apiErrorMessage(e), 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (payment: Payment) => (await api.delete(`/payments/${payment.id}`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      toast(t('toasts.paymentDeleted'))
      setDeleting(null)
    },
    onError: (e) => toast(apiErrorMessage(e), 'error'),
  })

  function openCreate() {
    setEditing(null)
    setDraft(emptyDraft)
    setModalOpen(true)
  }

  function openEdit(payment: Payment) {
    setEditing(payment)
    setDraft({
      student_id: String(payment.student_id), group_id: payment.group_id ? String(payment.group_id) : '',
      month: String(payment.month), year: String(payment.year),
      amount: payment.amount, paid_amount: payment.paid_amount,
      due_date: payment.due_date ?? '', paid_date: payment.paid_date ?? '',
      method: payment.method, note: payment.note,
    })
    setModalOpen(true)
  }

  const valid = draft.student_id && draft.amount && Number(draft.amount) > 0

  return (
    <>
      <PageHeader title={t('payments.title')} subtitle={t('payments.subtitle')}
                  actions={isStaff && <Button onClick={openCreate}><Plus size={16} /> {t('payments.addPayment')}</Button>} />
      <Card>
        <form className="flex flex-wrap gap-2 border-b border-slate-200 p-4"
              onSubmit={(e) => { e.preventDefault(); setPage(1); setSearch(searchInput) }}>
          {isStaff && (
            <Input className="w-full sm:max-w-xs" placeholder={t('payments.searchPlaceholder')}
                   value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
          )}
          <Select className="w-44" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}>
            <option value="">{t('payments.allStatuses')}</option>
            <option value="paid">{t('common.badge.paid')}</option>
            <option value="unpaid">{t('common.badge.unpaid')}</option>
            <option value="partial">{t('common.badge.partial')}</option>
            <option value="overdue">{t('common.badge.overdue')}</option>
          </Select>
          {isStaff && <Button type="submit" variant="secondary"><Search size={15} /></Button>}
        </form>

        {isLoading ? <TableSkeleton cols={8} /> : !data ? null : (
          <>
            <ResponsiveTable
              rows={data.items}
              rowKey={(p) => p.id}
              emptyTitle={t('payments.noPaymentsFound')}
              columns={[
                { key: 'student', header: t('payments.columnStudent'), primary: true,
                  cell: (p) => p.student_name },
                { key: 'group', header: t('payments.columnGroup'), cell: (p) => p.group_name ?? '—' },
                { key: 'period', header: t('payments.columnMonthYear'),
                  cell: (p) => `${monthNames[p.month - 1]} ${p.year}` },
                { key: 'amount', header: t('payments.columnAmount'), cell: (p) => formatMoney(p.amount) },
                { key: 'paid', header: t('payments.columnPaid'), cell: (p) => formatMoney(p.paid_amount) },
                { key: 'status', header: t('common.status'), cell: (p) => <Badge value={p.status} /> },
                { key: 'paidOn', header: t('payments.columnPaidOn'), cell: (p) => formatDate(p.paid_date) },
                ...(isStaff ? [{ key: 'actions', header: t('common.actions'), actions: true,
                  cell: (p: Payment) => (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(p)} title={t('common.edit')}>
                        <Pencil size={15} className="text-blue-600" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleting(p)} title={t('common.delete')}>
                        <Trash2 size={15} className="text-red-500" />
                      </Button>
                    </>
                  ) }] : []),
              ]}
            />
            <Pagination page={data.page} pageSize={data.page_size} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)}
             title={editing ? t('payments.editPayment') : t('payments.addPaymentTitle')} wide>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('payments.student')} required>
            <Select value={draft.student_id} onChange={(e) => updateDraft({ student_id: e.target.value })}>
              <option value="">{t('payments.selectStudent')}</option>
              {students?.items.map((s) => (
                <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
              ))}
            </Select>
          </Field>
          <Field label={t('payments.group')}>
            <Select value={draft.group_id} onChange={(e) => updateDraft({ group_id: e.target.value })}>
              <option value="">{t('payments.noGroup')}</option>
              {groups?.items.map((g) => (
                <option key={g.id} value={g.id}>{g.name} ({formatMoney(g.price_per_month)}{t('payments.perMonth')})</option>
              ))}
            </Select>
          </Field>
          <Field label={t('payments.month')} required>
            <Select value={draft.month} onChange={(e) => updateDraft({ month: e.target.value })}>
              {monthNames.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </Select>
          </Field>
          <Field label={t('payments.year')} required>
            <Input type="number" min={2000} max={2100} value={draft.year}
                   onChange={(e) => updateDraft({ year: e.target.value })} />
          </Field>
          <Field label={t('payments.amount')} required>
            <Input type="number" step="0.01" min="0" value={draft.amount}
                   onChange={(e) => updateDraft({ amount: e.target.value })} />
          </Field>
          <Field label={t('payments.paidAmount')}>
            <Input type="number" step="0.01" min="0" value={draft.paid_amount}
                   onChange={(e) => updateDraft({ paid_amount: e.target.value })} />
          </Field>
          <Field label={t('payments.dueDate')}>
            <Input type="date" value={draft.due_date} onChange={(e) => updateDraft({ due_date: e.target.value })} />
          </Field>
          <Field label={t('payments.paidDate')}>
            <Input type="date" value={draft.paid_date} onChange={(e) => updateDraft({ paid_date: e.target.value })} />
          </Field>
          <Field label={t('payments.method')}>
            <Select value={draft.method} onChange={(e) => updateDraft({ method: e.target.value })}>
              <option value="cash">{t('common.methods.cash')}</option>
              <option value="card">{t('common.methods.card')}</option>
              <option value="bank_transfer">{t('common.methods.bank_transfer')}</option>
              <option value="other">{t('common.methods.other')}</option>
            </Select>
          </Field>
        </div>
        <div className="mt-4">
          <Field label={t('common.notes')}>
            <Textarea value={draft.note} onChange={(e) => updateDraft({ note: e.target.value })} />
          </Field>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          {t('payments.statusHint')}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setModalOpen(false)}>{t('common.cancel')}</Button>
          <Button disabled={!valid} loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            {editing ? t('common.saveChanges') : t('payments.createPayment')}
          </Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMutation.mutate(deleting)}
        loading={deleteMutation.isPending}
        title={t('confirm.deletePaymentTitle')}
        message={t('confirm.deletePaymentMessage', {
          amount: deleting ? formatMoney(deleting.amount) : '',
          student: deleting?.student_name,
        })}
      />
    </>
  )
}
