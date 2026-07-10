import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { DatabaseBackup, Download, Play } from 'lucide-react'
import { api, apiErrorMessage } from '../lib/api'
import type { Backup } from '../lib/types'
import { useToast } from '../context/ToastContext'
import { Button, Card, EmptyState, TableSkeleton } from './ui'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function BackupsPanel() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['backups'],
    queryFn: async () => (await api.get<Backup[]>('/backups')).data,
  })

  const runNow = useMutation({
    mutationFn: async () => (await api.post('/backups')).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backups'] })
      toast(t('backups.created_ok'))
    },
    onError: (e) => toast(apiErrorMessage(e), 'error'),
  })

  async function download(filename: string) {
    try {
      const res = await api.get(`/backups/${filename}/download`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      toast(apiErrorMessage(e), 'error')
    }
  }

  const kindLabel = (k: string) => t(`backups.${k}`, { defaultValue: k })

  return (
    <Card className="p-6">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold text-slate-800">
          <DatabaseBackup size={17} /> {t('backups.title')}
        </h2>
        <Button size="sm" loading={runNow.isPending} onClick={() => runNow.mutate()}>
          <Play size={14} /> {t('backups.runNow')}
        </Button>
      </div>
      <p className="mb-4 text-sm text-slate-500">{t('backups.subtitle')}</p>

      {isLoading ? <TableSkeleton rows={3} cols={2} /> : !data || data.length === 0 ? (
        <EmptyState title={t('backups.none')} hint={t('backups.hint')} />
      ) : (
        <>
          <ul className="divide-y divide-slate-100">
            {data.map((b) => (
              <li key={b.filename} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-800">{b.filename}</div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {new Date(b.created_at).toLocaleString()} · {formatSize(b.size_bytes)} · {kindLabel(b.kind)}
                  </div>
                </div>
                <Button variant="secondary" size="sm" onClick={() => download(b.filename)}>
                  <Download size={14} /> {t('backups.download')}
                </Button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-400">{t('backups.hint')}</p>
        </>
      )}
    </Card>
  )
}
