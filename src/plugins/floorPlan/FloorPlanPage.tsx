import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTwoTapConfirm } from '../../components/useTwoTapConfirm'
import { PlusIcon } from '../../icons'
import { useStore, useTrackedEntities } from '../../store'
import { usePluginSettings } from '../settings'
import { DeviceDetail, EmptyDetail, HouseDetail, ObjectDetail } from './DetailPanel'
import { deviceKind, needsConfirm, tapService } from './devices'
import { EntityPicker } from './EntityPicker'
import { devicePosition, dragPosition, rotated, straightened } from './geometry'
import { baseSize, CANVAS, DEFAULT_PLAN, resolvePlan, type FtIn } from './plan'
import { HOUSE_ID, toPlanObj, withDimensions, type PlanObj, type Resize } from './planObjects'
import { DeviceMarker, GridBackdrop, PlanShape } from './PlanShapes'
import type { FloorDevice, FloorPlanSettings, Layout } from './types'

/** Pointer travel, in plan units, before a press counts as a drag rather than a tap. */
const DRAG_THRESHOLD = 2

interface Drag {
  id: string
  kind: 'object' | 'device'
  startX: number
  startY: number
  originX: number
  originY: number
  moved: boolean
}

const newDeviceId = () => `dev-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`

function FloorTabs({ floors, current, onSelect }: { floors: { id: string; name?: string; labelKey?: string }[]; current: string; onSelect: (id: string) => void }) {
  const { t } = useStore()
  return (
    <div className="fp-tabs">
      {floors.map((floor) => (
        <button key={floor.id} className={`fp-tab${floor.id === current ? ' active' : ''}`} onClick={() => onSelect(floor.id)}>
          {floor.name ?? t(`floorplan.${floor.labelKey ?? floor.id}`)}
        </button>
      ))}
    </div>
  )
}

