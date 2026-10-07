import { CANVAS } from './plan'
import type { FloorPlanPlacement, Layout } from './types'

export interface Rect { x: number; y: number; w: number; h: number }

/** Snap grid used while dragging and rotating, in plan units. */
export const GRID = 5
/** A dragged edge this close to a wall or another room's edge lands flush against it. */
const EDGE_SNAP = 12
/** Straighten pulls an edge onto a wall or neighbour up to this far away. */
const STRAIGHTEN_SNAP = 24

export const clamp = (lo: number, hi: number, v: number) => Math.max(lo, Math.min(hi, v))

export const snapToGrid = (v: number) => Math.round(v / GRID) * GRID

const edgesX = (r: Rect) => [r.x, r.x + r.w]
const edgesY = (r: Rect) => [r.y, r.y + r.h]

/** Position that puts the object's nearer edge on the closest line within `threshold`, or null. */
export function snapTo(pos: number, size: number, lines: number[], threshold: number): number | null {
  let best: number | null = null
  let bestDistance = threshold + 1
  for (const line of lines) {
    const toStart = Math.abs(pos - line)
    if (toStart < bestDistance) {
      bestDistance = toStart
      best = line
    }
    const toEnd = Math.abs(pos + size - line)
    if (toEnd < bestDistance) {
      bestDistance = toEnd
      best = line - size
    }
  }
  return best
}

const snapToEdges = (pos: number, size: number, lines: number[]) => snapTo(pos, size, lines, EDGE_SNAP) ?? snapToGrid(pos)

/** Where a dragged room lands: flush against a house wall or another room, else on the grid, inside the canvas. */
export function dragPosition(rect: Rect, x: number, y: number, house: Rect, others: Rect[]) {
  return {
    x: clamp(0, CANVAS.w - rect.w, snapToEdges(x, rect.w, [...edgesX(house), ...others.flatMap(edgesX)])),
    y: clamp(0, CANVAS.h - rect.h, snapToEdges(y, rect.h, [...edgesY(house), ...others.flatMap(edgesY)])),
  }
}

export const devicePosition = (x: number, y: number) => ({
  x: clamp(0, CANVAS.w, snapToGrid(x)),
  y: clamp(0, CANVAS.h, snapToGrid(y)),
})

/** Every room's nearer edge pulled onto a house wall, else onto a neighbour's edge. */
export function straightened(rooms: { id: string; rect: Rect }[], house: Rect, layout: Layout): Layout {
  const align = (pos: number, size: number, walls: number[], edges: number[]) =>
    snapTo(pos, size, walls, STRAIGHTEN_SNAP) ?? snapTo(pos, size, edges, STRAIGHTEN_SNAP) ?? pos
  const next = { ...layout }
  for (const { id, rect } of rooms) {
    const others = rooms.filter((room) => room.id !== id).map((room) => room.rect)
    next[id] = {
      ...next[id],
      x: clamp(0, CANVAS.w - rect.w, align(rect.x, rect.w, edgesX(house), others.flatMap(edgesX))),
      y: clamp(0, CANVAS.h - rect.h, align(rect.y, rect.h, edgesY(house), others.flatMap(edgesY))),
    }
  }
  return next
}

/** A quarter turn around the rectangle's centre. */
export function rotated(rect: Rect, placement?: FloorPlanPlacement): FloorPlanPlacement {
  const w = rect.h
  const h = rect.w
  return {
    rot: !placement?.rot,
    x: clamp(0, CANVAS.w - w, snapToGrid(rect.x + rect.w / 2 - w / 2)),
    y: clamp(0, CANVAS.h - h, snapToGrid(rect.y + rect.h / 2 - h / 2)),
  }
}
