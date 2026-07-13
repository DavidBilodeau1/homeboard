import React, { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import { haGet } from '../api'
import { availableLanguages } from '../i18n'
import type { AppConfig, ListCfg, NamedEntity, ThemeMode } from '../types'

const THEME_OPTIONS: { id: ThemeMode; labelKey: string }[] = [
  { id: 'auto', labelKey: 'settings.themeAuto' },
  { id: 'light', labelKey: 'settings.themeLight' },
  { id: 'dark', labelKey: 'settings.themeDark' },
  { id: 'sun', labelKey: 'settings.themeSun' },
]

const SENSOR_ICON_OPTIONS = ['temp', 'pool', 'air', 'sun']

interface EntityOption { id: string; name: string }

const useEntityOptions = () => {
  const [all, setAll] = useState<EntityOption[]>([])
  useEffect(() => {
    haGet('states')
      .then((list: { entity_id: string; attributes?: { friendly_name?: string } }[]) =>
        setAll(list
          .map((s) => ({ id: s.entity_id, name: s.attributes?.friendly_name ?? s.entity_id }))
          .sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => setAll([]))
  }, [])
  return all
}

function EntitySelect({ value, onChange, domains, options, noneLabel }: {
  value: string | null | undefined
  onChange: (v: string | null) => void
  domains: string[]
  options: EntityOption[]
  noneLabel: string
}) {
  const filtered = options.filter((o) => domains.some((d) => o.id.startsWith(`${d}.`)))
  const missing = value && !filtered.some((o) => o.id === value)
  return (
    <select className="ed-select" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{noneLabel}</option>
      {missing && <option value={value!}>{value}</option>}
      {filtered.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.id})</option>)}
    </select>
  )
}

type Row = ListCfg & NamedEntity & { color?: string; icon?: string }

function ListEditor({ rows, onChange, domains, options, withColor, withIcon, t }: {
  rows: Row[]
  onChange: (rows: Row[]) => void
  domains: string[]
  options: EntityOption[]
  withColor?: boolean
  withIcon?: boolean
  t: (k: string, v?: Record<string, string | number>) => string
}) {
  const patch = (i: number, p: Partial<Row>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...p } : r)))
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= rows.length) return
    const next = [...rows]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  return (
    <div className="ed-rows">
      {rows.map((r, i) => (
        <div className="ed-row" key={i}>
          <input className="ed-input" value={r.name} placeholder={t('settings.name')}
            onChange={(e) => patch(i, { name: e.target.value })} />
          <EntitySelect value={r.entity} domains={domains} options={options} noneLabel={t('settings.none')}
            onChange={(v) => patch(i, { entity: v })} />
          {withColor && (
            <input type="color" className="ed-color" value={r.color ?? '#c33c54'} title={t('settings.color')}
              onChange={(e) => patch(i, { color: e.target.value })} />
          )}
          {withIcon && (
            <select className="ed-select ed-icon" value={r.icon ?? 'temp'} title={t('settings.icon')}
              onChange={(e) => patch(i, { icon: e.target.value })}>
              {SENSOR_ICON_OPTIONS.map((ic) => <option key={ic} value={ic}>{ic}</option>)}
            </select>
          )}
          <span className="ed-row-btns">
            <button onClick={() => move(i, -1)} disabled={i === 0} aria-label={t('settings.up')}>↑</button>
            <button onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label={t('settings.down')}>↓</button>
            <button className="ed-del" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label={t('settings.remove')}>✕</button>
          </span>
        </div>
      ))}
      <button className="ed-add" onClick={() => onChange([...rows, { name: '', entity: null }])}>+ {t('settings.add')}</button>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="ed-field"><span>{label}</span>{children}</label>
}

const TABS = ['general', 'calendars', 'tasks', 'meals', 'lists', 'rewards', 'smarthome', 'json'] as const
type Tab = (typeof TABS)[number]

