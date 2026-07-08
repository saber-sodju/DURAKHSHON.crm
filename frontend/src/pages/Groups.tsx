import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { Pencil, Trash2, Search, Plus, X } from 'lucide-react'
import { api, apiErrorMessage } from '../lib/api'
import { personName, type Page, type Group, type Teacher, type Student } from '../lib/types'
import { useDayNames } from '../lib/i18nLists'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { formatMoney, formatTime } from '../lib/utils'
import PageHeader from '../components/PageHeader'
import {
  Button, Input, Select, Field, Badge, Card, Modal, ConfirmDialog,
  TableShell, Th, Td, EmptyState, TableSkeleton, Pagination,
} from '../components/ui'

type GroupForm = {
  name: string
  course_name: string
  teacher_id: string
  price_per_month: string
  status: 'active' | 'inactive'
  start_date: string
  end_date: string
  room: string
}

interface SlotDraft {
  day_of_week: number
  start_time: string
  end_time: string
  room: string
}

const emptyForm: GroupForm = {
  name: '', course_name: '', teacher_id: '', price_per_month: '', status: 'active',
  start_date: '', end_date: '', room: '',
}

export default function Groups() {
  const { user } = useAuth()
  const { toast } = useToast()
  const { t } = useTranslation()
  const dayNames = useDayNames()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const isStaff = user?.role === 'director' || user?.role === 'admin'

  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Group | null>(null)
  const [deleting, setDeleting] = useState<Group | null>(null)
  const [studentIds, setStudentIds] = useState<number[]>([])
  const [slots, setSlots] = useState<SlotDraft[]>([])

  const groupSchema = z.object({
    name: z.string().min(1, t('settings.required')),
    course_name: z.string().min(1, t('settings.required')),
    teacher_id: z.string(),
    price_per_month: z.string().min(1, t('settings.required')),
    status: z.enum(['active', 'inactive']),
    start_date: z.string(),
    end_date: z.string(),
    room: z.string(),
  })

  const { register, handleSubmit, reset, formState } = useForm<GroupForm>({
    resolver: zodResolver(groupSchema), defaultValues: emptyForm,
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
    queryKey: ['groups', { search, page }],
    queryFn: async () => (await api.get<Page<Group>>('/groups', {
      params: { search: search || undefined, page },
    })).data,
  })

  const { data: teachers } = useQuery({
    queryKey: ['teachers', 'all'],
    queryFn: async () => (await api.get<Page<Teacher>>('/teachers', { params: { page_size: 100 } })).data,
    enabled: isStaff,
  })
  const { data: students } = useQuery({
    queryKey: ['students', 'all'],
    queryFn: async () => (await api.get<Page<Student>>('/students', { params: { page_size: 100 } })).data,
    enabled: isStaff,
  })

  const saveMutation = useMutation({
    mutationFn: async (form: GroupForm) => {
      const payload = {
        ...form,
        teacher_id: form.teacher_id ? Number(form.teacher_id) : null,
        price_per_month: form.price_per_month,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        student_ids: studentIds,
        schedules: slots,
      }
      if (editing) return (await api.put(`/groups/${editing.id}`, payload)).data
      return (await api.post('/groups', payload)).data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      queryClient.invalidateQueries({ queryKey: ['schedule'] })
      toast(editing ? t('toasts.groupUpdated') : t('toasts.groupCreated'))
      setModalOpen(false)
    },
    onError: (e) => toast(apiErrorMessage(e), 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (group: Group) => (await api.delete(`/groups/${group.id}`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      toast(t('toasts.groupDeactivated'))
      setDeleting(null)
    },
    onError: (e) => toast(apiErrorMessage(e), 'error'),
  })

  function openCreate() {
    setEditing(null)
    setStudentIds([])
    setSlots([])
    reset(emptyForm)
    setModalOpen(true)
  }

  function openEdit(group: Group) {
    setEditing(group)
    setStudentIds(group.students.map((s) => s.id))
    setSlots(group.schedules.map((s) => ({
      day_of_week: s.day_of_week, start_time: formatTime(s.start_time),
      end_time: formatTime(s.end_time), room: s.room,
    })))
    reset({
      name: group.name, course_name: group.course_name,
      teacher_id: group.teacher_id ? String(group.teacher_id) : '',
      price_per_month: group.price_per_month, status: group.status as 'active' | 'inactive',
      start_date: group.start_date ?? '', end_date: group.end_date ?? '', room: group.room,
    })
    setModalOpen(true)
  }

  function scheduleLabel(group: Group): string {
    if (group.schedules.length === 0) return '—'
    const days = group.schedules.map((s) => dayNames[s.day_of_week]).join(', ')
    const first = group.schedules[0]
    return `${days} ${formatTime(first.start_time)}–${formatTime(first.end_time)}`
  }

  return (
    <>
      <PageHeader title={t('groups.title')} subtitle={t('groups.subtitle')}
                  actions={isStaff && <Button onClick={openCreate}><Plus size={16} /> {t('groups.addGroup')}</Button>} />
      <Card>
        <form className="flex flex-wrap gap-2 border-b border-slate-200 p-4"
              onSubmit={(e) => { e.preventDefault(); setPage(1); setSearch(searchInput) }}>
          <Input className="w-full sm:max-w-xs" placeholder={t('groups.searchPlaceholder')}
                 value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
          <Button type="submit" variant="secondary"><Search size={15} /> {t('common.search')}</Button>
        </form>

        {isLoading ? <TableSkeleton cols={7} /> : !data || data.items.length === 0 ? (
          <EmptyState title={t('groups.noGroupsFound')} />
        ) : (
          <>
            <TableShell>
              <thead className="bg-slate-50">
                <tr>
                  <Th>#</Th><Th>{t('groups.columnGroup')}</Th><Th>{t('groups.columnCourse')}</Th>
                  <Th>{t('groups.columnTeacher')}</Th><Th>{t('groups.columnStudents')}</Th>
                  <Th>{t('groups.columnSchedule')}</Th><Th>{t('groups.columnPrice')}</Th><Th>{t('common.status')}</Th>
                  {isStaff && <Th className="text-right">{t('common.actions')}</Th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((group, i) => (
                  <tr key={group.id} className="hover:bg-slate-50">
                    <Td className="text-slate-400">{(data.page - 1) * data.page_size + i + 1}</Td>
                    <Td>
                      <Link to={`/groups/${group.id}`} className="font-semibold text-blue-600 hover:underline">
                        {group.name}
                      </Link>
                    </Td>
                    <Td>{group.course_name}</Td>
                    <Td>{personName(group.teacher)}</Td>
                    <Td>
                      <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-blue-50 px-1.5 text-xs font-bold text-blue-700">
                        {group.students.length}
                      </span>
                    </Td>
                    <Td className="text-slate-500">{scheduleLabel(group)}</Td>
                    <Td>{formatMoney(group.price_per_month)}</Td>
                    <Td><Badge value={group.status} /></Td>
                    {isStaff && (
                      <Td className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(group)} title={t('common.edit')}>
                            <Pencil size={15} className="text-blue-600" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setDeleting(group)} title={t('common.deactivate')}>
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
             title={editing ? t('groups.editGroup') : t('groups.addGroupTitle')} wide>
        <form onSubmit={handleSubmit((f) => saveMutation.mutate(f))} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('groups.groupName')} required error={formState.errors.name?.message}>
              <Input placeholder={t('groups.groupNamePlaceholder')} {...register('name')} />
            </Field>
            <Field label={t('groups.courseSubject')} required error={formState.errors.course_name?.message}>
              <Input placeholder={t('groups.courseSubjectPlaceholder')} {...register('course_name')} />
            </Field>
            <Field label={t('groups.teacher')}>
              <Select {...register('teacher_id')}>
                <option value="">{t('groups.notAssigned')}</option>
                {(teachers?.items ?? []).map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>{teacher.first_name} {teacher.last_name} ({teacher.subject})</option>
                ))}
              </Select>
            </Field>
            <Field label={t('groups.pricePerMonth')} required error={formState.errors.price_per_month?.message}>
              <Input type="number" step="0.01" min="0" {...register('price_per_month')} />
            </Field>
            <Field label={t('groups.startDate')}><Input type="date" {...register('start_date')} /></Field>
            <Field label={t('groups.endDate')}><Input type="date" {...register('end_date')} /></Field>
            <Field label={t('groups.roomOptional')}><Input {...register('room')} /></Field>
            <Field label={t('common.status')}>
              <Select {...register('status')}>
                <option value="active">{t('common.badge.active')}</option>
                <option value="inactive">{t('common.badge.inactive')}</option>
              </Select>
            </Field>
          </div>

          <Field label={t('groups.weeklySchedule')}>
            <div className="space-y-2">
              {slots.map((slot, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <Select className="w-32" value={slot.day_of_week}
                          onChange={(e) => setSlots(slots.map((s, j) => j === i ? { ...s, day_of_week: Number(e.target.value) } : s))}>
                    {dayNames.map((d, di) => <option key={di} value={di}>{d}</option>)}
                  </Select>
                  <Input type="time" className="w-28" value={slot.start_time}
                         onChange={(e) => setSlots(slots.map((s, j) => j === i ? { ...s, start_time: e.target.value } : s))} />
                  <span className="text-slate-400">–</span>
                  <Input type="time" className="w-28" value={slot.end_time}
                         onChange={(e) => setSlots(slots.map((s, j) => j === i ? { ...s, end_time: e.target.value } : s))} />
                  <Input placeholder={t('groupDetails.columnRoom')} className="w-24" value={slot.room}
                         onChange={(e) => setSlots(slots.map((s, j) => j === i ? { ...s, room: e.target.value } : s))} />
                  <Button type="button" variant="ghost" size="sm" onClick={() => setSlots(slots.filter((_, j) => j !== i))}>
                    <X size={15} className="text-red-500" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="secondary" size="sm"
                      onClick={() => setSlots([...slots, { day_of_week: 0, start_time: '09:00', end_time: '10:30', room: '' }])}>
                <Plus size={14} /> {t('groups.addTimeSlot')}
              </Button>
            </div>
          </Field>

          <Field label={t('groups.students')}>
            <div className="flex max-h-36 flex-wrap gap-2 overflow-y-auto rounded-lg border border-slate-200 p-2.5">
              {(students?.items ?? []).map((s) => {
                const checked = studentIds.includes(s.id)
                return (
                  <button key={s.id} type="button"
                          onClick={() => setStudentIds(checked ? studentIds.filter((id) => id !== s.id) : [...studentIds, s.id])}
                          className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                            checked ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}>
                    {s.first_name} {s.last_name}
                  </button>
                )
              })}
              {(students?.items ?? []).length === 0 && <p className="text-xs text-slate-400">{t('groups.noStudentsHint')}</p>}
            </div>
          </Field>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>{t('common.cancel')}</Button>
            <Button type="submit" loading={saveMutation.isPending}>{editing ? t('common.saveChanges') : t('groups.createGroup')}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMutation.mutate(deleting)}
        loading={deleteMutation.isPending}
        title={t('confirm.deactivateGroupTitle')}
        message={t('confirm.deactivateGroupMessage', { name: deleting?.name })}
      />
    </>
  )
}
