import React from 'react'
import { EntitySelect } from '../../components/editor/EntitySelect'
import { Field, NumberField } from '../../components/editor/Field'
import { availableLanguages } from '../../i18n'
import { useStore } from '../../store'
import type { ThemeMode } from '../../types'
import type { TabProps } from './types'

export const THEME_OPTIONS: { id: ThemeMode; labelKey: string }[] = [
  { id: 'auto', labelKey: 'settings.themeAuto' },
  { id: 'light', labelKey: 'settings.themeLight' },
  { id: 'dark', labelKey: 'settings.themeDark' },
  { id: 'sun', labelKey: 'settings.themeSun' },
]

const DEFAULT_PHOTO_SECONDS = 15
const MIN_PHOTO_SECONDS = 3

const splitNames = (text: string) => text.split(',').map((name) => name.trim()).filter(Boolean)

export function GeneralTab({ draft, update, entities }: TabProps) {
  const { t } = useStore()
  return (
    <div className="ed-fields">
      <Field label={t('settings.language')}>
        <select className="ed-select" value={draft.language ?? ''} onChange={(e) => update((d) => { d.language = e.target.value || undefined })}>
          <option value="">{t('settings.none')}</option>
          {availableLanguages.map((lang) => <option key={lang} value={lang}>{lang}</option>)}
        </select>
      </Field>
      <Field label={t('settings.locale')}>
        <input className="ed-input" value={draft.locale ?? ''} placeholder="en-US"
          onChange={(e) => update((d) => { d.locale = e.target.value || undefined })} />
      </Field>
      <Field label={t('settings.theme')}>
        <select className="ed-select" value={draft.theme ?? 'auto'} onChange={(e) => update((d) => { d.theme = e.target.value as ThemeMode })}>
          {THEME_OPTIONS.map((option) => <option key={option.id} value={option.id}>{t(option.labelKey)}</option>)}
        </select>
      </Field>
      <Field label={t('settings.weather')}>
        <EntitySelect value={draft.weatherEntity} domains={['weather']} options={entities}
          onChange={(entity) => update((d) => { d.weatherEntity = entity ?? undefined })} />
      </Field>
      <NumberField label={t('settings.photoInterval')} min={MIN_PHOTO_SECONDS} value={draft.photos?.intervalSeconds} fallback={DEFAULT_PHOTO_SECONDS}
        onChange={(seconds) => update((d) => { d.photos = { ...d.photos, intervalSeconds: seconds } })} />
      <Field label={t('settings.people')}>
        <input className="ed-input" value={(draft.people ?? []).join(', ')}
          onChange={(e) => update((d) => { d.people = splitNames(e.target.value) })} />
      </Field>
    </div>
  )
}
