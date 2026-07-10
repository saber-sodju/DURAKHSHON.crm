import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { MonitorSmartphone, LogOut } from 'lucide-react'
import { api } from '../lib/api'
import type { DeviceSession } from '../lib/types'
import { useToast } from '../context/ToastContext'
import { Button, Card, EmptyState, TableSkeleton } from './ui'

export default function SessionsPanel() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['sessions'],
    queryFn: async () => (await api.get<DeviceSession[]>('/sessions')).data,
  })

  const revoke = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/sessions/${id}`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
      toast(t('sessions.loggedOut'))
    },
  })
  const logoutAll = useMutation({
    mutationFn: async () => (await api.post('/sessions/logout-all')).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
      toast(t('sessions.loggedOutAll'))
    },
  })

  const fmt = (v: string) => new Date(v).toLocaleString()

  return (
    <Card className="p-6">
      <h2 className="mb-1 flex items-center gap-2 font-bold text-slate-800">
        <MonitorSmartphone size={17} /> {t('sessions.title')}
      </h2>
      <p className="mb-4 text-sm text-slate-500">{t('sessions.subtitle')}</p>

      {isLoading ? <TableSkeleton rows={2} cols={2} /> : !data || data.length === 0 ? (
        <EmptyState title={t('sessions.none')} />
      ) : (
        <ul className="space-y-3">
          {data.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-800">{s.device_name}</span>
                  {s.is_current && (
                    <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">
                      {t('sessions.current')}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {s.ip_address || '—'} · {t('sessions.lastActive')}: {fmt(s.last_seen_at)}
                </div>
              </div>
              {!s.is_current && (
                <Button variant="secondary" size="sm" loading={revoke.isPending}
                        onClick={() => revoke.mutate(s.id)}>
                  {t('sessions.logoutThis')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {data && data.length > 1 && (
        <div className="mt-4">
          <Button variant="danger" size="sm" loading={logoutAll.isPending} onClick={() => logoutAll.mutate()}>
            <LogOut size={14} /> {t('sessions.logoutAll')}
          </Button>
        </div>
      )}
    </Card>
  )
}
