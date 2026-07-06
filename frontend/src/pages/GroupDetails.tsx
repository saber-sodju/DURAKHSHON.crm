import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, ClipboardCheck } from 'lucide-react'
import { api } from '../lib/api'
import { personName, type Group, type Page, type AttendanceRecord, type Exam } from '../lib/types'
import { useDayNames } from '../lib/i18nLists'
import { useAuth } from '../context/AuthContext'
import { formatDate, formatMoney, formatTime } from '../lib/utils'
import PageHeader from '../components/PageHeader'
import { Card, Badge, TableShell, Th, Td, EmptyState, TableSkeleton, Button } from '../components/ui'

export default function GroupDetails() {
  const { id } = useParams()
  const { user } = useAuth()
  const { t } = useTranslation()
  const dayNames = useDayNames()
  const canMark = user?.role === 'director' || user?.role === 'admin' || user?.role === 'teacher'

  const { data: group, isLoading } = useQuery({
    queryKey: ['groups', id],
    queryFn: async () => (await api.get<Group>(`/groups/${id}`)).data,
  })
  const { data: attendance } = useQuery({
    queryKey: ['attendance', { group: id }],
    queryFn: async () => (await api.get<Page<AttendanceRecord>>('/attendance', {
      params: { group_id: id, page_size: 10 },
    })).data,
    enabled: canMark,
  })
  const { data: exams } = useQuery({
    queryKey: ['exams', { group: id }],
    queryFn: async () => (await api.get<Page<Exam>>('/exams', {
      params: { group_id: id, page_size: 10 },
    })).data,
    enabled: canMark,
  })

  if (isLoading || !group) return <Card><TableSkeleton /></Card>

  return (
    <>
      <Link to="/groups" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:underline">
        <ArrowLeft size={15} /> {t('groupDetails.back')}
      </Link>
      <PageHeader
        title={group.name}
        subtitle={t('groupDetails.subtitleFmt', { course: group.course_name, price: formatMoney(group.price_per_month) })}
        actions={
          <div className="flex items-center gap-2">
            <Badge value={group.status} />
            {canMark && (
              <Link to={`/attendance?mark=1&group_id=${group.id}`}>
                <Button size="sm"><ClipboardCheck size={15} /> {t('groupDetails.markAttendance')}</Button>
              </Link>
            )}
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-3 font-bold text-slate-800">{t('groupDetails.details')}</h2>
            <dl className="space-y-2.5 text-sm">
              {[
                [t('groupDetails.columnTeacher'), personName(group.teacher)],
                [t('groupDetails.columnRoom'), group.room || '—'],
                [t('groupDetails.columnStartDate'), formatDate(group.start_date)],
                [t('groupDetails.columnEndDate'), formatDate(group.end_date)],
                [t('groupDetails.columnStudents'), String(group.students.length)],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4">
                  <dt className="font-semibold text-slate-500">{label}</dt>
                  <dd className="text-right text-slate-800">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 font-bold text-slate-800">{t('groupDetails.weeklySchedule')}</h2>
            {group.schedules.length === 0 ? <p className="text-sm text-slate-400">{t('groupDetails.noSchedule')}</p> : (
              <ul className="space-y-2">
                {group.schedules.map((s) => (
                  <li key={s.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    <span className="font-semibold text-slate-700">{dayNames[s.day_of_week]}</span>
                    <span className="text-slate-500">
                      {formatTime(s.start_time)}–{formatTime(s.end_time)}{s.room ? ` · ${s.room}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6 xl:col-span-2">
          <Card>
            <h2 className="px-5 pt-4 font-bold text-slate-800">{t('groupDetails.studentsCount', { count: group.students.length })}</h2>
            {group.students.length === 0 ? <EmptyState title={t('groupDetails.noStudents')} /> : (
              <TableShell>
                <thead><tr><Th>#</Th><Th>{t('students.columnName')}</Th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {group.students.map((s, i) => (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <Td className="text-slate-400">{i + 1}</Td>
                      <Td>
                        <Link to={`/students/${s.id}`} className="font-semibold text-blue-600 hover:underline">
                          {s.first_name} {s.last_name}
                        </Link>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableShell>
            )}
          </Card>

          {canMark && (
            <>
              <Card>
                <h2 className="px-5 pt-4 font-bold text-slate-800">{t('groupDetails.recentAttendance')}</h2>
                {!attendance || attendance.items.length === 0 ? <EmptyState title={t('groupDetails.noAttendance')} /> : (
                  <TableShell>
                    <thead><tr><Th>{t('groupDetails.columnDate')}</Th><Th>{t('groupDetails.columnStudent')}</Th><Th>{t('groupDetails.columnStatus')}</Th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {attendance.items.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-50">
                          <Td>{formatDate(r.date)}</Td>
                          <Td>{r.student_name}</Td>
                          <Td><Badge value={r.status} /></Td>
                        </tr>
                      ))}
                    </tbody>
                  </TableShell>
                )}
              </Card>
              <Card>
                <h2 className="px-5 pt-4 font-bold text-slate-800">{t('groupDetails.exams')}</h2>
                {!exams || exams.items.length === 0 ? <EmptyState title={t('groupDetails.noExams')} /> : (
                  <TableShell>
                    <thead><tr><Th>{t('groupDetails.columnTitle')}</Th><Th>{t('groupDetails.columnDate')}</Th><Th>{t('groupDetails.columnMaxScore')}</Th><Th>{t('groupDetails.columnStatus')}</Th><Th>{t('groupDetails.columnGrades')}</Th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {exams.items.map((e) => (
                        <tr key={e.id} className="hover:bg-slate-50">
                          <Td className="font-semibold">{e.title}</Td>
                          <Td>{formatDate(e.exam_date)}</Td>
                          <Td>{e.max_score}</Td>
                          <Td><Badge value={e.status} /></Td>
                          <Td>{e.grades_count}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </TableShell>
                )}
              </Card>
            </>
          )}
        </div>
      </div>
    </>
  )
}
