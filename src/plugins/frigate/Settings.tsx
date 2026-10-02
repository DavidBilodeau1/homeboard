import React, { useEffect, useState } from 'react'
import { Note, NumberField } from '../../components/editor/Field'
import { useStore } from '../../store'
import type { SettingsPanelProps } from '../types'
import { getFrigateState, type FrigateCamera } from './api'
import { DEFAULTS, type FrigateSettings } from './types'

/** Ticks the cameras Frigate reports; the tick order is the display order. */
function CameraPicker({ selected, onChange }: { selected: string[]; onChange: (names: string[]) => void }) {
  const { t } = useStore()
  const [cameras, setCameras] = useState<FrigateCamera[] | null>(null)
  useEffect(() => {
    getFrigateState().then((state) => setCameras(state.cameras ?? [])).catch(() => setCameras([]))
  }, [])

  if (!cameras) return <Note>{t('frigate.loading')}</Note>
  if (!cameras.length) return <Note>{t('frigate.settings.none')}</Note>

  const toggle = (name: string) => onChange(selected.includes(name) ? selected.filter((n) => n !== name) : [...selected, name])
  return (
    <div className="ed-checks">
      {cameras.map((camera) => {
        const position = selected.indexOf(camera.name)
        return (
          <label key={camera.name} className={`ed-check${position >= 0 ? ' on' : ''}`}>
            <input type="checkbox" checked={position >= 0} onChange={() => toggle(camera.name)} />
            <span>{camera.label}</span>
            {position >= 0 && <em>{position + 1}</em>}
          </label>
        )
      })}
    </div>
  )
}

export function FrigateSettingsPanel({ settings, onChange }: SettingsPanelProps<FrigateSettings>) {
  const { t } = useStore()
  const set = (change: Partial<FrigateSettings>) => onChange({ ...settings, ...change })
  return (
    <div className="ed-fields">
      <Note>{t('frigate.settings.hint')}</Note>
      <CameraPicker selected={settings.cameras ?? []} onChange={(names) => set({ cameras: names.length ? names : undefined })} />
      <NumberField label={t('frigate.settings.refresh')} min={2} max={120} value={settings.refreshSeconds} fallback={DEFAULTS.refreshSeconds}
        onChange={(refreshSeconds) => set({ refreshSeconds })} />
      <NumberField label={t('frigate.settings.poll')} min={5} max={300} value={settings.pollSeconds} fallback={DEFAULTS.pollSeconds}
        onChange={(pollSeconds) => set({ pollSeconds })} />
      <NumberField label={t('frigate.settings.alerts')} min={5} max={100} value={settings.alertLimit} fallback={DEFAULTS.alertLimit}
        onChange={(alertLimit) => set({ alertLimit })} />
    </div>
  )
}
