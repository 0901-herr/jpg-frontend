import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import QueryTierDropdown from './QueryTierDropdown'

describe('QueryTierDropdown tooltip', () => {
  it('shows the fast-mode tooltip on hover', async () => {
    const user = userEvent.setup()
    render(<QueryTierDropdown tier="fast" onChange={() => {}} />)

    await user.hover(screen.getByRole('button', { name: /query speed: fast/i }))

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Fastest answer. Uses a smaller model; may miss detail.',
    )
  })

  it('shows the normal-mode tooltip on hover', async () => {
    const user = userEvent.setup()
    render(<QueryTierDropdown tier="standard" onChange={() => {}} />)

    await user.hover(screen.getByRole('button', { name: /query speed: normal/i }))

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Balanced speed and accuracy. Typically under a minute.',
    )
  })

  it('shows the accurate-mode tooltip on hover', async () => {
    const user = userEvent.setup()
    render(<QueryTierDropdown tier="accurate" onChange={() => {}} />)

    await user.hover(screen.getByRole('button', { name: /query speed: accurate/i }))

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Most thorough answer. Can take a minute or more.',
    )
  })

  it('still shows the tooltip on hover while the button is disabled', async () => {
    const user = userEvent.setup()
    render(<QueryTierDropdown tier="accurate" onChange={() => {}} disabled />)

    const button = screen.getByRole('button', { name: /query speed: accurate/i })
    expect(button).toBeDisabled()

    // The tooltip's hover target must be a wrapping <span>, not the disabled
    // <button> itself — a real browser never fires pointer events on a
    // disabled form control, which is exactly what made this tooltip
    // unreachable before (UX P1-1).
    await user.hover(button.parentElement as HTMLElement)

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Most thorough answer. Can take a minute or more.',
    )
  })
})
