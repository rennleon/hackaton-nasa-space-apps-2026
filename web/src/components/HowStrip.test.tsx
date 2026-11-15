import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { ViewProvider } from '../context'
import { HowStrip } from './HowStrip'
import { HowItWorks } from '../screens/HowItWorks'
import { BANDS } from '../lib/howCopy'
import { monthRuns } from '../lib/placeFacts'
import { bannedIn } from '../lib/copy.test'

describe('How we worked this out strip', () => {
  it('shows the four stages, each a link that opens the How it works page on that stage', () => {
    const { container } = render(<ViewProvider initial="simple"><HowStrip /></ViewProvider>)
    expect(screen.getByRole('heading', { level: 2, name: 'How we worked this out' })).toBeInTheDocument()
    const stages = within(screen.getByRole('list', { name: 'The four stages of how we worked this out' })).getAllByRole('link')
    expect(stages).toHaveLength(4)
    expect(stages.map((a) => a.getAttribute('href'))).toEqual(BANDS.map((b) => `#/how?stage=${b}`))
    expect(stages.map((a) => a.textContent)).toEqual(['1Get the dataSteps 1 to 2', '2Clean itSteps 3 to 9', '3Find the trendSteps 10 to 13', '4Check and explainSteps 14 to 16'])
    expect(screen.getByRole('link', { name: /See every step/ })).toHaveAttribute('href', '#/how')
    expect(bannedIn(container.textContent ?? '')).toEqual([])
  })

  it('How it works scrolls to the stage named in the link', () => {
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    window.location.hash = '#/how?stage=trend'
    render(<ViewProvider initial="simple"><HowItWorks /></ViewProvider>)
    expect(scroll).toHaveBeenCalledTimes(1)
    expect(scroll.mock.instances[0]).toHaveAttribute('data-band', 'trend')
    window.location.hash = ''
  })
})

describe('rainy months', () => {
  it('turns month numbers into runs, wrapping over the new year', () => {
    expect(monthRuns([1, 2, 3, 4])).toEqual([[1, 4]])
    expect(monthRuns([11, 12, 1, 2])).toEqual([[11, 2]])
    expect(monthRuns([2, 3, 7])).toEqual([[2, 3], [7, 7]])
    expect(monthRuns([])).toEqual([])
  })
})
