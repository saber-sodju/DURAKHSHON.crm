import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { Pencil, Trash2, Search, UserPlus } from 'lucide-react'
import { api, apiErrorMessage } from '../lib/api'
import type { Page, Teacher } from '../lib/types'
import { useToast } from '../context/ToastContext'
import PageHeader from '../components/PageHeader'
import {
  Button, Input, Select, Textarea, Field, Badge, Card, Modal, ConfirmDialog,
  TableShell, Th, Td, EmptyState, TableSkeleton, Pagination,
} from '../components/ui'

type TeacherForm = {
  first_name: string
  last_name: string
  phone: string
  email: string
  subject: string
  status: 'active' | 'inactive'
  salary: string
  notes: string
}

const emptyForm: TeacherForm = {
  first_name: '', last_name: '', phone: '', email: '', subject: '', status: 'active', salary: '', notes: '',
}

export default function Teachers() {
  const { toast } = useToast()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Teacher | null>(null)
  const [deleting, setDeleting] = useState<Teacher | null>(null)

  const teacherSchema = z.object({
    first_name: z.string().min(1, t('settings.required')),
    last_name: z.string().min(1, t('settings.required')),
    phone: z.string(),
    email: z.string().email().or(z.literal('')),
    subject: z.string(),
    status: z.enum(['active', 'inactive']),
    salary: z.string(),
    notes: z.string(),
  })

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
      toast(editing ? t('toasts.teacherUpdated') : t('toasts.teacherCreated'))
      setModalOpen(false)
    },
    onError: (e) => toast(apiErrorMessage(e), 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (teacher: Teacher) => (await api.delete(`/teachers/${teacher.id}`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teachers'] })
      toast(t('toasts.teacherDeactivated'))
      setDeleting(null)
    },
    onError: (e) => toast(apiErrorMessage(e), 'error'),
  })

  function openCreate() {
    setEditing(null)
    reset(emptyForm)
    setModalOpen(true)
  }

  function openEdit(teacher: Teacher) {
    setEditing(teacher)
    reset({
      first_name: teacher.first_name, last_name: teacher.last_name, phone: teacher.phone, email: teacher.email,
      subject: teacher.subject, status: teacher.status as 'active' | 'inactive',
      salary: teacher.salary ?? '', notes: teacher.notes,
    })
    setModalOpen(true)
  }

  return (
    <>
      <PageHeader title={t('teachers.title')} subtitle={t('teachers.subtitle')}
                  actions={<Button onClick={openCreate}><UserPlus size={16} /> {t('teachers.addTeacher')}</Button>} />
      <Card>
        <form className="flex flex-wrap gap-2 border-b border-slate-200 p-4"
              onSubmit={(e) => { e.preventDefault(); setPage(1); setSearch(searchInput) }}>
          <Input className="max-w-xs" placeholder={t('teachers.searchPlaceholder')}
                 value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
          <Button type="submit" variant="secondary"><Search size={15} /> {t('common.search')}</Button>
        </form>

        {isLoading ? <TableSkeleton cols={6} /> : !data || data.items.length === 0 ? (
          <EmptyState title={t('teachers.noTeachersFound')} />
        ) : (
          <>
            <TableShell>
              <thead className="bg-slate-50">
                <tr>
                  <Th>#</Th><Th>{t('students.columnName')}</Th><Th>{t('students.columnPhone')}</Th>
                  <Th>{t('teachers.columnSubject')}</Th><Th>{t('teachers.columnGroups')}</Th><Th>{t('common.status')}</Th>
                  <Th className="text-right">{t('common.actions')}</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((teacher, i) => (
                  <tr key={teacher.id} className="hover:bg-slate-50">
                    <Td className="text-slate-400">{(data.page - 1) * data.page_size + i + 1}</Td>
                    <Td className="font-semibold text-slate-800">{teacher.first_name} {teacher.last_name}</Td>
                    <Td>{teacher.phone || '—'}</Td>
                    <Td>{teacher.subject || '—'}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {teacher.groups.map((g) => (
                          <span key={g.id} className="rounded-md bg-cyan-50 px-2 py-0.5 text-xs font-semibold text-cyan-700">
                            {g.name}
                          </span>
                        ))}
                      </div>
                    </Td>
                    <Td><Badge value={teacher.status} /></Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(teacher)} title={t('common.edit')}>
                          <Pencil size={15} className="text-blue-600" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleting(teacher)} title={t('common.deactivate')}>
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
             title={editing ? t('teachers.editTeacher') : t('teachers.addTeacherTitle')} wide>
        <form onSubmit={handleSubmit((f) => saveMutation.mutate(f))} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('students.firstName')} required error={formState.errors.first_name?.message}>
              <Input {...register('first_name')} />
            </Field>
            <Field label={t('students.lastName')} required error={formState.errors.last_name?.message}>
              <Input {...register('last_name')} />
            </Field>
            <Field label={t('students.phone')}><Input {...register('phone')} /></Field>
            <Field label={t('students.email')} error={formState.errors.email?.message}><Input {...register('email')} /></Field>
            <Field label={t('teachers.columnSubject')}><Input placeholder={t('teachers.subjectPlaceholder')} {...register('subject')} /></Field>
            <Field label={t('common.status')}>
              <Select {...register('status')}>
                <option value="active">{t('common.badge.active')}</option>
                <option value="inactive">{t('common.badge.inactive')}</option>
              </Select>
            </Field>
            <Field label={t('teachers.salaryOptional')}><Input type="number" step="0.01" min="0" {...register('salary')} /></Field>
          </div>
          <Field label={t('common.notes')}><Textarea {...register('notes')} /></Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>{t('common.cancel')}</Button>
            <Button type="submit" loading={saveMutation.isPending}>{editing ? t('common.saveChanges') : t('teachers.createTeacher')}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMutation.mutate(deleting)}
        loading={deleteMutation.isPending}
        title={t('confirm.deactivateTeacherTitle')}
        message={t('confirm.deactivateTeacherMessage', { name: `${deleting?.first_name} ${deleting?.last_name}` })}
      />
    </>
  )
}
