import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ClipboardCheck, Filter } from 'lucide-react'
import { api, apiErrorMessage } from '../lib/api'
import type { Page, AttendanceRecord, Group } from '../lib/types'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { formatDate } from '../lib/utils'
import PageHeader from '../components/PageHeader'
import {
  Button, Input, Select, Badge, Card, Modal, Field,
  TableSkeleton, Pagination,
} from '../components/ui'
import { ResponsiveTable } from '../components/ResponsiveTable'

const STATUSES = ['present', 'absent', 'late', 'excused'] as const

function MarkAttendanceModal({ open, onClose, initialGroupId }: {
  open: boolean
  onClose: () => void
  initialGroupId?: string | null
}) {
  const { toast } = useToast()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [groupId, setGroupId] = useState(initialGroupId ?? '')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [marks, setMarks] = useState<Record<number, { status: string; note: string }>>({})

  const { data: groups } = useQuery({
    queryKey: ['groups', 'all'],
    queryFn: async () => (await api.get<Page<Group>>('/groups', { params: { page_size: 100 } })).data,
    enabled: open,
  })

  const group = useMemo(
    () => groups?.items.find((g) => String(g.id) === groupId),
    [groups, groupId],
  )

  // preload existing records for the chosen group+date so re-marking updates them
  const { data: existing } = useQuery({
    queryKey: ['attendance', { group: groupId, date }],
    queryFn: async () => (await api.get<Page<AttendanceRecord>>('/attendance', {
      params: { group_id: groupId, date_from: date, date_to: date, page_size: 200 },
    })).data,
    enabled: open && !!groupId,
  })

  useEffect(() => {
    if (!group) return
    const next: Record<number, { status: string; note: string }> = {}
    for (const s of group.students) {
      const rec = existing?.items.find((r) => r.student_id === s.id)
      next[s.id] = { status: rec?.status ?? 'present', note: rec?.note ?? '' }
    }
    setMarks(next)
  }, [group, existing])

  const saveMutation = useMutation({
    mutationFn: async () => (await api.post('/attendance', {
      group_id: Number(groupId),
      date,
      items: Object.entries(marks).map(([student_id, m]) => ({
        student_id: Number(student_id), status: m.status, note: m.note,
      })),
    })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      toast(t('toasts.attendanceSaved'))
      onClose()
    },
    onError: (e) => toast(apiErrorMessage(e), 'error'),
  })

  return (
    <Modal open={open} onClose={onClose} title={t('attendance.modalTitle')} wide>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('attendance.group')} required>
          <Select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">{t('attendance.selectGroup')}</option>
            {groups?.items.filter((g) => g.status === 'active').map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </Select>
        </Field>
        <Field label={t('attendance.date')} required>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>

      {group && (
        <div className="mt-4 max-h-96 overflow-y-auto rounded-lg border border-slate-200">
          {group.students.length === 0 ? (
            <p className="p-4 text-sm text-slate-400">{t('attendance.noStudentsInGroup')}</p>
          ) : group.students.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2.5 last:border-0">
              <span className="w-40 text-sm font-semibold text-slate-700">{s.first_name} {s.last_name}</span>
              <div className="flex gap-1">
                {STATUSES.map((st) => (
                  <button key={st} type="button"
                          onClick={() => setMarks({ ...marks, [s.id]: { ...(marks[s.id] ?? { note: '' }), status: st } })}
                          className={`rounded-md px-2 py-1 text-xs font-semibold transition-colors ${
                            marks[s.id]?.status === st
                              ? st === 'present' ? 'bg-emerald-600 text-white'
                                : st === 'absent' ? 'bg-red-600 text-white'
                                : st === 'late' ? 'bg-amber-500 text-white'
                                : 'bg-blue-600 text-white'
                              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                          }`}>
                    {t(`common.badge.${st}`)}
                  </button>
                ))}
              </div>
              <Input className="min-w-32 flex-1" placeholder={t('attendance.notePlaceholder')}
                     value={marks[s.id]?.note ?? ''}
                     onChange={(e) => setMarks({ ...marks, [s.id]: { ...(marks[s.id] ?? { status: 'present' }), note: e.target.value } })} />
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
        <Button disabled={!groupId || !group || group.students.length === 0}
                loading={saveMutation.isPending}
                onClick={() => saveMutation.mutate()}>
          {t('attendance.saveAttendance')}
        </Button>
      </div>
    </Modal>
  )
}

export default function Attendance() {
  const { user } = useAuth()
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const canMark = user?.role === 'director' || user?.role === 'admin' || user?.role === 'teacher'
  const isStaffOrTeacher = canMark

  const [groupFilter, setGroupFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [markOpen, setMarkOpen] = useState(false)

  const studentIdParam = searchParams.get('student_id')

  useEffect(() => {
    if (searchParams.get('mark') === '1' && canMark) {
      setMarkOpen(true)
      searchParams.delete('mark')
      setSearchParams(searchParams, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { data: groups } = useQuery({
    queryKey: ['groups', 'all'],
    queryFn: async () => (await api.get<Page<Group>>('/groups', { params: { page_size: 100 } })).data,
    enabled: isStaffOrTeacher,
  })

  const { data, isLoading } = useQuery({
    queryKey: ['attendance', { groupFilter, statusFilter, dateFrom, dateTo, page, studentIdParam }],
    queryFn: async () => (await api.get<Page<AttendanceRecord>>('/attendance', {
      params: {
        group_id: groupFilter || undefined,
        status: statusFilter || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        student_id: studentIdParam || undefined,
        page,
      },
    })).data,
  })

  return (
    <>
      <PageHeader title={t('attendance.title')} subtitle={t('attendance.subtitle')}
                  actions={canMark && (
                    <Button onClick={() => setMarkOpen(true)}><ClipboardCheck size={16} /> {t('attendance.markAttendance')}</Button>
                  )} />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-4">
          {isStaffOrTeacher && (
            <Select className="w-44" value={groupFilter} onChange={(e) => { setGroupFilter(e.target.value); setPage(1) }}>
              <option value="">{t('attendance.allGroups')}</option>
              {groups?.items.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
          )}
          <Select className="w-36" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}>
            <option value="">{t('attendance.allStatuses')}</option>
            {STATUSES.map((s) => <option key={s} value={s}>{t(`common.badge.${s}`)}</option>)}
          </Select>
          <Input type="date" className="w-40" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1) }} />
          <span className="text-slate-400">–</span>
          <Input type="date" className="w-40" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1) }} />
          <span className="ml-auto hidden items-center gap-1 text-xs text-slate-400 sm:flex">
            <Filter size={13} /> {data?.total ?? 0} {t('attendance.records')}
          </span>
        </div>

        {isLoading ? <TableSkeleton cols={6} /> : !data ? null : (
          <>
            <ResponsiveTable
              rows={data.items}
              rowKey={(r) => r.id}
              emptyTitle={t('attendance.noRecords')}
              emptyHint={t('attendance.noRecordsHint')}
              columns={[
                { key: 'student', header: t('attendance.columnStudent'), primary: true,
                  cell: (r) => r.student_name },
                { key: 'group', header: t('attendance.columnGroup'), cell: (r) => r.group_name },
                { key: 'teacher', header: t('attendance.columnTeacher'), cell: (r) => r.teacher_name ?? '—' },
                { key: 'date', header: t('attendance.columnDate'), cell: (r) => formatDate(r.date) },
                { key: 'status', header: t('attendance.columnStatus'), cell: (r) => <Badge value={r.status} /> },
                { key: 'note', header: t('attendance.columnNote'), cell: (r) => r.note || '—' },
              ]}
            />
            <Pagination page={data.page} pageSize={data.page_size} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>

      {canMark && (
        <MarkAttendanceModal open={markOpen} onClose={() => setMarkOpen(false)}
                             initialGroupId={searchParams.get('group_id')} />
      )}
    </>
  )
}
