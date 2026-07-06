import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Bell, CheckCheck, Wallet, ClipboardCheck, GraduationCap, CalendarDays } from 'lucide-react'
import { api } from '../lib/api'
import type { Page, Notification } from '../lib/types'
import { cn } from '../lib/utils'
import PageHeader from '../components/PageHeader'
import { Button, Card, EmptyState, TableSkeleton, Pagination } from '../components/ui'

const KIND_ICONS: Record<string, React.ReactNode> = {
  payment: <Wallet size={18} className="text-amber-600" />,
  attendance: <ClipboardCheck size={18} className="text-red-500" />,
  grade: <GraduationCap size={18} className="text-emerald-600" />,
  schedule: <CalendarDays size={18} className="text-blue-600" />,
  info: <Bell size={18} className="text-slate-500" />,
}

export default function Notifications() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', { page }],
    queryFn: async () => (await api.get<Page<Notification>>('/notifications', { params: { page } })).data,
  })

  const readMutation = useMutation({
    mutationFn: async (id: number) => (await api.post(`/notifications/${id}/read`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const readAllMutation = useMutation({
    mutationFn: async () => (await api.post('/notifications/read-all')).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })

  return (
    <>
      <PageHeader title={t('notifications.title')} subtitle={t('notifications.subtitle')}
                  actions={
                    <Button variant="secondary" onClick={() => readAllMutation.mutate()}
                            loading={readAllMutation.isPending}>
                      <CheckCheck size={15} /> {t('notifications.markAllRead')}
                    </Button>
                  } />
      <Card>
        {isLoading ? <TableSkeleton cols={2} /> : !data || data.items.length === 0 ? (
          <EmptyState title={t('notifications.noNotifications')} hint={t('notifications.noNotificationsHint')} />
        ) : (
          <>
            <ul className="divide-y divide-slate-100">
              {data.items.map((n) => (
                <li key={n.id}
                    className={cn('flex cursor-pointer items-start gap-3 px-5 py-4 hover:bg-slate-50',
                                  !n.is_read && 'bg-blue-50/50')}
                    onClick={() => !n.is_read && readMutation.mutate(n.id)}>
                  <div className="mt-0.5 rounded-full bg-slate-100 p-2">
                    {KIND_ICONS[n.kind] ?? KIND_ICONS.info}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={cn('text-sm', n.is_read ? 'font-medium text-slate-600' : 'font-bold text-slate-800')}>
                        {n.title}
                      </span>
                      {!n.is_read && <span className="h-2 w-2 rounded-full bg-blue-500" />}
                    </div>
                    {n.body && <p className="mt-0.5 text-sm text-slate-500">{n.body}</p>}
                    <p className="mt-1 text-xs text-slate-400">{new Date(n.created_at).toLocaleString()}</p>
                  </div>
                </li>
              ))}
            </ul>
            <Pagination page={data.page} pageSize={data.page_size} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  )
}
