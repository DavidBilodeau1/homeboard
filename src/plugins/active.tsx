import React, { useMemo, type ReactNode } from 'react'
import { useStore } from '../store'
import { PLUGINS } from './registry'
import { isPluginAvailable, isPluginEnabled } from './settings'
import type { AnyPlugin } from './types'

/** Plugins that are enabled in the config and runnable on the server. */
export function useActivePlugins(): AnyPlugin[] {
  const { config, meta } = useStore()
  return useMemo(
    () => PLUGINS.filter((plugin) => isPluginEnabled(config, plugin.id) && isPluginAvailable(meta, plugin.id)),
    [config, meta],
  )
}

export function PluginProviders({ children }: { children: ReactNode }) {
  const active = useActivePlugins()
  const wrapped = PLUGINS.reduceRight<ReactNode>((inner, plugin) => {
    const { Provider } = plugin
    return Provider ? <Provider active={active.includes(plugin)}>{inner}</Provider> : inner
  }, children)
  return <>{wrapped}</>
}
