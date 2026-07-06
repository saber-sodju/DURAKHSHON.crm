import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { Pencil, Trash2, Search, UserPlus } from 'lucide-react'
import { api, apiErrorMessage } from '../lib/api'
import type { Page, Student, Group, Parent } from '../lib/types'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import PageHeader from '../components/PageHeader'
import {
  Button, Input, Select, Textarea, Field, Badge, Card, Modal, ConfirmDialog,
  TableShell, Th, Td, EmptyState, TableSkeleton, Pagination,
} from '../components/ui'

type StudentForm = {
  first_name: string
  last_name: string
  phone: string
  email: string
  date_of_birth: string | null
  gender: string
  status: 'active' | 'inactive'
  enrollment_date: string | null
  notes: string
}

const emptyForm: StudentForm = {
  first_name: '', last_name: '', phone: '', email: '', date_of_birth: '',
  gender: '', status: 'active', enrollment_date: '', notes: '',
}

function CheckboxList({ options, selected, onChange, empty }: {
  options: { id: number; label: string }[]
  selected: number[]
  onChange: (ids: number[]) => void
  empty: string
}) {
  if (options.length === 0) return <p className="text-xs text-slate-400">{empty}</p>
  return (
    <div className="flex max-h-36 flex-wrap gap-2 overflow-y-auto rounded-lg border border-slate-200 p-2.5">
      {options.map((o) => {
        const checked = selected.includes(o.id)
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(checked ? selected.filter((id) => id !== o.id) : [...selected, o.id])}
            className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
              checked ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export default function Students() {
  const { user } = useAuth()
  const { toast } = useToast()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const isStaff = user?.role === 'director' || user?.role === 'admin'

  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [groupFilter, setGroupFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Student | null>(null)
  const [deleting, setDeleting] = useState<Student | null>(null)
  const [parentIds, setParentIds] = useState<number[]>([])
  const [groupIds, setGroupIds] = useState<number[]>([])

  const studentSchema = z.object({
    first_name: z.string().min(1, t('settings.required')),
    last_name: z.string().min(1, t('settings.required')),
    phone: z.string(),
    email: z.string().email().or(z.literal('')),
    date_of_birth: z.string().nullable(),
    gender: z.string(),
    status: z.enum(['active', 'inactive']),
    enrollment_date: z.string().nullable(),
    notes: z.string(),
  })

  const { register, handleSubmit, reset, formState } = useForm<StudentForm>({
    resolver: zodResolver(studentSchema), defaultValues: emptyForm,
  })

  useEffect(() => {
    if (searchParams.get('new') === '1' && isStaff) {
      openCreate()
      searchParams.delete('new')
      setSearchParams(searchParams, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { data, isLoading } = useQuery({
    queryKey: ['students', { search, groupFilter, statusFilter, page }],
    queryFn: async () => (await api.get<Page<Student>>('/students', {
      params: {
        search: search || undefined,
        group_id: groupFilter || undefined,
        status: statusFilter || undefined,
        page,
      },
    })).data,
  })

  const { data: groups } = useQuery({
    queryKey: ['groups', 'all'],
    queryFn: async () => (await api.get<Page<Group>>('/groups', { params: { page_size: 100 } })).data,
  })
  const { data: parents } = useQuery({
    queryKey: ['parents', 'all'],
    queryFn: async () => (await api.get<Page<Parent>>('/parents', { params: { page_size: 100 } })).data,
    enabled: isStaff,
  })

  const saveMutation = useMutation({
    mutationFn: async (form: StudentForm) => {
      const payload = {
        ...form,
        date_of_birth: form.date_of_birth || null,
        enrollment_date: form.enrollment_date || null,
        parent_ids: parentIds,
        group_ids: groupIds,
      }
      if (editing) return (await api.put(`/students/${editing.id}`, payload)).data
      return (await api.post('/students', payload)).data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      toast(editing ? t('toasts.studentUpdated') : t('toasts.studentCreated'))
      setModalOpen(false)
    },
    onError: (e) => toast(apiErrorMessage(e), 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (student: Student) => (await api.delete(`/students/${student.id}`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] })
      toast(t('toasts.studentDeactivated'))
      setDeleting(null)
    },
    onError: (e) => toast(apiErrorMessage(e), 'error'),
  })

  function openCreate() {
    setEditing(null)
    setParentIds([])
    setGroupIds([])
    reset(emptyForm)
    setModalOpen(true)
  }

  function openEdit(student: Student) {
    setEditing(student)
    setParentIds(student.parents.map((p) => p.id))
    setGroupIds(student.groups.map((g) => g.id))
    reset({
      first_name: student.first_name, last_name: student.last_name,
      phone: student.phone, email: student.email,
      date_of_birth: student.date_of_birth ?? '', gender: student.gender,
      status: student.status as 'active' | 'inactive',
      enrollment_date: student.enrollment_date ?? '', notes: student.notes,
    })
    setModalOpen(true)
  }

  return (
    <>
      <PageHeader
        title={t('students.title')}
        subtitle={t('students.subtitle')}
        actions={isStaff && <Button onClick={openCreate}><UserPlus size={16} /> {t('students.addStudent')}</Button>}
      />
      <Card>
        <form
          className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-4"
          onSubmit={(e) => { e.preventDefault(); setPage(1); setSearch(searchInput) }}
        >
          <Input className="max-w-xs" placeholder={t('students.searchPlaceholder')}
                 value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
          <Select className="w-44" value={groupFilter}
                  onChange={(e) => { setGroupFilter(e.target.value); setPage(1) }}>
            <option value="">{t('students.allGroups')}</option>
            {groups?.items.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </Select>
          <Select className="w-36" value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}>
            <option value="">{t('students.allStatuses')}</option>
            <option value="active">{t('common.badge.active')}</option>
            <option value="inactive">{t('common.badge.inactive')}</option>
          </Select>
          <Button type="submit" variant="secondary"><Search size={15} /> {t('common.search')}</Button>
        </form>

        {isLoading ? <TableSkeleton cols={6} /> : !data || data.items.length === 0 ? (
          <EmptyState title={t('students.noStudentsFound')} hint={t('students.noStudentsHint')} />
        ) : (
          <>
            <TableShell>
              <thead className="bg-slate-50">
                <tr>
                  <Th>#</Th><Th>{t('students.columnName')}</Th><Th>{t('students.columnPhone')}</Th>
                  <Th>{t('students.columnParent')}</Th><Th>{t('students.columnGroups')}</Th><Th>{t('common.status')}</Th>
                  {isStaff && <Th className="text-right">{t('common.actions')}</Th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((s, i) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <Td className="text-slate-400">{(data.page - 1) * data.page_size + i + 1}</Td>
                    <Td>
                      <Link to={`/students/${s.id}`} className="font-semibold text-slate-800 hover:text-blue-600">
                        {s.first_name} {s.last_name}
                      </Link>
                    </Td>
                    <Td>{s.phone || '—'}</Td>
                    <Td>{s.parents.length ? s.parents.map((p) => `${p.first_name} ${p.last_name}`).join(', ') : '—'}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {s.groups.map((g) => (
                          <span key={g.id} className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                            {g.name}
                          </span>
                        ))}
                      </div>
                    </Td>
                    <Td><Badge value={s.status} /></Td>
                    {isStaff && (
                      <Td className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(s)} title={t('common.edit')}>
                            <Pencil size={15} className="text-blue-600" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setDeleting(s)} title={t('common.deactivate')}>
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
             title={editing ? t('students.editStudent') : t('students.addStudentTitle')} wide>
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
            <Field label={t('students.dateOfBirth')}><Input type="date" {...register('date_of_birth')} /></Field>
            <Field label={t('students.gender')}>
              <Select {...register('gender')}>
                <option value="">{t('common.notSpecified')}</option>
                <option value="male">{t('common.male')}</option>
                <option value="female">{t('common.female')}</option>
              </Select>
            </Field>
            <Field label={t('common.status')}>
              <Select {...register('status')}>
                <option value="active">{t('common.badge.active')}</option>
                <option value="inactive">{t('common.badge.inactive')}</option>
              </Select>
            </Field>
            <Field label={t('students.enrollmentDate')}><Input type="date" {...register('enrollment_date')} /></Field>
          </div>
          <Field label={t('students.parents')}>
            <CheckboxList
              options={(parents?.items ?? []).map((p) => ({ id: p.id, label: `${p.first_name} ${p.last_name}` }))}
              selected={parentIds} onChange={setParentIds} empty={t('students.noParentsHint')}
            />
          </Field>
          <Field label={t('students.groups')}>
            <CheckboxList
              options={(groups?.items ?? []).map((g) => ({ id: g.id, label: g.name }))}
              selected={groupIds} onChange={setGroupIds} empty={t('students.noGroupsHint')}
            />
          </Field>
          <Field label={t('common.notes')}><Textarea {...register('notes')} /></Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>{t('common.cancel')}</Button>
            <Button type="submit" loading={saveMutation.isPending}>{editing ? t('common.saveChanges') : t('students.createStudent')}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMutation.mutate(deleting)}
        loading={deleteMutation.isPending}
        title={t('confirm.deactivateStudentTitle')}
        message={t('confirm.deactivateStudentMessage', { name: `${deleting?.first_name} ${deleting?.last_name}` })}
      />
    </>
  )
}
