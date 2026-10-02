import React from 'react'
import { EntitySelect } from '../../components/editor/EntitySelect'
import { Field } from '../../components/editor/Field'
import { ListEditor, type EditorRow } from '../../components/editor/ListEditor'
import { useStore } from '../../store'
import type { SmartHomeCfg } from '../../types'
import type { TabProps } from './types'

const SENSOR_ICONS = ['temp', 'pool', 'air', 'sun']

type ListKey = 'sensors' | 'lights' | 'mediaPlayers' | 'locks'

const SECTIONS: { key: ListKey; titleKey: string; domains: string[]; icons?: string[] }[] = [
  { key: 'sensors', titleKey: 'home.sensors', domains: ['sensor'], icons: SENSOR_ICONS },
  { key: 'lights', titleKey: 'home.lights', domains: ['light', 'switch'] },
  { key: 'mediaPlayers', titleKey: 'home.media', domains: ['media_player'] },
  { key: 'locks', titleKey: 'home.security', domains: ['lock'] },
]

export function SmartHomeTab({ draft, update, entities }: TabProps) {
  const { t } = useStore()
  const smartHome = draft.smartHome ?? {}
  const updateSmartHome = (change: (s: SmartHomeCfg) => void) => update((d) => {
    d.smartHome = d.smartHome ?? {}
    change(d.smartHome)
  })

  return (
    <div className="ed-fields">
      <Field label={t('home.climate')}>
        <EntitySelect value={smartHome.climate} domains={['climate']} options={entities}
          onChange={(entity) => updateSmartHome((s) => { s.climate = entity ?? undefined })} />
      </Field>
      <Field label={t('settings.alarm')}>
        <EntitySelect value={smartHome.alarm} domains={['alarm_control_panel']} options={entities}
          onChange={(entity) => updateSmartHome((s) => { s.alarm = entity ?? undefined })} />
      </Field>
      {SECTIONS.map(({ key, titleKey, domains, icons }) => (
        <React.Fragment key={key}>
          <h3 className="ed-subtitle">{t(titleKey)}</h3>
          <ListEditor<EditorRow> rows={smartHome[key] ?? []} domains={domains} options={entities} icons={icons}
            onChange={(rows) => updateSmartHome((s) => { s[key] = rows })} />
        </React.Fragment>
      ))}
    </div>
  )
}
