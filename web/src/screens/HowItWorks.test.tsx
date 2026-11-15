import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { ViewProvider } from '../context'
import { HowItWorks } from './HowItWorks'
import { HOW, STEPS } from '../lib/howCopy'
import { bannedIn } from '../lib/copy.test'

describe('How it works page', () => {
  it('lists every step in four bands, with backend modules only in the Scientific view', () => {
    const { unmount } = render(<ViewProvider initial="simple"><HowItWorks /></ViewProvider>)
    expect(screen.getByRole('heading', { level: 1, name: 'How it works' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(4)
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(STEPS.length)
    expect(screen.queryByText('stats.py', { exact: false })).not.toBeInTheDocument()
    unmount()

    render(<ViewProvider initial="scientific"><HowItWorks /></ViewProvider>)
    const step13 = document.getElementById('how-step-13')!
    expect(within(step13).getByText(/Mann–Kendall with Hamed–Rao/)).toBeInTheDocument()
    expect(within(step13).getByText('stats.py')).toBeInTheDocument()
  })

  it('shows the four stages as a bar that marks the current one, and ends on the answer', () => {
    render(<ViewProvider initial="simple"><HowItWorks /></ViewProvider>)
    const bar = screen.getByRole('navigation', { name: 'The four stages' })
    const stages = within(bar).getAllByRole('button')
    expect(stages.map((b) => b.textContent)).toEqual([
      '1Get the dataSteps 1 to 2',
      '2Clean itSteps 3 to 9',
      '3Find the trendSteps 10 to 13',
      '4Check and explainSteps 14 to 16',
    ])
    expect(stages[0]).toHaveAttribute('aria-current', 'step')
    fireEvent.click(stages[2])
    expect(stages[2]).toHaveAttribute('aria-current', 'step')
    expect(stages[0]).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('heading', { level: 3, name: /^Step 10:\s*Take away the seasons$/ })).toBeInTheDocument()
    expect(screen.getByText('You get your answer.')).toBeInTheDocument()
  })

  it('keeps the Simple wording free of banned words', () => {
    for (const [k, v] of Object.entries(HOW)) expect(bannedIn(v.simple), k).toEqual([])
  })
})
