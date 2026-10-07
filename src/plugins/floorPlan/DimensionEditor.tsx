import React from 'react'
import { useStore } from '../../store'
import type { FtIn } from './plan'

const MAX_INCHES = 11

const wholeNumber = (text: string) => {
  const n = parseInt(text, 10)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** A feet ′ inches ″ pair of inputs. */
function DimField({ label, value, onChange, onCommit }: { label: string; value: FtIn; onChange: (v: FtIn) => void; onCommit: () => void }) {
  return (
    <div className="fp-dim">
      <span className="fp-dim-label">{label}</span>
      <span className="fp-dim-inputs">
        <input type="number" min={0} value={value[0]} aria-label={`${label} feet`}
          onChange={(e) => onChange([wholeNumber(e.target.value), value[1]])} onBlur={onCommit} />
        <em>′</em>
        <input type="number" min={0} max={MAX_INCHES} value={value[1]} aria-label={`${label} inches`}
          onChange={(e) => onChange([value[0], Math.min(MAX_INCHES, wholeNumber(e.target.value))])} onBlur={onCommit} />
        <em>″</em>
      </span>
    </div>
  )
}

interface Props {
  shape: 'rect' | 'circle'
  w: FtIn
  h: FtIn
  onChange: (w: FtIn, h: FtIn) => void
  /** saves the typed dimensions once a field loses focus */
  onCommit: () => void
}

export function DimensionEditor({ shape, w, h, onChange, onCommit }: Props) {
  const { t } = useStore()
  if (shape === 'circle') {
    return (
      <div className="fp-dims">
        <DimField label={t('floorplan.diameter')} value={w} onChange={(d) => onChange(d, d)} onCommit={onCommit} />
      </div>
    )
  }
  return (
    <div className="fp-dims">
      <DimField label={t('floorplan.width')} value={w} onChange={(next) => onChange(next, h)} onCommit={onCommit} />
      <DimField label={t('floorplan.height')} value={h} onChange={(next) => onChange(w, next)} onCommit={onCommit} />
    </div>
  )
}
