import { type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes,
  type TextareaHTMLAttributes, type ReactNode, forwardRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Inbox, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '../lib/utils'

// ---------- Button ----------

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success'

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-500',
  secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 focus-visible:ring-slate-400',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-500',
  ghost: 'text-slate-600 hover:bg-slate-100 focus-visible:ring-slate-400',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: 'sm' | 'md'
  loading?: boolean
}

export function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
        'disabled:opacity-50 disabled:pointer-events-none',
        size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-4 py-2 text-sm',
        buttonVariants[variant],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  )
}

// ---------- Inputs ----------

const fieldClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 ' +
  'placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 ' +
  'disabled:bg-slate-50 disabled:text-slate-400'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(fieldClass, className)} {...props} />
  },
)

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select ref={ref} className={cn(fieldClass, 'pr-8', className)} {...props}>
        {children}
      </select>
    )
  },
)

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(fieldClass, 'min-h-20', className)} {...props} />
  },
)

export function Field({ label, error, children, required }: {
  label: string
  error?: string
  required?: boolean
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}{required && <span className="text-red-500"> *</span>}
      </span>
      {children}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  )
}

// ---------- Badge ----------

const badgeStyles: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  inactive: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  paid: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  unpaid: 'bg-red-50 text-red-700 ring-red-600/20',
  partial: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  overdue: 'bg-red-100 text-red-800 ring-red-700/30',
  present: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  absent: 'bg-red-50 text-red-700 ring-red-600/20',
  late: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  excused: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  draft: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  published: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  director: 'bg-purple-50 text-purple-700 ring-purple-600/20',
  admin: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  teacher: 'bg-cyan-50 text-cyan-700 ring-cyan-600/20',
  student: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  parent: 'bg-amber-50 text-amber-700 ring-amber-600/20',
}

export function Badge({ value, className }: { value: string; className?: string }) {
  const { t } = useTranslation()
  const label = t(`common.badge.${value}`, { defaultValue: value.charAt(0).toUpperCase() + value.slice(1) })
  return (
    <span className={cn(
      'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset',
      badgeStyles[value] ?? 'bg-slate-100 text-slate-600 ring-slate-500/20',
      className,
    )}>
      {label}
    </span>
  )
}

// ---------- Card ----------

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('rounded-2xl border border-slate-200 bg-white shadow-md lg:rounded-xl lg:shadow-sm', className)}>
      {children}
    </div>
  )
}

/** A single elevated row-card used by mobile list/card views (app-like, spaced, shadowed). */
export function MobileCardRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-2xl border border-slate-100 bg-white p-4 shadow-sm', className)}>
      {children}
    </div>
  )
}

// ---------- Modal ----------

export function Modal({ open, onClose, title, children, wide, footer }: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  wide?: boolean
  /** sticky action bar pinned to the bottom of the modal (e.g. Save / Cancel) */
  footer?: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-2 sm:p-8"
         onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cn(
        'flex max-h-[calc(100dvh-1rem)] w-full flex-col overflow-hidden rounded-xl bg-white shadow-2xl sm:max-h-[calc(100dvh-4rem)]',
        wide ? 'max-w-3xl' : 'max-w-lg',
      )}>
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="truncate pr-3 text-base font-bold text-slate-800">{title}</h2>
          <button onClick={onClose} aria-label="Close"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="shrink-0 border-t border-slate-200 px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, loading }: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  loading?: boolean
}) {
  const { t } = useTranslation()
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
         onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-red-50 p-2 text-red-600"><AlertTriangle size={20} /></div>
          <div>
            <h2 className="text-base font-bold text-slate-800">{title}</h2>
            <p className="mt-1 text-sm text-slate-500">{message}</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="danger" onClick={onConfirm} loading={loading}>{t('common.delete')}</Button>
        </div>
      </div>
    </div>
  )
}

// ---------- Table helpers ----------

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th className={cn('whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500', className)}>
      {children}
    </th>
  )
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cn('whitespace-nowrap px-4 py-3 text-sm text-slate-700', className)}>{children}</td>
}

export function TableShell({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200">{children}</table>
    </div>
  )
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
      <div className="rounded-full bg-slate-100 p-3 text-slate-400"><Inbox size={24} /></div>
      <p className="text-sm font-semibold text-slate-600">{title}</p>
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  )
}

export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="animate-pulse p-4">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 border-b border-slate-100 py-3 last:border-0">
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} className="h-4 flex-1 rounded bg-slate-200" />
          ))}
        </div>
      ))}
    </div>
  )
}

export function Pagination({ page, pageSize, total, onPage }: {
  page: number
  pageSize: number
  total: number
  onPage: (page: number) => void
}) {
  const { t } = useTranslation()
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (pages <= 1) return null
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3">
      <span className="text-xs text-slate-500">
        {t('ui.pagination', { page, pages, total })}
      </span>
      <div className="flex gap-1">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft size={14} /> {t('ui.prev')}
        </Button>
        <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          {t('ui.next')} <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  )
}

// ---------- Stat card ----------

export function StatCard({ icon, value, label, accent, className }: {
  icon: ReactNode
  value: ReactNode
  label: string
  accent: string
  className?: string
}) {
  return (
    <Card className={cn('flex items-center gap-4 p-5', className)}>
      <div className={cn('rounded-xl p-3', accent)}>{icon}</div>
      <div className="min-w-0">
        <div className="text-2xl font-extrabold text-slate-800">{value}</div>
        <div className="text-sm text-slate-500">{label}</div>
      </div>
    </Card>
  )
}
