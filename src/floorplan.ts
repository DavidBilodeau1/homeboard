// Floor-plan geometry. The room/house/exterior data is configurable in
// config.json under `floorPlan`; the constant below is the built-in default
// (from certificate of location #4192) used when config doesn't provide one.
// `resolvePlan()` merges config over the default and converts feet-inches
// dimensions into the on-screen plan-unit rectangles the page draws.

import type { FloorPlanCfg, FloorPlanRoomCfg, FloorPlanExteriorCfg, FeetInches } from './types'

export type FloorId = string
export type FtIn = FeetInches

/** Plan units per foot. House is ~37 ft wide → a sensible on-screen size. */
export const SCALE = 10
/** Snap grid (plan units) used while dragging / rotating. */
export const GRID = 5
/** Edge-snap threshold (plan units): a dragged edge this close to a wall or
 *  another room's edge clicks flush against it. */
export const SNAP = 12
export const CANVAS = { w: 600, h: 480 }

/** Decimal feet from a [feet, inches] pair. */
export const feet = ([f, i]: FtIn): number => f + i / 12
/** Pretty measurement, e.g. [10, 10] → 10′10″. */
export const fmtFtIn = ([f, i]: FtIn): string => `${f}′${i}″`
/** Unrotated on-screen size (plan units) of a room/feature. */
export const baseSize = (o: { w: FtIn; h: FtIn }) => ({
  w: Math.round(feet(o.w) * SCALE),
  h: Math.round(feet(o.h) * SCALE),
})

// ----- runtime shapes the page consumes -----
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
  id: FloorId
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

// ----- built-in default (certificate of location #4192) -----
export const DEFAULT_PLAN: FloorPlanCfg = {
  house: { w: [37, 6], h: [24, 9], x: 40, y: 210 },
  floors: [
    {
      id: 'rdc',
      rooms: [
        { id: 'rdc-salon', type: 'living', w: [11, 6], h: [14, 11], x: 40, y: 210 },
        { id: 'rdc-ch1', type: 'bedroom', tag: '1', w: [9, 5], h: [12, 1], x: 155, y: 210 },
        { id: 'rdc-ch2', type: 'bedroom', tag: '2', w: [10, 4], h: [10, 1], x: 249, y: 210 },
        { id: 'rdc-cuisine', type: 'kitchen', note: 'dishwasherIsland', w: [10, 10], h: [8, 2], x: 40, y: 360 },
        { id: 'rdc-ch3', type: 'bedroom', tag: '3', w: [10, 4], h: [8, 5], x: 148, y: 360 },
        { id: 'rdc-sam', type: 'dining', w: [7, 7], h: [9, 8], x: 251, y: 360 },
        { id: 'rdc-bain', type: 'bathroom', w: [9, 4], h: [4, 11], x: 327, y: 360 },
      ],
    },
    {
      id: 'ss1',
      rooms: [
        { id: 'ss1-fam1', type: 'familyRoom', tag: '1', w: [10, 10], h: [19, 9], x: 40, y: 210 },
        { id: 'ss1-ch', type: 'bedroom', w: [14, 5], h: [11, 0], x: 148, y: 210 },
        { id: 'ss1-rangement', type: 'storage', note: 'doubleCloset', w: [8, 11], h: [11, 0], x: 292, y: 210 },
        { id: 'ss1-fam2', type: 'familyRoom', tag: '2', w: [10, 5], h: [10, 10], x: 148, y: 320 },
        { id: 'ss1-lavage', type: 'laundry', note: 'showerSink', w: [14, 5], h: [7, 3], x: 252, y: 320 },
      ],
    },
  ],
  exterior: [
    { id: 'pool', shape: 'circle', type: 'pool', w: [15, 0], h: [15, 0], x: 40, y: 30 },
    { id: 'shed', shape: 'rect', type: 'shed', w: [12, 4], h: [14, 4], x: 430, y: 30 },
  ],
}

const asFtIn = (v: unknown, fallback: FtIn): FtIn =>
  Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number') ? (v as FtIn) : fallback

const toRoom = (rc: FloorPlanRoomCfg, i: number, house: HouseRect): Room => ({
  id: rc.id,
  typeKey: rc.type,
  name: rc.name,
  tag: rc.tag,
  note: rc.note,
  w: asFtIn(rc.w, [10, 0]),
  h: asFtIn(rc.h, [10, 0]),
  // fall back to a cascading spot inside the house when no position is given
  x: rc.x ?? house.x + 10 + (i % 4) * 24,
  y: rc.y ?? house.y + 10 + (i % 4) * 24,
})

const toExterior = (ec: FloorPlanExteriorCfg, i: number): Exterior => ({
  id: ec.id,
  shape: ec.shape === 'circle' ? 'circle' : 'rect',
  labelKey: ec.type,
  name: ec.name,
  w: asFtIn(ec.w, [10, 0]),
  h: asFtIn(ec.h, [10, 0]),
  x: ec.x ?? 30 + i * 160,
  y: ec.y ?? 30,
})

/** Merge config over the built-in default and produce drawable structures. */
export const resolvePlan = (cfg?: FloorPlanCfg): ResolvedPlan => {
  const hc = cfg?.house ?? DEFAULT_PLAN.house!
  const hs = baseSize({ w: asFtIn(hc.w, [37, 6]), h: asFtIn(hc.h, [24, 9]) })
  const house: HouseRect = { x: hc.x ?? 40, y: hc.y ?? 210, w: hs.w, h: hs.h }

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