/** The home drawn to scale, with Home Assistant devices placed on it; rooms and devices can be rearranged. */
export function FloorPlanPage() {
  const { t, callService, savePluginSettings } = useStore()
  const settings = usePluginSettings<FloorPlanSettings>('floorPlan')
  const plan = useMemo(() => resolvePlan(settings), [settings])
  const [floorId, setFloorId] = useState(plan.floors[0]?.id)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  // mirrors of the saved layout and devices, so dragging stays smooth until the drop is saved
  const [layout, setLayout] = useState<Layout>({})
  const [devices, setDevices] = useState<FloorDevice[]>([])
  const [resize, setResize] = useState<Resize | null>(null)
  const [picking, setPicking] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<Drag | null>(null)
  const entityStates = useTrackedEntities(devices.map((device) => device.entity))
  const { armed, confirm } = useTwoTapConfirm()

  useEffect(() => {
    if (drag.current) return
    setLayout(settings.layout ?? {})
    setDevices(settings.devices ?? [])
  }, [settings])

  useEffect(() => setResize(null), [selectedId])

  const floor = plan.floors.find((f) => f.id === floorId) ?? plan.floors[0]
  const isGroundFloor = floor.id === plan.floors[0]?.id

  const objects = useMemo<PlanObj[]>(() => {
    const exterior = isGroundFloor ? plan.exterior.map((feature) =>
      toPlanObj(feature, 'exterior', feature.name ?? (feature.labelKey ? t(`floorplan.${feature.labelKey}`) : feature.id), layout, resize)) : []
    const rooms = floor.rooms.map((room) => {
      const name = `${room.name ?? (room.typeKey ? t(`room.${room.typeKey}`) : room.id)}${room.tag ? ` ${room.tag}` : ''}`
      return toPlanObj(room, 'room', name, layout, resize)
    })
    return [...exterior, ...rooms]
  }, [floor, plan.exterior, isGroundFloor, layout, resize, t])

  const house = useMemo(() => {
    if (resize?.id !== HOUSE_ID) return plan.house
    return { ...plan.house, ...baseSize(resize) }
  }, [plan.house, resize])

  const persist = (nextLayout: Layout, nextDevices: FloorDevice[]) => {
    const next: FloorPlanSettings = { ...settings, layout: nextLayout, devices: nextDevices }
    return savePluginSettings('floorPlan', next)
  }
  const saveLayout = (next: Layout) => {
    setLayout(next)
    persist(next, devices)
  }
  const saveDevices = (next: FloorDevice[]) => {
    setDevices(next)
    persist(layout, next)
  }

  const planUnitsPerPixel = () => {
    const width = svgRef.current?.getBoundingClientRect().width
    return width ? CANVAS.w / width : 1
  }

  const startDrag = (e: React.PointerEvent, id: string, kind: Drag['kind'], originX: number, originY: number) => {
    setSelectedId(id)
    if (!editing) return
    e.preventDefault()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    drag.current = { id, kind, startX: e.clientX, startY: e.clientY, originX, originY, moved: false }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const current = drag.current
    if (!current) return
    const scale = planUnitsPerPixel()
    const x = current.originX + (e.clientX - current.startX) * scale
    const y = current.originY + (e.clientY - current.startY) * scale
    if (Math.abs(x - current.originX) > DRAG_THRESHOLD || Math.abs(y - current.originY) > DRAG_THRESHOLD) current.moved = true

    if (current.kind === 'device') {
      setDevices((list) => list.map((device) => (device.id === current.id ? { ...device, ...devicePosition(x, y) } : device)))
      return
    }
    const object = objects.find((o) => o.id === current.id)!
    const otherRooms = objects.filter((o) => o.id !== current.id && o.kind === 'room').map((o) => o.rect)
    setLayout((prev) => ({ ...prev, [current.id]: { ...prev[current.id], ...dragPosition(object.rect, x, y, house, otherRooms) } }))
  }

  const onPointerUp = () => {
    if (drag.current?.moved) persist(layout, devices)
    drag.current = null
  }

  const act = (device: FloorDevice) => {
    const call = tapService(device.entity, entityStates[device.entity])
    if (!call) return
    const run = () => callService(call.domain, call.service, call.data)
    if (needsConfirm(deviceKind(device.entity))) confirm(device.id, run)
    else run()
  }

  const onDeviceClick = (device: FloorDevice) => {
    if (drag.current?.moved) return
    setSelectedId(device.id)
    if (!editing) act(device)
  }

  const addDevice = (entity: string) => {
    const device: FloorDevice = { id: newDeviceId(), entity, floor: floor.id, x: Math.round(CANVAS.w / 2), y: Math.round(CANVAS.h / 2) }
    saveDevices([...devices, device])
    setSelectedId(device.id)
    setPicking(false)
  }

  const removeDevice = (id: string) => {
    saveDevices(devices.filter((device) => device.id !== id))
    setSelectedId(null)
  }

  const reset = () => {
    saveLayout({})
    setSelectedId(null)
  }

  const sizing = (id: string, shape: 'rect' | 'circle', w: FtIn, h: FtIn) => {
    const current = resize?.id === id ? resize : { w, h }
    return {
      shape,
      w: current.w,
      h: current.h,
      onChange: (nextW: FtIn, nextH: FtIn) => setResize({ id, w: nextW, h: nextH }),
      onCommit: () => { if (resize) savePluginSettings('floorPlan', withDimensions(settings, resize)) },
    }
  }

  const selectFloor = (id: string) => {
    setFloorId(id)
    setSelectedId(null)
  }

  const savedHouse = settings.house ?? DEFAULT_PLAN.house!
  const selectedDevice = devices.find((device) => device.id === selectedId)
  const selectedObject = objects.find((o) => o.id === selectedId)
  const rooms = objects.filter((o) => o.kind === 'room')

  const detail = () => {
    if (selectedDevice) {
      return (
        <DeviceDetail device={selectedDevice} editing={editing} armed={armed === selectedDevice.id}
          onAct={() => act(selectedDevice)} onRemove={() => removeDevice(selectedDevice.id)} />
      )
    }
    if (selectedId === HOUSE_ID) return <HouseDetail editing={editing} sizing={sizing(HOUSE_ID, 'rect', savedHouse.w, savedHouse.h)} />
    if (selectedObject) {
      return (
        <ObjectDetail object={selectedObject} editing={editing} sizing={sizing(selectedObject.id, selectedObject.shape, selectedObject.w, selectedObject.h)}
          onRotate={() => saveLayout({ ...layout, [selectedObject.id]: rotated(selectedObject.rect, layout[selectedObject.id]) })} />
      )
    }
    return <EmptyDetail editing={editing} />
  }

  return (
    <div className="fp-page">
      <div className="fp-head">
        <h1 className="fp-title">{t('floorplan.title')}</h1>
        <FloorTabs floors={plan.floors} current={floor.id} onSelect={selectFloor} />
        <div className="fp-actions">
          {editing && <button className="fp-btn" onClick={() => setPicking(true)}><PlusIcon size={14} /> {t('floorplan.addDevice')}</button>}
          {editing && <button className="fp-btn" onClick={() => saveLayout(straightened(rooms, house, layout))}>{t('floorplan.straighten')}</button>}
          {editing && <button className="fp-btn" onClick={reset}>{t('floorplan.reset')}</button>}
          <button className={`fp-btn${editing ? ' primary' : ''}`} onClick={() => setEditing((on) => !on)}>
            {editing ? t('floorplan.done') : t('floorplan.rearrange')}
          </button>
        </div>
      </div>

      <p className="fp-note">{editing ? t('floorplan.editHint') : t('floorplan.viewHint')}</p>

      <div className="fp-body">
        <section className="card fp-plan">
          <svg
            ref={svgRef}
            className={`fp-svg${editing ? ' editing' : ''}`}
            viewBox={`-4 -4 ${CANVAS.w + 8} ${CANVAS.h + 8}`}
            preserveAspectRatio="xMidYMid meet"
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            onClick={(e) => { if (e.target === e.currentTarget) setSelectedId(null) }}
          >
            {editing && <GridBackdrop />}
            <rect
              className={`fp-house${editing ? ' editable' : ''}${selectedId === HOUSE_ID ? ' selected' : ''}`}
              x={house.x} y={house.y} width={house.w} height={house.h} rx={4}
              onClick={() => { if (editing) setSelectedId(HOUSE_ID) }} />
            {objects.map((object) => (
              <PlanShape key={object.id} object={object} selected={object.id === selectedId} editing={editing}
                onPointerDown={(e) => startDrag(e, object.id, 'object', object.rect.x, object.rect.y)}
                onClick={() => { if (!drag.current?.moved) setSelectedId(object.id) }} />
            ))}
            {devices.filter((device) => device.floor === floor.id).map((device) => (
              <DeviceMarker key={device.id} device={device} state={entityStates[device.entity]} armed={armed === device.id}
                selected={device.id === selectedId} editing={editing}
                onPointerDown={(e) => startDrag(e, device.id, 'device', device.x, device.y)}
                onClick={() => onDeviceClick(device)} />
            ))}
          </svg>
        </section>
        <aside className="fp-side">{detail()}</aside>
      </div>

      {picking && <EntityPicker onPick={addDevice} onClose={() => setPicking(false)} />}
    </div>
  )
}
