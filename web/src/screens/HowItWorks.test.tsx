import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
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

  it('keeps the Simple wording free of banned words', () => {
    for (const [k, v] of Object.entries(HOW)) expect(bannedIn(v.simple), k).toEqual([])
  })
})
