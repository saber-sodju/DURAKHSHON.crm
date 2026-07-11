import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { Pencil, Trash2, Search, UserPlus } from 'lucide-react'
import { api, apiErrorMessage, getDuplicateParents } from '../lib/api'
import type { Page, Student, Group, StudentCreateResult, GeneratedAccount } from '../lib/types'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import PageHeader from '../components/PageHeader'
import {
  Button, Input, Select, Textarea, Field, Badge, Card, Modal, ConfirmDialog,
  TableSkeleton, Pagination,
} from '../components/ui'
import { ResponsiveTable } from '../components/ResponsiveTable'
import ParentPicker, { type GuardianEntry } from '../components/ParentPicker'
import CredentialsModal from '../components/CredentialsModal'

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
  const navigate = useNavigate()
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
  const [groupIds, setGroupIds] = useState<number[]>([])
  const [guardianEntries, setGuardianEntries] = useState<GuardianEntry[]>([])
  const [createStudentAccount, setCreateStudentAccount] = useState(false)
  const [credentialsResult, setCredentialsResult] = useState<StudentCreateResult | null>(null)

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

  const saveMutation = useMutation({
    mutationFn: async (form: StudentForm) => {
      const base = {
        ...form,
        date_of_birth: form.date_of_birth || null,
        enrollment_date: form.enrollment_date || null,
      }
      if (editing) {
        return { kind: 'update' as const, data: (await api.put(`/students/${editing.id}`, {
          ...base, group_ids: groupIds,
        })).data as Student }
      }
      const existing_parent_links = guardianEntries
        .filter((e) => e.kind === 'existing')
        .map((e) => ({ parent_id: e.existingParent!.id, relation: e.relation }))
      const new_parents = guardianEntries
        .filter((e) => e.kind === 'new')
        .map((e) => ({
          first_name: e.newData!.first_name, last_name: e.newData!.last_name,
          phone: e.newData!.phone, email: e.newData!.email, notes: e.newData!.notes,
          relation: e.relation, create_user_account: e.newData!.create_user_account,
          allow_duplicate: !!e.allowDuplicate,
        }))
      const result = (await api.post('/students', {
        ...base, group_ids: groupIds,
        existing_parent_links, new_parents,
        create_student_user_account: createStudentAccount,
      })).data as StudentCreateResult
      return { kind: 'create' as const, data: result }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['students'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['parents'] })
      setModalOpen(false)
      if (result.kind === 'update') {
        toast(t('toasts.studentUpdated'))
      } else {
        toast(t('toasts.studentCreated'))
        setCredentialsResult(result.data)
      }
    },
    onError: (e) => {
      const duplicates = getDuplicateParents(e)
      if (duplicates && duplicates.length > 0) {
        const newEntries = guardianEntries.filter((entry) => entry.kind === 'new')
        setGuardianEntries((prev) => {
          const updated = [...prev]
          for (const dup of duplicates) {
            const target = newEntries[dup.index]
            if (!target) continue
            const idx = updated.findIndex((entry) => entry.key === target.key)
            if (idx >= 0) updated[idx] = { ...updated[idx], duplicateWarning: dup }
          }
          return updated
        })
        toast(t('studentForm.duplicatesFoundToast'), 'error')
        return
      }
      toast(apiErrorMessage(e), 'error')
    },
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
    setGroupIds([])
    setGuardianEntries([])
    setCreateStudentAccount(false)
    reset(emptyForm)
    setModalOpen(true)
  }

  function openEdit(student: Student) {
    setEditing(student)
    setGroupIds(student.groups.map((g) => g.id))
    setGuardianEntries([])
    setCreateStudentAccount(false)
    reset({
      first_name: student.first_name, last_name: student.last_name,
      phone: student.phone, email: student.email,
      date_of_birth: student.date_of_birth ?? '', gender: student.gender,
      status: student.status as 'active' | 'inactive',
      enrollment_date: student.enrollment_date ?? '', notes: student.notes,
    })
    setModalOpen(true)
  }

  const accounts: GeneratedAccount[] = credentialsResult?.accounts ?? []

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
          <Input className="w-full sm:max-w-xs" placeholder={t('students.searchPlaceholder')}
                 value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
          <Select className="w-full sm:w-44" value={groupFilter}
                  onChange={(e) => { setGroupFilter(e.target.value); setPage(1) }}>
            <option value="">{t('students.allGroups')}</option>
            {groups?.items.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </Select>
          <Select className="w-full sm:w-36" value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}>
            <option value="">{t('students.allStatuses')}</option>
            <option value="active">{t('common.badge.active')}</option>
            <option value="inactive">{t('common.badge.inactive')}</option>
          </Select>
          <Button type="submit" variant="secondary" className="w-full sm:w-auto"><Search size={15} /> {t('common.search')}</Button>
        </form>

        {isLoading ? <TableSkeleton cols={6} /> : !data ? null : (
          <>
            <ResponsiveTable
              rows={data.items}
              rowKey={(s) => s.id}
              emptyTitle={t('students.noStudentsFound')}
              emptyHint={t('students.noStudentsHint')}
              columns={[
                { key: 'name', header: t('students.columnName'), primary: true,
                  cell: (s) => (
                    <Link to={`/students/${s.id}`} className="font-semibold text-slate-800 hover:text-blue-600">
                      {s.first_name} {s.last_name}
                    </Link>
                  ) },
                { key: 'phone', header: t('students.columnPhone'), cell: (s) => s.phone || '—' },
                { key: 'parent', header: t('students.columnParent'),
                  cell: (s) => (s.parents.length ? s.parents.map((p) => `${p.first_name} ${p.last_name}`).join(', ') : '—') },
                { key: 'groups', header: t('students.columnGroups'),
                  cell: (s) => (
                    <div className="flex flex-wrap justify-end gap-1 sm:justify-start">
                      {s.groups.map((g) => (
                        <span key={g.id} className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                          {g.name}
                        </span>
                      ))}
                    </div>
                  ) },
                { key: 'status', header: t('common.status'), cell: (s) => <Badge value={s.status} /> },
                ...(isStaff ? [{ key: 'actions', header: t('common.actions'), actions: true,
                  cell: (s: Student) => (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(s)} title={t('common.edit')}>
                        <Pencil size={15} className="text-blue-600" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleting(s)} title={t('common.deactivate')}>
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
             title={editing ? t('students.editStudent') : t('students.addStudentTitle')} wide
             footer={
               <div className="flex justify-end gap-2">
                 <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>{t('common.cancel')}</Button>
                 <Button type="submit" form="student-form" loading={saveMutation.isPending}>{editing ? t('common.saveChanges') : t('students.createStudent')}</Button>
               </div>
             }>
        <form id="student-form" onSubmit={handleSubmit((f) => saveMutation.mutate(f))} className="space-y-6">
          <div>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">{t('studentForm.sectionStudentInfo')}</h3>
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
            <div className="mt-4">
              <Field label={t('common.notes')}><Textarea {...register('notes')} /></Field>
            </div>
          </div>

          {!editing && (
            <div>
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">{t('studentForm.sectionParents')}</h3>
              <ParentPicker entries={guardianEntries} onChange={setGuardianEntries} />
            </div>
          )}

          <div>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">{t('students.groups')}</h3>
            <CheckboxList
              options={(groups?.items ?? []).map((g) => ({ id: g.id, label: g.name }))}
              selected={groupIds} onChange={setGroupIds} empty={t('students.noGroupsHint')}
            />
          </div>

          {!editing && (
            <div>
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">{t('studentForm.sectionAccounts')}</h3>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300"
                       checked={createStudentAccount} onChange={(e) => setCreateStudentAccount(e.target.checked)} />
                {t('studentForm.createStudentAccount')}
              </label>
            </div>
          )}
        </form>
      </Modal>

      <CredentialsModal
        open={!!credentialsResult}
        onClose={() => setCredentialsResult(null)}
        accounts={accounts}
        onCreateAnother={() => { setCredentialsResult(null); openCreate() }}
        onViewProfile={() => {
          const id = credentialsResult?.student.id
          setCredentialsResult(null)
          if (id) navigate(`/students/${id}`)
        }}
      />

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
