import type { PluginSettings } from '../../types'

/** A [feet, inches] measurement, e.g. [10, 6] = 10′6″. */
export type FeetInches = [number, number]

export interface FloorPlanRoomCfg {
  id: string
  /** translation key under `room.` (living, kitchen, bedroom, …) */
  type?: string
  /** explicit label, instead of the translated `type` */
  name?: string
  /** disambiguating suffix, e.g. "1" */
  tag?: string
  /** translation key under `note.` for a feature line */
  note?: string
  w: FeetInches
  h: FeetInches
  /** starting position in plan units; dragging overrides it */
  x?: number
  y?: number
}

export interface FloorPlanFloorCfg {
  id: string
  /** label; falls back to the `floorplan.<id>` translation */
  name?: string
  rooms: FloorPlanRoomCfg[]
}

export interface FloorPlanExteriorCfg {
  id: string
  shape: 'circle' | 'rect'
  /** translation key under `floorplan.` (pool, shed) */
  type?: string
  name?: string
  w: FeetInches
  h: FeetInches
  x?: number
  y?: number
}

/** Where a room or feature was dragged to, in plan units. */
export interface FloorPlanPlacement { x: number; y: number; rot?: boolean }

/** A Home Assistant entity placed on the plan; x/y is the marker centre. */
export interface FloorDevice { id: string; entity: string; floor: string; x: number; y: number }

export type Layout = Record<string, FloorPlanPlacement>

export interface FloorPlanSettings extends PluginSettings {
  /** the exterior footprint, to scale */
  house?: { w: FeetInches; h: FeetInches; x?: number; y?: number }
  floors?: FloorPlanFloorCfg[]
  /** site features drawn around the ground floor */
  exterior?: FloorPlanExteriorCfg[]
  layout?: Layout
  devices?: FloorDevice[]
}
