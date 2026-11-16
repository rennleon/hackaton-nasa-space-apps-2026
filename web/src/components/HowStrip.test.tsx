import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { ViewProvider } from '../context'
import { HowStrip } from './HowStrip'
import { HowItWorks } from '../screens/HowItWorks'
import { BANDS } from '../lib/howCopy'
import { monthRuns } from '../lib/placeFacts'
import { bannedIn } from '../lib/copy.test'

const originalScrollIntoView = Element.prototype.scrollIntoView
afterEach(() => {
  Element.prototype.scrollIntoView = originalScrollIntoView
})

describe('How we worked this out strip', () => {
  it('shows the four stages as disclosures (not links) that open to list their steps', () => {
    const { container } = render(<ViewProvider initial="simple"><HowStrip /></ViewProvider>)
    expect(screen.getByRole('heading', { level: 2, name: 'How we worked this out' })).toBeInTheDocument()
    const list = screen.getByRole('list', { name: 'The four stages' })
    const stages = Array.from(list.children) as HTMLElement[]
    expect(stages).toHaveLength(4)
    expect(within(list).queryAllByRole('link')).toEqual([])
    const summaries = stages.map((li) => li.querySelector('summary') as HTMLElement)
    expect(summaries.map((s) => s.textContent)).toEqual(['1Get the dataSteps 1 to 2', '2Clean itSteps 3 to 9', '3Find the trendSteps 10 to 13', '4Check and explainSteps 14 to 16'])
    const details = stages.map((li) => li.querySelector('details') as HTMLDetailsElement)
    expect(details.every((d) => !d.open)).toBe(true)
    fireEvent.click(summaries[2])
    expect(details[2].open).toBe(true)
    expect(details[0].open).toBe(false)
    const steps = within(details[2]).getAllByRole('heading', { level: 3 })
    expect(steps.map((s) => s.textContent)).toEqual([
      'Step 10: Take away the seasons', 'Step 11: Handle the jumps', 'Step 12: Measure the change', 'Step 13: Two checks must agree',
    ])
    expect(details[2]).toHaveTextContent('We draw the line that best follows the dots.')
    expect(details[2].querySelector('ol')).toHaveAttribute('start', '10')
    expect(BANDS.map((_, i) => details[i].querySelectorAll('li').length)).toEqual([2, 7, 4, 3])
    expect(screen.getByRole('link', { name: /See every step/ })).toHaveAttribute('href', '#/how')
    expect(bannedIn(container.textContent ?? '')).toEqual([])
  })

  it('uses the Scientific step wording in the Scientific view', () => {
    render(<ViewProvider initial="scientific"><HowStrip /></ViewProvider>)
    expect(screen.getByRole('list', { name: 'Pipeline stages' })).toHaveTextContent("Sen's slope per 10 years")
    expect(screen.getByText('Two tests must agree')).toBeInTheDocument()
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
