import { useEffect, useMemo, useState } from 'react'
import type { DataClient } from '../data/client'
import { bboxKey, climateTooFar, climateWindows, mergeGrids, type Bbox, type ClimateGrid, type ClimateLayer } from '../lib/climate'

/** `far`: the map shows too much of the world to colour (no request is made). */
export type ClimateStatus = 'idle' | 'loading' | 'ready' | 'none' | 'far'

interface Target {
  key: string
  layer: ClimateLayer
  wins: Bbox[]
}

/**
 * The long-term-average grid for the layer and the part of the world the map shows. A view wider than one
 * 10-degree request is covered by up to 4 requests, sent together and merged. `focus` ([lon, lat], the pin or box
 * the child chose) centres the request when it is in view. Boxes already fetched are kept, so panning back is
 * instant, and the call waits `delayMs` after the view stops changing (not at all when everything is cached).
 * `none` means no grid could be had (offline, or outside the precomputed places).
 */
export function useClimateGrid(client: DataClient, layer: ClimateLayer | null, view: Bbox | null, focus: [number, number] | null = null, delayMs = 400) {
  const far = !!(layer && view && climateTooFar(view))
  // eslint-disable-next-line react-hooks/exhaustive-deps -- a new client starts with an empty cache
  const cache = useMemo(() => new Map<string, ClimateGrid>(), [client])
  const wins = layer && view && !far ? climateWindows(view, focus) : []
  const winKeys = wins.map(bboxKey)
  const wantedKey = layer && wins.length ? `${layer.param}|${winKeys.join(';')}` : ''
  const cached = wins.length > 0 && winKeys.every((k) => cache.has(`${layer!.param}|${k}`))
  const [target, setTarget] = useState<Target | null>(null)
  const [result, setResult] = useState<{ key: string; grid: ClimateGrid | null } | null>(null)

  useEffect(() => {
    const id = setTimeout(() => setTarget(layer && wins.length ? { key: wantedKey, layer, wins } : null), wantedKey && !cached ? delayMs : 0)
    return () => clearTimeout(id)
    // `layer` and `wins` are fully described by the key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedKey, delayMs])

  const targetKey = target?.key
  useEffect(() => {
    if (!target) return
    let current = true
    const { key, layer: l, wins: ws } = target
    Promise.all(
      ws.map(async (w) => {
        const ck = `${l.param}|${bboxKey(w)}`
        const hit = cache.get(ck)
        if (hit) return hit
        if (!client.climatology) return null
        try {
          const g = await client.climatology(l.param, w)
          cache.set(ck, g)
          return g
        } catch {
          return null // one box missing still leaves the others to draw
        }
      }),
    ).then((grids) => current && setResult({ key, grid: mergeGrids(grids.filter((g): g is ClimateGrid => !!g)) }))
    return () => {
      current = false
    }
    // refetch only when the request changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, targetKey])

  const grid = result?.grid && layer && result.grid.param === layer.param ? result.grid : null
  let status: ClimateStatus = 'idle'
  if (layer && far) status = 'far'
  else if (layer) status = result && target && result.key === target.key && target.layer.param === layer.param ? (result.grid ? 'ready' : 'none') : 'loading'
  return { grid: status === 'idle' || status === 'far' ? null : grid, status }
}
