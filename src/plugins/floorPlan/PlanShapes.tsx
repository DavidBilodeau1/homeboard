import React from 'react'
import type { EntityState } from '../../types'
import { DeviceIcon } from './DeviceIcon'
import { deviceValue, domainOf, isOn } from './devices'
import { GRID } from './geometry'
import { CANVAS } from './plan'
import type { PlanObj } from './planObjects'
import type { FloorDevice } from './types'

/** Marker radius, in plan units. */
const MARKER_RADIUS = 15
const GLYPH_OFFSET = 8.5
const LABEL_LINE_HEIGHT = 13
const SECURED_DOMAINS = ['lock', 'alarm_control_panel']

const classes = (...names: (string | false)[]) => names.filter(Boolean).join(' ')

export function GridBackdrop() {
  const cell = GRID * 2
  return (
    <>
      <defs>
        <pattern id="fp-grid" width={cell} height={cell} patternUnits="userSpaceOnUse">
          <path d={`M ${cell} 0 L 0 0 0 ${cell}`} className="fp-gridline" />
        </pattern>
      </defs>
      <rect x={0} y={0} width={CANVAS.w} height={CANVAS.h} fill="url(#fp-grid)" style={{ pointerEvents: 'none' }} />
    </>
  )
}

interface ShapeProps {
  selected: boolean
  editing: boolean
  onPointerDown: (e: React.PointerEvent) => void
  onClick: () => void
}

export function PlanShape({ object, selected, editing, onPointerDown, onClick }: ShapeProps & { object: PlanObj }) {
  const { rect } = object
  const cx = rect.x + rect.w / 2
  const cy = rect.y + rect.h / 2
  const lines = [object.name, object.dims]
  const top = cy - ((lines.length - 1) * LABEL_LINE_HEIGHT) / 2
  return (
    <g className={classes('fp-obj', `fp-${object.kind}`, selected && 'selected', editing && 'editable')} onPointerDown={onPointerDown} onClick={onClick}>
      {object.shape === 'circle'
        ? <ellipse className="fp-fill" cx={cx} cy={cy} rx={rect.w / 2} ry={rect.h / 2} />
        : <rect className="fp-fill" x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={3} />}
      {lines.map((text, i) => (
        <text key={i} className={`fp-label ${i === 0 ? 'fp-name' : 'fp-meta'}`}
          x={cx} y={top + i * LABEL_LINE_HEIGHT} textAnchor="middle" dominantBaseline="middle">{text}</text>
      ))}
    </g>
  )
}

export function DeviceMarker({ device, state, armed, selected, editing, onPointerDown, onClick }: ShapeProps & {
  device: FloorDevice
  state: EntityState | null | undefined
  armed: boolean
}) {
  const on = isOn(device.entity, state)
  const value = deviceValue(device.entity, state)
  const className = classes(
    'fp-device',
    state == null && 'unavailable',
    on && 'on',
    on && SECURED_DOMAINS.includes(domainOf(device.entity)) && 'secure',
    selected && 'selected',
    armed && 'armed',
    editing && 'editable',
  )
  return (
    <g className={className} onPointerDown={onPointerDown} onClick={onClick}>
      <circle className="fp-dev-dot" cx={device.x} cy={device.y} r={MARKER_RADIUS} />
      <g className="fp-dev-glyph" transform={`translate(${device.x - GLYPH_OFFSET}, ${device.y - GLYPH_OFFSET})`}>
        <DeviceIcon entity={device.entity} state={state} />
      </g>
      {value && <text className="fp-dev-value" x={device.x} y={device.y + MARKER_RADIUS + 8} textAnchor="middle">{value}</text>}
    </g>
  )
}
