import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GlossaryProvider, ViewProvider, useView } from '../context'
import { Term } from './Term'
import { ViewToggle } from './ViewToggle'
import { HeaderMenu } from './HeaderMenu'
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
    await user.click(screen.getByRole('switch', { name: 'Scientific view' }))
    expect(screen.getByText('science text')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'linear trend' })).toBeInTheDocument()
    expect(screen.getByRole('tooltip')).toHaveTextContent('Average rate of change.')
    expect(screen.getByRole('switch', { name: 'Scientific view' })).toHaveAttribute('aria-checked', 'true')
  })
  it('is one switch that flips both ways and drives the Simple font size on <html>', async () => {
    const user = userEvent.setup()
    wrap(<><ViewToggle /><Probe /></>)
    const sw = screen.getByRole('switch', { name: 'Scientific view' })
    expect(sw).toHaveAttribute('aria-checked', 'false')
    expect(document.documentElement.dataset.view).toBe('simple')
    await user.click(sw)
    expect(sw).toHaveAttribute('aria-checked', 'true')
    expect(document.documentElement.dataset.view).toBe('scientific')
    expect(screen.getByText('science text')).toBeInTheDocument()
    await user.click(sw)
    expect(sw).toHaveAttribute('aria-checked', 'false')
    expect(document.documentElement.dataset.view).toBe('simple')
    expect(screen.getByText('kid text')).toBeInTheDocument()
    sw.focus()
    await user.keyboard(' ')
    expect(sw).toHaveAttribute('aria-checked', 'true')
  })
})

describe('HeaderMenu', () => {
  it('opens, closes on Escape (focus back on the button) and on an outside click', async () => {
    const user = userEvent.setup()
    wrap(<><p>outside</p><HeaderMenu /></>)
    const btn = screen.getByRole('button', { name: 'Settings menu' })
    expect(screen.queryByRole('switch', { name: 'Dark mode' })).not.toBeInTheDocument()
    await user.click(btn)
    expect(screen.getByRole('switch', { name: /Español/ })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('switch', { name: 'Dark mode' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(btn).toHaveAttribute('aria-expanded', 'false')
    expect(btn).toHaveFocus()
    await user.click(btn)
    const dark = screen.getByRole('switch', { name: 'Dark mode' })
    const before = dark.getAttribute('aria-checked')
    await user.click(dark)
    expect(dark).toHaveAttribute('aria-checked', before === 'true' ? 'false' : 'true')
    expect(document.documentElement.dataset.theme).toBe(before === 'true' ? 'light' : 'dark')
    // the row label names the current mode
    expect(screen.getByText(before === 'true' ? 'Light mode' : 'Dark mode')).toBeInTheDocument()
    await user.click(dark)
    expect(screen.getByText(before === 'true' ? 'Dark mode' : 'Light mode')).toBeInTheDocument()
    expect(btn).toHaveAttribute('aria-expanded', 'true') // clicks inside keep it open
    await user.click(screen.getByText('outside'))
    expect(btn).toHaveAttribute('aria-expanded', 'false')
  })
})

describe('Badge', () => {
  it('has an icon and text, not just colour', () => {
    wrap(<Badge meta={SHORTLIST_META.changing} />)
    expect(screen.getByText('Changing')).toBeInTheDocument()
    expect(screen.getByText('▲')).toHaveAttribute('aria-hidden', 'true')
  })
})
