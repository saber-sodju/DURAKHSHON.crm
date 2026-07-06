import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil, Trash2, Search, UserPlus } from 'lucide-react'
import { api, apiErrorMessage } from '../lib/api'
import type { Page, Teacher } from '../lib/types'
import { useToast } from '../context/ToastContext'
import PageHeader from '../components/PageHeader'
import {
  Button, Input, Select, Textarea, Field, Badge, Card, Modal, ConfirmDialog,
  TableShell, Th, Td, EmptyState, TableSkeleton, Pagination,
} from '../components/ui'

const teacherSchema = z.object({
  first_name: z.string().min(1, 'Required'),
  last_name: z.string().min(1, 'Required'),
  phone: z.string(),
  email: z.string().email().or(z.literal('')),
  subject: z.string(),
  status: z.enum(['active', 'inactive']),
  salary: z.string(),
  notes: z.string(),
})

type TeacherForm = z.infer<typeof teacherSchema>

const emptyForm: TeacherForm = {
  first_name: '', last_name: '', phone: '', email: '', subject: '', status: 'active', salary: '', notes: '',
}

export default function Teachers() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Teacher | null>(null)
  const [deleting, setDeleting] = useState<Teacher | null>(null)

  const { register, handleSubmit, reset, formState } = useForm<TeacherForm>({
    resolver: zodResolver(teacherSchema), defaultValues: emptyForm,
  })

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      openCreate()
      searchParams.delete('new')
      setSearchParams(searchParams, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { data, isLoading } = useQuery({
    queryKey: ['teachers', { search, page }],
    queryFn: async () => (await api.get<Page<Teacher>>('/teachers', {
      params: { search: search || undefined, page },
    })).data,
  })

  const saveMutation = useMutation({
    mutationFn: async (form: TeacherForm) => {
      const payload = { ...form, salary: form.salary === '' ? null : form.salary }
      if (editing) return (await api.put(`/teachers/${editing.id}`, payload)).data
      return (await api.post('/teachers', payload)).data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teachers'] })
      toast(editing ? 'Teacher updated' : 'Teacher created')
      setModalOpen(false)
    },
    onError: (e) => toast(apiErrorMessage(e), 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (teacher: Teacher) => (await api.delete(`/teachers/${teacher.id}`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teachers'] })
      toast('Teacher deactivated')
      setDeleting(null)
    },
    onError: (e) => toast(apiErrorMessage(e), 'error'),
  })

  function openCreate() {
    setEditing(null)
    reset(emptyForm)
    setModalOpen(true)
  }

  function openEdit(t: Teacher) {
    setEditing(t)
    reset({
      first_name: t.first_name, last_name: t.last_name, phone: t.phone, email: t.email,
      subject: t.subject, status: t.status as 'active' | 'inactive',
      salary: t.salary ?? '', notes: t.notes,
    })
    setModalOpen(true)
  }

  return (
    <>
      <PageHeader title="Teachers" subtitle="All teaching staff"
                  actions={<Button onClick={openCreate}><UserPlus size={16} /> Add Teacher</Button>} />
      <Card>
        <form className="flex flex-wrap gap-2 border-b border-slate-200 p-4"
              onSubmit={(e) => { e.preventDefault(); setPage(1); setSearch(searchInput) }}>
          <Input className="max-w-xs" placeholder="Search by name or subject..."
                 value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
          <Button type="submit" variant="secondary"><Search size={15} /> Search</Button>
        </form>

        {isLoading ? <TableSkeleton cols={6} /> : !data || data.items.length === 0 ? (
          <EmptyState title="No teachers found" />
        ) : (
          <>
            <TableShell>
              <thead className="bg-slate-50">
                <tr>
                  <Th>#</Th><Th>Name</Th><Th>Phone</Th><Th>Subject</Th><Th>Groups</Th><Th>Status</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((t, i) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <Td className="text-slate-400">{(data.page - 1) * data.page_size + i + 1}</Td>
                    <Td className="font-semibold text-slate-800">{t.first_name} {t.last_name}</Td>
                    <Td>{t.phone || '—'}</Td>
                    <Td>{t.subject || '—'}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {t.groups.map((g) => (
                          <span key={g.id} className="rounded-md bg-cyan-50 px-2 py-0.5 text-xs font-semibold text-cyan-700">
                            {g.name}
                          </span>
                        ))}
                      </div>
                    </Td>
                    <Td><Badge value={t.status} /></Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(t)} title="Edit">
                          <Pencil size={15} className="text-blue-600" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleting(t)} title="Deactivate">
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
             title={editing ? 'Edit Teacher' : 'Add Teacher'} wide>
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
            <Field label="Subject"><Input placeholder="e.g. Mathematics" {...register('subject')} /></Field>
            <Field label="Status">
              <Select {...register('status')}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </Field>
            <Field label="Salary (optional)"><Input type="number" step="0.01" min="0" {...register('salary')} /></Field>
          </div>
          <Field label="Notes"><Textarea {...register('notes')} /></Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" loading={saveMutation.isPending}>{editing ? 'Save changes' : 'Create teacher'}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMutation.mutate(deleting)}
        loading={deleteMutation.isPending}
        title="Deactivate teacher?"
        message={`${deleting?.first_name} ${deleting?.last_name} will be marked inactive.`}
      />
    </>
  )
}
