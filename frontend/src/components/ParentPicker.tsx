import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Search, UserPlus, X, ChevronDown, ChevronUp, Link2 } from 'lucide-react'
import { api } from '../lib/api'
import type { ParentSearchResult, RelationType, DuplicateParentWarning } from '../lib/types'
import { Button, Input, Select, Field, MobileCardRow } from './ui'

export interface GuardianEntry {
  key: string
  kind: 'existing' | 'new'
  relation: RelationType
  existingParent?: ParentSearchResult
  newData?: { first_name: string; last_name: string; phone: string; email: string; notes: string; create_user_account: boolean }
  allowDuplicate?: boolean
  duplicateWarning?: DuplicateParentWarning
}

const RELATIONS: RelationType[] = ['father', 'mother', 'guardian', 'other']

function useDebounced(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}

const emptyNewParent = { first_name: '', last_name: '', phone: '', email: '', notes: '', create_user_account: false }

export default function ParentPicker({ entries, onChange }: {
  entries: GuardianEntry[]
  onChange: (entries: GuardianEntry[]) => void
}) {
  const { t } = useTranslation()
  const [term, setTerm] = useState('')
  const debouncedTerm = useDebounced(term, 300)
  const [createOpen, setCreateOpen] = useState(false)
  const [draft, setDraft] = useState(emptyNewParent)

  const { data: results, isFetching } = useQuery({
    queryKey: ['parents', 'search', debouncedTerm],
    queryFn: async () => (await api.get<ParentSearchResult[]>('/parents/search', {
      params: { q: debouncedTerm },
    })).data,
    enabled: debouncedTerm.trim().length >= 2,
  })

  const selectedExistingIds = new Set(
    entries.filter((e) => e.kind === 'existing').map((e) => e.existingParent!.id),
  )

  function addExisting(parent: ParentSearchResult) {
    if (selectedExistingIds.has(parent.id)) return
    onChange([...entries, {
      key: `existing-${parent.id}`, kind: 'existing', relation: 'guardian', existingParent: parent,
    }])
    setTerm('')
  }

  function addNew() {
    if (!draft.first_name.trim() || !draft.last_name.trim() || !draft.phone.trim()) return
    onChange([...entries, {
      key: `new-${Date.now()}`, kind: 'new', relation: 'guardian', newData: { ...draft },
    }])
    setDraft(emptyNewParent)
    setCreateOpen(false)
  }

  function remove(key: string) {
    onChange(entries.filter((e) => e.key !== key))
  }

  function updateRelation(key: string, relation: RelationType) {
    onChange(entries.map((e) => (e.key === key ? { ...e, relation } : e)))
  }

  function resolveDuplicateAsLink(entry: GuardianEntry) {
    if (!entry.duplicateWarning) return
    const parent = entry.duplicateWarning.parent
    onChange(entries.map((e) => (e.key !== entry.key ? e : {
      key: `existing-${parent.id}`, kind: 'existing', relation: e.relation,
      existingParent: {
        id: parent.id, full_name: `${parent.first_name} ${parent.last_name}`,
        phone: parent.phone, email: parent.email,
        children_count: parent.children.length, has_account: parent.user_id !== null,
      },
    })))
  }

  function resolveDuplicateAsCreateAnyway(entry: GuardianEntry) {
    onChange(entries.map((e) => (e.key === entry.key ? { ...e, allowDuplicate: true, duplicateWarning: undefined } : e)))
  }

  return (
    <div className="space-y-4">
      {entries.length > 0 && (
        <div className="space-y-2.5">
          {entries.map((entry) => (
            <MobileCardRow key={entry.key} className="shadow-none">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-bold text-slate-800">
                    {entry.kind === 'existing'
                      ? entry.existingParent!.full_name
                      : `${entry.newData!.first_name} ${entry.newData!.last_name}`}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {entry.kind === 'existing' ? (
                      <>
                        {entry.existingParent!.phone || '—'}
                        {' · '}
                        {t('studentForm.existingParentBadge')}
                        {entry.existingParent!.children_count > 0 && (
                          <> · {t('studentForm.childrenCount', { count: entry.existingParent!.children_count })}</>
                        )}
                      </>
                    ) : (
                      <>
                        {entry.newData!.phone || '—'} · {t('studentForm.newParentBadge')}
                        {entry.newData!.create_user_account && <> · {t('studentForm.willCreateAccount')}</>}
                      </>
                    )}
                  </div>
                </div>
                <button type="button" onClick={() => remove(entry.key)}
                        className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        aria-label={t('common.delete')}>
                  <X size={16} />
                </button>
              </div>

              {entry.duplicateWarning && (
                <div className="mt-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  <p className="font-semibold">{t('studentForm.duplicateWarning', {
                    field: entry.duplicateWarning.field === 'phone' ? t('students.phone') : t('students.email'),
                    value: entry.duplicateWarning.value,
                  })}</p>
                  <p className="mt-1">
                    {entry.duplicateWarning.parent.first_name} {entry.duplicateWarning.parent.last_name}
                    {' · '}{entry.duplicateWarning.parent.phone || '—'}
                    {entry.duplicateWarning.parent.children.length > 0 && (
                      <> · {t('studentForm.childrenCount', { count: entry.duplicateWarning.parent.children.length })}</>
                    )}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button type="button" size="sm" onClick={() => resolveDuplicateAsLink(entry)}>
                      <Link2 size={13} /> {t('studentForm.linkExistingInstead')}
                    </Button>
                    <Button type="button" size="sm" variant="secondary" onClick={() => resolveDuplicateAsCreateAnyway(entry)}>
                      {t('studentForm.createAnyway')}
                    </Button>
                  </div>
                </div>
              )}

              <div className="mt-2.5">
                <Select value={entry.relation} onChange={(e) => updateRelation(entry.key, e.target.value as RelationType)}
                        className="w-full sm:w-48">
                  {RELATIONS.map((r) => <option key={r} value={r}>{t(`studentForm.relation.${r}`)}</option>)}
                </Select>
              </div>
            </MobileCardRow>
          ))}
        </div>
      )}

      <div>
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input className="pl-9" placeholder={t('studentForm.searchParentPlaceholder')}
                 value={term} onChange={(e) => setTerm(e.target.value)} />
        </div>
        {term.trim().length >= 1 && term.trim().length < 2 && (
          <p className="mt-1.5 text-xs text-slate-400">{t('studentForm.keepTyping')}</p>
        )}
        {debouncedTerm.trim().length >= 2 && (
          <div className="mt-2 space-y-2">
            {isFetching ? (
              <p className="text-xs text-slate-400">{t('common.search')}…</p>
            ) : !results || results.length === 0 ? (
              <p className="text-xs text-slate-400">{t('studentForm.noParentsMatch')}</p>
            ) : (
              results.map((p) => (
                <div key={p.id}
                     className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-slate-800">{p.full_name}</div>
                    <div className="truncate text-xs text-slate-500">
                      {p.phone || '—'}{p.email ? ` · ${p.email}` : ''}
                      {' · '}{t('studentForm.childrenCount', { count: p.children_count })}
                    </div>
                  </div>
                  <Button type="button" size="sm" variant="secondary"
                          disabled={selectedExistingIds.has(p.id)}
                          onClick={() => addExisting(p)}>
                    {selectedExistingIds.has(p.id) ? t('studentForm.alreadyAdded') : t('studentForm.select')}
                  </Button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-dashed border-slate-300">
        <button type="button" onClick={() => setCreateOpen(!createOpen)}
                className="flex w-full items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-blue-600">
          <span className="flex items-center gap-2"><UserPlus size={16} /> {t('studentForm.createNewParent')}</span>
          {createOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {createOpen && (
          <div className="space-y-3 border-t border-slate-200 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('students.firstName')} required>
                <Input value={draft.first_name} onChange={(e) => setDraft({ ...draft, first_name: e.target.value })} />
              </Field>
              <Field label={t('students.lastName')} required>
                <Input value={draft.last_name} onChange={(e) => setDraft({ ...draft, last_name: e.target.value })} />
              </Field>
              <Field label={t('students.phone')} required>
                <Input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
              </Field>
              <Field label={t('students.email')}>
                <Input type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300"
                     checked={draft.create_user_account}
                     onChange={(e) => setDraft({ ...draft, create_user_account: e.target.checked })} />
              {t('studentForm.createParentAccount')}
            </label>
            <Button type="button" onClick={addNew}
                    disabled={!draft.first_name.trim() || !draft.last_name.trim() || !draft.phone.trim()}
                    className="w-full sm:w-auto">
              <UserPlus size={15} /> {t('studentForm.addParentToList')}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
