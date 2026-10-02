import { describe, expect, it } from 'vitest'
import { dragPosition, rotated, snapTo, straightened } from './geometry'

const house = { x: 40, y: 200, w: 400, h: 280 }

describe('snapTo', () => {
  it('lines up whichever edge is nearer', () => {
    expect(snapTo(43, 100, [40], 12)).toBe(40)
    expect(snapTo(138, 100, [240], 12)).toBe(140)
  })

  it('gives up past the threshold', () => {
    expect(snapTo(70, 100, [40], 12)).toBeNull()
  })
})

describe('dragPosition', () => {
  it('lands flush against the house wall', () => {
    expect(dragPosition({ x: 0, y: 0, w: 100, h: 80 }, 47, 206, house, [])).toEqual({ x: 40, y: 200 })
  })

  it('falls back to the grid away from any edge', () => {
    expect(dragPosition({ x: 0, y: 0, w: 100, h: 80 }, 152, 263, house, [])).toEqual({ x: 150, y: 265 })
  })
})

describe('straightened', () => {
  it('pulls rooms onto the walls before their neighbours', () => {
    const rooms = [{ id: 'a', rect: { x: 55, y: 210, w: 100, h: 80 } }]
    expect(straightened(rooms, house, {})).toEqual({ a: { x: 40, y: 200 } })
  })
})

describe('rotated', () => {
  it('turns around the centre and toggles the rotation flag', () => {
    expect(rotated({ x: 100, y: 100, w: 100, h: 40 })).toEqual({ rot: true, x: 130, y: 70 })
    expect(rotated({ x: 100, y: 100, w: 40, h: 100 }, { x: 0, y: 0, rot: true }).rot).toBe(false)
  })
})
