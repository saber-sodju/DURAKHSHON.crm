import { useTranslation } from 'react-i18next'
import { Languages } from 'lucide-react'
import { SUPPORTED_LANGUAGES } from '../i18n'

export default function LanguageSwitcher({ className }: { className?: string }) {
  const { i18n, t } = useTranslation()

  return (
    <label className={className} title={t('layout.language')}>
      <span className="sr-only">{t('layout.language')}</span>
      <div className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-slate-500 hover:bg-slate-50">
        <Languages size={16} />
        <select
          value={i18n.resolvedLanguage ?? i18n.language}
          onChange={(e) => i18n.changeLanguage(e.target.value)}
          className="bg-transparent text-xs font-semibold text-slate-700 focus:outline-none"
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>{lang.label}</option>
          ))}
        </select>
      </div>
    </label>
  )
}
