import { useStore } from '../store'
import type { AppConfig, PluginSettings, ServerMeta } from '../types'

const NO_SETTINGS: PluginSettings = {}

export const isPluginEnabled = (config: AppConfig | null, id: string) => config?.plugins?.[id]?.enabled === true

/** Whether the server has what the plugin needs; unknown until the server says so. */
export const isPluginAvailable = (meta: ServerMeta | null, id: string) => meta?.plugins[id]?.available ?? false

export function usePluginSettings<S extends PluginSettings>(id: string): S {
  const { config } = useStore()
  return (config?.plugins?.[id] ?? NO_SETTINGS) as S
}
