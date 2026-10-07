import { baseSize, DEFAULT_PLAN, feet, fmtFtIn, type Exterior, type FtIn, type Room } from './plan'
import type { Rect } from './geometry'
import type { FloorPlanSettings, Layout } from './types'

export const HOUSE_ID = 'house'

/** Dimensions being typed in for one object, shown live before they are saved. */
export interface Resize { id: string; w: FtIn; h: FtIn }

/** A room or exterior feature as drawn: its placement applied, its labels ready. */
export interface PlanObj {
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
  rect: Rect
}

const area = (shape: PlanObj['shape'], w: FtIn, h: FtIn) =>
  Math.round(shape === 'circle' ? Math.PI * (feet(w) / 2) ** 2 : feet(w) * feet(h))

export function toPlanObj(
  item: Room | Exterior,
  kind: PlanObj['kind'],
  name: string,
  layout: Layout,
  resize: Resize | null,
): PlanObj {
  const shape = 'shape' in item ? item.shape : 'rect'
  const { w, h } = resize?.id === item.id ? resize : item
  const size = baseSize({ w, h })
  const placement = layout[item.id]
  const turned = !!placement?.rot
  return {
    id: item.id,
    kind,
    shape,
    name,
    rotatable: shape === 'rect',
    w,
    h,
    dims: shape === 'circle' ? `Ø ${fmtFtIn(w)}` : `${fmtFtIn(w)} × ${fmtFtIn(h)}`,
    areaSqFt: area(shape, w, h),
    note: 'note' in item ? item.note : undefined,
    rect: { x: placement?.x ?? item.x, y: placement?.y ?? item.y, w: turned ? size.h : size.w, h: turned ? size.w : size.h },
  }
}

/** The settings with one object's (or the house's) dimensions replaced. */
export function withDimensions(settings: FloorPlanSettings, { id, w, h }: Resize): FloorPlanSettings {
  const source = settings.floors ? settings : DEFAULT_PLAN
  const next: FloorPlanSettings = { ...settings, ...structuredClone({ house: source.house, floors: source.floors, exterior: source.exterior }) }
  if (id === HOUSE_ID) {
    next.house = { ...next.house, w, h }
    return next
  }
  const target = next.floors?.flatMap((floor) => floor.rooms).find((room) => room.id === id) ??
    next.exterior?.find((feature) => feature.id === id)
  if (target) Object.assign(target, { w, h })
  return next
}
