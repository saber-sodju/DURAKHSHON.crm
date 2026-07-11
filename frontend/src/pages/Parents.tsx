import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { Pencil, Trash2, Search, UserPlus } from 'lucide-react'
import { api, apiErrorMessage } from '../lib/api'
import type { Page, Parent, Student } from '../lib/types'
import { useToast } from '../context/ToastContext'
import PageHeader from '../components/PageHeader'
import {
  Button, Input, Textarea, Field, Card, Modal, ConfirmDialog,
  TableSkeleton, Pagination,
} from '../components/ui'
import { ResponsiveTable } from '../components/ResponsiveTable'

type ParentForm = {
  first_name: string
  last_name: string
  phone: string
  email: string
  notes: string
}

const emptyForm: ParentForm = { first_name: '', last_name: '', phone: '', email: '', notes: '' }

export default function Parents() {
  const { toast } = useToast()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Parent | null>(null)
  const [deleting, setDeleting] = useState<Parent | null>(null)
  const [childIds, setChildIds] = useState<number[]>([])

  const parentSchema = z.object({
    first_name: z.string().min(1, t('settings.required')),
    last_name: z.string().min(1, t('settings.required')),
    phone: z.string(),
    email: z.string().email().or(z.literal('')),
    notes: z.string(),
  })

  const { register, handleSubmit, reset, formState } = useForm<ParentForm>({
    resolver: zodResolver(parentSchema), defaultValues: emptyForm,
  })

  const { data, isLoading } = useQuery({
    queryKey: ['parents', { search, page }],
    queryFn: async () => (await api.get<Page<Parent>>('/parents', {
      params: { search: search || undefined, page },
    })).data,
  })

  const { data: students } = useQuery({
    queryKey: ['students', 'all'],
    queryFn: async () => (await api.get<Page<Student>>('/students', { params: { page_size: 100 } })).data,
  })

  const saveMutation = useMutation({
    mutationFn: async (form: ParentForm) => {
      const payload = { ...form, child_ids: childIds }
      if (editing) return (await api.put(`/parents/${editing.id}`, payload)).data
      return (await api.post('/parents', payload)).data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parents'] })
      queryClient.invalidateQueries({ queryKey: ['students'] })
      toast(editing ? t('toasts.parentUpdated') : t('toasts.parentCreated'))
      setModalOpen(false)
    },
    onError: (e) => toast(apiErrorMessage(e), 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (parent: Parent) => (await api.delete(`/parents/${parent.id}`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parents'] })
      toast(t('toasts.parentDeleted'))
      setDeleting(null)
    },
    onError: (e) => toast(apiErrorMessage(e), 'error'),
  })

  function openCreate() {
    setEditing(null)
    setChildIds([])
    reset(emptyForm)
    setModalOpen(true)
  }

  function openEdit(parent: Parent) {
    setEditing(parent)
    setChildIds(parent.children.map((c) => c.id))
    reset({ first_name: parent.first_name, last_name: parent.last_name, phone: parent.phone, email: parent.email, notes: parent.notes })
    setModalOpen(true)
  }

  return (
    <>
      <PageHeader title={t('parents.title')} subtitle={t('parents.subtitle')}
                  actions={<Button onClick={openCreate}><UserPlus size={16} /> {t('parents.addParent')}</Button>} />
      <Card>
        <form className="flex flex-wrap gap-2 border-b border-slate-200 p-4"
              onSubmit={(e) => { e.preventDefault(); setPage(1); setSearch(searchInput) }}>
          <Input className="w-full sm:max-w-xs" placeholder={t('parents.searchPlaceholder')} value={searchInput}
                 onChange={(e) => setSearchInput(e.target.value)} />
          <Button type="submit" variant="secondary" className="w-full sm:w-auto"><Search size={15} /> {t('common.search')}</Button>
        </form>

        {isLoading ? <TableSkeleton cols={5} /> : !data ? null : (
          <>
            <ResponsiveTable
              rows={data.items}
              rowKey={(parent) => parent.id}
              emptyTitle={t('parents.noParentsFound')}
              columns={[
                { key: 'name', header: t('students.columnName'), primary: true,
                  cell: (parent) => (
                    <Link to={`/parents/${parent.id}`} className="font-semibold text-slate-800 hover:text-blue-600">
                      {parent.first_name} {parent.last_name}
                    </Link>
                  ) },
                { key: 'phone', header: t('students.columnPhone'), cell: (parent) => parent.phone || '—' },
                { key: 'email', header: t('parents.columnEmail'), cell: (parent) => parent.email || '—' },
                { key: 'children', header: t('parents.columnChildren'),
                  cell: (parent) => (
                    <div className="flex flex-wrap justify-end gap-1 sm:justify-start">
                      {parent.children.map((c) => (
                        <span key={c.id} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                          {c.first_name} {c.last_name}
                        </span>
                      ))}
                    </div>
                  ) },
                { key: 'actions', header: t('common.actions'), actions: true,
                  cell: (parent) => (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(parent)} title={t('common.edit')}>
                        <Pencil size={15} className="text-blue-600" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleting(parent)} title={t('common.delete')}>
                        <Trash2 size={15} className="text-red-500" />
                      </Button>
                    </>
                  ) },
              ]}
            />
            <Pagination page={data.page} pageSize={data.page_size} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)}
             title={editing ? t('parents.editParent') : t('parents.addParentTitle')}
             footer={
               <div className="flex justify-end gap-2">
                 <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>{t('common.cancel')}</Button>
                 <Button type="submit" form="parent-form" loading={saveMutation.isPending}>{editing ? t('common.saveChanges') : t('parents.createParent')}</Button>
               </div>
             }>
        <form id="parent-form" onSubmit={handleSubmit((f) => saveMutation.mutate(f))} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('students.firstName')} required error={formState.errors.first_name?.message}>
              <Input {...register('first_name')} />
            </Field>
            <Field label={t('students.lastName')} required error={formState.errors.last_name?.message}>
              <Input {...register('last_name')} />
            </Field>
            <Field label={t('students.phone')}><Input {...register('phone')} /></Field>
            <Field label={t('students.email')} error={formState.errors.email?.message}><Input {...register('email')} /></Field>
          </div>
          <Field label={t('parents.children')}>
            <div className="flex max-h-36 flex-wrap gap-2 overflow-y-auto rounded-lg border border-slate-200 p-2.5">
              {(students?.items ?? []).map((s) => {
                const checked = childIds.includes(s.id)
                return (
                  <button key={s.id} type="button"
                          onClick={() => setChildIds(checked ? childIds.filter((id) => id !== s.id) : [...childIds, s.id])}
                          className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                            checked ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}>
                    {s.first_name} {s.last_name}
                  </button>
                )
              })}
              {(students?.items ?? []).length === 0 && <p className="text-xs text-slate-400">{t('parents.noStudentsHint')}</p>}
            </div>
          </Field>
          <Field label={t('common.notes')}><Textarea {...register('notes')} /></Field>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMutation.mutate(deleting)}
        loading={deleteMutation.isPending}
        title={t('confirm.deleteParentTitle')}
        message={t('confirm.deleteParentMessage', { name: `${deleting?.first_name} ${deleting?.last_name}` })}
      />
    </>
  )
}
