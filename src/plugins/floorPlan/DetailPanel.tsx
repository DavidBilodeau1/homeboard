import React from 'react'
import { TrashIcon } from '../../icons'
import { useStore } from '../../store'
import { deviceValue, tapService } from './devices'
import { DimensionEditor } from './DimensionEditor'
import { fmtFtIn, type FtIn } from './plan'
import type { PlanObj } from './planObjects'
import type { FloorDevice } from './types'

interface Sizing {
  shape: 'rect' | 'circle'
  w: FtIn
  h: FtIn
  onChange: (w: FtIn, h: FtIn) => void
  onCommit: () => void
}

function Dimensions({ editing, sizing }: { editing: boolean; sizing: Sizing }) {
  const { t } = useStore()
  if (editing) return <DimensionEditor {...sizing} />
  return <dl className="fp-dl"><div><dt>{t('floorplan.dimensions')}</dt><dd>{fmtFtIn(sizing.w)} × {fmtFtIn(sizing.h)}</dd></div></dl>
}

export function DeviceDetail({ device, editing, armed, onAct, onRemove }: {
  device: FloorDevice
  editing: boolean
  armed: boolean
  onAct: () => void
  onRemove: () => void
}) {
  const { t, entityStates } = useStore()
  const state = entityStates[device.entity]
  const name = String(state?.attributes?.friendly_name ?? device.entity)
  const stateText = state ? deviceValue(device.entity, state) ?? state.state.replace(/_/g, ' ') : t('state.unavailable')
  const actionable = !!tapService(device.entity, state)

  return (
    <div className="card fp-detail">
      <h2 className="card-title">{name}</h2>
      <dl className="fp-dl">
        <div><dt>{t('floorplan.state')}</dt><dd className="fp-state">{stateText}</dd></div>
        <div><dt>{t('floorplan.entity')}</dt><dd className="fp-entity">{device.entity}</dd></div>
      </dl>
      {editing && <button className="fp-btn fp-remove" onClick={onRemove}><TrashIcon size={14} /> {t('floorplan.removeDevice')}</button>}
      {!editing && actionable && (
        <button className={`fp-btn fp-act${armed ? ' armed' : ''}`} onClick={onAct}>{armed ? t('home.confirm') : t('floorplan.trigger')}</button>
      )}
      {!editing && !actionable && <p className="fp-detail-hint">{t('floorplan.viewOnly')}</p>}
    </div>
  )
}

export function HouseDetail({ editing, sizing }: { editing: boolean; sizing: Sizing }) {
  const { t } = useStore()
  return (
    <div className="card fp-detail">
      <h2 className="card-title">{t('floorplan.house')}</h2>
      <Dimensions editing={editing} sizing={sizing} />
    </div>
  )
}

export function ObjectDetail({ object, editing, sizing, onRotate }: { object: PlanObj; editing: boolean; sizing: Sizing; onRotate: () => void }) {
  const { t } = useStore()
  return (
    <div className="card fp-detail">
      <h2 className="card-title">{object.name}</h2>
      {editing ? <DimensionEditor {...sizing} /> : <dl className="fp-dl"><div><dt>{t('floorplan.dimensions')}</dt><dd>{object.dims}</dd></div></dl>}
      <dl className="fp-dl">
        <div><dt>{t('floorplan.area')}</dt><dd>{t('floorplan.sqft', { n: object.areaSqFt })}</dd></div>
        {object.note && <div><dt>{t('floorplan.features')}</dt><dd>{t(`note.${object.note}`)}</dd></div>}
      </dl>
      {editing && object.rotatable && <button className="fp-btn fp-rotate" onClick={onRotate}>⟳ {t('floorplan.rotate')}</button>}
    </div>
  )
}

export function EmptyDetail({ editing }: { editing: boolean }) {
  const { t } = useStore()
  return <div className="card fp-detail fp-detail-empty">{t(editing ? 'floorplan.editHint' : 'floorplan.selectHint')}</div>
}
