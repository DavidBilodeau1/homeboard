import { useMemo } from 'react'
import { useStore, useTrackedEntities } from '../../store'
import { usePluginSettings } from '../settings'
import { upcomingCollections, type Collection, type CollectionCfg, type GarbageSettings } from './collections'

const NO_ROWS: CollectionCfg[] = []

export function useCollections(enabled = true): Collection[] {
  const { now } = useStore()
  const settings = usePluginSettings<GarbageSettings>('garbage')
  const rows = enabled ? settings.collections ?? NO_ROWS : NO_ROWS
  const states = useTrackedEntities(rows.map((row) => row.entity))
  const today = now.toDateString()
  return useMemo(() => upcomingCollections(rows, states, new Date(today)), [rows, states, today])
}
