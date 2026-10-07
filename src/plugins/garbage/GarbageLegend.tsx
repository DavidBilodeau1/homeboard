import React from 'react'
import { LayerChip } from '../../components/LayerChip'
import { useStore } from '../../store'
import { usePluginSettings } from '../settings'
import { DEFAULT_COLOR, LAYER_ID, type GarbageSettings } from './collections'

export function GarbageLegend() {
  const { t } = useStore()
  const first = usePluginSettings<GarbageSettings>('garbage').collections?.[0]
  return first ? <LayerChip id={LAYER_ID} color={first.color ?? DEFAULT_COLOR} label={t('garbage.layer')} /> : null
}
