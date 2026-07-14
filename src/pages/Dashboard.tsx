import React, { useEffect, useMemo, useRef, useState } from 'react'
import GridLayout, { WidthProvider, type Layout } from 'react-grid-layout'
import { CalendarCard } from '../components/CalendarCard'
import { PhotoCard } from '../components/PhotoCard'
import { TasksCard } from '../components/TasksCard'
import { WeatherCard } from '../components/WeatherCard'
import { MealsCard } from '../components/MealsCard'
import { RewardsCard } from '../components/RewardsCard'
import type { Page } from '../components/Sidebar'
import { useStore } from '../store'
import type { DashboardTile, TileId } from '../types'
import { DEFAULT_SIZE, GRID_MARGIN, GRID_ROWS, TILE_META, resolveLayout } from '../dashboardLayout'
import { CalendarFullCard } from '../components/CalendarFullCard'
import { AirQualityCard } from '../components/AirQualityCard'
import { EditIcon, PlusIcon, TrashIcon } from '../icons'

const RGL = WidthProvider(GridLayout)

export function Dashboard({ onNavigate }: { onNavigate: (p: Page) => void }) {
  const { config, reloadConfig, t } = useStore()
  const resolved = useMemo(() => resolveLayout(config?.dashboard), [config])
  const cols = resolved.cols
  const rows = resolved.rows

  const [editing, setEditing] = useState(false)
  const [tiles, setTiles] = useState<DashboardTile[]>(resolved.tiles)
  const [editorEnabled, setEditorEnabled] = useState(false)
  const [saving, setSaving] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

  const wrapRef = useRef<HTMLDivElement>(null)
  const [rowHeight, setRowHeight] = useState(90)
  const [narrow, setNarrow] = useState(() => window.innerWidth < 640)

  useEffect(() => {
    fetch('/api/meta').then((r) => r.json()).then((m) => setEditorEnabled(!!m.editorEnabled)).catch(() => {})
  }, [])

  // phones get a simple scrolling stack instead of the drag-grid
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 640)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // keep local tiles in sync with config whenever we're not mid-edit
  useEffect(() => { if (!editing) setTiles(resolved.tiles) }, [resolved.tiles, editing])

  // size rows to fill the available height
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const recompute = () => {
      const h = el.clientHeight
      setRowHeight(Math.max(40, Math.floor((h - GRID_MARGIN * (rows + 1)) / rows)))
    }
    recompute()
    const ro = new ResizeObserver(recompute)
    ro.observe(el)
    return () => ro.disconnect()
  }, [rows])

  const renderTile = (id: TileId): React.ReactNode => {
    switch (id) {
      case 'calendar': return <CalendarCard />
      case 'calendarFull': return <CalendarFullCard />
      case 'photo': return <PhotoCard />
      case 'tasks': return <TasksCard />
      case 'weather': return <WeatherCard />
      case 'meals': return <MealsCard onOpen={() => !editing && onNavigate('meals')} />
      case 'rewards': return <RewardsCard />
      case 'airQuality': return <AirQualityCard />
    }
  }

  const layout: Layout[] = tiles.map((tile) => ({
    i: tile.id, x: tile.x, y: tile.y, w: tile.w, h: tile.h,
    static: !editing, minW: 2, minH: 2,
  }))

  const onLayoutChange = (next: Layout[]) => {
    if (!editing) return
    setTiles((prev) => next.map((l) => {
      const t0 = prev.find((p) => p.id === l.i)!
      return { ...t0, x: l.x, y: l.y, w: l.w, h: l.h }
    }))
  }

  const removeTile = (id: TileId) => setTiles((prev) => prev.filter((p) => p.id !== id))
  const addTile = (id: TileId) => {
    setAddOpen(false)
    setTiles((prev) => [...prev, { id, x: 0, y: 999, ...DEFAULT_SIZE[id] }])
  }

  const missing = TILE_META.filter((m) => !tiles.some((tile) => tile.id === m.id))

  const cancel = () => { setTiles(resolved.tiles); setEditing(false); setAddOpen(false) }
  const save = async () => {
    setSaving(true)
    try {
      const body = { ...config, dashboard: { cols, rows, tiles } }
      const r = await fetch('/api/config', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (r.ok) { await reloadConfig(); setEditing(false); setAddOpen(false) }
    } finally {
      setSaving(false)
    }
  }

  // phones: a single scrolling column, tallest-first-intent preserved via each
  // tile's configured height. No drag/resize here (that's for large screens).
  if (narrow) {
    return (
      <div className="dash-stack">
        {tiles.map((tile) => (
          <div key={tile.id} className="dash-stack-tile" style={{ height: tile.h * 54 }}>
            {renderTile(tile.id)}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className={`dash-wrap${editing ? ' editing' : ''}`} ref={wrapRef}>
      {editing && (
        <div className="dash-toolbar">
          <div className="dash-add">
            <button className="dash-add-btn" onClick={() => setAddOpen((o) => !o)} disabled={!missing.length}>
              <PlusIcon size={15} /> {t('dash.addTile')}
            </button>
            {addOpen && (
              <div className="dash-add-menu">
                {missing.map((m) => (
                  <button key={m.id} onClick={() => addTile(m.id)}>{t(m.titleKey)}</button>
                ))}
              </div>
            )}
          </div>
          <span className="dash-toolbar-spacer" />
          <button className="dash-cancel" onClick={cancel}>{t('settings.revert')}</button>
          <button className="dash-save" onClick={save} disabled={saving}>{t('settings.save')}</button>
        </div>
      )}

      <RGL
        className={`dash-rgl${editing ? ' editing' : ''}`}
        layout={layout}
        cols={cols}
        rowHeight={rowHeight}
        margin={[GRID_MARGIN, GRID_MARGIN]}
        containerPadding={[0, 0]}
        isDraggable={editing}
        isResizable={editing}
        draggableCancel=".tile-del"
        onLayoutChange={onLayoutChange}
        compactType="vertical"
      >
        {tiles.map((tile) => (
          <div key={tile.id} className="dash-tile">
            {editing && (
              <button className="tile-del" onClick={() => removeTile(tile.id)} aria-label={t('settings.remove')}>
                <TrashIcon size={15} />
              </button>
            )}
            {renderTile(tile.id)}
          </div>
        ))}
      </RGL>

      {editorEnabled && !editing && (
        <button className="dash-edit-fab" onClick={() => setEditing(true)} title={t('dash.edit')}>
          <EditIcon />
        </button>
      )}
    </div>
  )
}
