import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil, Trash2, Search, Plus, X } from 'lucide-react'
import { api, apiErrorMessage } from '../lib/api'
import { DAY_NAMES, personName, type Page, type Group, type Teacher, type Student } from '../lib/types'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { formatMoney, formatTime } from '../lib/utils'
import PageHeader from '../components/PageHeader'
import {
  Button, Input, Select, Field, Badge, Card, Modal, ConfirmDialog,
  TableShell, Th, Td, EmptyState, TableSkeleton, Pagination,
} from '../components/ui'

const groupSchema = z.object({
  name: z.string().min(1, 'Required'),
  course_name: z.string().min(1, 'Required'),
  teacher_id: z.string(),
  price_per_month: z.string().min(1, 'Required'),
  status: z.enum(['active', 'inactive']),
  start_date: z.string(),
  end_date: z.string(),
  room: z.string(),
})

type GroupForm = z.infer<typeof groupSchema>

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
      toast(editing ? 'Group updated' : 'Group created')
      setModalOpen(false)
    },
    onError: (e) => toast(apiErrorMessage(e), 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (group: Group) => (await api.delete(`/groups/${group.id}`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      toast('Group deactivated')
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

  function openEdit(g: Group) {
    setEditing(g)
    setStudentIds(g.students.map((s) => s.id))
    setSlots(g.schedules.map((s) => ({
      day_of_week: s.day_of_week, start_time: formatTime(s.start_time),
      end_time: formatTime(s.end_time), room: s.room,
    })))
    reset({
      name: g.name, course_name: g.course_name,
      teacher_id: g.teacher_id ? String(g.teacher_id) : '',
      price_per_month: g.price_per_month, status: g.status as 'active' | 'inactive',
      start_date: g.start_date ?? '', end_date: g.end_date ?? '', room: g.room,
    })
    setModalOpen(true)
  }

  function scheduleLabel(g: Group): string {
    if (g.schedules.length === 0) return '—'
    const days = g.schedules.map((s) => DAY_NAMES[s.day_of_week]).join(', ')
    const first = g.schedules[0]
    return `${days} ${formatTime(first.start_time)}–${formatTime(first.end_time)}`
  }

  return (
    <>
      <PageHeader title="Groups" subtitle="All course groups"
                  actions={isStaff && <Button onClick={openCreate}><Plus size={16} /> Add Group</Button>} />
      <Card>
        <form className="flex flex-wrap gap-2 border-b border-slate-200 p-4"
              onSubmit={(e) => { e.preventDefault(); setPage(1); setSearch(searchInput) }}>
          <Input className="max-w-xs" placeholder="Search by group or course name..."
                 value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
          <Button type="submit" variant="secondary"><Search size={15} /> Search</Button>
        </form>

        {isLoading ? <TableSkeleton cols={7} /> : !data || data.items.length === 0 ? (
          <EmptyState title="No groups found" />
        ) : (
          <>
            <TableShell>
              <thead className="bg-slate-50">
                <tr>
                  <Th>#</Th><Th>Group</Th><Th>Course</Th><Th>Teacher</Th><Th>Students</Th>
                  <Th>Schedule</Th><Th>Price</Th><Th>Status</Th>
                  {isStaff && <Th className="text-right">Actions</Th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((g, i) => (
                  <tr key={g.id} className="hover:bg-slate-50">
                    <Td className="text-slate-400">{(data.page - 1) * data.page_size + i + 1}</Td>
                    <Td>
                      <Link to={`/groups/${g.id}`} className="font-semibold text-blue-600 hover:underline">
                        {g.name}
                      </Link>
                    </Td>
                    <Td>{g.course_name}</Td>
                    <Td>{personName(g.teacher)}</Td>
                    <Td>
                      <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-blue-50 px-1.5 text-xs font-bold text-blue-700">
                        {g.students.length}
                      </span>
                    </Td>
                    <Td className="text-slate-500">{scheduleLabel(g)}</Td>
                    <Td>{formatMoney(g.price_per_month)}</Td>
                    <Td><Badge value={g.status} /></Td>
                    {isStaff && (
                      <Td className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(g)} title="Edit">
                            <Pencil size={15} className="text-blue-600" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setDeleting(g)} title="Deactivate">
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
             title={editing ? 'Edit Group' : 'Add Group'} wide>
        <form onSubmit={handleSubmit((f) => saveMutation.mutate(f))} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Group name" required error={formState.errors.name?.message}>
              <Input placeholder="e.g. Math A1" {...register('name')} />
            </Field>
            <Field label="Course / subject" required error={formState.errors.course_name?.message}>
              <Input placeholder="e.g. Mathematics" {...register('course_name')} />
            </Field>
            <Field label="Teacher">
              <Select {...register('teacher_id')}>
                <option value="">— Not assigned —</option>
                {(teachers?.items ?? []).map((t) => (
                  <option key={t.id} value={t.id}>{t.first_name} {t.last_name} ({t.subject})</option>
                ))}
              </Select>
            </Field>
            <Field label="Price per month" required error={formState.errors.price_per_month?.message}>
              <Input type="number" step="0.01" min="0" {...register('price_per_month')} />
            </Field>
            <Field label="Start date"><Input type="date" {...register('start_date')} /></Field>
            <Field label="End date (optional)"><Input type="date" {...register('end_date')} /></Field>
            <Field label="Room (optional)"><Input {...register('room')} /></Field>
            <Field label="Status">
              <Select {...register('status')}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </Field>
          </div>

          <Field label="Weekly schedule">
            <div className="space-y-2">
              {slots.map((slot, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <Select className="w-32" value={slot.day_of_week}
                          onChange={(e) => setSlots(slots.map((s, j) => j === i ? { ...s, day_of_week: Number(e.target.value) } : s))}>
                    {DAY_NAMES.map((d, di) => <option key={di} value={di}>{d}</option>)}
                  </Select>
                  <Input type="time" className="w-28" value={slot.start_time}
                         onChange={(e) => setSlots(slots.map((s, j) => j === i ? { ...s, start_time: e.target.value } : s))} />
                  <span className="text-slate-400">–</span>
                  <Input type="time" className="w-28" value={slot.end_time}
                         onChange={(e) => setSlots(slots.map((s, j) => j === i ? { ...s, end_time: e.target.value } : s))} />
                  <Input placeholder="Room" className="w-24" value={slot.room}
                         onChange={(e) => setSlots(slots.map((s, j) => j === i ? { ...s, room: e.target.value } : s))} />
                  <Button type="button" variant="ghost" size="sm" onClick={() => setSlots(slots.filter((_, j) => j !== i))}>
                    <X size={15} className="text-red-500" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="secondary" size="sm"
                      onClick={() => setSlots([...slots, { day_of_week: 0, start_time: '09:00', end_time: '10:30', room: '' }])}>
                <Plus size={14} /> Add time slot
              </Button>
            </div>
          </Field>

          <Field label="Students">
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
              {(students?.items ?? []).length === 0 && <p className="text-xs text-slate-400">No students yet.</p>}
            </div>
          </Field>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" loading={saveMutation.isPending}>{editing ? 'Save changes' : 'Create group'}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMutation.mutate(deleting)}
        loading={deleteMutation.isPending}
        title="Deactivate group?"
        message={`Group "${deleting?.name}" will be marked inactive. History stays intact.`}
      />
    </>
  )
}
