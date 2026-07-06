import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil, Trash2, Search, UserPlus } from 'lucide-react'
import { api, apiErrorMessage } from '../lib/api'
import type { Page, Parent, Student } from '../lib/types'
import { useToast } from '../context/ToastContext'
import PageHeader from '../components/PageHeader'
import {
  Button, Input, Textarea, Field, Card, Modal, ConfirmDialog,
  TableShell, Th, Td, EmptyState, TableSkeleton, Pagination,
} from '../components/ui'

const parentSchema = z.object({
  first_name: z.string().min(1, 'Required'),
  last_name: z.string().min(1, 'Required'),
  phone: z.string(),
  email: z.string().email().or(z.literal('')),
  notes: z.string(),
})

type ParentForm = z.infer<typeof parentSchema>

const emptyForm: ParentForm = { first_name: '', last_name: '', phone: '', email: '', notes: '' }

export default function Parents() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Parent | null>(null)
  const [deleting, setDeleting] = useState<Parent | null>(null)
  const [childIds, setChildIds] = useState<number[]>([])

  const { register, handleSubmit, reset, formState } = useForm<ParentForm>({
    resolver: zodResolver(parentSchema), defaultValues: emptyForm,
  })

  const { data, isLoading } = useQuery({
    queryKey: ['parents', { search, page }],
    queryFn: async () => (await api.get<Page<Parent>>('/parents', {
      params: { search: search || undefined, page },
    })).data,
  })

  const { data: students } = useQuery({
    queryKey: ['students', 'all'],
    queryFn: async () => (await api.get<Page<Student>>('/students', { params: { page_size: 100 } })).data,
  })

  const saveMutation = useMutation({
    mutationFn: async (form: ParentForm) => {
      const payload = { ...form, child_ids: childIds }
      if (editing) return (await api.put(`/parents/${editing.id}`, payload)).data
      return (await api.post('/parents', payload)).data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parents'] })
      queryClient.invalidateQueries({ queryKey: ['students'] })
      toast(editing ? 'Parent updated' : 'Parent created')
      setModalOpen(false)
    },
    onError: (e) => toast(apiErrorMessage(e), 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (parent: Parent) => (await api.delete(`/parents/${parent.id}`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parents'] })
      toast('Parent deleted')
      setDeleting(null)
    },
    onError: (e) => toast(apiErrorMessage(e), 'error'),
  })

  function openCreate() {
    setEditing(null)
    setChildIds([])
    reset(emptyForm)
    setModalOpen(true)
  }

  function openEdit(p: Parent) {
    setEditing(p)
    setChildIds(p.children.map((c) => c.id))
    reset({ first_name: p.first_name, last_name: p.last_name, phone: p.phone, email: p.email, notes: p.notes })
    setModalOpen(true)
  }

  return (
    <>
      <PageHeader title="Parents" subtitle="All parent contacts"
                  actions={<Button onClick={openCreate}><UserPlus size={16} /> Add Parent</Button>} />
      <Card>
        <form className="flex flex-wrap gap-2 border-b border-slate-200 p-4"
              onSubmit={(e) => { e.preventDefault(); setPage(1); setSearch(searchInput) }}>
          <Input className="max-w-xs" placeholder="Search..." value={searchInput}
                 onChange={(e) => setSearchInput(e.target.value)} />
          <Button type="submit" variant="secondary"><Search size={15} /> Search</Button>
        </form>

        {isLoading ? <TableSkeleton cols={5} /> : !data || data.items.length === 0 ? (
          <EmptyState title="No parents found" />
        ) : (
          <>
            <TableShell>
              <thead className="bg-slate-50">
                <tr>
                  <Th>#</Th><Th>Name</Th><Th>Phone</Th><Th>Email</Th><Th>Children</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((p, i) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <Td className="text-slate-400">{(data.page - 1) * data.page_size + i + 1}</Td>
                    <Td className="font-semibold text-slate-800">{p.first_name} {p.last_name}</Td>
                    <Td>{p.phone || '—'}</Td>
                    <Td>{p.email || '—'}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {p.children.map((c) => (
                          <span key={c.id} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                            {c.first_name} {c.last_name}
                          </span>
                        ))}
                      </div>
                    </Td>
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
                  </tr>
                ))}
              </tbody>
            </TableShell>
            <Pagination page={data.page} pageSize={data.page_size} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)}
             title={editing ? 'Edit Parent' : 'Add Parent'}>
        <form onSubmit={handleSubmit((f) => saveMutation.mutate(f))} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" required error={formState.errors.first_name?.message}>
              <Input {...register('first_name')} />
            </Field>
            <Field label="Last name" required error={formState.errors.last_name?.message}>
              <Input {...register('last_name')} />
            </Field>
            <Field label="Phone"><Input {...register('phone')} /></Field>
            <Field label="Email" error={formState.errors.email?.message}><Input {...register('email')} /></Field>
          </div>
          <Field label="Children">
            <div className="flex max-h-36 flex-wrap gap-2 overflow-y-auto rounded-lg border border-slate-200 p-2.5">
              {(students?.items ?? []).map((s) => {
                const checked = childIds.includes(s.id)
                return (
                  <button key={s.id} type="button"
                          onClick={() => setChildIds(checked ? childIds.filter((id) => id !== s.id) : [...childIds, s.id])}
                          className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                            checked ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}>
                    {s.first_name} {s.last_name}
                  </button>
                )
              })}
              {(students?.items ?? []).length === 0 && <p className="text-xs text-slate-400">No students yet.</p>}
            </div>
          </Field>
          <Field label="Notes"><Textarea {...register('notes')} /></Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" loading={saveMutation.isPending}>{editing ? 'Save changes' : 'Create parent'}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMutation.mutate(deleting)}
        loading={deleteMutation.isPending}
        title="Delete parent?"
        message={`${deleting?.first_name} ${deleting?.last_name} will be removed. Children stay in the system.`}
      />
    </>
  )
}
