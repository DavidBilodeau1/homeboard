import React, { useEffect, useState } from 'react'
import { useStore } from '../store'

const FALLBACK = ['/placeholders/photo1.svg', '/placeholders/photo2.svg']

export function PhotoSlideshow({ className }: { className?: string }) {
  const { photos, config } = useStore()
  const list = photos.length ? photos : FALLBACK
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    const interval = (config?.photos?.intervalSeconds ?? 15) * 1000
    const t = setInterval(() => setIdx((i) => i + 1), interval)
    return () => clearInterval(t)
  }, [list.length, config?.photos?.intervalSeconds])

  // Mount only prev (fading out), current (visible) and next (preloading) —
  // the album can hold hundreds of photos. Map dedupes when the list is short;
  // current is set last so it wins the visibility flag.
  const len = list.length
  const slots = new Map<string, boolean>()
  slots.set(list[(idx - 1 + len) % len], false)
  slots.set(list[(idx + 1) % len], false)
  slots.set(list[idx % len], true)

  return (
    <div className={`photo-stage ${className ?? ''}`}>
      {[...slots.entries()].map(([src, visible]) => (
        <img key={src} src={src} alt="" className={visible ? 'visible' : ''} />
      ))}
    </div>
  )
}

export function PhotoCard() {
  return (
    <section className="card photo-card">
      <PhotoSlideshow />
    </section>
  )
}
