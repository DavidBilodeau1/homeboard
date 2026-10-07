import type { FeetInches, FloorPlanExteriorCfg, FloorPlanRoomCfg, FloorPlanSettings } from './types'

export type FtIn = FeetInches

/** Plan units per foot. */
export const SCALE = 10
export const CANVAS = { w: 600, h: 480 }
const DEFAULT_SIZE: FtIn = [10, 0]

/** Decimal feet from a [feet, inches] pair. */
export const feet = ([f, i]: FtIn): number => f + i / 12
/** Pretty measurement, e.g. [10, 10] → 10′10″. */
export const fmtFtIn = ([f, i]: FtIn): string => `${f}′${i}″`
/** Unrotated on-screen size (plan units) of a room/feature. */
export const baseSize = (o: { w: FtIn; h: FtIn }) => ({
  w: Math.round(feet(o.w) * SCALE),
  h: Math.round(feet(o.h) * SCALE),
})

export interface Room {
  id: string
  typeKey?: string
  name?: string
  tag?: string
  note?: string
  w: FtIn
  h: FtIn
  x: number
  y: number
}
export interface Exterior {
  id: string
  shape: 'circle' | 'rect'
  labelKey?: string
  name?: string
  w: FtIn
  h: FtIn
  x: number
  y: number
}
export interface FloorDef {
  id: string
  labelKey?: string
  name?: string
  rooms: Room[]
}
export interface HouseRect { x: number; y: number; w: number; h: number }
export interface ResolvedPlan {
  house: HouseRect
  floors: FloorDef[]
  exterior: Exterior[]
}

/** Shown until the config describes a home of its own. */
export const DEFAULT_PLAN: FloorPlanSettings = {
  house: { w: [40, 0], h: [28, 0], x: 40, y: 60 },
  floors: [
    {
      id: 'ground',
      rooms: [
        { id: 'ground-living', type: 'living', w: [16, 0], h: [14, 0], x: 40, y: 60 },
        { id: 'ground-kitchen', type: 'kitchen', w: [12, 0], h: [14, 0], x: 200, y: 60 },
        { id: 'ground-dining', type: 'dining', w: [12, 0], h: [14, 0], x: 320, y: 60 },
        { id: 'ground-bath', type: 'bathroom', w: [8, 0], h: [6, 0], x: 40, y: 200 },
      ],
    },
    {
      id: 'upstairs',
      rooms: [
        { id: 'up-bed1', type: 'bedroom', tag: '1', w: [14, 0], h: [13, 0], x: 40, y: 60 },
        { id: 'up-bed2', type: 'bedroom', tag: '2', w: [12, 0], h: [13, 0], x: 180, y: 60 },
        { id: 'up-bath', type: 'bathroom', w: [9, 0], h: [8, 0], x: 300, y: 60 },
      ],
    },
  ],
  exterior: [],
}

const asFtIn = (v: unknown, fallback: FtIn): FtIn =>
  Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number') ? (v as FtIn) : fallback

const toRoom = (rc: FloorPlanRoomCfg, i: number, house: HouseRect): Room => ({
  id: rc.id,
  typeKey: rc.type,
  name: rc.name,
  tag: rc.tag,
  note: rc.note,
  w: asFtIn(rc.w, DEFAULT_SIZE),
  h: asFtIn(rc.h, DEFAULT_SIZE),
  // unplaced rooms cascade inside the house
  x: rc.x ?? house.x + 10 + (i % 4) * 24,
  y: rc.y ?? house.y + 10 + (i % 4) * 24,
})

const toExterior = (ec: FloorPlanExteriorCfg, i: number): Exterior => ({
  id: ec.id,
  shape: ec.shape === 'circle' ? 'circle' : 'rect',
  labelKey: ec.type,
  name: ec.name,
  w: asFtIn(ec.w, DEFAULT_SIZE),
  h: asFtIn(ec.h, DEFAULT_SIZE),
  x: ec.x ?? 30 + i * 160,
  y: ec.y ?? 30,
})

/** The configured plan, or the default one, as drawable plan-unit shapes. */
export const resolvePlan = (cfg?: FloorPlanSettings): ResolvedPlan => {
  const defaultHouse = DEFAULT_PLAN.house!
  const hc = cfg?.house ?? defaultHouse
  const hs = baseSize({ w: asFtIn(hc.w, defaultHouse.w), h: asFtIn(hc.h, defaultHouse.h) })
  const house: HouseRect = { x: hc.x ?? defaultHouse.x!, y: hc.y ?? defaultHouse.y!, w: hs.w, h: hs.h }

  const floorsCfg = cfg?.floors?.length ? cfg.floors : DEFAULT_PLAN.floors!
  const floors: FloorDef[] = floorsCfg.map((f) => ({
    id: f.id,
    labelKey: f.id,
    name: f.name,
    rooms: f.rooms.map((r, i) => toRoom(r, i, house)),
  }))

  const exCfg = cfg?.exterior ?? DEFAULT_PLAN.exterior!
  const exterior: Exterior[] = exCfg.map(toExterior)

  return { house, floors, exterior }
}
