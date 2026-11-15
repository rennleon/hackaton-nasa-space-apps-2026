import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { GlossaryProvider, ViewProvider } from '../context'
import { layerById, type ClimateGrid } from '../lib/climate'
import { ClimateCells } from './ClimateCells'
import { RegionMap } from './RegionMap'

const grid: ClimateGrid = {
  param: 'PRECTOTCORR',
  units: 'mm/day',
  source: 'NASA POWER',
  cells: [
    [-79, -7, 0.3],
    [-78.375, -7, 6.2],
    [-79, -6.5, 2],
  ],
  cell_deg: [0.5, 0.625],
}

describe('ClimateCells on the real map', () => {
  it('draws one rectangle per cell, coloured by class, and reports the view', () => {
    const onViewChange = vi.fn()
    const { container } = render(
      <ViewProvider initial="simple">
        <GlossaryProvider terms={[]}>
          <RegionMap regions={[]} onViewChange={onViewChange}>
            <ClimateCells layer={layerById('water')} grid={grid} />
          </RegionMap>
        </GlossaryProvider>
      </ViewProvider>,
    )
    const fills = [...container.querySelectorAll('path.leaflet-interactive')].map((p) => p.getAttribute('fill'))
    expect(fills).toEqual(['#eff3ff', '#08519c', '#6baed6'])
    expect(onViewChange).toHaveBeenCalled()
    expect(onViewChange.mock.calls[0][0]).toHaveLength(4)
  })
})
