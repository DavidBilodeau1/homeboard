import React from 'react'
import { useStore } from '../store'

/** Legend chip that shows or hides one calendar layer on this screen. */
export function LayerChip({ id, color, label, fallback = true }: { id: string; color: string; label: string; fallback?: boolean }) {
  const { layerVisible, toggleLayer } = useStore()
  const on = layerVisible(id, fallback)
  return (
    <button className={`calpage-legend-chip${on ? '' : ' off'}`} onClick={() => toggleLayer(id, fallback)} aria-pressed={on}>
      <i style={{ background: on ? color : 'transparent', borderColor: color }} />
      {label}
    </button>
  )
}
