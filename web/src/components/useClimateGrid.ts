import { useEffect, useState } from 'react'
import type { DataClient } from '../data/client'
import { bboxKey, climateWindow, type Bbox, type ClimateGrid, type ClimateLayer } from '../lib/climate'

export type ClimateStatus = 'idle' | 'loading' | 'ready' | 'none'

interface Target {
  key: string
  layer: ClimateLayer
  win: Bbox
}

/**
 * The long-term-average grid for the layer and the part of the world the map shows. The request box is snapped
 * to whole degrees (so small pans reuse it) and the call waits `delayMs` after the view stops changing.
 * `none` means no grid could be had (offline, or outside the precomputed places).
 */
export function useClimateGrid(client: DataClient, layer: ClimateLayer | null, view: Bbox | null, delayMs = 400) {
  const win = layer && view ? climateWindow(view) : null
  const wantedKey = layer && win ? `${layer.param}|${bboxKey(win)}` : ''
  const [target, setTarget] = useState<Target | null>(null)
  const [result, setResult] = useState<{ key: string; grid: ClimateGrid | null } | null>(null)

  useEffect(() => {
    const id = setTimeout(() => setTarget(layer && win ? { key: wantedKey, layer, win } : null), wantedKey ? delayMs : 0)
    return () => clearTimeout(id)
    // `layer` and `win` are fully described by the key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedKey, delayMs])

  const targetKey = target?.key
  useEffect(() => {
    if (!target) return
    let current = true
    const { key, layer: l, win: w } = target
    const request = client.climatology ? client.climatology(l.param, w) : Promise.reject(new Error('no climate layer'))
    request
      .then((grid) => current && setResult({ key, grid }))
      .catch(() => current && setResult({ key, grid: null }))
    return () => {
      current = false
    }
    // refetch only when the request changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, targetKey])

  const grid = result?.grid && layer && result.grid.param === layer.param ? result.grid : null
  let status: ClimateStatus = 'idle'
  if (layer) status = result && target && result.key === target.key && target.layer.param === layer.param ? (result.grid ? 'ready' : 'none') : 'loading'
  return { grid: status === 'idle' ? null : grid, status }
}
