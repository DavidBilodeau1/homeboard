import { describe, expect, it } from 'vitest'
import { mergeReview } from './frigate.js'

const seg = (id, severity, start, reviewed) => ({
  id, severity, start_time: start, has_been_reviewed: reviewed,
})

describe('mergeReview', () => {
  const unseen = [seg('a', 'alert', 500, false), seg('d', 'detection', 900, false)]
  const seen = [seg('b', 'alert', 100, true)]

  it('keeps the unreviewed segments Frigate 0.16 only returns from reviewed=0', () => {
    // the whole point of the two-bucket query: `reviewed=1` alone hides these
    expect(mergeReview([unseen, seen], 20).map((v) => v.id)).toEqual(['a', 'b', 'd'])
  })

  it('de-duplicates when reviewed=1 returns everything (Frigate 0.15)', () => {
    const everything = [...unseen, ...seen]
    expect(mergeReview([unseen, everything], 20).map((v) => v.id)).toEqual(['a', 'b', 'd'])
  })

  it('orders alerts before detections, newest first', () => {
    const rows = mergeReview([[seg('old', 'alert', 1), seg('new', 'alert', 9), seg('det', 'detection', 99)]], 20)
    expect(rows.map((v) => v.id)).toEqual(['new', 'old', 'det'])
  })

  it('honours the limit and survives a non-array bucket', () => {
    expect(mergeReview([unseen, null, undefined], 1).map((v) => v.id)).toEqual(['a'])
  })
})
