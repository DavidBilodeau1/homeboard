import React from 'react'
import { Note } from '../../components/editor/Field'
import { PLUGINS } from '../../plugins/registry'
import { isPluginAvailable, isPluginEnabled } from '../../plugins/settings'
import { useStore } from '../../store'
import type { TabProps } from './types'

export function PluginsTab({ draft, update }: TabProps) {
  const { meta, t } = useStore()
  const setEnabled = (id: string, enabled: boolean) => update((d) => {
    d.plugins = { ...d.plugins, [id]: { ...d.plugins?.[id], enabled } }
  })

  return (
    <div className="ed-fields">
      <Note>{t('settings.pluginsHint')}</Note>
      {PLUGINS.map((plugin) => {
        const enabled = isPluginEnabled(draft, plugin.id)
        const unavailable = !isPluginAvailable(meta, plugin.id)
        return (
          <label key={plugin.id} className={`ed-plugin${enabled ? ' on' : ''}`}>
            <input type="checkbox" checked={enabled} onChange={() => setEnabled(plugin.id, !enabled)} />
            <span className="ed-plugin-text">
              <b>{t(plugin.titleKey)}</b>
              <small>{t(plugin.descriptionKey)}</small>
              {unavailable && plugin.setupKey && (
                <small className="ed-plugin-setup">{t('settings.pluginUnavailable')} — {t(plugin.setupKey)}</small>
              )}
            </span>
          </label>
        )
      })}
    </div>
  )
}
