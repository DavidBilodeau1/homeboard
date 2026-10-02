import React, { useEffect, useMemo, useState, type ReactNode } from 'react'
import * as api from '../../api'
import { useEntityOptions } from '../../components/editor/useEntityOptions'
import { PLUGINS } from '../../plugins/registry'
import { isPluginAvailable, isPluginEnabled } from '../../plugins/settings'
import type { AnyPlugin } from '../../plugins/types'
import { useStore } from '../../store'
import type { AppConfig, ServerMeta } from '../../types'
import { GeneralTab } from './GeneralTab'
import { CalendarsTab, ListSectionTab } from './ListTabs'
import { PluginsTab } from './PluginsTab'
import { SmartHomeTab } from './SmartHomeTab'
import type { TabProps, UpdateDraft } from './types'

const JSON_TAB = 'json'
const SAVED_MESSAGE_MS = 3000

interface EditorTab {
  id: string
  labelKey: string
  render: (props: TabProps) => ReactNode
}

const CORE_TABS: EditorTab[] = [
  { id: 'general', labelKey: 'settings.general', render: (props) => <GeneralTab {...props} /> },
  { id: 'calendars', labelKey: 'nav.calendar', render: (props) => <CalendarsTab {...props} /> },
  { id: 'tasks', labelKey: 'nav.tasks', render: (props) => <ListSectionTab {...props} section="tasks" domains={['todo']} withColor /> },
  { id: 'meals', labelKey: 'nav.meals', render: (props) => <ListSectionTab {...props} section="meals" domains={['todo']} withColor /> },
  { id: 'lists', labelKey: 'nav.lists', render: (props) => <ListSectionTab {...props} section="lists" domains={['todo']} /> },
  { id: 'rewards', labelKey: 'nav.rewards', render: (props) => <ListSectionTab {...props} section="rewards" domains={['counter', 'input_number', 'sensor']} /> },
  { id: 'smarthome', labelKey: 'nav.home', render: (props) => <SmartHomeTab {...props} /> },
  { id: 'plugins', labelKey: 'settings.plugins', render: (props) => <PluginsTab {...props} /> },
]

const pluginTab = (plugin: AnyPlugin): EditorTab => ({
  id: `plugin:${plugin.id}`,
  labelKey: plugin.titleKey,
  render: ({ draft, update, entities }) => {
    const { Settings } = plugin
    return Settings && (
      <Settings settings={draft.plugins?.[plugin.id] ?? {}} entities={entities}
        onChange={(next) => update((d) => { d.plugins = { ...d.plugins, [plugin.id]: next } })} />
    )
  },
})

const JSON_EDITOR_TAB: EditorTab = { id: JSON_TAB, labelKey: 'settings.json', render: () => null }

/** Core tabs, a tab per plugin enabled in the draft and runnable on the server, then raw JSON. */
const editorTabs = (draft: AppConfig, meta: ServerMeta | null): EditorTab[] => [
  ...CORE_TABS,
  ...PLUGINS
    .filter((plugin) => plugin.Settings && isPluginEnabled(draft, plugin.id) && isPluginAvailable(meta, plugin.id))
    .map(pluginTab),
  JSON_EDITOR_TAB,
]

const formatJson = (config: AppConfig | null) => JSON.stringify(config ?? {}, null, 2)

export function ConfigEditor() {
  const { config, meta, t, reloadConfig } = useStore()
  const entities = useEntityOptions()
  const [draft, setDraft] = useState<AppConfig>(() => structuredClone(config ?? {}))
  const [tabId, setTabId] = useState(CORE_TABS[0].id)
  const [jsonText, setJsonText] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => { if (config) setDraft(structuredClone(config)) }, [config])

  const tabs = useMemo(() => editorTabs(draft, meta), [draft, meta])
  const tab = tabs.find((candidate) => candidate.id === tabId) ?? tabs[0]

  const update: UpdateDraft = (change) => setDraft((current) => {
    const next = structuredClone(current)
    change(next)
    return next
  })

  const openTab = (id: string) => {
    if (id === JSON_TAB) setJsonText(formatJson(draft))
    setTabId(id)
  }

  const draftToSave = (): AppConfig | null => {
    if (tab.id !== JSON_TAB) return draft
    try {
      return JSON.parse(jsonText)
    } catch {
      setMessage(t('settings.invalidJson'))
      return null
    }
  }

  const save = async () => {
    const next = draftToSave()
    if (!next) return
    try {
      await api.saveConfig(next)
      await reloadConfig()
      setMessage(t('settings.saved'))
      setTimeout(() => setMessage(''), SAVED_MESSAGE_MS)
    } catch (e) {
      setMessage(`${t('settings.saveError')}: ${e instanceof Error ? e.message : e}`)
    }
  }

  const revert = () => {
    setDraft(structuredClone(config ?? {}))
    setJsonText(formatJson(config))
    setMessage('')
  }

  return (
    <>
      <div className="todo-tabs ed-tabs">
        {tabs.map((candidate) => (
          <button key={candidate.id} className={`todo-tab${candidate.id === tab.id ? ' active' : ''}`} onClick={() => openTab(candidate.id)}>
            {t(candidate.labelKey)}
          </button>
        ))}
      </div>

      <div className="ed-body">
        {tab.id === JSON_TAB
          ? <textarea className="ed-json" value={jsonText} onChange={(e) => setJsonText(e.target.value)} spellCheck={false} />
          : tab.render({ draft, update, entities })}
      </div>

      <div className="ed-actions">
        <button className="ed-save" onClick={save}>{t('settings.save')}</button>
        <button className="ed-revert" onClick={revert}>{t('settings.revert')}</button>
        <span className="ed-msg">{message}</span>
      </div>
      <p className="settings-note">{t('settings.editHint')}</p>
    </>
  )
}
