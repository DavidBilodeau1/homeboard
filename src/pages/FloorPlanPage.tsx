import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { haGet } from '../api'
import {
  resolvePlan, DEFAULT_PLAN, CANVAS, GRID, SNAP, baseSize, feet, fmtFtIn,
  type FloorId, type Room, type Exterior, type FtIn,
} from '../floorplan'
import {
  deviceKind, domainOf, isOn, needsConfirm, tapService, deviceValue,
  type FloorDevice,
} from '../floorplanDevices'
import {
  BulbIcon, LockIcon, ShieldIcon, ThermoIcon, CameraIcon, PlugIcon, FanIcon,
  GaugeIcon, DropletIcon, MotionIcon, BoltIcon, CoverIcon, DoorIcon, DotIcon,
  PlusIcon, TrashIcon,
} from '../icons'
import type { EntityState, FloorPlanCfg } from '../types'

const LS_KEY = 'homeboard-floorplan-layout'
const DEV_KEY = 'homeboard-floorplan-devices'
const DEV_R = 15 // marker radius, plan units

type Placement = { x: number; y: number; rot?: boolean }
type Layout = Record<string, Placement>

const clamp = (lo: number, hi: number, v: number) => Math.max(lo, Math.min(hi, v))
const snap = (v: number) => Math.round(v / GRID) * GRID

/** Straighten pulls a room's edge to a wall/neighbour up to this far (plan units). */
const STRAIGHTEN_SNAP = 24

/** Position that aligns the object's nearest edge (near or far) to the closest
 *  line within `threshold`, or null when nothing is close enough. */
const snapTo = (pos: number, size: number, lines: number[], threshold: number): number | null => {
  let best: number | null = null
  let bestDelta = threshold + 1
  for (const line of lines) {
    const dNear = Math.abs(pos - line)
    if (dNear < bestDelta) { bestDelta = dNear; best = line }
    const dFar = Math.abs(pos + size - line)
    if (dFar < bestDelta) { bestDelta = dFar; best = line - size }
  }
  return best
}

/** Drag snap: align to the closest wall/room edge within `threshold`, else fall
 *  back to the grid (or leave unchanged when `gridFallback` is false). */
const snapAxis = (pos: number, size: number, lines: number[], threshold = SNAP, gridFallback = true): number => {
  const s = snapTo(pos, size, lines, threshold)
  if (s !== null) return s
  return gridFallback ? snap(pos) : pos
}

const loadJSON = <T,>(key: string, fallback: T): T => {
  try { return JSON.parse(localStorage.getItem(key) || '') as T } catch { return fallback }
}

const uid = () => `dev-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`

/** Icon for an entity, chosen by domain and device_class. */
const deviceIcon = (entity: string, st: EntityState | null | undefined): React.ReactNode => {
  const d = domainOf(entity)
  const dc = String(st?.attributes?.device_class ?? '')
  const s = 17
  switch (d) {
    case 'light': return <BulbIcon size={s} />
    case 'switch': case 'input_boolean': case 'siren': return <PlugIcon size={s} />
    case 'fan': return <FanIcon size={s} />
    case 'lock': return <LockIcon size={s} open={st?.state !== 'locked'} />
    case 'alarm_control_panel': return <ShieldIcon size={s} />
    case 'climate': case 'humidifier': return <ThermoIcon size={s} />
    case 'cover': return <CoverIcon size={s} />
    case 'camera': return <CameraIcon size={s} />
    case 'scene': case 'script': case 'button': case 'input_button': case 'automation':
      return <BoltIcon size={s} />
    case 'sensor': case 'number': case 'input_number':
      if (dc === 'humidity') return <DropletIcon size={s} />
      if (dc === 'temperature') return <ThermoIcon size={s} />
      return <GaugeIcon size={s} />
    case 'binary_sensor':
      if (['motion', 'occupancy', 'moving', 'presence'].includes(dc)) return <MotionIcon size={s} />
      if (['door', 'window', 'opening', 'garage_door'].includes(dc)) return <DoorIcon size={s} />
      return <DotIcon size={s} />
    default: return <DotIcon size={s} />
  }
}

