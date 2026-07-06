import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Trash2, Search, Plus } from 'lucide-react'
import { api, apiErrorMessage } from '../lib/api'
import { MONTH_NAMES, type Page, type Payment, type Group, type Student } from '../lib/types'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { formatDate, formatMoney } from '../lib/utils'
import PageHeader from '../components/PageHeader'
import {
  Button, Input, Select, Textarea, Field, Badge, Card, Modal, ConfirmDialog,
  TableShell, Th, Td, EmptyState, TableSkeleton, Pagination,
} from '../components/ui'

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
      toast(editing ? 'Payment updated' : 'Payment created')
      setModalOpen(false)
    },
    onError: (e) => toast(apiErrorMessage(e), 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (payment: Payment) => (await api.delete(`/payments/${payment.id}`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      toast('Payment deleted')
      setDeleting(null)
    },
    onError: (e) => toast(apiErrorMessage(e), 'error'),
  })

  function openCreate() {
    setEditing(null)
    setDraft(emptyDraft)
    setModalOpen(true)
  }

  function openEdit(p: Payment) {
    setEditing(p)
    setDraft({
      student_id: String(p.student_id), group_id: p.group_id ? String(p.group_id) : '',
      month: String(p.month), year: String(p.year),
      amount: p.amount, paid_amount: p.paid_amount,
      due_date: p.due_date ?? '', paid_date: p.paid_date ?? '',
      method: p.method, note: p.note,
    })
    setModalOpen(true)
  }

  const valid = draft.student_id && draft.amount && Number(draft.amount) > 0

  return (
    <>
      <PageHeader title="Payments" subtitle="Track all student payments"
                  actions={isStaff && <Button onClick={openCreate}><Plus size={16} /> Add Payment</Button>} />
      <Card>
        <form className="flex flex-wrap gap-2 border-b border-slate-200 p-4"
              onSubmit={(e) => { e.preventDefault(); setPage(1); setSearch(searchInput) }}>
          {isStaff && (
            <Input className="max-w-xs" placeholder="Search student..."
                   value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
          )}
          <Select className="w-44" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}>
            <option value="">All statuses</option>
            <option value="paid">Paid</option>
            <option value="unpaid">Unpaid</option>
            <option value="partial">Partially Paid</option>
            <option value="overdue">Overdue</option>
          </Select>
          {isStaff && <Button type="submit" variant="secondary"><Search size={15} /></Button>}
        </form>

        {isLoading ? <TableSkeleton cols={8} /> : !data || data.items.length === 0 ? (
          <EmptyState title="No payments found" />
        ) : (
          <>
            <TableShell>
              <thead className="bg-slate-50">
                <tr>
                  <Th>#</Th><Th>Student</Th><Th>Group</Th><Th>Month/Year</Th><Th>Amount</Th>
                  <Th>Paid</Th><Th>Status</Th><Th>Paid on</Th>
                  {isStaff && <Th className="text-right">Actions</Th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((p, i) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <Td className="text-slate-400">{(data.page - 1) * data.page_size + i + 1}</Td>
                    <Td className="font-semibold text-slate-800">{p.student_name}</Td>
                    <Td>{p.group_name ?? '—'}</Td>
                    <Td>{MONTH_NAMES[p.month - 1]} {p.year}</Td>
                    <Td>{formatMoney(p.amount)}</Td>
                    <Td>{formatMoney(p.paid_amount)}</Td>
                    <Td><Badge value={p.status} /></Td>
                    <Td>{formatDate(p.paid_date)}</Td>
                    {isStaff && (
                      <Td className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(p)} title="Edit">
                            <Pencil size={15} className="text-blue-600" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setDeleting(p)} title="Delete">
                            <Trash2 size={15} className="text-red-500" />
                          </Button>
                        </div>
                      </Td>
                    )}
                  </tr>
                ))}
              </tbody>
            </TableShell>
            <Pagination page={data.page} pageSize={data.page_size} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)}
             title={editing ? 'Edit Payment' : 'Add Payment'} wide>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Student" required>
            <Select value={draft.student_id} onChange={(e) => updateDraft({ student_id: e.target.value })}>
              <option value="">— Select student —</option>
              {students?.items.map((s) => (
                <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Group">
            <Select value={draft.group_id} onChange={(e) => updateDraft({ group_id: e.target.value })}>
              <option value="">— No group —</option>
              {groups?.items.map((g) => (
                <option key={g.id} value={g.id}>{g.name} ({formatMoney(g.price_per_month)}/mo)</option>
              ))}
            </Select>
          </Field>
          <Field label="Month" required>
            <Select value={draft.month} onChange={(e) => updateDraft({ month: e.target.value })}>
              {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </Select>
          </Field>
          <Field label="Year" required>
            <Input type="number" min={2000} max={2100} value={draft.year}
                   onChange={(e) => updateDraft({ year: e.target.value })} />
          </Field>
          <Field label="Amount" required>
            <Input type="number" step="0.01" min="0" value={draft.amount}
                   onChange={(e) => updateDraft({ amount: e.target.value })} />
          </Field>
          <Field label="Paid amount">
            <Input type="number" step="0.01" min="0" value={draft.paid_amount}
                   onChange={(e) => updateDraft({ paid_amount: e.target.value })} />
          </Field>
          <Field label="Due date">
            <Input type="date" value={draft.due_date} onChange={(e) => updateDraft({ due_date: e.target.value })} />
          </Field>
          <Field label="Paid date">
            <Input type="date" value={draft.paid_date} onChange={(e) => updateDraft({ paid_date: e.target.value })} />
          </Field>
          <Field label="Method">
            <Select value={draft.method} onChange={(e) => updateDraft({ method: e.target.value })}>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="other">Other</option>
            </Select>
          </Field>
        </div>
        <div className="mt-4">
          <Field label="Note">
            <Textarea value={draft.note} onChange={(e) => updateDraft({ note: e.target.value })} />
          </Field>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Status is computed automatically: fully paid → Paid, partly paid → Partially Paid,
          past due date → Overdue.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button disabled={!valid} loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            {editing ? 'Save changes' : 'Create payment'}
          </Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMutation.mutate(deleting)}
        loading={deleteMutation.isPending}
        title="Delete payment?"
        message={`Payment of ${deleting ? formatMoney(deleting.amount) : ''} for ${deleting?.student_name} will be permanently removed.`}
      />
    </>
  )
}