export function SettingsPage() {
  const { config, systemInfo, connected, themeMode, setThemeMode, t, reloadConfig } = useStore()
  const options = useEntityOptions()
  const [meta, setMeta] = useState<{ editorEnabled: boolean; authEnabled?: boolean; user?: string | null } | null>(null)
  const [tab, setTab] = useState<Tab>('general')
  const [draft, setDraft] = useState<AppConfig | null>(null)
  const [jsonText, setJsonText] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(() => { fetch('/api/meta').then((r) => r.json()).then(setMeta).catch(() => setMeta({ editorEnabled: false })) }, [])
  useEffect(() => { if (config) setDraft(structuredClone(config)) }, [config])
  useEffect(() => { if (tab === 'json' && draft) setJsonText(JSON.stringify(draft, null, 2)) }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  const tabLabel: Record<Tab, string> = useMemo(() => ({
    general: t('settings.general'), calendars: t('nav.calendar'), tasks: t('nav.tasks'),
    meals: t('nav.meals'), lists: t('nav.lists'), rewards: t('nav.rewards'),
    smarthome: t('nav.home'), json: t('settings.json'),
  }), [t])

  if (!draft) return <div className="card page-card settings-page"><h2 className="card-title">{t('settings.title')}</h2></div>

  const editable = meta?.editorEnabled ?? false
  const up = (fn: (d: AppConfig) => void) => setDraft((d) => { const c = structuredClone(d!); fn(c); return c })
  const sh = draft.smartHome ?? {}
  const upSh = (fn: (s: NonNullable<AppConfig['smartHome']>) => void) => up((d) => { d.smartHome = d.smartHome ?? {}; fn(d.smartHome) })

  const save = async () => {
    let body: unknown = draft
    if (tab === 'json') {
      try { body = JSON.parse(jsonText) } catch { setMsg(t('settings.invalidJson')); return }
    }
    try {
      const r = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) {
        const e = await r.json().catch(() => ({} as { error?: string }))
        setMsg(`${t('settings.saveError')}: ${e.error ?? r.status}`)
        return
      }
      await reloadConfig()
      setMsg(t('settings.saved'))
      setTimeout(() => setMsg(''), 3000)
    } catch (e) {
      setMsg(`${t('settings.saveError')}: ${e}`)
    }
  }

  return (
    <div className="card page-card settings-page">
      <h2 className="card-title">{t('settings.title')}</h2>

      <div className="settings-row">
        <span>{t('settings.theme')}</span>
        <span className="theme-picker">
          {THEME_OPTIONS.map((o) => (
            <button key={o.id} className={themeMode === o.id ? 'active' : ''} onClick={() => setThemeMode(o.id)}>
              {t(o.labelKey)}
            </button>
          ))}
        </span>
      </div>
      <div className="settings-row">
        <span>{t('settings.ha')}</span>
        <b className={connected ? 'ok' : 'bad'}>
          {connected ? t('settings.connected') : t('settings.disconnected')}
          {systemInfo && ` — ${systemInfo.location_name} (${systemInfo.version})`}
        </b>
      </div>
      {meta?.authEnabled && (
        <div className="settings-row">
          <span>{t('settings.account')}</span>
          <button
            className="settings-logout"
            onClick={async () => {
              await fetch('/auth/logout', { method: 'POST' }).catch(() => {})
              location.href = '/'
            }}
          >
            {t('settings.logout')}
          </button>
        </div>
      )}

      {!editable && <p className="settings-note">{t('settings.readOnly')}</p>}

      {editable && (
        <>
          <div className="todo-tabs ed-tabs">
            {TABS.map((tb) => (
              <button key={tb} className={`todo-tab${tab === tb ? ' active' : ''}`} onClick={() => setTab(tb)}>
                {tabLabel[tb]}
              </button>
            ))}
          </div>

          <div className="ed-body">
            {tab === 'general' && (
              <div className="ed-fields">
                <Field label={t('settings.language')}>
                  <select className="ed-select" value={draft.language ?? ''} onChange={(e) => up((d) => { d.language = e.target.value || undefined })}>
                    <option value="">{t('settings.none')}</option>
                    {availableLanguages.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </Field>
                <Field label={t('settings.locale')}>
                  <input className="ed-input" value={draft.locale ?? ''} placeholder="fr-CA"
                    onChange={(e) => up((d) => { d.locale = e.target.value || undefined })} />
                </Field>
                <Field label={t('settings.theme')}>
                  <select className="ed-select" value={draft.theme ?? 'auto'} onChange={(e) => up((d) => { d.theme = e.target.value as ThemeMode })}>
                    {THEME_OPTIONS.map((o) => <option key={o.id} value={o.id}>{t(o.labelKey)}</option>)}
                  </select>
                </Field>
                <Field label={t('settings.weather')}>
                  <EntitySelect value={draft.weatherEntity} domains={['weather']} options={options} noneLabel={t('settings.none')}
                    onChange={(v) => up((d) => { d.weatherEntity = v ?? '' })} />
                </Field>
                <Field label={t('settings.photoInterval')}>
                  <input className="ed-input" type="number" min={3} value={draft.photos?.intervalSeconds ?? 15}
                    onChange={(e) => up((d) => { d.photos = { ...d.photos, intervalSeconds: Number(e.target.value) || 15 } })} />
                </Field>
                <Field label={t('settings.people')}>
                  <input className="ed-input" value={(draft.people ?? []).join(', ')}
                    onChange={(e) => up((d) => { d.people = e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
                </Field>
              </div>
            )}

            {tab === 'calendars' && (
              <ListEditor rows={draft.calendars as Row[]} domains={['calendar']} options={options} withColor t={t}
                onChange={(rows) => up((d) => { d.calendars = rows.map((r) => ({ ...r, entity: r.entity ?? '' })) })} />
            )}
            {tab === 'tasks' && (
              <ListEditor rows={draft.tasks as Row[]} domains={['todo']} options={options} withColor t={t}
                onChange={(rows) => up((d) => { d.tasks = rows })} />
            )}
            {tab === 'meals' && (
              <ListEditor rows={draft.meals as Row[]} domains={['todo']} options={options} withColor t={t}
                onChange={(rows) => up((d) => { d.meals = rows })} />
            )}
            {tab === 'lists' && (
              <ListEditor rows={(draft.lists ?? []) as Row[]} domains={['todo']} options={options} t={t}
                onChange={(rows) => up((d) => { d.lists = rows })} />
            )}
            {tab === 'rewards' && (
              <ListEditor rows={draft.rewards as Row[]} domains={['counter', 'input_number', 'sensor']} options={options} t={t}
                onChange={(rows) => up((d) => { d.rewards = rows })} />
            )}

            {tab === 'smarthome' && (
              <div className="ed-fields">
                <Field label={t('home.climate')}>
                  <EntitySelect value={sh.climate} domains={['climate']} options={options} noneLabel={t('settings.none')}
                    onChange={(v) => upSh((s) => { s.climate = v ?? undefined })} />
                </Field>
                <Field label={t('settings.alarm')}>
                  <EntitySelect value={sh.alarm} domains={['alarm_control_panel']} options={options} noneLabel={t('settings.none')}
                    onChange={(v) => upSh((s) => { s.alarm = v ?? undefined })} />
                </Field>
                <h3 className="ed-subtitle">{t('home.cameras')}</h3>
                <ListEditor rows={(sh.cameras ?? []) as Row[]} domains={['camera']} options={options} t={t}
                  onChange={(rows) => upSh((s) => { s.cameras = rows.filter((r) => r.entity) as NamedEntity[] })} />
                <h3 className="ed-subtitle">{t('home.sensors')}</h3>
                <ListEditor rows={(sh.sensors ?? []) as Row[]} domains={['sensor']} options={options} withIcon t={t}
                  onChange={(rows) => upSh((s) => { s.sensors = rows.filter((r) => r.entity) as NamedEntity[] })} />
                <h3 className="ed-subtitle">{t('home.lights')}</h3>
                <ListEditor rows={(sh.lights ?? []) as Row[]} domains={['light', 'switch']} options={options} t={t}
                  onChange={(rows) => upSh((s) => { s.lights = rows.filter((r) => r.entity) as NamedEntity[] })} />
                <h3 className="ed-subtitle">{t('home.security')}</h3>
                <ListEditor rows={(sh.locks ?? []) as Row[]} domains={['lock']} options={options} t={t}
                  onChange={(rows) => upSh((s) => { s.locks = rows.filter((r) => r.entity) as NamedEntity[] })} />
              </div>
            )}

            {tab === 'json' && (
              <textarea className="ed-json" value={jsonText} onChange={(e) => setJsonText(e.target.value)} spellCheck={false} />
            )}
          </div>

          <div className="ed-actions">
            <button className="ed-save" onClick={save}>{t('settings.save')}</button>
            <button className="ed-revert" onClick={() => { setDraft(structuredClone(config!)); setJsonText(JSON.stringify(config, null, 2)); setMsg('') }}>
              {t('settings.revert')}
            </button>
            <span className="ed-msg">{msg}</span>
          </div>
          <p className="settings-note">{t('settings.editHint')}</p>
        </>
      )}
    </div>
  )
}
