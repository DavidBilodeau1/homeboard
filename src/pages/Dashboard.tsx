import React, { useEffect, useMemo, useRef, useState } from 'react'
import GridLayout, { WidthProvider, type Layout } from 'react-grid-layout'
import { useStore } from '../store'
import type { DashboardTile } from '../types'
import { GRID_MARGIN, resolveLayout } from '../dashboardLayout'
import { useTileDefinitions } from '../dashboardTiles'
import { EditIcon, PlusIcon, TrashIcon } from '../icons'

const RGL = WidthProvider(GridLayout)
const PHONE_MAX_WIDTH = 640
const PHONE_ROW_HEIGHT = 54
const MIN_ROW_HEIGHT = 40
const MIN_TILE_SPAN = 2
/** where an added tile starts; vertical compaction pulls it up to the first free row */
const BOTTOM_ROW = 999

function useIsPhone() {
  const [phone, setPhone] = useState(() => window.innerWidth < PHONE_MAX_WIDTH)
  useEffect(() => {
    const onResize = () => setPhone(window.innerWidth < PHONE_MAX_WIDTH)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return phone
}

/** Row height that makes `rows` rows fill the element's height. */
function useFillingRowHeight(rows: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [rowHeight, setRowHeight] = useState(90)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const recompute = () => setRowHeight(Math.max(MIN_ROW_HEIGHT, Math.floor((el.clientHeight - GRID_MARGIN * (rows + 1)) / rows)))
    recompute()
    const observer = new ResizeObserver(recompute)
    observer.observe(el)
    return () => observer.disconnect()
  }, [rows])
  return { ref, rowHeight }
}

export function Dashboard() {
  const { config, meta, saveConfig, t } = useStore()
  const definitions = useTileDefinitions()
  const layout = useMemo(() => resolveLayout(config?.dashboard), [config])
  const shown = useMemo(() => layout.tiles.filter((tile) => definitions.has(tile.id)), [layout, definitions])

  const [editing, setEditing] = useState(false)
  const [tiles, setTiles] = useState<DashboardTile[]>(shown)
  const [saving, setSaving] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const phone = useIsPhone()
  const { ref, rowHeight } = useFillingRowHeight(layout.rows)

  useEffect(() => { if (!editing) setTiles(shown) }, [shown, editing])

  const renderTile = (tile: DashboardTile) => {
    const Tile = definitions.get(tile.id)?.Component
    return Tile ? <Tile editing={editing} /> : null
  }

  if (phone) {
    return (
      <div className="dash-stack">
        {tiles.map((tile) => (
          <div key={tile.id} className="dash-stack-tile" style={{ height: tile.h * PHONE_ROW_HEIGHT }}>
            {renderTile(tile)}
          </div>
        ))}
      </div>
    )
  }

  const gridLayout: Layout[] = tiles.map((tile) => ({
    i: tile.id, x: tile.x, y: tile.y, w: tile.w, h: tile.h,
    static: !editing, minW: MIN_TILE_SPAN, minH: MIN_TILE_SPAN,
  }))

  const onLayoutChange = (next: Layout[]) => {
    if (!editing) return
    setTiles((prev) => next.map((cell) => ({ ...prev.find((tile) => tile.id === cell.i)!, x: cell.x, y: cell.y, w: cell.w, h: cell.h })))
  }

  const addTile = (id: string) => {
    setAddOpen(false)
    setTiles((prev) => [...prev, { id, x: 0, y: BOTTOM_ROW, ...definitions.get(id)!.size }])
  }

  const missing = [...definitions.values()].filter((definition) => !tiles.some((tile) => tile.id === definition.id))

  const stopEditing = () => {
    setEditing(false)
    setAddOpen(false)
  }

  const cancel = () => {
    setTiles(shown)
    stopEditing()
  }

  const save = async () => {
    setSaving(true)
    // tiles of plugins that are switched off keep their place for when they come back
    const hidden = layout.tiles.filter((tile) => !definitions.has(tile.id))
    const saved = await saveConfig({ ...config, dashboard: { cols: layout.cols, rows: layout.rows, tiles: [...tiles, ...hidden] } })
    setSaving(false)
    if (saved) stopEditing()
  }

  return (
    <div className={`dash-wrap${editing ? ' editing' : ''}`} ref={ref}>
      {editing && (
        <div className="dash-toolbar">
          <div className="dash-add">
            <button className="dash-add-btn" onClick={() => setAddOpen((open) => !open)} disabled={!missing.length}>
              <PlusIcon size={15} /> {t('dash.addTile')}
            </button>
            {addOpen && (
              <div className="dash-add-menu">
                {missing.map((definition) => (
                  <button key={definition.id} onClick={() => addTile(definition.id)}>{t(definition.titleKey)}</button>
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
        layout={gridLayout}
        cols={layout.cols}
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
              <button className="tile-del" onClick={() => setTiles((prev) => prev.filter((p) => p.id !== tile.id))} aria-label={t('settings.remove')}>
                <TrashIcon size={15} />
              </button>
            )}
            {renderTile(tile)}
          </div>
        ))}
      </RGL>

      {meta?.editorEnabled && !editing && (
        <button className="dash-edit-fab" onClick={() => setEditing(true)} title={t('dash.edit')}>
          <EditIcon />
        </button>
      )}
    </div>
  )
}
