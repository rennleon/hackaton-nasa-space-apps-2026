import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GlossaryProvider, ViewProvider, useView } from '../context'
import { Term } from './Term'
import { ViewToggle } from './ViewToggle'
import { Badge } from './Badge'
import { SHORTLIST_META } from '../lib/labels'

const terms = [
  { id: 'trend', term: { simple: 'trend', scientific: 'linear trend' }, definition: { simple: 'A slow steady change.', scientific: 'Average rate of change.' } },
]

function Probe() {
  const { t } = useView()
  return <p>{t({ simple: 'kid text', scientific: 'science text' })}</p>
}
const wrap = (ui: React.ReactNode) => render(<ViewProvider initial="simple"><GlossaryProvider terms={terms}>{ui}</GlossaryProvider></ViewProvider>)

describe('Term', () => {
  it('shows the simple word and links the definition with aria-describedby', () => {
    wrap(<Term id="trend" />)
    const btn = screen.getByRole('button', { name: 'trend' })
    const tip = screen.getByRole('tooltip')
    expect(btn).toHaveAttribute('aria-describedby', tip.id)
    expect(tip).toHaveTextContent('A slow steady change.')
    expect(tip).toHaveAttribute('data-open', 'false')
  })
  it('opens on focus and closes on Escape / blur', async () => {
    const user = userEvent.setup()
    wrap(<Term id="trend" />)
    await user.tab()
    expect(screen.getByRole('tooltip')).toHaveAttribute('data-open', 'true')
    await user.keyboard('{Escape}')
    await user.tab()
    expect(screen.getByRole('tooltip')).toHaveAttribute('data-open', 'false')
  })
  it('toggles on tap', async () => {
    const user = userEvent.setup()
    wrap(<Term id="trend" />)
    await user.click(screen.getByRole('button', { name: 'trend' }))
    expect(screen.getByRole('tooltip')).toHaveAttribute('data-open', 'true')
  })
  it('renders plain text for unknown ids', () => {
    wrap(<Term id="nope">fallback</Term>)
    expect(screen.getByText('fallback')).toBeInTheDocument()
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})

describe('view switch', () => {
  it('swaps registers in text and in term definitions', async () => {
    const user = userEvent.setup()
    wrap(<><ViewToggle /><Probe /><Term id="trend" /></>)
    expect(screen.getByText('kid text')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Scientific' }))
    expect(screen.getByText('science text')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'linear trend' })).toBeInTheDocument()
    expect(screen.getByRole('tooltip')).toHaveTextContent('Average rate of change.')
    expect(screen.getByRole('button', { name: 'Scientific' })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('Badge', () => {
  it('has an icon and text, not just colour', () => {
    wrap(<Badge meta={SHORTLIST_META.changing} />)
    expect(screen.getByText('Changing')).toBeInTheDocument()
    expect(screen.getByText('▲')).toHaveAttribute('aria-hidden', 'true')
  })
})