interface PlanObj {
  id: string
  kind: 'room' | 'exterior'
  shape: 'rect' | 'circle'
  name: string
  dims: string
  areaSqFt: number
  note?: string
  rotatable: boolean
  w: FtIn
  h: FtIn
  rect: { x: number; y: number; w: number; h: number }
}

const asInt = (s: string) => { const n = parseInt(s, 10); return Number.isFinite(n) && n > 0 ? n : 0 }

/** A feet-inches input pair (feet ′ / inches ″). */
function DimField({ label, value, onChange, onCommit }: {
  label: string; value: FtIn; onChange: (v: FtIn) => void; onCommit: () => void
}) {
  return (
    <div className="fp-dim">
      <span className="fp-dim-label">{label}</span>
      <span className="fp-dim-inputs">
        <input type="number" min={0} value={value[0]} aria-label={`${label} feet`}
          onChange={(e) => onChange([asInt(e.target.value), value[1]])} onBlur={onCommit} />
        <em>′</em>
        <input type="number" min={0} max={11} value={value[1]} aria-label={`${label} inches`}
          onChange={(e) => onChange([value[0], Math.min(11, asInt(e.target.value))])} onBlur={onCommit} />
        <em>″</em>
      </span>
    </div>
  )
}

export function FloorPlanPage() {
  const { t, config, entityStates, callService, trackEntities, saveConfig } = useStore()
  const [floorId, setFloorId] = useState<FloorId>('rdc')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [edit, setEdit] = useState(false)
  // layout & devices live in config.json (shared across screens); mirrored into
  // local state for snappy dragging, then persisted back on release.
  const [layout, setLayout] = useState<Layout>({})
  const [devices, setDevices] = useState<FloorDevice[]>([])
  const [armed, setArmed] = useState<string | null>(null)
  // in-progress dimension edit for the selected object/house (live, commits to config on blur)
  const [dimEdit, setDimEdit] = useState<{ id: string; w: FtIn; h: FtIn } | null>(null)
  const [picking, setPicking] = useState(false)
  const [options, setOptions] = useState<{ id: string; name: string }[] | null>(null)
  const [query, setQuery] = useState('')

  const svgRef = useRef<SVGSVGElement>(null)
  const armTimer = useRef<ReturnType<typeof setTimeout>>()
  const migrated = useRef(false)
  const drag = useRef<{ id: string; kind: 'obj' | 'device'; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null)

  const plan = useMemo(() => resolvePlan(config?.floorPlan), [config])
  const floor = plan.floors.find((f) => f.id === floorId) ?? plan.floors[0]
  const groundId = plan.floors[0]?.id
  const roomName = (r: Room) => `${r.name ?? (r.typeKey ? t(`room.${r.typeKey}`) : r.id)}${r.tag ? ` ${r.tag}` : ''}`
  const exteriorName = (e: Exterior) => e.name ?? (e.labelKey ? t(`floorplan.${e.labelKey}`) : e.id)

  // mirror config → local state (skips while a drag is in flight)
  useEffect(() => {
    if (drag.current) return
    setLayout(config?.floorPlan?.layout ?? {})
    setDevices(config?.floorPlan?.devices ?? [])
  }, [config])

  // one-time migration of pre-config localStorage placements into config.json
  useEffect(() => {
    if (!config || migrated.current) return
    migrated.current = true
    const fp = config.floorPlan
    if (fp?.layout || fp?.devices) return
    const oldLayout = loadJSON<Layout | null>(LS_KEY, null)
    const oldDevices = loadJSON<FloorDevice[] | null>(DEV_KEY, null)
    if (!oldLayout && !oldDevices) return
    saveConfig({ ...config, floorPlan: { ...fp, layout: oldLayout ?? {}, devices: oldDevices ?? [] } })
      .then((ok) => { if (ok) { localStorage.removeItem(LS_KEY); localStorage.removeItem(DEV_KEY) } })
  }, [config, saveConfig])

  // keep the floor plan's entities live (states + websocket) via the store
  useEffect(() => { trackEntities(devices.map((d) => d.entity)) }, [devices, trackEntities])
  useEffect(() => () => clearTimeout(armTimer.current), [])
  // drop any in-progress dimension edit when the selection changes
  useEffect(() => { setDimEdit(null) }, [selectedId])

  // persist current placements back to config.json
  const persist = (nextLayout: Layout, nextDevices: FloorDevice[]) => {
    if (!config) return
    saveConfig({ ...config, floorPlan: { ...(config.floorPlan ?? {}), layout: nextLayout, devices: nextDevices } })
  }
  const saveLayout = (next: Layout) => { setLayout(next); persist(next, devices) }
  const saveDevices = (next: FloorDevice[]) => { setDevices(next); persist(layout, next) }

  const objects: PlanObj[] = useMemo(() => {
    const build = (o: Room | Exterior, kind: PlanObj['kind'], shape: PlanObj['shape'], name: string, rotatable: boolean): PlanObj => {
      // an in-progress dimension edit for this object wins, for live resizing
      const w0 = dimEdit?.id === o.id ? dimEdit.w : o.w
      const h0 = dimEdit?.id === o.id ? dimEdit.h : o.h
      const base = baseSize({ w: w0, h: h0 })
      const p = layout[o.id]
      const rot = !!p?.rot
      return {
        id: o.id, kind, shape, name, rotatable, w: w0, h: h0,
        dims: shape === 'circle' ? `Ø ${fmtFtIn(w0)}` : `${fmtFtIn(w0)} × ${fmtFtIn(h0)}`,
        areaSqFt: shape === 'circle' ? Math.round(Math.PI * (feet(w0) / 2) ** 2) : Math.round(feet(w0) * feet(h0)),
        note: 'note' in o ? o.note : undefined,
        rect: { x: p?.x ?? o.x, y: p?.y ?? o.y, w: rot ? base.h : base.w, h: rot ? base.w : base.h },
      }
    }
    const rooms = floor.rooms.map((r) => build(r, 'room', 'rect', roomName(r), true))
    const ext = floor.id === groundId ? plan.exterior.map((e) => build(e, 'exterior', e.shape, exteriorName(e), e.shape === 'rect')) : []
    return [...ext, ...rooms]
  }, [floor, plan, groundId, layout, dimEdit, t]) // eslint-disable-line react-hooks/exhaustive-deps

  // house rect, resized live while its dimensions are being edited
  const houseRect = useMemo(() => {
    if (dimEdit?.id === 'house') {
      const s = baseSize({ w: dimEdit.w, h: dimEdit.h })
      return { ...plan.house, w: s.w, h: s.h }
    }
    return plan.house
  }, [plan.house, dimEdit])

  const floorDevices = devices.filter((d) => d.floor === floor.id)
  const selectedObj = objects.find((o) => o.id === selectedId) ?? null
  const selectedDev = devices.find((d) => d.id === selectedId) ?? null

  // ----- drag -----
  const unitsPerPx = () => {
    const el = svgRef.current
    return el ? CANVAS.w / el.getBoundingClientRect().width : 1
  }

  const startDrag = (e: React.PointerEvent, id: string, kind: 'obj' | 'device', ox: number, oy: number) => {
    setSelectedId(id)
    if (!edit) return
    e.preventDefault()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    drag.current = { id, kind, sx: e.clientX, sy: e.clientY, ox, oy, moved: false }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const k = unitsPerPx()
    const dx = (e.clientX - d.sx) * k
    const dy = (e.clientY - d.sy) * k
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) d.moved = true

    if (d.kind === 'device') {
      const nx = clamp(0, CANVAS.w, snap(d.ox + dx))
      const ny = clamp(0, CANVAS.h, snap(d.oy + dy))
      setDevices((list) => list.map((dev) => (dev.id === d.id ? { ...dev, x: nx, y: ny } : dev)))
      return
    }
    const obj = objects.find((o) => o.id === d.id)!
    const { w, h } = obj.rect
    const rooms = objects.filter((o) => o.id !== d.id && o.kind === 'room')
    const house = houseRect
    const vLines = [house.x, house.x + house.w, ...rooms.flatMap((o) => [o.rect.x, o.rect.x + o.rect.w])]
    const hLines = [house.y, house.y + house.h, ...rooms.flatMap((o) => [o.rect.y, o.rect.y + o.rect.h])]
    const nx = clamp(0, CANVAS.w - w, snapAxis(d.ox + dx, w, vLines))
    const ny = clamp(0, CANVAS.h - h, snapAxis(d.oy + dy, h, hLines))
    setLayout((l) => ({ ...l, [d.id]: { ...l[d.id], x: nx, y: ny } }))
  }

  const onPointerUp = () => {
    if (drag.current?.moved) persist(layout, devices)
    drag.current = null
  }

  const rotate = (o: PlanObj) => {
    const cx = o.rect.x + o.rect.w / 2
    const cy = o.rect.y + o.rect.h / 2
    const nw = o.rect.h
    const nh = o.rect.w
    saveLayout({
      ...layout,
      [o.id]: { rot: !layout[o.id]?.rot, x: clamp(0, CANVAS.w - nw, snap(cx - nw / 2)), y: clamp(0, CANVAS.h - nh, snap(cy - nh / 2)) },
    })
  }

  // ----- device actions -----
  const act = (dev: FloorDevice) => {
    const st = entityStates[dev.entity]
    const kind = deviceKind(dev.entity)
    const call = tapService(dev.entity, st)
    if (!call) return // view-only
    if (needsConfirm(kind) && armed !== dev.id) {
      setArmed(dev.id)
      clearTimeout(armTimer.current)
      armTimer.current = setTimeout(() => setArmed(null), 3000)
      return
    }
    setArmed(null)
    callService(call.domain, call.service, call.data)
  }

  const onDeviceClick = (dev: FloorDevice) => {
    if (drag.current?.moved) return
    setSelectedId(dev.id)
    if (!edit) act(dev)
  }

  const openPicker = () => {
    setPicking(true)
    if (!options) {
      haGet('states')
        .then((list: { entity_id: string; attributes?: { friendly_name?: string } }[]) =>
          setOptions(list
            .map((s) => ({ id: s.entity_id, name: s.attributes?.friendly_name ?? s.entity_id }))
            .sort((a, b) => a.name.localeCompare(b.name))))
        .catch(() => setOptions([]))
    }
  }

  const addDevice = (entity: string) => {
    const dev: FloorDevice = { id: uid(), entity, floor: floor.id, x: Math.round(CANVAS.w / 2), y: Math.round(CANVAS.h / 2) }
    saveDevices([...devices, dev])
    setSelectedId(dev.id)
    setPicking(false)
    setQuery('')
  }

  const removeDevice = (id: string) => { saveDevices(devices.filter((d) => d.id !== id)); setSelectedId(null) }
  const reset = () => { saveLayout({}); setSelectedId(null) }

  // snap every room's nearest edge to a house wall (preferred) or, failing that,
  // a neighbouring room edge — straightening the perimeter and shared borders
  const straighten = () => {
    const rooms = objects.filter((o) => o.kind === 'room')
    const house = houseRect
    const wallsV = [house.x, house.x + house.w]
    const wallsH = [house.y, house.y + house.h]
    const next: Layout = { ...layout }
    for (const o of rooms) {
      const others = rooms.filter((r) => r.id !== o.id)
      const edgesV = others.flatMap((r) => [r.rect.x, r.rect.x + r.rect.w])
      const edgesH = others.flatMap((r) => [r.rect.y, r.rect.y + r.rect.h])
      const nx = snapTo(o.rect.x, o.rect.w, wallsV, STRAIGHTEN_SNAP) ?? snapTo(o.rect.x, o.rect.w, edgesV, STRAIGHTEN_SNAP) ?? o.rect.x
      const ny = snapTo(o.rect.y, o.rect.h, wallsH, STRAIGHTEN_SNAP) ?? snapTo(o.rect.y, o.rect.h, edgesH, STRAIGHTEN_SNAP) ?? o.rect.y
      next[o.id] = {
        ...next[o.id],
        x: clamp(0, CANVAS.w - o.rect.w, nx),
        y: clamp(0, CANVAS.h - o.rect.h, ny),
      }
    }
    saveLayout(next)
  }

  // ----- dimension editing (rooms / exterior / house) -----
  const dimsOf = (id: string): { w: FtIn; h: FtIn; shape: 'rect' | 'circle' } | null => {
    if (id === 'house') {
      const hc = config?.floorPlan?.house ?? DEFAULT_PLAN.house!
      return { w: hc.w, h: hc.h, shape: 'rect' }
    }
    const o = objects.find((x) => x.id === id)
    return o ? { w: o.w, h: o.h, shape: o.shape } : null
  }

  // write the edited dimensions back to config.json (source of truth)
  const commitDims = () => {
    if (!dimEdit || !config) return
    const src = config.floorPlan?.floors ? config.floorPlan : DEFAULT_PLAN
    const fp: FloorPlanCfg = JSON.parse(JSON.stringify(src))
    fp.layout = config.floorPlan?.layout ?? fp.layout
    fp.devices = config.floorPlan?.devices ?? fp.devices
    const { id, w, h } = dimEdit
    if (id === 'house') {
      fp.house = { ...(fp.house ?? { w, h }), w, h }
    } else {
      let done = false
      for (const fl of fp.floors ?? []) {
        const r = fl.rooms.find((room) => room.id === id)
        if (r) { r.w = w; r.h = h; done = true; break }
      }
      if (!done) { const e = (fp.exterior ?? []).find((x) => x.id === id); if (e) { e.w = w; e.h = h } }
    }
    saveConfig({ ...config, floorPlan: fp })
  }

  const dimEditor = (id: string) => {
    const base = dimsOf(id)
    if (!base) return null
    const cur = dimEdit?.id === id ? dimEdit : { id, w: base.w, h: base.h }
    return (
      <div className="fp-dims">
        {base.shape === 'circle' ? (
          <DimField label={t('floorplan.diameter')} value={cur.w}
            onChange={(v) => setDimEdit({ id, w: v, h: v })} onCommit={commitDims} />
        ) : (
          <>
            <DimField label={t('floorplan.width')} value={cur.w}
              onChange={(w) => setDimEdit({ id, w, h: cur.h })} onCommit={commitDims} />
            <DimField label={t('floorplan.height')} value={cur.h}
              onChange={(h) => setDimEdit({ id, w: cur.w, h })} onCommit={commitDims} />
          </>
        )}
      </div>
    )
  }

  const filteredOptions = (options ?? []).filter((o) => {
    const q = query.trim().toLowerCase()
    return !q || o.name.toLowerCase().includes(q) || o.id.toLowerCase().includes(q)
  })

  const devName = (dev: FloorDevice) => entityStates[dev.entity]?.attributes?.friendly_name as string | undefined ?? dev.entity
  const stateText = (dev: FloorDevice) => {
    const st = entityStates[dev.entity]
    if (!st) return t('state.unavailable')
    return deviceValue(dev.entity, st) ?? st.state.replace(/_/g, ' ')
  }

  return (
    <div className="fp-page">
      <div className="fp-head">
        <h1 className="fp-title">{t('floorplan.title')}</h1>
        <div className="fp-tabs">
          {plan.floors.map((f) => (
            <button key={f.id} className={`fp-tab${f.id === floor.id ? ' active' : ''}`}
              onClick={() => { setFloorId(f.id); setSelectedId(null) }}>
              {f.name ?? t(`floorplan.${f.labelKey ?? f.id}`)}
            </button>
          ))}
        </div>
        <div className="fp-actions">
          {edit && <button className="fp-btn" onClick={openPicker}><PlusIcon size={14} /> {t('floorplan.addDevice')}</button>}
          {edit && <button className="fp-btn" onClick={straighten}>{t('floorplan.straighten')}</button>}
          {edit && <button className="fp-btn" onClick={reset}>{t('floorplan.reset')}</button>}
          <button className={`fp-btn${edit ? ' primary' : ''}`} onClick={() => setEdit((v) => !v)}>
            {edit ? t('floorplan.done') : t('floorplan.rearrange')}
          </button>
        </div>
      </div>

      <p className="fp-note">{edit ? t('floorplan.editHint') : t('floorplan.viewHint')}</p>

      <div className="fp-body">
        <section className="card fp-plan">
          <svg
            ref={svgRef}
            className={`fp-svg${edit ? ' editing' : ''}`}
            viewBox={`-4 -4 ${CANVAS.w + 8} ${CANVAS.h + 8}`}
            preserveAspectRatio="xMidYMid meet"
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            onClick={(e) => { if (e.target === e.currentTarget) setSelectedId(null) }}
          >
            {edit && (
              <>
                <defs>
                  <pattern id="fp-grid" width={GRID * 2} height={GRID * 2} patternUnits="userSpaceOnUse">
                    <path d={`M ${GRID * 2} 0 L 0 0 0 ${GRID * 2}`} className="fp-gridline" />
                  </pattern>
                </defs>
                <rect x={0} y={0} width={CANVAS.w} height={CANVAS.h} fill="url(#fp-grid)" style={{ pointerEvents: 'none' }} />
              </>
            )}

            <rect
              className={`fp-house${edit ? ' editable' : ''}${selectedId === 'house' ? ' selected' : ''}`}
              x={houseRect.x} y={houseRect.y} width={houseRect.w} height={houseRect.h} rx={4}
              onClick={() => { if (edit) setSelectedId('house') }} />

            {objects.map((o) => {
              const cx = o.rect.x + o.rect.w / 2
              const lines = [o.name, o.dims]
              const lineH = 13
              const top = o.rect.y + o.rect.h / 2 - ((lines.length - 1) * lineH) / 2
              return (
                <g key={o.id}
                  className={`fp-obj fp-${o.kind}${o.id === selectedId ? ' selected' : ''}${edit ? ' editable' : ''}`}
                  onPointerDown={(e) => startDrag(e, o.id, 'obj', o.rect.x, o.rect.y)}
                  onClick={() => { if (!drag.current?.moved) setSelectedId(o.id) }}>
                  {o.shape === 'circle'
                    ? <ellipse className="fp-fill" cx={cx} cy={o.rect.y + o.rect.h / 2} rx={o.rect.w / 2} ry={o.rect.h / 2} />
                    : <rect className="fp-fill" x={o.rect.x} y={o.rect.y} width={o.rect.w} height={o.rect.h} rx={3} />}
                  {lines.map((text, i) => (
                    <text key={i} className={`fp-label ${i === 0 ? 'fp-name' : 'fp-meta'}`}
                      x={cx} y={top + i * lineH} textAnchor="middle" dominantBaseline="middle">{text}</text>
                  ))}
                </g>
              )
            })}

            {/* device markers on top */}
            {floorDevices.map((dev) => {
              const st = entityStates[dev.entity]
              const d = domainOf(dev.entity)
              const on = isOn(dev.entity, st)
              const secure = (d === 'lock' || d === 'alarm_control_panel') && on
              const val = deviceValue(dev.entity, st)
              const cls = [
                'fp-device',
                st === null || st === undefined ? 'unavailable' : '',
                on ? 'on' : '',
                secure ? 'secure' : '',
                dev.id === selectedId ? 'selected' : '',
                armed === dev.id ? 'armed' : '',
                edit ? 'editable' : '',
              ].filter(Boolean).join(' ')
              return (
                <g key={dev.id} className={cls}
                  onPointerDown={(e) => startDrag(e, dev.id, 'device', dev.x, dev.y)}
                  onClick={() => onDeviceClick(dev)}>
                  <circle className="fp-dev-dot" cx={dev.x} cy={dev.y} r={DEV_R} />
                  <g className="fp-dev-glyph" transform={`translate(${dev.x - 8.5}, ${dev.y - 8.5})`}>
                    {deviceIcon(dev.entity, st)}
                  </g>
                  {val && (
                    <text className="fp-dev-value" x={dev.x} y={dev.y + DEV_R + 8} textAnchor="middle">{val}</text>
                  )}
                </g>
              )
            })}
          </svg>
        </section>

        <aside className="fp-side">
          {selectedDev ? (
            <div className="card fp-detail">
              <h2 className="card-title">{devName(selectedDev)}</h2>
              <dl className="fp-dl">
                <div><dt>{t('floorplan.state')}</dt><dd className="fp-state">{stateText(selectedDev)}</dd></div>
                <div><dt>{t('floorplan.entity')}</dt><dd className="fp-entity">{selectedDev.entity}</dd></div>
              </dl>
              {edit ? (
                <button className="fp-btn fp-remove" onClick={() => removeDevice(selectedDev.id)}>
                  <TrashIcon size={14} /> {t('floorplan.removeDevice')}
                </button>
              ) : tapService(selectedDev.entity, entityStates[selectedDev.entity]) ? (
                <button className={`fp-btn fp-act${armed === selectedDev.id ? ' armed' : ''}`} onClick={() => act(selectedDev)}>
                  {armed === selectedDev.id ? t('home.confirm') : t('floorplan.trigger')}
                </button>
              ) : (
                <p className="fp-detail-hint">{t('floorplan.viewOnly')}</p>
              )}
            </div>
          ) : selectedId === 'house' ? (
            <div className="card fp-detail">
              <h2 className="card-title">{t('floorplan.house')}</h2>
              {edit
                ? dimEditor('house')
                : <dl className="fp-dl"><div><dt>{t('floorplan.dimensions')}</dt><dd>{fmtFtIn(dimsOf('house')!.w)} × {fmtFtIn(dimsOf('house')!.h)}</dd></div></dl>}
            </div>
          ) : selectedObj ? (
            <div className="card fp-detail">
              <h2 className="card-title">{selectedObj.name}</h2>
              {edit ? dimEditor(selectedObj.id) : (
                <dl className="fp-dl">
                  <div><dt>{t('floorplan.dimensions')}</dt><dd>{selectedObj.dims}</dd></div>
                </dl>
              )}
              <dl className="fp-dl">
                <div><dt>{t('floorplan.area')}</dt><dd>{t('floorplan.sqft', { n: selectedObj.areaSqFt })}</dd></div>
                {selectedObj.note && <div><dt>{t('floorplan.features')}</dt><dd>{t(`note.${selectedObj.note}`)}</dd></div>}
              </dl>
              {edit && selectedObj.rotatable && (
                <button className="fp-btn fp-rotate" onClick={() => rotate(selectedObj)}>⟳ {t('floorplan.rotate')}</button>
              )}
            </div>
          ) : (
            <div className="card fp-detail fp-detail-empty">{t(edit ? 'floorplan.editHint' : 'floorplan.selectHint')}</div>
          )}
        </aside>
      </div>

      {picking && (
        <div className="fp-picker-backdrop" onClick={() => setPicking(false)}>
          <div className="card fp-picker" onClick={(e) => e.stopPropagation()}>
            <h2 className="card-title">{t('floorplan.addDevice')}</h2>
            <input className="fp-picker-search" autoFocus placeholder={t('floorplan.searchEntities')}
              value={query} onChange={(e) => setQuery(e.target.value)} />
            <div className="fp-picker-list">
              {options === null && <div className="fp-picker-empty">…</div>}
              {options !== null && filteredOptions.length === 0 && <div className="fp-picker-empty">{t('floorplan.noEntities')}</div>}
              {filteredOptions.slice(0, 200).map((o) => (
                <button key={o.id} className="fp-picker-item" onClick={() => addDevice(o.id)}>
                  <span className="fp-picker-icon">{deviceIcon(o.id, entityStates[o.id])}</span>
                  <span className="fp-picker-name">{o.name}</span>
                  <span className="fp-picker-id">{o.id}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
