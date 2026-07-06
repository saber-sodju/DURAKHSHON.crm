import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { DAY_NAMES, type ScheduleSlot } from '../lib/types'
import { formatTime } from '../lib/utils'
import PageHeader from '../components/PageHeader'
import { Card, EmptyState, TableSkeleton } from '../components/ui'

export default function SchedulePage() {
  const { data, isLoading } = useQuery({
    queryKey: ['schedule'],
    queryFn: async () => (await api.get<ScheduleSlot[]>('/schedule')).data,
  })

  const today = (new Date().getDay() + 6) % 7 // JS Sunday=0 -> our Monday=0

  return (
    <>
      <PageHeader title="Schedule" subtitle="Weekly timetable of all lessons" />
      {isLoading ? <Card><TableSkeleton /></Card> : !data || data.length === 0 ? (
        <Card><EmptyState title="No schedule yet" hint="Add time slots when creating or editing a group." /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {DAY_NAMES.map((day, dayIndex) => {
            const slots = data.filter((s) => s.day_of_week === dayIndex)
              .sort((a, b) => a.start_time.localeCompare(b.start_time))
            return (
              <Card key={day} className={dayIndex === today ? 'ring-2 ring-blue-400' : ''}>
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                  <h2 className="font-bold text-slate-800">{day}</h2>
                  {dayIndex === today && (
                    <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-600">Today</span>
                  )}
                </div>
                <div className="space-y-2 p-4">
                  {slots.length === 0 ? (
                    <p className="py-2 text-center text-xs text-slate-400">No lessons</p>
                  ) : slots.map((s) => (
                    <div key={s.id} className="rounded-lg border-l-4 border-blue-500 bg-slate-50 px-3 py-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-slate-800">{s.group_name}</span>
                        <span className="text-xs font-semibold text-blue-600">
                          {formatTime(s.start_time)}–{formatTime(s.end_time)}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {s.teacher_name ?? 'No teacher'}{s.room ? ` · Room ${s.room}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}
